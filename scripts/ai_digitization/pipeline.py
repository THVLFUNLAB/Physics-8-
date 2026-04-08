import os
import sys
import json
import re
import argparse
import typing_extensions as typing
from time import sleep

# --- Dependencies ---
# pip install pypandoc google-generativeai python-dotenv
try:
    import pypandoc
except ImportError:
    print("Vui lòng cài đặt thư viện: pip install pypandoc")
    sys.exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print("Vui lòng cài đặt thư viện: pip install google-generativeai")
    sys.exit(1)

from dotenv import load_dotenv

# ─── BƯỚC 0: SETUP ────────────────────────────────────────────────────────
# Load .env từ đúng đường dẫn thư mục chứa script
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '.env')
load_dotenv(dotenv_path=env_path)

# Fallback: Quét cả VITE_GEMINI_API_KEY từ file .env gốc của project nếu script được chạy từ thư mục gốc
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")

if not API_KEY:
    print("ERROR: Không tìm thấy GEMINI_API_KEY trong file .env")
    sys.exit(1)

genai.configure(api_key=API_KEY)


# ─── CẤU TRÚC JSON MONG MUỐN BẰNG TYPEDDICT ────────────────────────────────
class QuestionSchema(typing.TypedDict):
    content: str         # Nội dung đầy đủ câu hỏi, giữ nguyên LaTeX ($ công thức $)
    options: list[str]   # Mảng nội dung 4 đáp án (nếu có)
    correctAnswer: str   # Đáp án đúng dạng chuỗi (ví dụ: "A") hoặc dạng số (nếu điền khuyết)
    explanation: str     # Lời giải chi tiết (nếu có), phải giữ nguyên LaTeX
    imageUrls: list[str] # Mảng đường dẫn ảnh trích xuất được từ Markdown (thường là assets/media/...)


def download_pandoc_if_needed():
    """Tự động tải Pandoc cục bộ nếu hệ thống chưa cài sẵn"""
    try:
        pypandoc.get_pandoc_version()
        print("[+] Đã kết nối với Pandoc!")
    except OSError:
        print("[!] Không tìm thấy Pandoc. Hệ thống đang tự động tải xuống phiên bản portable...")
        pypandoc.download_pandoc()
        print("[+] Tải Pandoc thành công!")


def chunk_markdown(md_text: str, questions_per_chunk: int = 5) -> list[str]:
    """
    Cắt nhỏ văn bản Markdown theo số lượng câu hỏi để tránh AI hallucination
    và vượt qua giới hạn độ dài token.
    """
    # Tìm các chữ "Câu 1:", "Câu 2." ... (có thể được bọc với in đậm markdown như **Câu 1:**)
    pattern = r'(?i)\b(?:\*\*|#+\s*)?câu\s+\d+\s*[:.]'
    matches = list(re.finditer(pattern, md_text))
    
    if not matches:
        # Nếu pattern không được tìm thấy, có thể format lạ -> chunk bằng số ký tự cho an toàn
        print("[-] Không nhận diện được 'Câu X: ', sẽ chia chunk theo độ dài...")
        chunk_size = 4000
        return [md_text[i:i+chunk_size] for i in range(0, len(md_text), chunk_size)]
        
    chunks = []
    for i in range(0, len(matches), questions_per_chunk):
        start_idx = matches[i].start()
        end_idx = matches[i+questions_per_chunk].start() if i + questions_per_chunk < len(matches) else len(md_text)
        chunks.append(md_text[start_idx:end_idx].strip())
    
    # Nối phần văn bản chung trước Câu 1 vào chunk đầu tiên
    if matches and matches[0].start() > 0:
        header_text = md_text[0:matches[0].start()].strip()
        chunks[0] = header_text + "\n\n" + chunks[0]
        
    return chunks


