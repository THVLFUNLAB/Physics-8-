import json
import glob
import re
import os

def clean_and_extract(q):
    content = q.get("content", "")
    if not content:
        return
        
    extracted_topic = None
    extracted_tags = set(q.get("tags", []))
    extracted_level = None
    extracted_part = q.get("part")
    
    # Extract #Chương -> topic
    chuong_match = re.search(r'#Chương:\s*([^\n]+)', content, re.IGNORECASE)
    if chuong_match:
        extracted_topic = chuong_match.group(1).strip()
        content = content.replace(chuong_match.group(0), "")
        
    # Extract #Bài -> tags
    bai_match = re.search(r'#Bài:\s*([^\n]+)', content, re.IGNORECASE)
    if bai_match:
        extracted_tags.add(bai_match.group(1).strip())
        content = content.replace(bai_match.group(0), "")
        
    # Extract #Dạng -> tags
    dang_match = re.search(r'#Dạng:\s*([^\n]+)', content, re.IGNORECASE)
    if dang_match:
        extracted_tags.add(dang_match.group(1).strip())
        content = content.replace(dang_match.group(0), "")
        
    # Extract Phần 
    phan_match = re.search(r'(?i)Phần (I{1,3}|1|2|3)', content)
    if phan_match:
        p_val = phan_match.group(1).upper()
        if p_val in ['I', '1']: extracted_part = 1
        elif p_val in ['II', '2']: extracted_part = 2
        elif p_val in ['III', '3']: extracted_part = 3
        
    # Cleanup orphaned "Phần 1/2/3" lines
    content = re.sub(r'(?i)^Phần (I{1,3}|1|2|3)\s*$', '', content, flags=re.MULTILINE)
    
    # Extract mức độ
    levels = ["Nhận biết", "Thông hiểu", "Vận dụng cao", "Vận dụng"]
    for lv in levels:
        if lv.lower() in content.lower():
            if not extracted_level:
                extracted_level = lv
            # Try to safely remove standalone lines like "Vật lí nhiệt - Vận dụng"
            # Or just replace the exact word if it looks like a tag
            content = re.sub(r'^[^\n-]*-\s*' + lv + r'\s*$', '', content, flags=re.IGNORECASE | re.MULTILINE)
            content = re.sub(r'^' + lv + r'\s*$', '', content, flags=re.IGNORECASE | re.MULTILINE)

    # Clean up empty lines
    content = re.sub(r'\n{3,}', '\n\n', content).strip()
    
    # Update object
    q["content"] = content
    if extracted_topic: q["topic"] = extracted_topic
    if extracted_level: q["level"] = extracted_level
    if extracted_part: q["part"] = extracted_part
    
    # Remove 'Đã phục hồi' dummy tag if we got real tags
    if "Đã phục hồi" in extracted_tags and len(extracted_tags) > 1:
        extracted_tags.remove("Đã phục hồi")
    q["tags"] = list(extracted_tags)

def process():
    files = glob.glob("output_*.json")
    for fpath in files:
        if 'output_mau' in fpath: continue
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        for q in data:
            clean_and_extract(q)
            # If it's a cluster, process sub_questions too
            if q.get("item_type") == "cluster" and "sub_questions" in q:
                for sq in q["sub_questions"]:
                    clean_and_extract(sq)
                    
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
    print("[!] Đã dùng Regex bóc tách toàn bộ tag ẩn và dọn dẹp nội dung siêu tốc!")

if __name__ == "__main__":
    process()
