import { useState, type FormEvent, type ReactNode } from 'react';
import { clean, downloadCsv, Err, fmtDate, rpc, useLoad, vnd } from '@agriconnect/admin-kit';

/**
 * Đối tác giới thiệu và hoa hồng (D131). Mã giới thiệu gắn vào cơ sở lúc đăng ký; khi ghi nhận thanh toán của cơ sở thì hệ thống tự tạo
 * dòng hoa hồng (tổng thu x tỷ lệ). Dòng hoa hồng chờ đủ số ngày xác nhận mới chi được, phòng khách hoàn tiền.
 */
export const KIND_LABEL: Record<string, string> = { agent: 'Đại lý vật tư', user: 'Người dùng', association: 'Hội / đoàn thể', coop: 'Hợp tác xã', other: 'Khác' };
const COMM_LABEL: Record<string, string> = { waiting: 'Chờ xác nhận', payable: 'Có thể chi', paid: 'Đã chi', void: 'Đã hủy' };
const COMM_CLS: Record<string, string> = { waiting: 'warn', payable: 'info', paid: 'ok', void: 'bad' };
const SUB_LABEL: Record<string, string> = { trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa', none: 'Chưa có gói' };

interface PartnerRow {
  id: string; code: string; kind: string; name: string; phone: string | null; active: boolean; commission_pct: number; renewal_pct: number;
  referred: number; paying: number; revenue: number; payable: number; waiting: number; paid: number;
}
interface PartnerFull {
  id: string; code: string; kind: string; name: string; phone: string | null; bank_info: string | null; commission_pct: number; renewal_pct: number;
  months_eligible: number; hold_days: number; active: boolean; note: string | null; signed_at: string | null; organization_id: string | null;
}
interface Detail {
  partner: PartnerFull;
  orgs: { id: string; name: string; type: string; referred_at: string | null; status: string; paid_total: number }[];
  commissions: { id: string; org_name: string; paid_at: string; base_amount: number; pct: number; amount: number; payable_after: string; status: string; paid_on: string | null; paid_method: string | null; void_reason: string | null }[];
}

function Kpi({ label, value, tone, note }: { label: string; value: ReactNode; tone?: string; note?: string }) {
  return <div className={`kpi ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
const today = () => new Date().toLocaleDateString('en-CA');

const EMPTY = { code: '', kind: 'agent', name: '', phone: '', bank_info: '', commission_pct: '15', renewal_pct: '0', months_eligible: '12', hold_days: '30', signed_at: '', note: '', active: true };
type Form = typeof EMPTY;
const toForm = (p: PartnerFull): Form => ({
  code: p.code, kind: p.kind, name: p.name, phone: p.phone ?? '', bank_info: p.bank_info ?? '', commission_pct: String(p.commission_pct), renewal_pct: String(p.renewal_pct),
  months_eligible: String(p.months_eligible), hold_days: String(p.hold_days), signed_at: p.signed_at ?? '', note: p.note ?? '', active: p.active,
});

/** Biểu mẫu thêm và sửa đối tác dùng chung một chỗ, cùng các trường */
function PartnerForm({ id, init, onDone, onCancel }: { id: string | null; init: Form; onDone: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<Form>(init);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onDone(await rpc<string>('admin_partner_save', { p_id: id, p_data: { ...f, code: f.code.trim().toUpperCase() } })); }
    catch (x) { setErr(clean((x as Error).message)); } finally { setBusy(false); }
  }
  return (
    <form className="form card" onSubmit={(e) => void submit(e)}>
      <h2>{id ? 'Sửa đối tác' : 'Thêm đối tác'}</h2>
      <Err e={err} />
      <label>Mã giới thiệu (chữ không dấu, số, gạch ngang)<input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="DL-HUNG" /></label>
      <label>Loại đối tác<select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Tên đối tác / đơn vị<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label>Điện thoại / Zalo<input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></label>
      <label>Nơi nhận tiền (ngân hàng, số tài khoản)<input value={f.bank_info} onChange={(e) => set('bank_info', e.target.value)} /></label>
      <label>Hoa hồng trong thời hạn hưởng (%)<input value={f.commission_pct} onChange={(e) => set('commission_pct', e.target.value)} inputMode="decimal" /></label>
      <label>Thời hạn hưởng (tháng, tính từ lần thu đầu của khách)<input value={f.months_eligible} onChange={(e) => set('months_eligible', e.target.value)} inputMode="numeric" /></label>
      <label>Hoa hồng khi khách tái ký sau thời hạn (%)<input value={f.renewal_pct} onChange={(e) => set('renewal_pct', e.target.value)} inputMode="decimal" /></label>
      <label>Số ngày chờ xác nhận trước khi được chi<input value={f.hold_days} onChange={(e) => set('hold_days', e.target.value)} inputMode="numeric" /></label>
      <label>Ngày ký thỏa thuận<input type="date" value={f.signed_at} onChange={(e) => set('signed_at', e.target.value)} /></label>
      <label>Ghi chú<input value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Đang hoạt động (khóa thì mã không nhận khách mới và không phát sinh hoa hồng mới)</label>
      <p className="muted">Hội, đơn vị nhà nước: để hoa hồng 0% (chỉ thống kê số khách giới thiệu), không chi tiền cá nhân.</p>
      <div className="toolbar"><button className="primary" disabled={busy}>Lưu</button><button type="button" onClick={onCancel}>Hủy</button></div>
    </form>
  );
}

function PartnerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: d, error, reload } = useLoad(() => rpc<Detail>('admin_partner_detail', { p_id: id }), [id]);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState('Chuyển khoản');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); setSel([]); reload(); } catch (e) { setErr(clean((e as Error).message)); } finally { setBusy(false); }
  }
  if (error) return <><button onClick={onBack}>‹ Danh sách đối tác</button><Err e={error} /></>;
  if (!d) return <p className="muted">Đang tải…</p>;
  const p = d.partner;
  const sum = (st: string) => d.commissions.filter((c) => c.status === st).reduce((s, c) => s + Number(c.amount), 0);
  const selTotal = d.commissions.filter((c) => sel.includes(c.id)).reduce((s, c) => s + Number(c.amount), 0);
  const toggle = (cid: string) => setSel((x) => (x.includes(cid) ? x.filter((i) => i !== cid) : [...x, cid]));
  return (
    <>
      <button onClick={onBack}>‹ Danh sách đối tác</button>
      <h2 style={{ marginTop: 12 }}>{p.name} <span className="badge info">{p.code}</span> {!p.active && <span className="badge bad">Đã khóa</span>}</h2>
      <p className="muted">{KIND_LABEL[p.kind]} · {p.phone ?? 'chưa có số điện thoại'} · hoa hồng {p.commission_pct}% trong {p.months_eligible} tháng, sau đó {p.renewal_pct}% · chờ {p.hold_days} ngày
        {p.bank_info ? ` · nhận tiền: ${p.bank_info}` : ''}{p.signed_at ? ` · ký ${fmtDate(p.signed_at)}` : ''}</p>
      <Err e={err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      <div className="kpis">
        <Kpi label="Khách đã giới thiệu" value={d.orgs.length} note={`${d.orgs.filter((o) => Number(o.paid_total) > 0).length} đã trả phí`} />
        <Kpi label="Chờ xác nhận" value={vnd(sum('waiting'))} tone="warn" />
        <Kpi label="Có thể chi" value={vnd(sum('payable'))} tone="info" />
        <Kpi label="Đã chi" value={vnd(sum('paid'))} tone="ok" />
      </div>
      {editing
        ? <PartnerForm id={p.id} init={toForm(p)} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); reload(); }} />
        : <p><button onClick={() => setEditing(true)}>Sửa thông tin đối tác</button></p>}
      <section className="card">
        <h2>Hoa hồng</h2>
        <table className="list"><thead><tr><th></th><th>Khách</th><th>Ngày thu</th><th>Tổng thu</th><th>Tỷ lệ</th><th>Hoa hồng</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {d.commissions.length === 0 && <tr><td colSpan={8} className="muted">Chưa có khoản hoa hồng nào. Hoa hồng tự phát sinh khi ghi nhận thanh toán của khách do đối tác này giới thiệu.</td></tr>}
            {d.commissions.map((c) => (
              <tr key={c.id}>
                <td>{c.status === 'payable' && <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} aria-label="Chọn khoản này để chi" style={{ width: 'auto' }} />}</td>
                <td>{c.org_name}</td><td>{fmtDate(c.paid_at)}</td><td>{vnd(c.base_amount)}</td><td>{c.pct}%</td><td><strong>{vnd(c.amount)}</strong></td>
                <td><span className={`badge ${COMM_CLS[c.status]}`}>{COMM_LABEL[c.status]}</span>
                  {c.status === 'waiting' && <><br /><small className="muted">được chi từ {fmtDate(c.payable_after)}</small></>}
                  {c.status === 'paid' && <><br /><small className="muted">{fmtDate(c.paid_on)}{c.paid_method ? ` · ${c.paid_method}` : ''}</small></>}
                  {c.status === 'void' && <><br /><small className="muted">{c.void_reason}</small></>}</td>
                <td>{(c.status === 'waiting' || c.status === 'payable') && (
                  <button disabled={busy} onClick={() => { const r = window.prompt('Lý do hủy khoản hoa hồng này (ví dụ khách đã hoàn tiền)?'); if (r) void run(() => rpc('admin_commission_void', { p_id: c.id, p_reason: r }), 'Đã hủy khoản hoa hồng.'); }}>Hủy</button>)}</td>
              </tr>
            ))}
          </tbody></table>
        {sel.length > 0 && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => rpc('admin_commission_pay', { p_ids: sel, p_paid_at: paidAt, p_method: method, p_note: note }), 'Đã ghi nhận chi hoa hồng.'); }}>
            <h2>Ghi nhận chi {sel.length} khoản · {vnd(selTotal)}</h2>
            <label>Hình thức chi<input value={method} onChange={(e) => setMethod(e.target.value)} /></label>
            <label>Ngày chi<input type="date" value={paidAt} max={today()} onChange={(e) => setPaidAt(e.target.value)} /></label>
            <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="primary" disabled={busy}>Ghi nhận đã chi</button>
          </form>)}
        <p className="muted">Chi tiền thật bằng chuyển khoản ngoài hệ thống, sau đó chọn các khoản và bấm ghi nhận. Cá nhân nhận hoa hồng có thể phải khấu trừ thuế thu nhập cá nhân: hỏi kế toán.</p>
      </section>
      <section className="card">
        <h2>Khách đã giới thiệu</h2>
        <table className="list"><thead><tr><th>Cơ sở</th><th>Loại</th><th>Ngày gắn mã</th><th>Gói</th><th>Đã thu</th></tr></thead>
          <tbody>
            {d.orgs.length === 0 && <tr><td colSpan={5} className="muted">Chưa có khách nào nhập mã này.</td></tr>}
            {d.orgs.map((o) => <tr key={o.id}><td>{o.name}</td><td>{o.type === 'cooperative' ? 'Hợp tác xã' : 'Hộ'}</td><td>{fmtDate(o.referred_at)}</td><td>{SUB_LABEL[o.status] ?? o.status}</td><td>{vnd(o.paid_total)}</td></tr>)}
          </tbody></table>
      </section>
    </>
  );
}

export function PartnersPage() {
  const { data: rows, error, reload } = useLoad(() => rpc<PartnerRow[]>('admin_partner_list'));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (open) return <PartnerDetail id={open} onBack={() => { setOpen(null); reload(); }} />;
  const all = rows ?? [];
  const total = (k: 'payable' | 'waiting' | 'paid') => all.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <>
      <div className="kpis">
        <Kpi label="Đối tác" value={all.length} note={`${all.filter((r) => r.active).length} đang hoạt động`} />
        <Kpi label="Khách đã giới thiệu" value={all.reduce((s, r) => s + r.referred, 0)} note={`${all.reduce((s, r) => s + r.paying, 0)} đã trả phí`} />
        <Kpi label="Có thể chi" value={vnd(total('payable'))} tone="info" />
        <Kpi label="Chờ xác nhận" value={vnd(total('waiting'))} tone="warn" />
        <Kpi label="Đã chi" value={vnd(total('paid'))} tone="ok" />
      </div>
      <div className="toolbar">
        <button className="primary" onClick={() => setAdding(true)}>Thêm đối tác</button>
        <button disabled={!all.length} onClick={() => downloadCsv('doi-tac.csv', [['Mã', 'Tên', 'Loại', 'Điện thoại', 'Hoa hồng %', 'Khách', 'Đã trả phí', 'Doanh thu', 'Có thể chi', 'Chờ xác nhận', 'Đã chi'],
          ...all.map((r) => [r.code, r.name, KIND_LABEL[r.kind] ?? r.kind, r.phone ?? '', r.commission_pct, r.referred, r.paying, r.revenue, r.payable, r.waiting, r.paid])])}>Xuất CSV</button>
      </div>
      <Err e={error} />
      {adding && <PartnerForm id={null} init={EMPTY} onCancel={() => setAdding(false)} onDone={(id) => { setAdding(false); setOpen(id); }} />}
      <table className="list"><thead><tr><th>Mã</th><th>Đối tác</th><th>Hoa hồng</th><th>Khách</th><th>Doanh thu</th><th>Có thể chi</th><th>Chờ xác nhận</th><th>Đã chi</th></tr></thead>
        <tbody>
          {all.length === 0 && <tr><td colSpan={8} className="muted">Chưa có đối tác. Người dùng tự có mã riêng ở menu Hỗ trợ &amp; Chia sẻ trong app; đại lý, hội, HTX thì thêm ở đây.</td></tr>}
          {all.map((r) => (
            <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
              <td><strong>{r.code}</strong>{!r.active && <><br /><small className="muted">đã khóa</small></>}</td>
              <td>{r.name}<br /><small className="muted">{KIND_LABEL[r.kind]}</small></td>
              <td>{r.commission_pct}%{Number(r.renewal_pct) > 0 && <small className="muted"> / tái ký {r.renewal_pct}%</small>}</td>
              <td>{r.referred}<small className="muted"> ({r.paying} trả phí)</small></td>
              <td>{vnd(r.revenue)}</td><td>{vnd(r.payable)}</td><td>{vnd(r.waiting)}</td><td>{vnd(r.paid)}</td>
            </tr>
          ))}
        </tbody></table>
    </>
  );
}

/** Khối "Đối tác giới thiệu" trong trang chi tiết cơ sở: xem, gắn hoặc gỡ mã (có lý do, ghi nhật ký kiểm toán) */
export function OrgReferral({ orgId }: { orgId: string }) {
  const { data, error, reload } = useLoad(() => rpc<{ code: string; name: string; kind: string; referred_at: string } | null>('admin_org_referral', { p_org: orgId }), [orgId]);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    try { await rpc('admin_org_set_referral', { p_org: orgId, p_code: code.trim(), p_reason: reason }); setMsg(code.trim() ? 'Đã gắn đối tác.' : 'Đã gỡ đối tác.'); setCode(''); setReason(''); reload(); }
    catch (x) { setErr(clean((x as Error).message)); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <h2>Đối tác giới thiệu</h2>
      <Err e={error} /><Err e={err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      <p>{data ? <><strong>{data.name}</strong> ({data.code}) · {KIND_LABEL[data.kind]} · từ {fmtDate(data.referred_at)}</> : <span className="muted">Chưa có đối tác giới thiệu.</span>}</p>
      <form className="form" onSubmit={(e) => void save(e)}>
        <label>Mã đối tác mới (để trống = gỡ đối tác hiện tại)<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DL-HUNG" /></label>
        <label>Lý do (bắt buộc)<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button disabled={busy}>Cập nhật</button>
      </form>
      <p className="muted">Dùng khi khách quên nhập mã hoặc nhập nhầm. Hoa hồng chỉ tính cho các lần thanh toán ghi nhận SAU khi gắn mã.</p>
    </section>
  );
}
