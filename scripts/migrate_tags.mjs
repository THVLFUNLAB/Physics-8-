import fetch from "node-fetch";

const PROJECT_ID = "gen-lang-client-0765259986";
const API_KEY = "AIzaSyBeJul-y-01bMr-UzqGou2icn3tL6YiSCU";
const DATABASE_ID = "(default)";

const TOPIC_ALIASES = {
  "Trường từ (Từ trường)": ["Từ trường", "Trường từ", "Từ trường (Trường từ)"],
  "Vật lí hạt nhân và phóng xạ": ["Hạt nhân", "Vật lý hạt nhân", "Phóng xạ", "Hạt nhân và phóng xạ", "Vật lí hạt nhân"],
  "Trường điện (Điện trường)": ["Điện trường", "Trường điện"],
  "Dòng điện, mạch điện": ["Dòng điện", "Mạch điện"],
  "Khí lí tưởng": ["Khí lý tưởng", "Chất khí"],
  "Vật lí nhiệt": ["Vật lý nhiệt", "Nhiệt học", "Nhiệt"],
  "Công, năng lượng, công suất": ["Công và năng lượng", "Năng lượng"],
};

function getBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
}

function normalize(str) {
  if (!str) return "";
  return str.toLowerCase().trim();
}

const aliasToCanonical = {};
for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
  aliasToCanonical[normalize(canonical)] = canonical;
  aliases.forEach(alias => {
    aliasToCanonical[normalize(alias)] = canonical;
  });
}

// REST Pagination fetch
async function listAllDocs(collectionPath) {
  const allDocs = [];
  let nextPageToken = null;

  do {
    let url = `${getBaseUrl()}/${collectionPath}?key=${API_KEY}&pageSize=300`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.documents) allDocs.push(...data.documents);
      nextPageToken = data.nextPageToken;
    } else {
      throw new Error(`Failed to list docs: ${await resp.text()}`);
    }
  } while (nextPageToken);

  return allDocs;
}

// Update single nested field in exams via PATCH
async function updateDocFields(collectionPath, docId, fieldsMask, fieldsData) {
  const maskQuery = fieldsMask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
  const url = `${getBaseUrl()}/${collectionPath}/${docId}?${maskQuery}&key=${API_KEY}`;
  
  const payload = { fields: fieldsData };

  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    throw new Error(`Failed to update ${docId}: ${await resp.text()}`);
  }
}

async function run() {
  console.log("🚀 Bắt đầu quét và chuẩn hoá dữ liệu TOPIC (GDPT 2018)...");
  
  const unknownTopics = new Set();
  const summary = {};
  
  // 1. MIGRATE QUESTIONS
  console.log("\n[1] MIGRATING ROOT QUESTIONS...");
  const questions = await listAllDocs("questions");
  console.log(`📦 Tìm thấy ${questions.length} câu hỏi.`);

  let qMigrated = 0;
  let qSkipped = 0;

  for (const doc of questions) {
    const docId = doc.name.split("/").pop();
    const currentTopicStr = doc.fields?.topic?.stringValue || "";
    const lowerTopic = normalize(currentTopicStr);
    
    if (!currentTopicStr) {
      qSkipped++;
      continue;
    }

    const canonical = aliasToCanonical[lowerTopic];
    if (!canonical) {
      unknownTopics.add(currentTopicStr);
      qSkipped++;
    } else if (currentTopicStr !== canonical) {
      console.log(`   🔄 Updating Q [${docId}]: "${currentTopicStr}" ➔ "${canonical}"`);
      await updateDocFields("questions", docId, ["topic"], { topic: { stringValue: canonical } });
      qMigrated++;
      summary[canonical] = (summary[canonical] || 0) + 1;
    } else {
      qSkipped++; // Already Canonical
    }
  }

  // 2. MIGRATE EXAMS EMBEDDED QUESTIONS
  console.log("\n[2] MIGRATING EMBEDDED EXAM QUESTIONS...");
  const exams = await listAllDocs("exams");
  console.log(`📦 Tìm thấy ${exams.length} đề thi.`);
  
  let eMigrated = 0;
  
  for (const doc of exams) {
    const docId = doc.name.split("/").pop();
    
    if (!doc.fields?.questions?.arrayValue?.values) {
      continue;
    }
    
    const qs = doc.fields.questions.arrayValue.values;
    let needsUpdate = false;
    
    // We modify the array
    for (const q of qs) {
      if (q.mapValue?.fields?.topic) {
        const tStr = q.mapValue.fields.topic.stringValue || "";
        const lowerT = normalize(tStr);
        const canon = aliasToCanonical[lowerT];
        
        if (canon && tStr !== canon) {
          q.mapValue.fields.topic.stringValue = canon;
          needsUpdate = true;
          summary[canon] = (summary[canon] || 0) + 1;
        } else if (!canon && tStr) {
          unknownTopics.add(tStr);
        }
      }
    }
    
    if (needsUpdate) {
      console.log(`   🔄 Updating Exam [${docId}] embedded questions`);
      await updateDocFields("exams", docId, ["questions"], { questions: { arrayValue: { values: qs } } });
      eMigrated++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  📊 KẾT QUẢ MIGRATION");
  console.log("═══════════════════════════════════════════════════");
  console.log(`✅ Câu hỏi tự do đã cập nhật: ${qMigrated}`);
  console.log(`✅ Đề thi đã cập nhật: ${eMigrated}`);
  
  if (Object.keys(summary).length > 0) {
    console.log("\n📦 Chi tiết Topics đã chuẩn hoá:");
    for (const [canonical, count] of Object.entries(summary)) {
      console.log(`   - ${canonical}: ${count} lượt sửa`);
    }
  }

  if (unknownTopics.size > 0) {
    console.log("\n⚠️ Các Topic lạ (không khớp alias):");
    Array.from(unknownTopics).forEach(t => console.log(`   - "${t}"`));
  }
  console.log("═══════════════════════════════════════════════════");
}

run().catch(console.error);
