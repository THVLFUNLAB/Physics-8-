/**
 * ═══════════════════════════════════════════════════════════════
 *  DANH SÁCH YÊU CẦU CẦN ĐẠT (YCCĐ) — GDPT 2018
 *  Chuẩn hóa bởi Bộ GD&ĐT, sử dụng cho hệ thống PHYS-9+
 * ═══════════════════════════════════════════════════════════════
 */

export interface YCCD {
  code: string;       // Mã định danh duy nhất: YCCD_10_01, YCCD_12_05, ...
  grade: string;      // "10", "11", "12", "Chuyên đề 12.1", "Chuyên đề 12.2", "Chuyên đề 12.3"
  topic: string;      // Tên chủ đề lớn
  content: string;    // Nội dung YCCĐ đầy đủ
  keywords: string[]; // Từ khóa để auto-matching
}

// ── Helper: trích xuất từ khóa tự động từ nội dung YCCĐ ──
function extractKeywords(content: string): string[] {
  // Loại bỏ các từ phổ biến, giữ lại thuật ngữ Vật lý
  const stopWords = new Set([
    'được', 'và', 'của', 'cho', 'trong', 'các', 'một', 'khi', 'nếu', 'thì',
    'với', 'để', 'có', 'là', 'bằng', 'từ', 'đó', 'về', 'hoặc', 'hay',
    'theo', 'sử', 'dụng', 'nêu', 'vận', 'phát', 'biểu', 'mô', 'tả',
    'giải', 'thích', 'tìm', 'xác', 'định', 'rút', 'ra', 'lập', 'luận',
    'thảo', 'luận', 'thực', 'hiện', 'thí', 'nghiệm', 'khảo', 'sát',
    'biết', 'không', 'đổi', 'giữ', 'thể', 'trường', 'hợp', 'đơn', 'giản',
    'ví', 'dụ', 'cụ', 'phương', 'pháp', 'trình', 'bày', 'liên', 'hệ',
    'cách', 'đề', 'xuất', 'phân', 'tích', 'so', 'sánh', 'đánh', 'giá',
  ]);

  const words = content
    .toLowerCase()
    .replace(/[(),.;:!?"/\\]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Trích xuất thêm cụm từ khóa quan trọng
  const phrases: string[] = [];
  const importantPhrases = [
    'tốc độ trung bình', 'độ dịch chuyển', 'vận tốc', 'gia tốc',
    'chuyển động thẳng', 'chuyển động biến đổi đều', 'ném ngang', 'ném xiên',
    'định luật newton', 'khối lượng', 'quán tính', 'trọng lực', 'trọng tâm',
    'lực ma sát', 'lực cản', 'lực nâng', 'lực căng dây', 'moment lực',
    'cân bằng lực', 'khối lượng riêng', 'áp suất chất lỏng',
    'công', 'động năng', 'thế năng', 'cơ năng', 'bảo toàn cơ năng',
    'công suất', 'hiệu suất', 'động lượng', 'bảo toàn động lượng', 'va chạm',
    'chuyển động tròn', 'tốc độ góc', 'gia tốc hướng tâm', 'lực hướng tâm',
    'lò xo', 'đàn hồi', 'định luật hooke', 'biến dạng',
    'dao động điều hoà', 'dao động điều hòa', 'biên độ', 'chu kì', 'chu kỳ', 'tần số', 'tần số góc',
    'dao động tắt dần', 'cộng hưởng', 'dao động cưỡng bức',
    'bước sóng', 'sóng dọc', 'sóng ngang', 'sóng điện từ',
    'giao thoa', 'sóng dừng', 'sóng kết hợp',
    'điện tích', 'coulomb', 'cường độ điện trường', 'điện trường đều',
    'điện thế', 'thế năng điện', 'tụ điện', 'điện dung',
    'cường độ dòng điện', 'điện trở', 'định luật ohm', 'suất điện động',
    'năng lượng điện', 'công suất điện',
    'chuyển thể', 'nóng chảy', 'hoá hơi', 'hóa hơi',
    'nội năng', 'nhiệt động lực học', 'nhiệt dung riêng',
    'nhiệt nóng chảy riêng', 'nhiệt hoá hơi riêng', 'nhiệt hóa hơi riêng',
    'nhiệt kế', 'nhiệt độ', 'kelvin', 'celsius',
    'khí lí tưởng', 'khí lý tưởng', 'boyle', 'charles',
    'phương trình trạng thái', 'chất khí', 'phân tử',
    'boltzmann', 'động năng tịnh tiến',
    'từ trường', 'đường sức từ', 'lực từ', 'cảm ứng từ',
    'từ thông', 'cảm ứng điện từ', 'faraday', 'lenz',
    'dòng điện xoay chiều', 'máy biến áp',
    'hạt nhân', 'proton', 'neutron', 'nucleon',
    'phóng xạ', 'bán rã', 'phân rã', 'phân hạch', 'tổng hợp hạt nhân',
    'năng lượng liên kết', 'độ hụt khối',
    'tia x', 'siêu âm', 'cộng hưởng từ', 'chụp cắt lớp',
    'photon', 'lượng tử', 'quang điện', 'de broglie',
    'quang phổ', 'mức năng lượng', 'vùng năng lượng',
    'con lắc lò xo', 'con lắc đơn',
    'radian', 'omega',
    'diode', 'chỉnh lưu',
  ];

  const contentLower = content.toLowerCase();
  for (const phrase of importantPhrases) {
    if (contentLower.includes(phrase)) {
      phrases.push(phrase);
    }
  }

  return [...new Set([...phrases, ...words])];
}

const RAW_YCCD_DATA = [
  { grade: "10", topic: "Mở đầu", content: "Nêu được đối tượng nghiên cứu của Vật lí học và mục tiêu của môn Vật lí. Phân tích được một số ảnh hưởng của vật lí đối với cuộc sống, đối với sự phát triển của khoa học, công nghệ và kĩ thuật." },
  { grade: "10", topic: "Mở đầu", content: "Nêu được ví dụ chứng tỏ kiến thức, kĩ năng vật lí được sử dụng trong một số lĩnh vực khác nhau. Nêu được ví dụ về phương pháp nghiên cứu vật lí (thực nghiệm và lí thuyết)." },
  { grade: "10", topic: "Mở đầu", content: "Mô tả được các bước trong tiến trình tìm hiểu thế giới tự nhiên dưới góc độ vật lí. Thảo luận về các loại sai số đơn giản hay gặp khi đo các đại lượng vật lí và cách khắc phục." },
  { grade: "10", topic: "Mở đầu", content: "Nêu được các quy tắc an toàn trong nghiên cứu và học tập môn Vật lí." },
  { grade: "10", topic: "Động học", content: "Lập luận để rút ra được công thức tính tốc độ trung bình, định nghĩa được tốc độ theo một phương. Từ hình ảnh hoặc ví dụ thực tiễn, định nghĩa được độ dịch chuyển." },
  { grade: "10", topic: "Động học", content: "So sánh được quãng đường đi được và độ dịch chuyển. Dựa vào định nghĩa tốc độ theo một phương và độ dịch chuyển, rút ra được công thức tính và định nghĩa được vận tốc." },
  { grade: "10", topic: "Động học", content: "Vẽ được đồ thị độ dịch chuyển - thời gian trong chuyển động thẳng. Tính được tốc độ từ độ dốc của đồ thị độ dịch chuyển - thời gian." },
  { grade: "10", topic: "Động học", content: "Xác định được độ dịch chuyển tổng hợp, vận tốc tổng hợp. Vận dụng được công thức tính tốc độ, vận tốc." },
  { grade: "10", topic: "Động học", content: "Rút ra được công thức tính gia tốc; nêu được ý nghĩa, đơn vị của gia tốc. Vẽ được đồ thị vận tốc - thời gian trong chuyển động thẳng." },
  { grade: "10", topic: "Động học", content: "Vận dụng đồ thị vận tốc - thời gian để tính được độ dịch chuyển và gia tốc. Rút ra và vận dụng được các công thức của chuyển động thẳng biến đổi đều." },
  { grade: "10", topic: "Động học", content: "Mô tả và giải thích được chuyển động ném ngang, ném xiên (chuyển động khi vật có vận tốc không đổi theo một phương và có gia tốc không đổi theo phương vuông góc)." },
  { grade: "10", topic: "Động lực học", content: "Thực hiện thí nghiệm rút ra được biểu thức a = F/m (định luật 2 Newton). Nêu được khối lượng là đại lượng đặc trưng cho mức quán tính của vật." },
  { grade: "10", topic: "Động lực học", content: "Phát biểu định luật 1 Newton và minh hoạ được bằng ví dụ cụ thể. Vận dụng được mối liên hệ đơn vị dẫn xuất với 7 đơn vị cơ bản của hệ SI." },
  { grade: "10", topic: "Động lực học", content: "Nêu được tính chất của trọng lực, trọng tâm và công thức tính trọng lượng. Mô tả được một cách định tính chuyển động rơi trong trường trọng lực đều khi có sức cản của không khí." },
  { grade: "10", topic: "Động lực học", content: "Phát biểu được định luật 3 Newton, minh hoạ và vận dụng được định luật 3 Newton trong một số trường hợp đơn giản." },
  { grade: "10", topic: "Động lực học", content: "Mô tả và biểu diễn được bằng hình vẽ: Trọng lực, Lực ma sát, Lực cản của môi trường (nước/không khí), Lực nâng, Lực căng dây." },
  { grade: "10", topic: "Động lực học", content: "Tổng hợp được các lực trên một mặt phẳng. Phân tích được một lực thành các lực thành phần vuông góc." },
  { grade: "10", topic: "Động lực học", content: "Nêu được khái niệm moment lực, moment ngẫu lực. Phát biểu và vận dụng được quy tắc moment cho một số trường hợp đơn giản." },
  { grade: "10", topic: "Động lực học", content: "Rút ra được điều kiện để vật cân bằng: lực tổng hợp tác dụng lên vật bằng không và tổng moment lực tác dụng lên vật bằng không." },
  { grade: "10", topic: "Động lực học", content: "Nêu được khái niệm khối lượng riêng. Thành lập và vận dụng được phương trình áp suất chất lỏng: Delta p = rho.g.Delta h." },
  { grade: "10", topic: "Công, năng lượng, công suất", content: "Nêu được biểu thức tính công bằng tích của lực tác dụng và độ dịch chuyển theo phương của lực (A = F.s.cos a), đơn vị đo công." },
  { grade: "10", topic: "Công, năng lượng, công suất", content: "Rút ra được động năng của vật có giá trị bằng công của lực tác dụng lên vật. Nêu được công thức tính thế năng trong trường trọng lực đều." },
  { grade: "10", topic: "Công, năng lượng, công suất", content: "Phân tích được sự chuyển hoá động năng và thế năng của vật. Nêu khái niệm cơ năng, phát biểu và vận dụng định luật bảo toàn cơ năng." },
  { grade: "10", topic: "Công, năng lượng, công suất", content: "Nêu được ý nghĩa vật lí và định nghĩa công suất. Vận dụng được mối liên hệ công suất với tích của lực và vận tốc (P = F.v). Định nghĩa và vận dụng hiệu suất." },
  { grade: "10", topic: "Động lượng", content: "Nêu được ý nghĩa vật lí và định nghĩa động lượng. Phát biểu và vận dụng được định luật bảo toàn động lượng trong hệ kín." },
  { grade: "10", topic: "Động lượng", content: "Rút ra được mối liên hệ giữa lực tổng hợp tác dụng lên vật và tốc độ thay đổi của động lượng. Phân tích sự thay đổi năng lượng trong va chạm." },
  { grade: "10", topic: "Chuyển động tròn", content: "Định nghĩa radian và biểu diễn được độ dịch chuyển góc theo radian. Vận dụng được khái niệm tốc độ góc." },
  { grade: "10", topic: "Chuyển động tròn", content: "Vận dụng được biểu thức gia tốc hướng tâm (a = r.omega^2, a = v^2/r) và lực hướng tâm (F = m.a_ht)." },
  { grade: "10", topic: "Biến dạng của vật rắn", content: "Mô tả được các đặc tính của lò xo: giới hạn đàn hồi, độ dãn, độ cứng. Tìm mối liên hệ giữa lực đàn hồi và độ biến dạng, phát biểu và vận dụng định luật Hooke." },
  { grade: "11", topic: "Dao động", content: "Nêu được định nghĩa và vận dụng các khái niệm: biên độ, chu kì, tần số, tần số góc, độ lệch pha để mô tả dao động điều hoà." },
  { grade: "11", topic: "Dao động", content: "Sử dụng đồ thị, xác định được độ dịch chuyển, vận tốc và gia tốc trong dao động điều hoà. Vận dụng phương trình li độ, vận tốc, gia tốc." },
  { grade: "11", topic: "Dao động", content: "Vận dụng được phương trình a = -omega^2.x của dao động điều hoà. Mô tả sự chuyển hoá động năng và thế năng trong dao động điều hoà." },
  { grade: "11", topic: "Dao động", content: "Nêu được ví dụ và giải thích hiện tượng dao động tắt dần, dao động cưỡng bức và hiện tượng cộng hưởng. Đánh giá sự có lợi hay có hại của cộng hưởng." },
  { grade: "11", topic: "Sóng", content: "Mô tả được sóng qua các khái niệm bước sóng, biên độ, tần số, tốc độ và cường độ sóng. Rút ra và vận dụng được biểu thức v = lambda.f." },
  { grade: "11", topic: "Sóng", content: "Nêu được ví dụ chứng tỏ sóng truyền năng lượng. Giải thích được một tính chất đơn giản của âm thanh và ánh sáng dựa trên mô hình sóng." },
  { grade: "11", topic: "Sóng", content: "So sánh được sóng dọc và sóng ngang. Nêu được tính chất truyền trong chân không và liệt kê bậc độ lớn bước sóng của các bức xạ trong thang sóng điện từ." },
  { grade: "11", topic: "Sóng", content: "Mô tả hiện tượng giao thoa hai sóng kết hợp. Nêu được các điều kiện cần thiết để quan sát được hệ vân giao thoa." },
  { grade: "11", topic: "Sóng", content: "Vận dụng được biểu thức i = lambda.D/a cho giao thoa ánh sáng qua hai khe hẹp." },
  { grade: "11", topic: "Sóng", content: "Giải thích được sự hình thành sóng dừng. Phân tích, xác định được vị trí nút và bụng của sóng dừng bằng đồ thị hoặc đại số." },
  { grade: "11", topic: "Trường điện", content: "Phát biểu định luật Coulomb. Sử dụng biểu thức F = (k.|q1.q2|)/r^2 tính và mô tả lực tương tác giữa hai điện tích điểm." },
  { grade: "11", topic: "Trường điện", content: "Nêu khái niệm điện trường. Định nghĩa cường độ điện trường (E = F/q). Sử dụng biểu thức E = k.|Q|/r^2 để tính cường độ điện trường do điện tích điểm gây ra." },
  { grade: "11", topic: "Trường điện", content: "Vẽ được điện phổ trong một số trường hợp đơn giản. Tính được cường độ điện trường đều (E = U/d). Mô tả tác dụng của điện trường đều lên chuyển động của điện tích." },
  { grade: "11", topic: "Trường điện", content: "Nêu được khái niệm điện thế, thế năng điện. Vận dụng mối liên hệ thế năng điện với điện thế (V = A/q), cường độ điện trường với điện thế." },
  { grade: "11", topic: "Trường điện", content: "Định nghĩa điện dung và đơn vị Fara. Vận dụng công thức điện dung của bộ tụ ghép nối tiếp, song song. Vận dụng biểu thức tính năng lượng tụ điện." },
  { grade: "11", topic: "Dòng điện, mạch điện", content: "Nêu khái niệm cường độ dòng điện (I = delta q / delta t). Vận dụng biểu thức I = Snve cho dây dẫn có dòng điện." },
  { grade: "11", topic: "Dòng điện, mạch điện", content: "Định nghĩa điện trở, nguyên nhân gây ra điện trở. Vẽ và thảo luận đường đặc trưng I - U của kim loại. Ảnh hưởng của nhiệt độ lên điện trở (điện trở nhiệt)." },
  { grade: "11", topic: "Dòng điện, mạch điện", content: "Phát biểu định luật Ohm cho vật dẫn kim loại. Định nghĩa suất điện động của nguồn điện. Mô tả ảnh hưởng của điện trở trong lên hiệu điện thế hai cực nguồn." },
  { grade: "11", topic: "Dòng điện, mạch điện", content: "Nêu được năng lượng điện tiêu thụ và công suất điện. Tính được năng lượng điện và công suất tiêu thụ năng lượng điện của đoạn mạch." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Sử dụng mô hình động học phân tử, nêu được sơ lược cấu trúc của chất rắn, chất lỏng, chất khí. Giải thích được sơ lược một số hiện tượng vật lí liên quan đến sự chuyển thể: sự nóng chảy, sự hoá hơi." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Thực hiện thí nghiệm, nêu được: mối liên hệ nội năng của vật với năng lượng của các phân tử tạo nên vật, định luật 1 của nhiệt động lực học. Vận dụng được định luật 1 của nhiệt động lực học trong một số trường hợp đơn giản." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Thực hiện thí nghiệm đơn giản, thảo luận để nêu được sự chênh lệch nhiệt độ giữa hai vật tiếp xúc nhau có thể cho ta biết chiều truyền năng lượng nhiệt giữa chúng; từ đó nêu được khi hai vật tiếp xúc với nhau, ở cùng nhiệt độ, sẽ không có sự truyền năng lượng nhiệt giữa chúng." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Thảo luận để nêu được mỗi độ chia (1°C) trong thang Celsius bằng 1/100 của khoảng cách giữa nhiệt độ tan chảy của nước tinh khiết đóng băng và nhiệt độ sôi của nước tinh khiết. Mỗi độ chia (1 K) trong thang Kelvin bằng 1/273,16 của khoảng cách giữa nhiệt độ không tuyệt đối và nhiệt độ điểm ba của nước." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Nêu được nhiệt độ không tuyệt đối là nhiệt độ mà tại đó tất cả các chất có động năng chuyển động nhiệt của các phân tử hoặc nguyên tử bằng không và thế năng của chúng là tối thiểu. Chuyển đổi được nhiệt độ đo theo thang Celsius sang nhiệt độ đo theo thang Kelvin và ngược lại." },
  { grade: "12", topic: "Vật lí nhiệt", content: "Nêu được định nghĩa nhiệt dung riêng, nhiệt nóng chảy riêng, nhiệt hoá hơi riêng. Thảo luận để thiết kế phương án hoặc lựa chọn phương án và thực hiện phương án, đo được nhiệt dung riêng, nhiệt nóng chảy riêng, nhiệt hoá hơi riêng bằng dụng cụ thực hành." },
  { grade: "12", topic: "Khí lí tưởng", content: "Phân tích mô hình chuyển động Brown, nêu được các phân tử trong chất khí chuyển động hỗn loạn. Từ các kết quả thực nghiệm hoặc mô hình, thảo luận để nêu được các giả thuyết của thuyết động học phân tử chất khí." },
  { grade: "12", topic: "Khí lí tưởng", content: "Thực hiện thí nghiệm khảo sát được định luật Boyle: Khi giữ không đổi nhiệt độ của một khối lượng khí xác định thì áp suất gây ra bởi khí tỉ lệ nghịch với thể tích của nó." },
  { grade: "12", topic: "Khí lí tưởng", content: "Thực hiện thí nghiệm minh hoạ được định luật Charles: Khi giữ không đổi áp suất của một khối lượng khí xác định thì thể tích của khí tỉ lệ với nhiệt độ tuyệt đối của nó." },
  { grade: "12", topic: "Khí lí tưởng", content: "Sử dụng định luật Boyle và định luật Charles rút ra được phương trình trạng thái của khí lí tưởng. Vận dụng được phương trình trạng thái của khí lí tưởng." },
  { grade: "12", topic: "Khí lí tưởng", content: "Giải thích được chuyển động của các phân tử ảnh hưởng như thế nào đến áp suất tác dụng lên thành bình và từ đó rút ra được hệ thức p = (1/3)nm(v^2) với n là số phân tử trong một đơn vị thể tích." },
  { grade: "12", topic: "Khí lí tưởng", content: "Nêu được biểu thức hằng số Boltzmann, k = R/NA. So sánh pV = (1/3)Nm(v^2) với pV = nRT, rút ra được động năng tịnh tiến trung bình của phân tử tỉ lệ với nhiệt độ T." },
  { grade: "12", topic: "Trường từ (Từ trường)", content: "Thực hiện thí nghiệm tạo ra được các đường sức từ bằng các dụng cụ đơn giản. Nêu được từ trường là trường lực gây ra bởi dòng điện hoặc nam châm, biểu hiện cụ thể là sự xuất hiện của lực từ tác dụng lên một dòng điện hay một nam châm đặt trong đó." },
  { grade: "12", topic: "Trường từ (Từ trường)", content: "Thực hiện thí nghiệm để mô tả được hướng của lực từ tác dụng lên đoạn dây dẫn mang dòng điện đặt trong từ trường. Xác định được độ lớn và hướng của lực từ tác dụng lên đoạn dây dẫn mang dòng điện đặt trong từ trường." },
  { grade: "12", topic: "Trường từ (Từ trường)", content: "Định nghĩa được cảm ứng từ B và đơn vị tesla. Nêu được đơn vị cơ bản và dẫn xuất để đo các đại lượng từ." },
  { grade: "12", topic: "Trường từ (Từ trường)", content: "Thảo luận để thiết kế phương án, lựa chọn phương án, thực hiện phương án, đo được (hoặc mô tả được phương pháp đo) cảm ứng từ bằng cân dòng điện. Vận dụng được biểu thức tính lực F = BILsin(alpha)." },
  { grade: "12", topic: "Cảm ứng điện từ", content: "Định nghĩa được từ thông và đơn vị weber. Tiến hành các thí nghiệm đơn giản minh hoạ được hiện tượng cảm ứng điện từ." },
  { grade: "12", topic: "Cảm ứng điện từ", content: "Vận dụng được định luật Faraday và định luật Lenz về cảm ứng điện từ. Giải thích được một số ứng dụng đơn giản của hiện tượng cảm ứng điện từ." },
  { grade: "12", topic: "Cảm ứng điện từ", content: "Mô tả được mô hình sóng điện từ và ứng dụng để giải thích sự tạo thành và lan truyền của các sóng điện từ trong thang sóng điện từ." },
  { grade: "12", topic: "Cảm ứng điện từ", content: "Thảo luận để thiết kế phương án (hoặc mô tả được phương pháp) tạo ra dòng điện xoay chiều. Nêu được: chu kì, tần số, giá trị cực đại, giá trị hiệu dụng của cường độ dòng điện và điện áp xoay chiều." },
  { grade: "12", topic: "Cảm ứng điện từ", content: "Thảo luận để nêu được một số ứng dụng của dòng điện xoay chiều trong cuộc sống, tầm quan trọng của việc tuân thủ quy tắc an toàn khi sử dụng dòng điện xoay chiều trong cuộc sống." },
  { grade: "12", topic: "Vật lí hạt nhân và phóng xạ", content: "Rút ra được sự tồn tại và đánh giá được kích thước của hạt nhân từ phân tích kết quả thí nghiệm tán xạ hạt alpha. Biểu diễn được kí hiệu hạt nhân của nguyên tử bằng số nucleon và số proton. Mô tả được mô hình đơn giản của nguyên tử gồm proton, neutron và electron." },
  { grade: "12", topic: "Vật lí hạt nhân và phóng xạ", content: "Viết được đúng phương trình phân rã hạt nhân đơn giản. Thảo luận hệ thức E = mc^2, nêu được liên hệ giữa khối lượng và năng lượng. Nêu được mối liên hệ giữa năng lượng liên kết riêng và độ bền vững của hạt nhân." },
  { grade: "12", topic: "Vật lí hạt nhân và phóng xạ", content: "Nêu được sự phân hạch và sự tổng hợp hạt nhân. Thảo luận để đánh giá được vai trò của một số ngành công nghiệp hạt nhân trong đời sống." },
  { grade: "12", topic: "Vật lí hạt nhân và phóng xạ", content: "Nêu được bản chất tự phát và ngẫu nhiên của sự phân rã phóng xạ. Định nghĩa được độ phóng xạ, hằng số phóng xạ và vận dụng được liên hệ H = lambda.N. Vận dụng được công thức x = x0.e^(-lambda.t) với x là độ phóng xạ, số hạt chưa phân rã hoặc tốc độ số hạt đếm được." },
  { grade: "12", topic: "Vật lí hạt nhân và phóng xạ", content: "Định nghĩa được chu kì bán rã. Mô tả được sơ lược một số tính chất của các phóng xạ alpha, beta và gamma. Nhận biết được dấu hiệu vị trí có phóng xạ thông qua các biển báo. Nêu được các nguyên tắc an toàn phóng xạ; tuân thủ quy tắc an toàn phóng xạ." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Thảo luận để thiết kế phương án, chọn phương án, thực hiện phương án, đo được (hoặc mô tả được phương pháp đo): tần số, điện áp xoay chiều bằng dụng cụ thực hành." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Nêu được: công suất toả nhiệt trung bình trên điện trở thuần bằng một nửa công suất cực đại của dòng điện xoay chiều hình sin (chạy qua điện trở thuần này)." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Mô tả được bằng biểu thức đại số hoặc đồ thị: cường độ dòng điện, điện áp xoay chiều; so sánh được giá trị hiệu dụng và giá trị cực đại." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Thảo luận để thiết kế phương án hoặc lựa chọn phương án và thực hiện phương án, khảo sát được đoạn mạch xoay chiều RLC mắc nối tiếp bằng dụng cụ thực hành." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Nêu được nguyên tắc hoạt động của máy biến áp. Nêu được ưu điểm của dòng điện và điện áp xoay chiều trong truyền tải năng lượng điện về phương diện khoa học và kinh tế. Thảo luận để đánh giá được vai trò của máy biến áp trong việc giảm hao phí năng lượng điện khi truyền dòng điện đi xa." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Thực hiện thí nghiệm, vẽ được đồ thị biểu diễn quan hệ giữa dòng điện chạy qua diode bán dẫn và điện áp giữa hai cực của nó. Vẽ được mạch chỉnh lưu nửa chu kì sử dụng diode." },
  { grade: "Chuyên đề 12.1", topic: "Dòng điện xoay chiều", content: "Vẽ được mạch chỉnh lưu cả chu kì sử dụng cầu chỉnh lưu. So sánh được đồ thị chỉnh lưu nửa chu kì và chỉnh lưu cả chu kì." },
  { grade: "Chuyên đề 12.2", topic: "Một số ứng dụng vật lí trong chẩn đoán y học", content: "Nêu được cách tạo ra tia X, cách điều khiển tia X, sự suy giảm tia X. Thảo luận để đánh giá được vai trò của tia X trong đời sống và trong khoa học." },
  { grade: "Chuyên đề 12.2", topic: "Một số ứng dụng vật lí trong chẩn đoán y học", content: "Mô tả được sơ lược cách chụp ảnh bằng tia X. Từ tranh ảnh (tài liệu đa phương tiện) thảo luận để rút ra được một số cách cải thiện ảnh chụp bằng tia X: giảm liều chiếu, cải thiện độ sắc nét, cải thiện độ tương phản." },
  { grade: "Chuyên đề 12.2", topic: "Một số ứng dụng vật lí trong chẩn đoán y học", content: "Nêu được sơ lược cách tạo siêu âm. Nêu được sơ lược cách tạo ra hình ảnh siêu âm các cấu trúc bên trong cơ thể. Từ tranh ảnh (tài liệu đa phương tiện) thảo luận để đánh giá được vai trò của siêu âm trong đời sống và trong khoa học." },
  { grade: "Chuyên đề 12.2", topic: "Một số ứng dụng vật lí trong chẩn đoán y học", content: "Mô tả được sơ lược cách chụp ảnh cắt lớp. Thực hiện dự án hay đề tài nghiên cứu, thiết kế được một mô hình chụp cắt lớp đơn giản. Nêu được sơ lược nguyên lí chụp cộng hưởng từ." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Nêu được tính lượng tử của bức xạ điện từ, năng lượng photon. Vận dụng được công thức tính năng lượng photon, E = hf." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Nêu được hiệu ứng quang điện là bằng chứng cho tính chất hạt của bức xạ điện từ, giao thoa và nhiễu xạ là bằng chứng cho tính chất sóng của bức xạ điện từ." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Mô tả được khái niệm giới hạn quang điện, công thoát. Giải thích được hiệu ứng quang điện dựa trên năng lượng photon và công thoát." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Giải thích được: động năng ban đầu cực đại của quang điện tử không phụ thuộc cường độ chùm sáng, cường độ dòng quang điện bão hoà tỉ lệ với cường độ chùm sáng chiếu vào. Vận dụng được phương trình Einstein để giải thích các định luật quang điện." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Ước lượng được năng lượng của các bức xạ điện từ cơ bản trong thang sóng điện từ. Thảo luận để thiết kế phương án hoặc lựa chọn phương án và thực hiện phương án, khảo sát được dòng quang điện bằng dụng cụ thực hành." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Mô tả (hoặc giải thích) được tính chất sóng của electron bằng hiện tượng nhiễu xạ electron. Vận dụng được công thức bước sóng de Broglie: lambda = h/p với p là động lượng của hạt." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Mô tả được sự tồn tại của các mức năng lượng dừng của nguyên tử. Giải thích được sự tạo thành vạch quang phổ. So sánh được quang phổ phát xạ và quang phổ vạch hấp thụ. Vận dụng được biểu thức chuyển mức năng lượng hf = E1 - E2." },
  { grade: "Chuyên đề 12.3", topic: "Vật lí lượng tử", content: "Nêu được các vùng năng lượng trong chất rắn theo mô hình vùng năng lượng đơn giản. Sử dụng được lí thuyết vùng năng lượng đơn giản để giải thích được: Sự phụ thuộc vào nhiệt độ của điện trở kim loại và bán dẫn không pha tạp; Sự phụ thuộc của điện trở của các điện trở quang (LDR) vào cường độ sáng." },
];

// ── Tạo mã YCCĐ tự động + keywords ──
function generateYCCDCode(grade: string, index: number): string {
  const gradeCode = grade.replace(/\s+/g, '').replace('Chuyênđề', 'CD');
  return `YCCD_${gradeCode}_${String(index).padStart(2, '0')}`;
}

// ── Build final dataset ──
const counterMap = new Map<string, number>();

export const YCCD_LIST: YCCD[] = RAW_YCCD_DATA.map((item) => {
  const current = (counterMap.get(item.grade) || 0) + 1;
  counterMap.set(item.grade, current);

  return {
    code: generateYCCDCode(item.grade, current),
    grade: item.grade,
    topic: item.topic,
    content: item.content,
    keywords: extractKeywords(item.content),
  };
});

// ── Helper: Lấy YCCĐ theo mã ──
export function getYCCDByCode(code: string): YCCD | undefined {
  return YCCD_LIST.find(y => y.code === code);
}

// ── Helper: Lấy YCCĐ theo grade ──
export function getYCCDByGrade(grade: string): YCCD[] {
  return YCCD_LIST.filter(y => y.grade === grade);
}

// ── Helper: Lấy display text ngắn ──
export function getYCCDShortLabel(code: string): string {
  const item = getYCCDByCode(code);
  if (!item) return code;
  const short = item.content.length > 80 ? item.content.substring(0, 80) + '...' : item.content;
  return `[${item.grade}] ${item.topic}: ${short}`;
}
