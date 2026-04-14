import React, { useState, useEffect } from 'react';
import { db, collection, getDocs, deleteDoc, doc } from '../firebase';
import { Question } from '../types';
import DuplicateReviewHub from './DuplicateReviewHub';

// ── Wrapper tự fetch questions cho DuplicateReviewHub — ONE-SHOT ──
export const DuplicateReviewHubWrapper = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => {
    const fetchQ = async () => {
      try {
        const snap = await getDocs(collection(db, 'questions'));
        setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as Question)));
      } catch (err) {
        console.warn('[DuplicateHub] Lỗi fetch questions:', err);
      }
    };
    fetchQ();
  }, []);
  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'questions', id));
    // Fix: Cập nhật local state ngay sau khi xóa thành công
    setQuestions(prev => prev.filter(q => q.id !== id));
  };
  return <DuplicateReviewHub questions={questions} onDeleteQuestion={handleDelete} />;
};

export default DuplicateReviewHubWrapper;
