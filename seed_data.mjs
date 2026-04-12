import fetch from 'node-fetch';

const PROJECT_ID = "gen-lang-client-0765259986";
const DATABASE_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

// Token auth
const token = process.argv[2];

if (!token) {
  console.error("❌ Thiếu Auth Token! Vui lòng làm theo hướng dẫn sau:");
  console.error("1. Đăng nhập vào trang web bằng tài khoản Admin (haunn.vietanhschool@gmail.com).");
  console.error("2. Mở Console (F12) và chạy dòng lệnh sau:");
  console.error("   copy(await (await import('/src/firebase.ts')).auth.currentUser.getIdToken(true))");
  console.error("3. Chạy lại script này: node seed_data.mjs <DÁN_TOKEN_VÀO_ĐÂY>");
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setDoc(collection, docId, fields) {
  let url = `${BASE_URL}/${collection}?documentId=${docId}`;
  let method = 'POST';
  
  if (docId === '') {
     url = `${BASE_URL}/${collection}`;
  }

  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  
  // Nếu HTTP 409 (ALREADY_EXISTS), patch
  if (resp.status === 409) {
     const patchUrl = `${BASE_URL}/${collection}/${docId}`;
     const patchResp = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
     });
     if (!patchResp.ok) {
        const err = await patchResp.text();
        console.error(`Lỗi cập nhật ${collection}/${docId}:`, err);
        return false;
     }
     return true;
  }

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Lỗi tạo ${collection}/${docId}:`, err);
    return false;
  }
  return true;
}

const quotes = [
  "Cố gắng hết mình, kết quả sẽ xứng đáng.",
  "Đường đến vinh quang không xa nếu ta nỗ lực.",
  "Thắng không kiêu, bại không nản.",
  "Mỗi giờ học là một bước gần hơn tới cánh cửa đại học.",
  "Đừng để sự lười biếng đánh cắp ước mơ của bạn.",
  "Thành công là sự tích tiểu thành đại từ ngày này qua ngày khác.",
  "Không có áp lực, không có kim cương.",
  "Cách tốt nhất để dự đoán tương lai là tạo ra nó.",
  "Biến những điều không thể thành có thể.",
  "Hãy chiến đấu vì tương lai của chính mình!"
];

async function main() {
  console.log("🚀 Đang cập nhật cấu hình hệ thống (exam_config)...");
  const configFields = {
    exam_date: { timestampValue: "2026-06-11T00:00:00Z" }, // 7h sáng giờ VN
    music_url: { stringValue: "/music/duong_den_ngay_vinh_quang.mp3" }
  };
  const configOk = await setDoc('metadata', 'exam_config', configFields);
  if (configOk) console.log("✅ Đã cập nhật metadata/exam_config");

  console.log("🚀 Đang đẩy dữ liệu motivational_quotes...");
  for (let i = 0; i < quotes.length; i++) {
    const ok = await setDoc('motivational_quotes', '', {
       text: { stringValue: quotes[i] }
    });
    if (ok) {
       console.log(`  + Đã thêm câu ${i + 1}/${quotes.length}`);
    }
  }

  console.log("🎉 Hoàn tất!");
}

main();