def filter_solution_part(md_text: str) -> str:
    """Nếu đề có 2 phần (Phần Đề và Phần Lời Giải), tự động cắt bỏ Phần Đề để tránh lặp."""
    # Tìm tất cả các "Câu X:"
    pattern = r'(?i)\b(?:\*\*|#+\s*)?câu\s+(\d+)\s*[:.]'
    matches = list(re.finditer(pattern, md_text))
    
    if not matches:
        return md_text
        
    last_reset_idx = 0
    max_q = int(matches[0].group(1))
    
    for i in range(1, len(matches)):
        num = int(matches[i].group(1))
        # Phát hiện sự kiện reset số thứ tự (Ví dụ: đang Câu 28 mà tụt về Câu 1 hoặc Câu 2)
        if num < max_q and num <= 3:
            last_reset_idx = i
            max_q = num
        elif num > max_q:
            max_q = num
            
    # Nếu lần reset cuối cùng nắm giữ số lượng câu tương đối (>5 câu), ta cắt cái rụp
    if last_reset_idx > 0 and len(matches) - last_reset_idx > 5:
        split_pos = matches[last_reset_idx].start()
        lookback = max(0, split_pos - 300) # Lùi 1 xíu dính Header "Lời giải" nếu có
        # Scan header
        header_match = re.search(r'(?i)(bảng\s*đáp\s*án|lời\s*giải\s*chi\s*tiết|hướng\s*dẫn\s*giải)', md_text[lookback:split_pos])
        
        if header_match:
            split_pos = lookback + header_match.start()
            
        print(f"[*] AUTO-TRIM: Phát hiện cấu trúc Đề Kép! Đã cưa đôi tài liệu, từ chối phần thô, chuyển AI đọc {len(matches) - last_reset_idx} câu chốt hạ lấy Lời giải.")
        return md_text[split_pos:]
        
    return md_text


# ─── BƯỚC 1: QUÉT & ĐỌC FILE (EXTRACTION) ──────────────────────────────────
def extract_docx(file_path: str, media_dir: str = "assets/") -> str:
    print(f"\n[STEP 1] Đang đọc file Word và trích xuất: {file_path}")
    if not os.path.exists(file_path):
        print(f"ERROR: Không tìm thấy file {file_path}")
        sys.exit(1)
        
    # Tạo folder chứa ảnh
    os.makedirs(media_dir, exist_ok=True)
    
    # Pypandoc cực đỉnh: xuất markdown + render OMML Math to LaTeX + xả ảnh local
    extra_args = [f'--extract-media={media_dir}']
    md_output = pypandoc.convert_file(
        source_file=file_path,
        to='markdown',
        format='docx',
        extra_args=extra_args
    )
    print(f"[+] Trích xuất thành công! Độ dài MD: {len(md_output)} ký tự.")
    print(f"[+] Toàn bộ ảnh đã được đổ vào: ./{media_dir}")
    return md_output


# ─── BƯỚC 2: AI TRANSFORMATION (GEMINI 2.5 PRO) ───────────────────────────
def transform_with_ai(chunks: list[str]) -> list[dict]:
    print(f"\n[STEP 2] Gửi lên Gemini 2.5 PRO xử lý, tổng: {len(chunks)} chunks...")
    
    # Khởi tạo model với config bắt buộc Schema JSON array => 100% trả đồ chuẩn
    model = genai.GenerativeModel(
        "gemini-2.5-pro",
        system_instruction=(
            "Bạn là chuyên gia phân tích dữ liệu môn Vật Lý. Hãy chuyển đổi chuỗi văn bản hỗn loạn sau thành "
            "cấu trúc JSON là mảng các câu hỏi.\n\n"
            "YÊU CẦU NGHIÊM NGẶT:\n"
            "1. Phải CHẮC CHẮN GIỮ NGUYÊN nội dung định dạng Toán học LaTeX do Pandoc sinh ra ($...$).\n"
            "2. Tuyệt đối giữ nguyên đường dẫn ảnh nếu có định dạng Markdown ![](assets/media/...).\n"
            "3. BẢO TOÀN BẢNG SỐ LIỆU (Markdown Tables): Nếu xuất hiện bảng số liệu thí nghiệm trong đề bài, "
            "hãy giữ nguyên định dạng Markdown table đó và đặt vào thuộc tính `content` của câu hỏi tương ứng.\n"
            "4. GIỮ LỜI GIẢI CHI TIẾT: Bóc tách phần Lời giải (Hướng dẫn giải) đưa vào trường `explanation`, "
            "phải giữ nguyên Markdown và Latex của lời giải.\n"
            "5. XỬ LÝ CÂU HỎI CHÙM (Dùng chung dữ kiện): Nếu có văn bản/hình ảnh là dữ kiện chung cho 2 hay nhiều câu hỏi liên tiếp (Ví dụ ở Phần III), "
            "BẠN PHẢI COPY TOÀN BỘ dữ kiện chung đó và DÁN VÀO ĐẦU phần `content` của TẤT CẢ các câu hỏi con thuộc nhóm đó. Mỗi câu phải chứa đủ dữ kiện để có thể đứng hoàn toàn độc lập."
        ),
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=list[QuestionSchema],
            temperature=0  # Nhiệt độ 0 để model xuất ra dữ liệu deterministic và cực kỳ logic
        )
    )

    all_questions = []
    
    for idx, chunk in enumerate(chunks):
        print(f"  -> Đang gọi AI xử lý Chunk {idx + 1}/{len(chunks)} ...", end="", flush=True)
        # Thêm cơ chế tự động thử phục hồi (Retry 3 lần) nếu mạng chập chờn
        for attempt in range(3):
            try:
                response = model.generate_content(chunk)
                
                # Vì response_mime_type đã cấu hình, text trả về là Array JSON chuẩn
                # Đọc thẳng bằng json
                raw_text = response.text.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                elif raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                
                # Sử dụng strict=False để bỏ qua lỗi ký tự điều khiển (control characters) có trong văn bản vật lý
                json_data = json.loads(raw_text.strip(), strict=False)
                all_questions.extend(json_data)
                print(" XONG! ✅")
                break  # Gọi API thành công thì thoát vòng lặp nhỏ để qua Chunk tiếp theo
            except Exception as e:
                if attempt < 2:
                    print(f"\n     ⚠️ Lỗi mạng (Thử lại lần {attempt + 1}/3 sau 5s): {e}... ", end="")
                    sleep(5)
                else:
                    print(f" ERROR! ❌ Bỏ qua chunk này do lỗi {e}")
        
        # Ngủ một chút để không dính rate-limit của Gemini
        sleep(2)
        
    return all_questions


