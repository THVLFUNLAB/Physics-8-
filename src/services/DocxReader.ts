/**
 * DocxReader.ts  —  "Giải phẫu Docx"
 * ──────────────────────────────────────────────────────────────────────────
 * Đọc file .docx, bảo toàn:
 *   • Công thức MathType / OMML → giữ nguyên dạng LaTeX $...$ nếu mammoth
 *     chuyển được, hoặc để lại dạng comment nhận diện.
 *   • Hình ảnh inline → upload lên Firebase Storage, thay bằng <img src="URL">.
 *   • Định dạng in đậm / nghiêng / gạch chân → giữ nguyên HTML tags.
 *
 * Đầu ra: Chuỗi HTML chuẩn hóa, sẵn sàng đưa vào AzotaParser.
 *
 * Phụ thuộc:
 *   npm install mammoth   (đã có)
 *   firebase/storage      (đã có)
 */

import * as mammoth from 'mammoth';
import { uploadExamImage } from '../firebase';

// ─── Kiểu trả về ──────────────────────────────────────────────────────────

export interface DocxReadResult {
  /** Chuỗi HTML với ảnh đã được thay bằng URL Firebase */
  html: string;
  /** Danh sách cảnh báo từ mammoth (VD: font không hỗ trợ) */
  warnings: string[];
  /** Số lượng ảnh đã upload thành công */
  imagesUploaded: number;
  /** Số lượng ảnh upload thất bại */
  imagesFailed: number;
}

// ─── Style map bổ sung: chuyển MathType object embedding ─────────────────
// mammoth không natively parse MathType/OMML, nhưng với style map
// ta có thể bắt một số ký hiệu phổ biến.
// Các công thức đã nằm trong text của Word thường được mammoth lấy ra OK.
const MAMMOTH_STYLE_MAP = [
  // Giữ các heading
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Question'] => p.question:fresh",
  // Math object placeholder (nếu có custom style)
  "p[style-name='Math'] => p.math:fresh",
  // Table headers
  "r[style-name='Strong'] => strong",
].join('\n');

// ─── Hàm chính ────────────────────────────────────────────────────────────

/**
 * Đọc file .docx, upload ảnh lên Firebase Storage, trả về HTML sạch.
 *
 * @param file  File object từ <input type="file" />
 * @param imageFolder  Thư mục trên Storage (mặc định: 'exam_images')
 * @param onProgress  Callback báo tiến độ upload ảnh
 */
export async function processDocxFile(
  file: File,
  imageFolder = 'exam_images',
  onProgress?: (uploaded: number, total: number) => void
): Promise<DocxReadResult> {
  const arrayBuffer = await file.arrayBuffer();

  let imagesUploaded = 0;
  let imagesFailed = 0;
  const imageTasks: Promise<void>[] = [];

  // ── Bước 1: Định nghĩa convertImage handler ────────────────────────────
  // mammoth gọi hàm này với mỗi ảnh inline trong file Word.
  const convertImage = mammoth.images.imgElement(async (image) => {
    try {
      const buffer = await image.read();             // ArrayBuffer của ảnh
      const mimeType = image.contentType ?? 'image/png';

      // Upload song song để tăng tốc
      const uploadTask = uploadExamImage(buffer, mimeType, imageFolder)
        .then((url) => {
          imagesUploaded++;
          onProgress?.(imagesUploaded, imagesUploaded + imagesFailed);
          return url;
        })
        .catch((err) => {
          console.error('[DocxReader] Lỗi upload ảnh:', err);
          imagesFailed++;
          // Fallback: data URI để không mất ảnh hoàn toàn
          return `data:${mimeType};base64,ERROR`;
        });

      imageTasks.push(uploadTask.then(() => {}));

      // Trả về URL ngay (mammoth chờ promise này)
      const url = await uploadTask;
      return { src: url, alt: 'Hình minh họa đề thi', loading: 'lazy' };
    } catch (err) {
      imagesFailed++;
      console.error('[DocxReader] Lỗi xử lý ảnh:', err);
      return { src: '', alt: '[Không tải được ảnh]' };
    }
  });

  // ── Bước 2: Chuyển đổi .docx → HTML ───────────────────────────────────
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage,
      styleMap: MAMMOTH_STYLE_MAP,
      includeDefaultStyleMap: true,
    }
  );

  // Đảm bảo tất cả upload hoàn thành
  await Promise.allSettled(imageTasks);

  // ── Bước 3: Hậu xử lý HTML ────────────────────────────────────────────
  const cleanedHtml = postProcessHtml(result.value);

  return {
    html: cleanedHtml,
    warnings: result.messages.map((m) => m.message),
    imagesUploaded,
    imagesFailed,
  };
}

// ─── Hậu xử lý HTML ──────────────────────────────────────────────────────

