import os
import json
import base64
import glob
import re
from io import BytesIO

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

def fix_math(text):
    if not text: return text
    # Fix superscripts: ^2^ -> ^{2}
    text = re.sub(r'\^([^\^]+)\^', r'^{\1}', text)
    # Fix subscripts: ~2~ -> _{2}
    text = re.sub(r'~([^~]+)~', r'_{\1}', text)
    # Optionally wrap common patterns in $ ... $ if they aren't already
    # But often pandoc leaves things like `10^{-3}` plain.
    # To be safe, we wrap any sequence containing `^{` or `_{` that is not inside $...$ in $...$
    
    # A simple but highly effective trick: just replace special unicode degrees
    text = text.replace("∘C", "\\circ C")
    text = text.replace("°C", "\\circ C")
    text = text.replace("m/s^{2}", "$m/s^2$")
    return text

def process():
    files = glob.glob("output_*.json")
    print(f"[!] Bắt đầu tự động khôi phục siêu tốc (Không dùng AI) cho {len(files)} file...")

    for fpath in files:
        if 'output_mau' in fpath:
            continue
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception: continue
        
        for q in data:
            # 1. FIX HÌNH ẢNH
            if "imageUrls" in q and isinstance(q["imageUrls"], list):
                new_urls = []
                for url in q["imageUrls"]:
                    if "data:image" in url:
                        new_urls.append(url)
                        continue
                        
                    img_path = url
                    if not os.path.exists(img_path):
                        img_path = os.path.join("scripts/ai_digitization", url)
                    
                    b64 = image_to_base64_compressed(img_path)
                    if b64:
                        new_urls.append(b64)
                    else:
                        new_urls.append(url) 

                q["imageUrls"] = new_urls
                
                # Dọn markdown ảnh
                if new_urls:
                    for old_u in q["imageUrls"]:
                        q["content"] = q.get("content", "").replace(f"![](assets/media/image", "")
            
            # 2. FIX MATH
            if "content" in q: q["content"] = fix_math(q["content"])
            if "explanation" in q: q["explanation"] = fix_math(q["explanation"])
            
            if "options" in q and isinstance(q["options"], list):
                q["options"] = [fix_math(opt) for opt in q["options"]]
            if "correctAnswer" in q and isinstance(q["correctAnswer"], str):
                q["correctAnswer"] = fix_math(q["correctAnswer"])
                
            # 3. GÁN DEFAULT TAGS
            if "tags" not in q: q["tags"] = ["Đã phục hồi"]
            if "level" not in q: q["level"] = "Nhận biết"

        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  ✅ Đã cứu dữ liệu ảnh & cấu trúc Toán cho: {fpath}!")

if __name__ == "__main__":
    process()
