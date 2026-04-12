import React, { useState, useEffect } from 'react';
import { db, collection, getDocs } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

export const MotivationalQuote = () => {
  const [quotes, setQuotes] = useState<string[]>([]);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'motivational_quotes'));
        const qs: string[] = [];
        querySnapshot.forEach((doc) => {
          if (doc.data().text) {
            qs.push(doc.data().text);
          }
        });
        if (qs.length > 0) {
          // Xáo trộn ngẫu nhiên
          const shuffled = qs.sort(() => 0.5 - Math.random());
          setQuotes(shuffled);
        }
      } catch (err) {
        console.error("Lỗi lấy danh ngôn:", err);
      }
    };
    fetchQuotes();
  }, []);

  useEffect(() => {
    if (quotes.length <= 1) return;

    const intervalId = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 10000); // 10 giây đổi môt lần

    return () => clearInterval(intervalId);
  }, [quotes.length]);

  const displayQuote = quotes.length > 0 
    ? quotes[currentQuoteIndex] 
    : "Hãy chiến đấu vì tương lai của chính mình!";

  return (
    <div className="flex flex-col items-center justify-center pt-6 pb-2 w-full">
      <div className="w-full max-w-2xl text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuoteIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-center"
          >
            <p className="text-sm sm:text-lg md:text-xl font-bold text-slate-300 italic drop-shadow-md">
              "{displayQuote}"
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
