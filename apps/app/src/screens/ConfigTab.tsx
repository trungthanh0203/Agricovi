import { Collapsible } from '../components/Collapsible';
import { CONFIG_LISTS } from '../lib/config';

/**
 * Tab Cấu hình (giống tab Tài khoản: các khối thu gọn): những danh sách mặc định nhỏ của hệ thống.
 * Chỗ nào cần (ví dụ chọn nhóm loại sản phẩm) sẽ lấy từ đây. Cấu hình mới thêm vào CONFIG_LISTS ở lib/config.ts.
 */
export function ConfigTab() {
  return (
    <section>
      <h1>Cấu hình</h1>
      <p className="muted">Các danh sách mặc định của hệ thống. Những chỗ cần chọn sẽ lấy từ đây.</p>
      {CONFIG_LISTS.map((l) => (
        <Collapsible key={l.id} title={l.title} summary={l.items.map((i) => i.label).join(' · ')} defaultOpen>
          <p className="muted">{l.hint}</p>
          <ul className="plain">
            {l.items.map((i) => <li key={i.id}>{i.label}</li>)}
          </ul>
        </Collapsible>
      ))}
    </section>
  );
}
