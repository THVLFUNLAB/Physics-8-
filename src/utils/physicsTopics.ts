export interface PhysicsTopicHierarchy {
  grade: string;
  isSpecialized?: boolean;
  topics: {
    name: string;
    subTopics: string[];
  }[];
}

export const PHYSICS_TOPICS: PhysicsTopicHierarchy[] = [
  {
    grade: "Khối 10",
    topics: [
      { name: "Mở đầu", subTopics: [] },
      { name: "Động học", subTopics: ["Mô tả chuyển động", "Chuyển động biến đổi"] },
      { name: "Động lực học", subTopics: ["Ba định luật Newton về chuyển động", "Một số lực trong thực tiễn", "Cân bằng lực, moment lực", "Khối lượng riêng, áp suất chất lỏng"] },
      { name: "Công, năng lượng, công suất", subTopics: ["Công và năng lượng", "Động năng và thế năng", "Công suất và hiệu suất"] },
      { name: "Động lượng", subTopics: ["Định nghĩa động lượng", "Bảo toàn động lượng", "Động lượng và va chạm"] },
      { name: "Chuyển động tròn", subTopics: ["Động học của chuyển động tròn đều", "Gia tốc hướng tâm và lực hướng tâm"] },
      { name: "Biến dạng của vật rắn", subTopics: ["Biến dạng kéo và biến dạng nén", "Đặc tính của lò xo", "Định luật Hooke"] }
    ]
  },
  {
    grade: "Khối 11",
    topics: [
      { name: "Dao động", subTopics: ["Dao động điều hoà", "Dao động tắt dần, hiện tượng cộng hưởng"] },
      { name: "Sóng", subTopics: ["Mô tả sóng", "Sóng dọc và sóng ngang", "Sóng điện từ", "Giao thoa sóng kết hợp", "Sóng dừng", "Đo tốc độ truyền âm"] },
      { name: "Trường điện (Điện trường)", subTopics: ["Lực điện tương tác giữa các điện tích", "Khái niệm điện trường", "Điện trường đều", "Điện thế và thế năng điện", "Tụ điện và điện dung"] },
      { name: "Dòng điện, mạch điện", subTopics: ["Cường độ dòng điện", "Mạch điện và điện trở", "Năng lượng điện, công suất điện"] }
    ]
  },
  {
    grade: "Khối 12",
    topics: [
      { name: "Vật lí nhiệt", subTopics: ["Sự chuyển thể", "Nội năng, định luật 1 của nhiệt động lực học", "Thang nhiệt độ, nhiệt kế", "Nhiệt dung riêng, nhiệt nóng chảy riêng, nhiệt hoá hơi riêng"] },
      { name: "Khí lí tưởng", subTopics: ["Mô hình động học phân tử chất khí", "Phương trình trạng thái", "Áp suất khí theo mô hình động học phân tử", "Động năng phân tử"] },
      { name: "Trường từ (Từ trường)", subTopics: ["Khái niệm từ trường", "Lực từ tác dụng lên đoạn dây dẫn mang dòng điện; Cảm ứng từ", "Từ thông; Cảm ứng điện từ"] },
      { name: "Vật lí hạt nhân và phóng xạ", subTopics: ["Cấu trúc hạt nhân", "Độ hụt khối và năng lượng liên kết hạt nhân", "Sự phóng xạ và chu kì bán rã"] }
    ]
  },
  {
    grade: "Khối Chuyên đề",
    isSpecialized: true,
    topics: [
      { name: "Chuyên đề Lớp 10", subTopics: ["Vật lí trong một số ngành nghề", "Trái Đất và bầu trời", "Vật lí với giáo dục về bảo vệ môi trường"] },
      { name: "Chuyên đề Lớp 11", subTopics: ["Trường hấp dẫn", "Truyền thông tin bằng sóng vô tuyến", "Mở đầu về điện tử học"] },
      { name: "Chuyên đề Lớp 12", subTopics: ["Dòng điện xoay chiều", "Một số ứng dụng vật lí trong chẩn đoán y học", "Vật lí lượng tử"] }
    ]
  }
];

export const getAllTopics = (): string[] => {
  const topics = new Set<string>();
  PHYSICS_TOPICS.forEach(g => {
    g.topics.forEach(t => topics.add(t.name));
  });
  return Array.from(topics);
};
