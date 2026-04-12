import os
import json
import base64
import glob
from io import BytesIO
import google.generativeai as genai
from dotenv import load_dotenv

script_dir = os.path.dirname(os.path.abspath(__file__))
# Try multiple logic to find API Key
API_KEY = os.getenv("VITE_GEMINI_API_KEY")
if not API_KEY:
    load_dotenv('scripts/ai_digitization/.env')
    API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
if not API_KEY:
    load_dotenv('.env')
    API_KEY = os.getenv("VITE_GEMINI_API_KEY")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction=(
        "Bạn là chuyên gia Vật Lý. Hãy phân tích mảng JSON chứa các câu hỏi thi Vật Lý và trả về mảng JSON đã được TẨY RỬA ĐỊNH DẠNG và PHÂN LOẠI.\n"
        "CÁC NHIỆM VỤ BẮT BUỘC:\n"
        "1. Fix Toán (Rất Quan Trọng): Sửa toàn bộ lỗi hiển thị Toán học của Pandoc để chuẩn hóa 100% LaTeX. Nghĩa là biến `m/s^2^` thành `$m/s^2$`, `30^∘^C` thành `$30^\\circ C$`, `10^-3^` thành `$10^{-3}$`, `g.A^−1^. s^−2^` thành `$g.A^{-1}.s^{-2}$`. Nếu kí hiệu đứng 1 mình (như chữ D, hay V) thì giữ kệ nó, nhưng nếu có mũ hay chỉ số thì bọc lại bằng dấu `$`.\n"
        "2. Điền bổ sung các field còn thiếu cho MỖI câu hỏi: \n"
        "  - `part`: 1 (Dành cho Trắc nghiệm 4 đáp án), 2 (Dành cho câu Đúng/Sai), 3 (Dành cho câu Trả lời ngắn)\n"
        "  - `topic`: Phân loại chủ đề kiến thức lớp 12 (VD: Vật lí nhiệt, Khí lí tưởng, Từ trường, Vật lí hạt nhân)\n"
        "  - `level`: Phân loại Nhận biết/Thông hiểu/Vận dụng/Vận dụng cao\n"
        "  - `tags`: Một mảng chứa 2-3 từ khóa ngắn (VD: ['Phương trình trạng thái', 'Áp suất'])\n"
        "3. Tuyệt đối giữ nguyên giá trị trong mảng `imageUrls` (hiện tại nó đang chứa mã Base64 cực dài), KHÔNG ĐƯỢC XÓA HOẶC LÀM HỎNG chuỗi Base64 đó.\n"
        "Chỉ xuất ra KẾT QUẢ CUỐI CÙNG LÀ PURE JSON ARRAY, KHÔNG ĐÍNH KÈM GÌ THÊM."
    )
)

try:
    from PIL import Image
    has_pil = True
except ImportError:
    has_pil = False

def image_to_base64_compressed(image_path):
    if not os.path.exists(image_path):
        return None
        
    try:
        if has_pil:
            img = Image.open(image_path)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # Resize
            MAX_W = 600
            if img.width > MAX_W:
                ratio = MAX_W / img.width
                img = img.resize((MAX_W, int(img.height * ratio)), Image.Resampling.LANCZOS)
            buffered = BytesIO()
            img.save(buffered, format="JPEG", quality=40)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        else:
            with open(image_path, "rb") as f:
                img_str = base64.b64encode(f.read()).decode("utf-8")
        return f"data:image/jpeg;base64,{img_str}"
    except Exception as e:
        print(f"Lỗi đọc ảnh {image_path}: {e}")
        return None

def process():
    files = glob.glob("output_*.json")
    print(f"[!] Tìm thấy {len(files)} file cần Rửa Sạch Lỗi Định Dạng...")

    for fpath in files:
        if 'output_mau' in fpath:
            continue # skip sample
        print(f"\n[+] Đang xử lý: {fpath}...")
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Lỗi đọc {fpath}: {e}")
            continue
            
        # BƯỚC 1: Đọc ảnh từ ổ cứng và nén Base64
        for q in data:
            if "imageUrls" in q and isinstance(q["imageUrls"], list):
                new_urls = []
                for url in q["imageUrls"]:
                    if "data:image" in url:
                        new_urls.append(url)
                        continue
                        
                    # Tìm file ảnh tĩnh
                    img_path = url
                    if not os.path.exists(img_path):
                        img_path = os.path.join("scripts/ai_digitization", url)
                    
                    b64 = image_to_base64_compressed(img_path)
                    if b64:
                        new_urls.append(b64)
                    else:
                        new_urls.append(url) 

                q["imageUrls"] = new_urls
                
                # Dọn dẹp mớ markdown dính từ pandoc
                if new_urls:
                    q["content"] = q.get("content", "").replace(f"![](assets/media/image", "")

        # BƯỚC 2: Nhờ AI Sửa Toán & Gắn Tag
        raw_str = json.dumps(data, ensure_ascii=False)
        print(f"  -> Bơm lên mây cho AI sửa Toán và Tag (Độ dài: {len(raw_str)})...")
        
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = model.generate_content(raw_str)
                out_text = response.text.strip()
                if out_text.startswith("```json"): out_text = out_text[7:]
                elif out_text.startswith("```"): out_text = out_text[3:]
                if out_text.endswith("```"): out_text = out_text[:-3]
                
                fixed_data = json.loads(out_text.strip())
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(fixed_data, f, ensure_ascii=False, indent=2)
                print(f"  ✅ Đã cứu sống hoàn toàn: {fpath}!")
                break
            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg or "quota" in err_msg.lower():
                    print(f"  ⚠️ Quá tải API, đang chờ 30 giây để thử lại (Lần {attempt+1}/{max_retries})...")
                    time.sleep(30)
                else:
                    print(f"  ❌ LỖI AI cho {fpath}: {e}")
                    if attempt == max_retries - 1:
                        break
                    time.sleep(5)

if __name__ == "__main__":
    process()
