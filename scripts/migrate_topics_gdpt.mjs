import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Rule-based mappers
const getTopicData = (q) => {
  const content = (q.content || "").toLowerCase();
  const tags = (q.tags || []).map((t) => t.toLowerCase());
  const oldTopic = (q.topic || "").toLowerCase();

  const fullText = [content, ...tags, oldTopic].join(" ");

  // --- Khí Lí Tưởng ---
  if (
    fullText.includes("khí lí tưởng") ||
    fullText.includes("khí lý tưởng") ||
    fullText.includes("brown") ||
    fullText.includes("boyle") ||
    fullText.includes("charles") ||
    fullText.includes("trạng thái") ||
    fullText.includes("áp suất khí") ||
    fullText.includes("đẳng nhiệt") ||
    fullText.includes("đẳng tích") ||
    fullText.includes("đẳng áp") ||
    fullText.includes("boltzmann")
  ) {
    if (fullText.includes("phương trình trạng thái") || fullText.includes("đẳng") || fullText.includes("boyle") || fullText.includes("charles")) {
      return { topic: "Khí lí tưởng", subTopic: "Phương trình trạng thái" };
    }
    if (fullText.includes("áp suất khí") || fullText.includes("mô hình động học")) {
      return { topic: "Khí lí tưởng", subTopic: "Áp suất khí theo mô hình động học phân tử" };
    }
    if (fullText.includes("động năng phân tử")) {
      return { topic: "Khí lí tưởng", subTopic: "Động năng phân tử" };
    }
    return { topic: "Khí lí tưởng", subTopic: "Mô hình động học phân tử chất khí" };
  }

  // --- Vật lí nhiệt ---
  if (
    fullText.includes("nhiệt") ||
    fullText.includes("nóng chảy") ||
    fullText.includes("hoá hơi") ||
    fullText.includes("nội năng") ||
    fullText.includes("celsius") ||
    fullText.includes("kelvin") ||
    oldTopic.includes("nhiệt")
  ) {
    if (fullText.includes("chuyển thể") || fullText.includes("nóng chảy") || fullText.includes("hoá hơi") && !fullText.includes("nhiệt dung riêng")) {
      return { topic: "Vật lí nhiệt", subTopic: "Sự chuyển thể" };
    }
    if (fullText.includes("nhiệt dung riêng") || fullText.includes("thu nhiệt") || fullText.includes("toả nhiệt") || fullText.includes("nhiệt nóng chảy riêng") || fullText.includes("nhiệt hoá hơi riêng")) {
      return { topic: "Vật lí nhiệt", subTopic: "Nhiệt dung riêng, nhiệt nóng chảy riêng, nhiệt hoá hơi riêng" };
    }
    if (fullText.includes("nội năng") || fullText.includes("định luật 1")) {
      return { topic: "Vật lí nhiệt", subTopic: "Nội năng, định luật 1 của nhiệt động lực học" };
    }
    if (fullText.includes("thang nhiệt độ") || fullText.includes("nhiệt kế") || fullText.includes("celsius") || fullText.includes("kelvin")) {
      return { topic: "Vật lí nhiệt", subTopic: "Thang nhiệt độ, nhiệt kế" };
    }
    return { topic: "Vật lí nhiệt", subTopic: "" };
  }

  // --- Trường từ ---
  if (
    fullText.includes("từ trường") ||
    fullText.includes("lực từ") ||
    fullText.includes("cảm ứng từ") ||
    fullText.includes("từ thông") ||
    fullText.includes("lorentz") ||
    fullText.includes("tesla") ||
    fullText.includes("nam châm")
  ) {
    if (fullText.includes("từ thông") || fullText.includes("cảm ứng điện từ") || fullText.includes("faraday") || fullText.includes("lenz") || fullText.includes("suất điện động") || fullText.includes("weber") || fullText.includes("Wb")) {
      return { topic: "Trường từ (Từ trường)", subTopic: "Từ thông; Cảm ứng điện từ" };
    }
    if (fullText.includes("lực từ") || fullText.includes("lực lorentz") || fullText.includes("ampere") || fullText.includes("am-pe")) {
      return { topic: "Trường từ (Từ trường)", subTopic: "Lực từ tác dụng lên đoạn dây dẫn mang dòng điện; Cảm ứng từ" };
    }
    return { topic: "Trường từ (Từ trường)", subTopic: "Khái niệm từ trường" };
  }

  // --- Vật lí hạt nhân ---
  if (
    fullText.includes("hạt nhân") ||
    fullText.includes("phóng xạ") ||
    fullText.includes("đồng vị") ||
    fullText.includes("hụt khối") ||
    fullText.includes("năng lượng liên kết") ||
    fullText.includes("chu kì bán rã")
  ) {
    if (fullText.includes("hụt khối") || fullText.includes("năng lượng liên kết") || fullText.includes("mev")) {
      return { topic: "Vật lí hạt nhân và phóng xạ", subTopic: "Độ hụt khối và năng lượng liên kết hạt nhân" };
    }
    if (fullText.includes("phóng xạ") || fullText.includes("chu kì bán rã") || fullText.includes("becquerel")) {
      return { topic: "Vật lí hạt nhân và phóng xạ", subTopic: "Sự phóng xạ và chu kì bán rã" };
    }
    return { topic: "Vật lí hạt nhân và phóng xạ", subTopic: "Cấu trúc hạt nhân" };
  }

  // Nếu không matching cái nào của lớp 12, giữ nguyên
  return { topic: q.topic, subTopic: q.subTopic || "" };
};

async function migrate() {
  console.log("🚀 Bắt đầu quá trình Migration Dữ liệu theo chuẩn GDPT 2018 (Lớp 12)...");
  try {
    const qSnapshot = await getDocs(collection(db, "questions"));
    const totalQuestions = qSnapshot.size;
    console.log(`Tìm thấy ${totalQuestions} câu hỏi. Đang xử lý...`);

    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let modifiedCount = 0;

    for (const docSnap of qSnapshot.docs) {
      const q = docSnap.data();
      const updatedData = getTopicData(q);

      // Nếu topic hoặc subTopic cần được thay đổi
      if (updatedData.topic !== q.topic || updatedData.subTopic !== q.subTopic) {
        // Cập nhật lại
        currentBatch.update(docSnap.ref, {
          topic: updatedData.topic,
          subTopic: updatedData.subTopic,
        });

        modifiedCount++;
        operationCount++;

        if (operationCount >= 400) {
          batches.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      }
    }

    if (operationCount > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
    console.log(`✅ Migration hoàn tất! Đã cập nhật thành công ${modifiedCount}/${totalQuestions} câu hỏi.`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Lỗi xảy ra trong quá trình migration:", error);
    process.exit(1);
  }
}

migrate();
