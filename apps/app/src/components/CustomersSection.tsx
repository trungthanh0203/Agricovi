import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import {
  CUSTOMER_KIND_LABEL, createCustomer, listAllPartners, listCustomers, updateCustomer, type Customer, type CustomerInput, type CustomerKind,
} from '../lib/partners';
import { canPerm } from '../lib/permissions';

type Existing = Awaited<ReturnType<typeof listAllPartners>>[number];

/**
 * Khách hàng của cơ sở (G2-4): danh bạ nơi bán nông sản. Dùng chung bảng Đối tác với nhà cung ứng: tên đã có trong danh bạ nhà cung ứng thì
 * được gợi ý "Đánh dấu thêm là khách hàng" thay vì tạo trùng. Xem cần quyền xem Doanh thu; thêm/sửa cần quyền sửa Doanh thu.
 * Cần mạng; không lưu trên máy vì là thông tin cá nhân và công nợ.
 */
export function CustomersSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [all, setAll] = useState<Existing[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dupe, setDupe] = useState<{ existing: Existing; input: CustomerInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgId = active?.id;

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const [c, a] = await Promise.all([listCustomers(orgId), listAllPartners(orgId).catch(() => [] as Existing[])]);
      setRows(c);
      setAll(a);
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!active || !orgId) return null;
  const canEdit = canPerm(active.perms, 'sales', 'edit');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); await load(); } finally { setBusy(false); }
  }

  /** Thêm khách; nếu tên đã có trong danh bạ (ví dụ là nhà cung ứng) thì hỏi đánh dấu thêm thay vì tạo trùng */
  async function addCustomer(f: CustomerInput) {
    const key = f.name.trim().toLowerCase();
    const hit = all.find((p) => p.name.trim().toLowerCase() === key);
    if (hit) {
      if (hit.is_customer) throw new Error('INVALID_PARTNER: Khách hàng này đã có trong danh sách.');
      setDupe({ existing: hit, input: f });
      return;
    }
    await createCustomer(orgId!, f);
    setAdding(false);
  }

  const shown = (rows ?? []).filter((p) => showOff || p.is_active);
  const editRow = rows?.find((p) => p.id === editing) ?? null;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: danh sách khách hàng cần có mạng để xem và sửa.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canEdit && !adding && !editRow && !dupe && (
        <div className="actions"><button className="primary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm khách hàng</button></div>
      )}
      {dupe && (
        <div className="card">
          <p><strong>"{dupe.existing.name}"</strong> đã có trong danh bạ (đang là nhà cung ứng). Đánh dấu thêm là khách hàng để dùng chung một hồ sơ?</p>
          <div className="btnrow">
            <button className="primary" disabled={busy || !online}
              onClick={() => void run(async () => { await updateCustomer(dupe.existing, { is_customer: true, customer_kind: dupe.input.customer_kind || undefined }); setDupe(null); setAdding(false); })}>Đánh dấu là khách hàng</button>
            <button className="secondary" onClick={() => setDupe(null)}>Quay lại</button>
          </div>
        </div>
      )}
      {canEdit && adding && !dupe && (
        <CustomerForm title="Thêm khách hàng" busy={busy || !online} onClose={() => setAdding(false)} onSave={(f) => run(() => addCustomer(f))} />
      )}

      <h2 className="sect">Khách hàng ({shown.length})</h2>
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && shown.length === 0 && <p className="muted">Chưa có khách hàng nào. Thêm nơi bạn hay bán nông sản để ghi lần bán và theo dõi công nợ.</p>}
      {shown.length > 0 && (
        <table className="grid">
          <thead><tr><th>Tên</th><th>Điện thoại</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'off'}>
                <td>
                  {p.name}
                  {p.customer_kind && <span className="sub">{CUSTOMER_KIND_LABEL[p.customer_kind]}</span>}
                  {p.goods && <span className="sub">{p.goods}</span>}
                  {p.is_supplier && <span className="sub">Cũng là nhà cung ứng</span>}
                  {!p.is_active && <span className="sub">Đã dừng</span>}
                </td>
                <td>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : '—'}</td>
                <td className="act">
                  {canEdit && (
                    <>
                      <button className="icon" disabled={busy || !online} aria-label={`Sửa ${p.name}`} onClick={() => { setAdding(false); setEditing(p.id); }}>✎</button>{' '}
                      <button className="icon" disabled={busy || !online} aria-label={p.is_active ? `Dừng ${p.name}` : `Dùng lại ${p.name}`}
                        onClick={() => void run(() => updateCustomer(p, { is_active: !p.is_active }))}>{p.is_active ? '⏸' : '▶'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả khách hàng đã dừng</label>
      <p className="muted">Khách đã dừng vẫn giữ lịch sử mua nhưng không chọn được cho lần bán mới. Thông tin khách là dữ liệu cá nhân: riêng tư, không công khai trên website.</p>

      {canEdit && editRow && (
        <CustomerForm key={editRow.id} title={`Sửa khách hàng: ${editRow.name}`} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateCustomer(editRow, f); setEditing(null); })} />
      )}
    </>
  );
}

/** Biểu mẫu thêm/sửa khách hàng (cũng dùng khi thêm nhanh lúc ghi lần bán) */
export function CustomerForm({ title, initial, busy, onSave, onClose }: {
  title: string; initial?: Customer; busy: boolean; onSave: (f: CustomerInput) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<CustomerKind | ''>(initial?.customer_kind ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [goods, setGoods] = useState(initial?.goods ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Tên khách hàng<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chị Lan (chợ đầu mối)" /></label>
        <label>Loại khách
          <select value={kind} onChange={(e) => setKind(e.target.value as CustomerKind | '')}>
            <option value="">— Chưa phân loại —</option>
            {(Object.keys(CUSTOMER_KIND_LABEL) as CustomerKind[]).map((k) => <option key={k} value={k}>{CUSTOMER_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Điện thoại<input value={phone} maxLength={40} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Địa chỉ<input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>Nhu cầu thường mua<input value={goods} maxLength={300} onChange={(e) => setGoods(e.target.value)} placeholder="Dưa lưới loại 1, số lượng lớn…" /></label>
        <label>Ghi chú<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Hãy nhập tên khách hàng (ít nhất 2 ký tự).');
            setErr(null);
            void onSave({ name, customer_kind: kind, phone, address, goods, note }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
