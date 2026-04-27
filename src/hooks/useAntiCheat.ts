import { useEffect } from 'react';

/**
 * Hook `useAntiCheat` giúp ngăn chặn hành vi copy và mở DevTools.
 * Lưu ý: Chỉ là lớp bảo vệ cơ bản trên frontend, không thể cấm tuyệt đối nếu user dùng công cụ phân tích network.
 */
export function useAntiCheat(isActive: boolean = true) {
  useEffect(() => {
    if (!isActive) return;

    // Chặn Right Click (Context Menu)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Chặn các tổ hợp phím mở DevTools và Copy
    const handleKeyDown = (e: KeyboardEvent) => {
      // 123 = F12
      if (e.keyCode === 123) {
        e.preventDefault();
      }
      // Ctrl+Shift+I (Inspect)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
      }
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
        e.preventDefault();
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
      }
      // Ctrl+C (Copy)
      if (e.ctrlKey && e.keyCode === 67) {
        // Chỉ chặn copy nếu đang khóa bảo mật (nếu muốn cho copy ở mức bình thường thì bỏ qua dòng này)
        e.preventDefault();
      }
    };

    // Chặn Copy event (qua chuột)
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', 'Nội dung thuộc bản quyền hệ thống.');
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
    };
  }, [isActive]);
}