# ─── BƯỚC 3: XUẤT FILE (LOAD TO STAGING) ──────────────────────────────────
def save_output(data: list[dict], out_path: str = "output_data.json"):
    print(f"\n[STEP 3] Đang lưu trữ Data Staging...")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[+] Đã lưu file chuẩn JSON tại: {out_path}")
    print(f"[+] Thầy Hậu có thể lấy file này upload thẳng vào Web App (tính năng 'Số hóa AI trực tiếp') !")


def process_single_file(file_path: str, chunk_size: int):
    print(f"\n{'='*60}")
    print(f"BẮT ĐẦU XỬ LÝ: {file_path}")
    print(f"{'='*60}")
    
    try:
        # Step 1: Khui file docx (bung ảnh, biến math -> latex)
        md_text = extract_docx(file_path, "assets/")
        
        # Step 1.5: Tự động loại bỏ mớ bòng bong nửa trên nếu là đề kép
        md_text = filter_solution_part(md_text)
        
        # Step 2.0: Băm nhỏ văn bản Markdown
        chunks = chunk_markdown(md_text, questions_per_chunk=chunk_size)
        
        # Step 2.1: Quăng cho AI Extract sang JSON Array
        structured_questions = transform_with_ai(chunks)
        
        # Step 3: Xuất file
        if structured_questions:
            base_name = os.path.basename(file_path).replace(".docx", "")
            out_path = f"output_{base_name}.json".replace(" ", "_")
            save_output(structured_questions, out_path)
            print(f"\n🚀 QUY TRÌNH HOÀN TẤT VIÊN MÃN ({file_path})! Số câu vừa chuẩn hóa: {len(structured_questions)}")
        else:
            print(f"\n❌ Quy trình hoàn tất nhưng không lấy được nội dung nào trong file {file_path}.")
            
    except Exception as e:
        print(f"\n[!] Lỗi Pipeline tại file {file_path}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Data Pipeline: Tự động số hóa 1 file hoặc cả thư mục .docx sang JSON")
    parser.add_argument("path", help="Đường dẫn đến file Word (.docx) hoặc Thư mục chứa nhiều đề thi")
    parser.add_argument("--chunk", type=int, default=8, help="Số câu hỏi gửi trong mỗi lần gọi AI (mặc định: 8)")
    args = parser.parse_args()

    download_pandoc_if_needed()
    
    if not os.path.exists(args.path):
        print(f"\n❌ LỖI: Không tìm thấy file hoặc thư mục mang tên '{args.path}'")
        print("💡 Gợi ý: Thầy kiểm tra lại xem đã tạo thư mục này và gõ đúng đường dẫn chưa nhé!")
        return

    if os.path.isdir(args.path):
        import glob
        docx_files = glob.glob(os.path.join(args.path, "*.docx"))
        if not docx_files:
            print(f"⚠️ Không tìm thấy file .docx nào trong thư mục {args.path}")
            return
            
        print(f"🚀 BẬT CHẾ ĐỘ XỬ LÝ HÀNG LOẠT (BATCH MODE). Tìm thấy {len(docx_files)} file đề thi.")
        for fpath in docx_files:
            process_single_file(fpath, args.chunk)
            
        print(f"\n🎉 ĐÃ CÀY XONG TOÀN BỘ {len(docx_files)} ĐỀ THI TRONG THƯ MỤC!")
    else:
        process_single_file(args.path, args.chunk)

if __name__ == "__main__":
    main()
