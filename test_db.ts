import { initializeApp } from "firebase/app";
import { getFirestore, doc, deleteDoc, getDoc, getDocs, collection, initializeFirestore, writeBatch } from "firebase/firestore";
import fetch from "node-fetch";

// Setup global fetch for Firebase Node
global.fetch = fetch as any;

const firebaseConfig = require("./firebase-applet-config.json");
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

async function testDelete() {
  const snapshot = await getDocs(collection(db, "questions"));
  console.log(`Found ${snapshot.size} questions.`);
  if (snapshot.empty) return;
  
  const docId = snapshot.docs[0].id;
  console.log(`Testing delete on: ${docId}`);
  
  const testRef = doc(db, "questions", docId);
  const before = await getDoc(testRef);
  console.log(`Before delete exists: ${before.exists()}`);
  
  try {
    const batch = writeBatch(db);
    batch.delete(testRef);
    await batch.commit();
    console.log("Batch commit finished WITHOUT throwing.");
  } catch (err) {
    console.log("Batch commit THREW an error:", err);
  }
  
  const after = await getDoc(testRef);
  console.log(`After delete exists: ${after.exists()}`);
}

testDelete();
