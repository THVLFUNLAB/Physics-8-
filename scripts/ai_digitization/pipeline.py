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
    """
    Hiện tại, với Gemini 1.5/2.5 Flash context siêu lớn, ta KHÔNG CẦN CẮT BỎ text nữa.
    Việc ném trọn gói Đề + Lời giải vào API bằng 1-shot (không chunking) sẽ giúp AI 
    tự động đối chiếu Câu 1 của Đề với Câu 1 của Lời giải để gộp thông tin một cách thông minh,
    mà không bị mất hình ảnh hay bảng biểu ở phần Đề gốc.
    """
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


# ─── BƯỚC 2: AI TRANSFORMATION (GEMINI 2.5 FLASH) ─────────────────────────
def transform_with_ai(md_text: str) -> list[dict]:
    print(f"\n[STEP 2] Gửi lên Gemini 2.5 FLASH xử lý (1-Shot toàn bộ tài liệu)...")
    
    # Khởi tạo model Flash: Nhanh, cực rẻ, Context 1 triệu token
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=(
            "Bạn là chuyên gia phân tích dữ liệu môn Vật Lý. Hãy chuyển đổi chuỗi văn bản (có thể chứa cả Đề và Lời giải) "
            "thành cấu trúc JSON Array đại diện cho một đề thi.\n\n"
            "YÊU CẦU CỐT LÕI (TUYỆT ĐỐI TUÂN THỦ):\n"
            "1. SỐ LƯỢNG CÂU HỎI: Bộ giáo dục 2025 quy định 1 đề Vật Lý có CHÍNH XÁC 28 CÂU (18 câu Phần 1; 4 câu Phần 2; 6 câu Phần 3). "
            "Bạn PHẢI XUẤT RA ĐÚNG 28 phần tử trong mảng JSON. Tuyệt đối không được tạo ra số lượng khác 28.\n"
            "2. GỘP ĐỀ VÀ LỜI GIẢI: Vì tài liệu input có thể bị lặp lại phần Đề trước, Phần Lời Giải sau, bạn tự đối chiếu Câu X ở Phần Đề "
            "với Câu X ở Phần Lời giải để tạo thành MỘT (1) object JSON duy nhất chứa cả `content` lẫn `explanation`.\n"
            "3. CÂU HỎI ĐÚNG / SAI (Phần 2 gồm 4 câu): Với mỗi câu Đúng/Sai, ĐƯA BỐI CẢNH VÀO `content` VÀ gom 4 phát biểu (a,b,c,d) vào MẢNG `options`. "
            "TUYỆT ĐỐI KHÔNG TÁCH rời từng phát biểu thành các câu hỏi JSON độc lập. Đây là lý do nghiêm trọng gây ra lỗi xuất dư số câu hỏi.\n"
            "4. BẢO TOÀN LATEX VÀ HÌNH ẢNH: Giữ nguyên định dạng $...$ cho công thức và ![](assets/media/...) cho ảnh. Nếu ảnh là ngữ cảnh chung của nhiều câu hỏi, "
            "phải sao chép ảnh đó dán vào đầu `content` của tất cả các câu hỏi thuộc nhóm đó để chúng có thể đứng độc lập.\n"
        ),
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=list[QuestionSchema],
            temperature=0  # Deterministic logic
        )
    )

    all_questions = []
    
    print(f"  -> Đang gọi AI xử lý lượng văn bản {len(md_text)} ký tự ...", end="", flush=True)
    # Thêm cơ chế tự động thử phục hồi
    for attempt in range(3):
        try:
            response = model.generate_content(md_text)
            
            raw_text = response.text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            
            json_data = json.loads(raw_text.strip(), strict=False)
            all_questions.extend(json_data)
            print(" XONG! ✅")
            break
        except Exception as e:
            if attempt < 2:
                print(f"\n     ⚠️ Lỗi (Thử lại lần {attempt + 1}/3 sau 5s): {e}... ", end="")
                sleep(5)
            else:
                print(f" ERROR! ❌ Bỏ qua tài liệu do lỗi {e}")
                
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
        
        # Step 1.5: [Đã tối ưu] Không cắt phần giải nữa, do ta gộp 1 lần thông minh
        md_text = filter_solution_part(md_text)
        
        # Step 2: Quăng TOÀN BỘ văn bản cho AI Extract sang JSON Array (Không cắt vụn chunking nữa)
        structured_questions = transform_with_ai(md_text)
        
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
