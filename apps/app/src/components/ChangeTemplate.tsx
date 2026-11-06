import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { listTemplates, type TemplateRow } from '../lib/templates';

/**
 * "Đổi quy trình" cho vụ CHƯA BẮT ĐẦU việc nào và chưa có nhật ký / thu hoạch (máy chủ ép lại). Các việc và mốc an toàn được tạo lại từ quy trình mới
 * theo đúng ngày bắt đầu hiện tại. Chỉ liệt kê quy trình còn dùng, cùng sản phẩm, của cơ sở sở hữu vụ.
 */
export function ChangeTemplate({ ownerOrgId, cropTypeId, currentTemplateId, busy, onChange }: {
  ownerOrgId: string; cropTypeId: string; currentTemplateId: string | null | undefined; busy: boolean; onChange: (templateId: string) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listTemplates(ownerOrgId)
      .then((r) => { if (alive) setRows(r.filter((t) => t.is_active && t.crop_type_id === cropTypeId && t.id !== currentTemplateId && t.template_stages.length > 0)); })
      .catch((e) => { if (alive) { setRows([]); setError(friendlyError(e)); } });
    return () => { alive = false; };
  }, [ownerOrgId, cropTypeId, currentTemplateId]);
  return (
    <div className="inline-form">
      <p className="muted">Dùng khi chọn nhầm quy trình lúc tạo vụ. Các việc của vụ được tạo lại từ quy trình mới theo ngày bắt đầu hiện tại. Chỉ đổi được khi chưa có việc nào bắt đầu và chưa có nhật ký, thu hoạch.</p>
      {rows === null ? <p className="muted">Đang tải…</p> : rows.length === 0 ? <p className="muted">Không có quy trình khác của sản phẩm này để đổi sang. Tạo hoặc áp dụng thêm quy trình ở Khai báo → Quy trình mẫu.</p> : (
        <>
          <label>Quy trình mới
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— Chọn quy trình —</option>
              {rows.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.template_stages.length} việc)</option>)}
            </select>
          </label>
          {error && <p className="msg error" role="alert">{error}</p>}
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !pick}
              onClick={() => {
                if (!window.confirm('Đổi sang quy trình đã chọn? Các việc hiện tại của vụ sẽ được thay bằng các việc của quy trình mới.')) return;
                setError(null);
                void onChange(pick).then(() => setPick('')).catch((e) => setError(friendlyError(e)));
              }}>Đổi quy trình</button>
          </div>
        </>
      )}
    </div>
  );
}
