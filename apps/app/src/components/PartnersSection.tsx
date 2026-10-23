import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createSupplier, listSuppliers, updateSupplier, type Partner, type PartnerInput } from '../lib/partners';
import { canPerm } from '../lib/permissions';

/**
 * Nhà cung ứng của cơ sở (G2-2): danh bạ nơi mua vật tư, giống, dịch vụ. Thêm bằng biểu mẫu, sửa bằng ✎, dừng/dùng lại bằng ⏸/▶.
 * Xem cần quyền xem mục Chi phí; thêm/sửa cần quyền sửa mục Chi phí. Cần mạng; không lưu trên máy vì có giá và công nợ.
 */
export function PartnersSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [rows, setRows] = useState<Partner[] | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgId = active?.id;

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await listSuppliers(orgId)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!active || !orgId) return null;
  const canEdit = canPerm(active.perms, 'expenses', 'edit');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); await load(); } finally { setBusy(false); }
  }

  const shown = (rows ?? []).filter((p) => showOff || p.is_active);
  const editRow = rows?.find((p) => p.id === editing) ?? null;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: danh sách nhà cung ứng cần có mạng để xem và sửa.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canEdit && !adding && !editRow && (
        <div className="actions"><button className="primary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm nhà cung ứng</button></div>
      )}
      {canEdit && adding && (
        <SupplierForm title="Thêm nhà cung ứng" busy={busy || !online} onClose={() => setAdding(false)}
          onSave={(f) => run(async () => { await createSupplier(orgId, f); setAdding(false); })} />
      )}

      <h2 className="sect">Nhà cung ứng ({shown.length})</h2>
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && shown.length === 0 && <p className="muted">Chưa có nhà cung ứng nào. Thêm nơi bạn hay mua vật tư để ghi hóa đơn và theo dõi công nợ.</p>}
      {shown.length > 0 && (
        <table className="grid">
          <thead><tr><th>Tên</th><th>Điện thoại</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'off'}>
                <td>
                  {p.name}
                  {p.goods && <span className="sub">{p.goods}</span>}
                  {p.address && <span className="sub">{p.address}</span>}
                  {!p.is_active && <span className="sub">Đã dừng</span>}
                </td>
                <td>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : '—'}</td>
                <td className="act">
                  {canEdit && (
                    <>
                      <button className="icon" disabled={busy || !online} aria-label={`Sửa ${p.name}`} onClick={() => { setAdding(false); setEditing(p.id); }}>✎</button>{' '}
                      <button className="icon" disabled={busy || !online} aria-label={p.is_active ? `Dừng ${p.name}` : `Dùng lại ${p.name}`}
                        onClick={() => void run(() => updateSupplier(p, { is_active: !p.is_active }))}>{p.is_active ? '⏸' : '▶'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả nhà cung ứng đã dừng</label>
      <p className="muted">Nhà cung ứng đã dừng vẫn giữ lịch sử mua nhưng không chọn được cho hóa đơn mới. Thông tin này riêng tư, không công khai trên website.</p>

      {canEdit && editRow && (
        <SupplierForm key={editRow.id} title={`Sửa nhà cung ứng: ${editRow.name}`} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateSupplier(editRow, f); setEditing(null); })} />
      )}
    </>
  );
}

/** Biểu mẫu thêm/sửa nhà cung ứng (cũng dùng khi thêm nhanh lúc nhập hóa đơn) */
export function SupplierForm({ title, initial, busy, onSave, onClose }: {
  title: string; initial?: Partner; busy: boolean; onSave: (f: PartnerInput) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [goods, setGoods] = useState(initial?.goods ?? '');
  const [tax, setTax] = useState(initial?.tax_code ?? '');
  const [bank, setBank] = useState(initial?.bank_account ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Tên nhà cung ứng<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Đại lý vật tư An Phát" /></label>
        <label>Điện thoại<input value={phone} maxLength={40} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Địa chỉ<input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>Loại hàng thường mua<input value={goods} maxLength={300} onChange={(e) => setGoods(e.target.value)} placeholder="Phân bón, thuốc bảo vệ thực vật, giống…" /></label>
        <label>Mã số thuế (nếu có)<input value={tax} maxLength={40} onChange={(e) => setTax(e.target.value)} /></label>
        <label>Tài khoản ngân hàng (nếu có)<input value={bank} maxLength={120} onChange={(e) => setBank(e.target.value)} /></label>
        <label>Ghi chú<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Hãy nhập tên nhà cung ứng (ít nhất 2 ký tự).');
            setErr(null);
            void onSave({ name, phone, address, goods, tax_code: tax, bank_account: bank, note }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