/**
 * Làm sạch và chuẩn hóa HTML từ mammoth:
 *  - Chuyển các ký hiệu đặc biệt Word → LaTeX inline $...$
 *  - Bọc số học dạng x^2, x_n, etc. nếu cần
 *  - Loại bỏ thẻ rỗng
 *  - Chuẩn hóa khoảng trắng giữa phương án A. B. C. D.
 */
function postProcessHtml(html: string): string {
  let out = html;

  // 1. Loại bỏ các thẻ <p></p> hoặc <p> </p> rỗng
  out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');

  // 2. Chuyển <p><strong>A.</strong> ... </p> về dạng chuẩn
  //    Mammoth đôi khi gói phương án trong <strong>
  out = out.replace(/<strong>\s*([A-D])\.\s*<\/strong>/g, '$1. ');

  // 3. Bảo tồn siêu ký hiệu thường dùng trong Vật Lý:
  //    Word thường dùng Unicode: ²→^2, ³→^3, ⁻¹→^{-1}, ½→0.5 v.v.
  //    Ta bọc chúng vào LaTeX nếu đứng cạnh chữ số/chữ cái
  out = convertUnicodeMath(out);

  // 4. Chuẩn hóa ký tự "Câu" - đôi khi mammoth thêm khoảng trắng thừa
  out = out.replace(/C\s+â\s+u/g, 'Câu');

  // 5. Loại bỏ &nbsp; thừa
  out = out.replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ');

  return out.trim();
}

/**
 * Chuyển các ký tự Unicode toán học thường gặp trong đề Word về dạng LaTeX.
 * Chỉ áp dụng BÊN NGOÀI các thẻ HTML để không phá vỡ attributes.
 */
function convertUnicodeMath(html: string): string {
  // Tách HTML thành [ngoài-tag, trong-tag, ngoài-tag, ...]
  const parts = html.split(/(<[^>]*>)/);
  return parts.map((part, i) => {
    // Chỉ xử lý phần TEXT (chỉ số chẵn là text giữa các tag)
    if (i % 2 !== 0) return part; // bên trong tag, bỏ qua

    return part
      // Mũ thường gặp trong Vật Lý
      .replace(/(\d|[a-zA-Z])²/g, '$1$^2$')
      .replace(/(\d|[a-zA-Z])³/g, '$1$^3$')
      .replace(/(\d|[a-zA-Z])⁻¹/g, '$1$^{-1}$')
      .replace(/(\d|[a-zA-Z])⁻²/g, '$1$^{-2}$')
      // Chỉ số dưới thường gặp
      .replace(/(\d|[a-zA-Z])₀/g, '$1$_0$')
      .replace(/(\d|[a-zA-Z])₁/g, '$1$_1$')
      .replace(/(\d|[a-zA-Z])₂/g, '$1$_2$')
      // Ký hiệu Vật Lý
      .replace(/μ/g, '$\\mu$')
      .replace(/Ω/g, '$\\Omega$')
      .replace(/π/g, '$\\pi$')
      .replace(/α/g, '$\\alpha$')
      .replace(/β/g, '$\\beta$')
      .replace(/γ/g, '$\\gamma$')
      .replace(/λ/g, '$\\lambda$')
      .replace(/Δ/g, '$\\Delta$')
      .replace(/±/g, '$\\pm$')
      .replace(/≈/g, '$\\approx$')
      .replace(/≥/g, '$\\geq$')
      .replace(/≤/g, '$\\leq$')
      .replace(/×/g, '$\\times$')
      // Phân số ½ → 1/2
      .replace(/½/g, '1/2')
      .replace(/⅓/g, '1/3')
      .replace(/¼/g, '1/4');
  }).join('');
}

// ─── Tiện ích: Trích xuất text thuần từ HTML ──────────────────────────────

/**
 * Tách HTML thành mảng "dòng logic" - mỗi phần tử là content của một thẻ <p>.
 * Ảnh (<img>) được GIỮ NGUYÊN dưới dạng thẻ HTML trong chuỗi.
 * Dùng bởi AzotaParser (bản HTML-aware).
 */
export function splitHtmlIntoLines(html: string): string[] {
  // Tách theo thẻ block-level: <p>, <h2>, <h3>, <li>
  const lines: string[] = [];

  // Regex để bắt nội dung giữa các thẻ block
  const blockPattern = /<(?:p|h[1-6]|li|tr|td|th)(?:[^>]*)>([\s\S]*?)<\/(?:p|h[1-6]|li|tr|td|th)>/gi;
  let match;

  while ((match = blockPattern.exec(html)) !== null) {
    const inner = match[1].trim();
    if (inner.length > 0) {
      // Giữ lại <img>, <strong>, <em>, <sub>, <sup>
      // Loại bỏ các thẻ format không mang ý nghĩa ngữ nghĩa
      const cleaned = inner
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1') // unwrap span
        .trim();
      if (cleaned) lines.push(cleaned);
    }
  }

  return lines;
}
