import type { ReactNode } from 'react';

/**
 * Mục thu gọn được (dùng thẻ <details> có sẵn của trình duyệt: bàn phím và trình đọc màn hình dùng được, không cần mã thêm).
 * Mặc định thu gọn để màn hình ngắn; dòng tóm tắt cho biết bên trong có gì mà không cần mở.
 *  - mặc định: một thẻ có tiêu đề (cho cả khối như "Thành viên").
 *  - inline: một dòng "＋ Việc gì đó" mở ra biểu mẫu (cho biểu mẫu thêm mới nằm trong khối).
 */
export function Collapsible({ title, summary, inline, defaultOpen, warn, children }: {
  title: string;
  summary?: ReactNode;
  inline?: boolean;
  defaultOpen?: boolean;
  /** Tô dòng tóm tắt màu cảnh báo (chữ vẫn đủ nghĩa, không chỉ dựa vào màu) */
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={inline ? 'fold inline' : 'fold'} open={defaultOpen}>
      <summary>
        <span className="fold-title">{title}</span>
        {summary !== undefined && summary !== null && <span className={warn ? 'fold-sum warn' : 'fold-sum'}>{summary}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
