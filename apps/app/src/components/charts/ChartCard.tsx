import type { ReactNode } from 'react';

export interface AltTable { columns: string[]; rows: (string | number)[][] }

/**
 * Khung của một biểu đồ: tiêu đề, dòng phụ (công thức, khoảng thời gian, "Cập nhật lúc…"), nội dung biểu đồ, và mục "Xem dạng bảng"
 * cho người dùng trình đọc màn hình hoặc muốn xem số đầy đủ (biểu đồ nào cũng có bản bảng thay thế).
 */
export function ChartCard({ title, subtitle, children, table, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: AltTable; footer?: ReactNode }) {
  return (
    <figure className="chartcard">
      <figcaption>
        <strong>{title}</strong>
        {subtitle && <span className="muted">{subtitle}</span>}
      </figcaption>
      {children}
      {table && table.rows.length > 0 && (
        <details className="chart-table">
          <summary>Xem dạng bảng</summary>
          <div className="scrollx">
            <table className="grid">
              <thead><tr>{table.columns.map((c, i) => <th key={c} className={i === 0 ? '' : 'num'}>{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j === 0 ? '' : 'num'}>{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
      {footer && <div className="chart-foot muted">{footer}</div>}
    </figure>
  );
}
