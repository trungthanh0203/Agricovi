import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { clean, downloadCsv, Err, fmtDate, fmtDateTime, rpc, supabase, useLoad, vnd } from '@agriconnect/admin-kit';

const STATUS_LABEL: Record<string, string> = { trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa', none: 'Chưa có gói' };
const STATUS_CLS: Record<string, string> = { trial: 'info', active: 'ok', expired: 'warn', suspended: 'bad', none: '' };
const Badge = ({ s }: { s: string }) => <span className={`badge ${STATUS_CLS[s] ?? ''}`}>{STATUS_LABEL[s] ?? s}</span>;

function Kpi({ label, value, tone, note }: { label: string; value: ReactNode; tone?: string; note?: string }) {
  return <div className={`kpi ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

// ============================================================ Tổng quan
interface Overview {
  orgs_total: number; orgs_new_30d: number; by_status: Record<string, number>; cycles_active: number; users_total: number;
  expiring: { org_id: string; name: string; status: string; period_end: string }[];
  revenue_by_month: { month: string; amount: number }[]; public_cycles: number; pending_reviews: number;
}
export function OverviewPage({ onOpenOrg, go }: { onOpenOrg: (id: string) => void; go: (p: string) => void }) {
  const { data: o, error } = useLoad(() => rpc<Overview>('admin_overview'));
  if (error) return <Err e={error} />;
  if (!o) return <p className="muted">Đang tải…</p>;
  const max = Math.max(1, ...o.revenue_by_month.map((r) => Number(r.amount)));
  return (
    <>
      <div className="kpis">
        <Kpi label="Tổng số cơ sở" value={o.orgs_total} note={`+${o.orgs_new_30d} trong 30 ngày`} tone="info" />
        <Kpi label="Đang hoạt động" value={o.by_status.active ?? 0} tone="ok" />
        <Kpi label="Dùng thử" value={o.by_status.trial ?? 0} tone="info" />
        <Kpi label="Hết hạn" value={o.by_status.expired ?? 0} tone={(o.by_status.expired ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Tạm khóa" value={o.by_status.suspended ?? 0} tone={(o.by_status.suspended ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Người dùng" value={o.users_total} />
        <Kpi label="Vụ đang sản xuất" value={o.cycles_active} />
        <Kpi label="Vụ đang công khai" value={o.public_cycles} />
        <button className="kpi linkish" onClick={() => go('reviews')}><span>Hồ sơ chờ duyệt</span><strong>{o.pending_reviews}</strong></button>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Sắp hết hạn trong 14 ngày ({o.expiring.length})</h2>
          {o.expiring.length === 0 && <p className="muted">Không có.</p>}
          <table><tbody>
            {o.expiring.map((e) => (
              <tr key={e.org_id}><td><a href="#" onClick={(ev) => { ev.preventDefault(); onOpenOrg(e.org_id); }}>{e.name}</a></td><td><Badge s={e.status} /></td><td>{fmtDate(e.period_end)}</td></tr>
            ))}
          </tbody></table>
        </section>
        <section className="card">
          <h2>Doanh thu 12 tháng</h2>
          {o.revenue_by_month.length === 0 && <p className="muted">Chưa có thanh toán.</p>}
          {o.revenue_by_month.map((r) => (
            <div className="bar" key={r.month}><span>{r.month}</span><i style={{ width: `${(Number(r.amount) / max) * 100}%` }} /><b>{vnd(r.amount)}</b></div>
          ))}
        </section>
      </div>
    </>
  );
}

// ============================================================ Cơ sở
interface OrgRow {
  id: string; name: string; type: string; created_at: string; owner_email: string | null; status: string; plan: string | null;
  period_end: string | null; max_cycles: number | null; used_cycles: number; members: number;
}
export function OrgsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 30;
  const { data, error, loading } = useLoad(() => rpc<{ total: number; rows: OrgRow[] }>('admin_list_orgs', { p_search: q || null, p_status: status || null, p_limit: PAGE, p_offset: page * PAGE }), [q, status, page]);
  return (
    <>
      <div className="toolbar">
        <input placeholder="Tìm theo tên cơ sở hoặc email chủ…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted">{data ? `${data.total} cơ sở` : ''}</span>
      </div>
      <Err e={error} />
      <table className="list">
        <thead><tr><th>Cơ sở</th><th>Chủ</th><th>Gói</th><th>Trạng thái</th><th>Hạn</th><th>Vụ</th><th>Người</th><th>Tạo</th></tr></thead>
        <tbody>
          {(data?.rows ?? []).map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)} className="click">
              <td><strong>{o.name}</strong><small>{o.type === 'cooperative' ? 'Hợp tác xã' : 'Hộ / trang trại'}</small></td>
              <td>{o.owner_email ?? '—'}</td><td>{o.plan ?? '—'}</td><td><Badge s={o.status} /></td><td>{fmtDate(o.period_end)}</td>
              <td>{o.used_cycles}/{o.max_cycles ?? '—'}</td><td>{o.members}</td><td>{fmtDate(o.created_at)}</td>
            </tr>
          ))}
          {data && data.rows.length === 0 && <tr><td colSpan={8} className="muted">Không có cơ sở phù hợp.</td></tr>}
        </tbody>
      </table>
      {loading && <p className="muted">Đang tải…</p>}
      <div className="toolbar">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Trước</button>
        <button disabled={!data || (page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Sau ›</button>
      </div>
    </>
  );
}

interface PlanRow { id: string; org_type: 'household' | 'cooperative'; name: string; max_cycles: number; price_per_quarter: number; ranking_weight: number; is_trial_default: boolean; is_active: boolean }
const listPlans = async (): Promise<PlanRow[]> => {
  const { data, error } = await supabase!.from('plan_tiers').select('*').order('org_type').order('price_per_quarter');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanRow[];
};

interface OrgDetail {
  org: { id: string; name: string; type: 'household' | 'cooperative'; created_at: string };
  owner_email: string | null; status: string; members: number; members_suspended: number; staff_accounts: number; cycles: Record<string, number>; last_activity: string | null;
  subscriptions: { id: string; plan: string; status: string; max_cycles: number; price_per_quarter: number; period_start: string; period_end: string }[];
  payments: { id: string; amount: number; paid_at: string; method: string | null; note: string | null }[];
  published_profile: { status: string; slug: string | null } | null;
}
export function OrgDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: d, error, reload } = useLoad(() => rpc<OrgDetail>('admin_org_detail', { p_org: id }), [id]);
  const { data: plans } = useLoad(listPlans);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // thanh toán
  const [discount, setDiscount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toLocaleDateString('en-CA'));
  const [method, setMethod] = useState('Chuyển khoản');
  const [note, setNote] = useState('');
  const [quarters, setQuarters] = useState('1');
  const [planId, setPlanId] = useState('');
  // đổi gói
  const [setPlan, setSetPlan] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  }
  if (error) return <><button onClick={onBack}>‹ Quay lại</button><Err e={error} /></>;
  if (!d) return <p className="muted">Đang tải…</p>;
  // mọi gói của loại cơ sở này trong "Gói và giá" (gói đã ngừng xếp cuối, ghi rõ) để không sót gói nào
  const typePlans = (plans ?? []).filter((p) => p.org_type === d.org.type).sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.price_per_quarter - b.price_per_quarter);
  const planLabel = (p: PlanRow) => `${p.name} · ${p.max_cycles} vụ · ${vnd(p.price_per_quarter)}/quý${p.is_active ? '' : ' (đã ngừng)'}`;

  // Thành tiền = số quý × giá/quý của gói được chọn (để trống = gói hiện tại); tổng thu = thành tiền − chiết khấu. CSDL chỉ lưu tổng thu, chiết khấu ghi vào ghi chú.
  const curSub = [...d.subscriptions].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const unitPrice = planId ? typePlans.find((p) => p.id === planId)?.price_per_quarter ?? 0 : curSub?.price_per_quarter ?? 0;
  const gross = unitPrice * Number(quarters);
  const disc = Number(discount.replace(/[.,\s]/g, '')) || 0;
  const total = gross - disc;
  function pay(e: FormEvent) {
    e.preventDefault();
    if (disc < 0 || total < 0) return setErr('Chiết khấu không được lớn hơn thành tiền.');
    const n = disc > 0 ? `${note.trim() ? `${note.trim()} · ` : ''}Thành tiền ${vnd(gross)}, chiết khấu ${vnd(disc)}` : note;
    void run(() => rpc('admin_record_payment', { p_org: id, p_amount: total, p_paid_at: paidAt, p_method: method, p_note: n, p_quarters: Number(quarters), p_plan: planId || null }), 'Đã ghi nhận thanh toán và gia hạn.');
  }
  return (
    <>
      <button onClick={onBack}>‹ Danh sách cơ sở</button>
      <h2 style={{ marginTop: 12 }}>{d.org.name} <Badge s={d.status} /></h2>
      <p className="muted">{d.org.type === 'cooperative' ? 'Hợp tác xã' : 'Hộ / trang trại'} · chủ: {d.owner_email ?? '—'} · tạo {fmtDate(d.org.created_at)}</p>
      <Err e={err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      <div className="kpis">
        <Kpi label="Thành viên" value={d.members} note={d.members_suspended > 0 ? `${d.members_suspended} tạm dừng` : undefined} />
        <Kpi label="Tài khoản nhân viên" value={d.staff_accounts} />
        <Kpi label="Vụ" value={Object.values(d.cycles).reduce((a, b) => a + Number(b), 0)} note={Object.entries(d.cycles).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
        <Kpi label="Hoạt động gần nhất" value={fmtDate(d.last_activity)} />
        <Kpi label="Hồ sơ website" value={d.published_profile?.status ?? 'chưa có'} />
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Ghi nhận thanh toán / gia hạn</h2>
          <form className="form" onSubmit={pay}>
            <label>Gói (để trống = giữ gói hiện tại)<select value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">— Giữ gói hiện tại —</option>{typePlans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}</select></label>
            <label>Gia hạn (quý)<select value={quarters} onChange={(e) => setQuarters(e.target.value)}>{[1, 2, 3, 4, 6, 8].map((q) => <option key={q} value={q}>{q} quý</option>)}</select></label>
            <label>Thành tiền (đồng)<input value={vnd(gross)} readOnly /></label>
            <label>Chiết khấu (đồng)<input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" placeholder="0" /></label>
            <label>Tổng thu (đồng)<input value={vnd(total)} readOnly /></label>
            <label>Hình thức thanh toán<input value={method} onChange={(e) => setMethod(e.target.value)} /></label>
            <label>Ngày thu<input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
            <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="primary" disabled={busy}>Ghi nhận và gia hạn</button>
          </form>
        </section>
        <section className="card">
          <h2>Đổi gói / đặt hạn dùng</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (!setPlan || !until) return setErr('Hãy chọn gói và hạn.'); void run(() => rpc('admin_set_org_plan', { p_org: id, p_plan: setPlan, p_period_end: new Date(`${until}T23:59:59`).toISOString(), p_reason: reason }), 'Đã cập nhật gói.'); }}>
            <label>Gói<select value={setPlan} onChange={(e) => setSetPlan(e.target.value)}><option value="">— Chọn gói —</option>{typePlans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}</select></label>
            <label>Hạn dùng đến ngày<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
            <label>Lý do (bắt buộc)<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button disabled={busy}>Cập nhật gói</button>
          </form>
          <hr />
          <h2>{d.status === 'suspended' ? 'Mở khóa cơ sở' : 'Tạm khóa cơ sở'}</h2>
          <p className="muted">Tạm khóa: gói chuyển sang trạng thái khóa (chưa tạo được vụ mới); người dùng vẫn xem dữ liệu của mình. Cần ghi lý do ở ô bên trên.</p>
          <button className={d.status === 'suspended' ? '' : 'danger'} disabled={busy}
            onClick={() => void run(() => rpc('admin_set_org_suspended', { p_org: id, p_suspended: d.status !== 'suspended', p_reason: reason }), d.status === 'suspended' ? 'Đã mở khóa.' : 'Đã tạm khóa.')}>
            {d.status === 'suspended' ? 'Mở khóa' : 'Tạm khóa'}
          </button>
        </section>
      </div>
      <section className="card">
        <h2>Lịch sử gói</h2>
        <table className="list"><thead><tr><th>Gói</th><th>Trạng thái</th><th>Từ</th><th>Đến</th><th>Số vụ tối đa</th><th>Giá/quý</th></tr></thead>
          <tbody>{d.subscriptions.map((s) => <tr key={s.id}><td>{s.plan}</td><td><Badge s={s.status} /></td><td>{fmtDate(s.period_start)}</td><td>{fmtDate(s.period_end)}</td><td>{s.max_cycles}</td><td>{vnd(s.price_per_quarter)}</td></tr>)}</tbody></table>
      </section>
      <section className="card">
        <h2>Thanh toán</h2>
        <table className="list"><thead><tr><th>Ngày</th><th>Số tiền</th><th>Hình thức</th><th>Ghi chú</th></tr></thead>
          <tbody>{d.payments.length === 0 && <tr><td colSpan={4} className="muted">Chưa có.</td></tr>}{d.payments.map((p) => <tr key={p.id}><td>{fmtDate(p.paid_at)}</td><td>{vnd(p.amount)}</td><td>{p.method ?? ''}</td><td>{p.note ?? ''}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}

// ============================================================ Thanh toán (tất cả)
interface PayRow { id: string; amount: number; paid_at: string; method: string | null; note: string | null; subscriptions: { organizations: { name: string } | null; plan_tiers: { name: string } | null } | null }
export function PaymentsPage() {
  const { data, error } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('payment_records')
      .select('id, amount, paid_at, method, note, subscriptions(organizations(name), plan_tiers(name))').order('paid_at', { ascending: false }).limit(500);
    if (e) throw new Error(e.message);
    return (rows ?? []) as unknown as PayRow[];
  });
  const total = (data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  return (
    <>
      <div className="toolbar">
        <strong>{data?.length ?? 0} khoản · tổng {vnd(total)}</strong>
        <button disabled={!data?.length} onClick={() => downloadCsv('thanh-toan.csv', [['Ngày', 'Cơ sở', 'Gói', 'Số tiền', 'Hình thức', 'Ghi chú'], ...(data ?? []).map((p) => [p.paid_at, p.subscriptions?.organizations?.name ?? '', p.subscriptions?.plan_tiers?.name ?? '', p.amount, p.method, p.note])])}>Xuất CSV</button>
      </div>
      <Err e={error} />
      <table className="list"><thead><tr><th>Ngày</th><th>Cơ sở</th><th>Gói</th><th>Số tiền</th><th>Hình thức</th><th>Ghi chú</th></tr></thead>
        <tbody>{(data ?? []).map((p) => <tr key={p.id}><td>{fmtDate(p.paid_at)}</td><td>{p.subscriptions?.organizations?.name}</td><td>{p.subscriptions?.plan_tiers?.name}</td><td>{vnd(p.amount)}</td><td>{p.method}</td><td>{p.note}</td></tr>)}</tbody></table>
      <p className="muted">Ghi nhận thanh toán mới: mở cơ sở tương ứng ở mục "Cơ sở".</p>
    </>
  );
}

// ============================================================ Gói và giá
export function PlansPage() {
  const { data, error, reload } = useLoad(listPlans);
  const [edit, setEdit] = useState<PlanRow | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ org_type: 'household', name: '', max_cycles: '2', price: '300000', weight: '1', trial: false, active: true });

  function open(p: PlanRow | 'new') {
    setEdit(p);
    setErr(null);
    setF(p === 'new' ? { org_type: 'household', name: '', max_cycles: '2', price: '300000', weight: '1', trial: false, active: true }
      : { org_type: p.org_type, name: p.name, max_cycles: String(p.max_cycles), price: String(p.price_per_quarter), weight: String(p.ranking_weight), trial: p.is_trial_default, active: p.is_active });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await rpc('admin_save_plan', { p_id: edit === 'new' ? null : (edit as PlanRow).id, p_org_type: f.org_type, p_name: f.name, p_max_cycles: Number(f.max_cycles), p_price: Number(f.price), p_weight: Number(f.weight), p_trial_default: f.trial, p_active: f.active });
      setEdit(null);
      reload();
    } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <div className="toolbar"><button className="primary" onClick={() => open('new')}>+ Thêm gói</button></div>
      <Err e={error} />
      {edit && (
        <section className="card">
          <h2>{edit === 'new' ? 'Thêm gói' : `Sửa gói: ${edit.name}`}</h2>
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Loại cơ sở<select value={f.org_type} onChange={(e) => setF({ ...f, org_type: e.target.value })}><option value="household">Hộ / trang trại</option><option value="cooperative">Hợp tác xã</option></select></label>
            <label>Tên gói<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Số vụ tối đa<input value={f.max_cycles} inputMode="numeric" onChange={(e) => setF({ ...f, max_cycles: e.target.value })} /></label>
            <label>Giá mỗi quý (đồng)<input value={f.price} inputMode="numeric" onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label>Hệ số ưu tiên hiển thị website<input value={f.weight} inputMode="decimal" onChange={(e) => setF({ ...f, weight: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={f.trial} onChange={(e) => setF({ ...f, trial: e.target.checked })} /> Gói dùng thử mặc định của loại này</label>
            <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Đang bán</label>
            <Err e={err} />
            <div className="toolbar"><button className="primary">Lưu</button><button type="button" onClick={() => setEdit(null)}>Hủy</button></div>
          </form>
          <p className="muted">Đổi giá/hạn mức chỉ áp dụng cho đăng ký mới; gói đang dùng giữ điều khoản đã chụp lúc đăng ký.</p>
        </section>
      )}
      <table className="list"><thead><tr><th>Gói</th><th>Loại</th><th>Số vụ</th><th>Giá/quý</th><th>Hệ số</th><th></th><th></th></tr></thead>
        <tbody>{(data ?? []).map((p) => (
          <tr key={p.id} className={p.is_active ? '' : 'off'}>
            <td><strong>{p.name}</strong>{p.is_trial_default && <small>Gói dùng thử mặc định</small>}</td>
            <td>{p.org_type === 'cooperative' ? 'HTX' : 'Hộ'}</td><td>{p.max_cycles}</td><td>{vnd(p.price_per_quarter)}</td><td>{p.ranking_weight}</td>
            <td>{p.is_active ? '' : 'Ngừng bán'}</td><td><button onClick={() => open(p)}>Sửa</button></td>
          </tr>))}</tbody></table>
    </>
  );
}

// ============================================================ Cấu hình
const SETTINGS: { key: string; label: string; hint: string; kind: 'number' | 'text' | 'json' }[] = [
  { key: 'trial_days', label: 'Số ngày dùng thử', hint: 'Cơ sở mới được dùng thử bấy nhiêu ngày (mặc định 30)', kind: 'number' },
  { key: 'expiry_reminder_days', label: 'Số ngày nhắc trước khi hết hạn', hint: 'Dùng cho nhắc hết hạn (sẽ áp dụng khi có thông báo)', kind: 'number' },
  { key: 'staff_temp_password_days', label: 'Số ngày hiệu lực mật khẩu tạm của nhân viên', hint: 'Mặc định 7', kind: 'number' },
  { key: 'login_email_domain', label: 'Tên miền email ẩn của nhân viên', hint: 'PHẢI là tên miền bạn sở hữu (đổi sau khi đã có nhân viên sẽ không đăng nhập được bằng số điện thoại cũ)', kind: 'text' },
  { key: 'ranking', label: 'Cấu hình xếp hạng hiển thị website (JSON)', hint: 'Ví dụ {"freshness_days":30,"profile_completeness_weight":1,"freshness_weight":1}', kind: 'json' },
];
// ============================================================ Thông tin liên hệ (hiện cho người dùng ở trang đăng nhập và màn "Hỗ trợ & Chia sẻ" của app)
const CONTACT_FIELDS: { key: string; label: string; hint: string; area?: boolean }[] = [
  { key: 'company', label: 'Tên công ty / đơn vị', hint: 'Ví dụ: CÔNG TY TNHH AGRICOVI' },
  { key: 'address', label: 'Địa chỉ', hint: 'Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành', area: true },
  { key: 'phone', label: 'Điện thoại', hint: 'Số gọi hỗ trợ, ví dụ 0989.099.454' },
  { key: 'zalo', label: 'Zalo', hint: 'Số Zalo (để trống nếu trùng với điện thoại)' },
  { key: 'website', label: 'Website', hint: 'Bắt đầu bằng https://, ví dụ https://agricovi.com' },
  { key: 'email', label: 'Email', hint: 'Ví dụ lienhe@agricovi.com' },
  { key: 'facebook', label: 'Facebook', hint: 'Đường dẫn trang, bắt đầu bằng https://' },
  { key: 'youtube', label: 'YouTube', hint: 'Đường dẫn kênh, bắt đầu bằng https://' },
];
function ContactSettings({ value, onSaved }: { value: Record<string, string> | undefined; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, value?.[f.key] ?? '']))); }, [value]);
  async function save() {
    setErr(null); setMsg(null);
    try {
      const out = Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, (draft[f.key] ?? '').trim()]));
      await rpc('admin_set_setting', { p_key: 'contact_info', p_value: out });
      setMsg('Đã lưu thông tin liên hệ. Người dùng thấy nội dung mới khi mở lại app.');
      onSaved();
    } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <section className="card">
      <h2>Thông tin liên hệ</h2>
      <p className="muted">Hiện ở trang đăng nhập/đăng ký (kể cả khi app đã cài) và màn "Hỗ trợ &amp; Chia sẻ" trong app. Mục để trống thì không hiện. Đang là dữ liệu MẪU, hãy thay bằng thông tin thật.</p>
      {err && <p className="msg error" role="alert">{err}</p>}{msg && <p className="msg ok" role="status">{msg}</p>}
      {CONTACT_FIELDS.map((f) => (
        <label key={f.key}>{f.label}
          {f.area
            ? <textarea rows={2} maxLength={300} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            : <input maxLength={300} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
          <small className="muted">{f.hint}</small>
        </label>
      ))}
      <div><button className="primary" onClick={() => void save()}>Lưu thông tin liên hệ</button></div>
    </section>
  );
}

export function SettingsPage() {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('platform_settings').select('key, value');
    if (e) throw new Error(e.message);
    return Object.fromEntries((rows ?? []).map((r) => [r.key as string, r.value as unknown]));
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(SETTINGS.map((s) => [s.key, data[s.key] === undefined ? '' : s.kind === 'json' ? JSON.stringify(data[s.key], null, 2) : String(data[s.key])])));
  }, [data]);
  async function save(s: (typeof SETTINGS)[number]) {
    setErr(null); setMsg(null);
    try {
      const raw = (draft[s.key] ?? '').trim();
      let value: unknown;
      if (s.kind === 'number') { value = Number(raw); if (!raw || Number.isNaN(value as number) || (value as number) < 0) throw new Error('Hãy nhập số không âm.'); }
      else if (s.kind === 'json') { try { value = JSON.parse(raw); } catch { throw new Error('JSON chưa hợp lệ.'); } }
      else { if (!raw) throw new Error('Không để trống.'); value = raw; }
      await rpc('admin_set_setting', { p_key: s.key, p_value: value });
      setMsg(`Đã lưu: ${s.label}`);
      reload();
    } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <Err e={error ?? err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      <ContactSettings value={data?.contact_info as Record<string, string> | undefined} onSaved={reload} />
      {SETTINGS.map((s) => (
        <section className="card" key={s.key}>
          <h2>{s.label}</h2>
          <p className="muted">{s.hint}</p>
          {s.kind === 'json'
            ? <textarea rows={6} value={draft[s.key] ?? ''} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
            : <input value={draft[s.key] ?? ''} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />}
          <div><button className="primary" onClick={() => void save(s)}>Lưu</button></div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Nhật ký kiểm toán
interface AuditRow { id: number; at: string; actor: string | null; org: string | null; action: string; entity: string; entity_id: string | null; before: unknown; after: unknown; reason: string | null }
const ACTION_LABEL: Record<string, string> = {
  record_payment: 'Ghi nhận thanh toán', set_plan: 'Đổi gói / đặt hạn', suspend_org: 'Tạm khóa cơ sở', unsuspend_org: 'Mở khóa cơ sở', create_plan: 'Tạo gói', update_plan: 'Sửa gói',
  set_setting: 'Sửa cấu hình', set_role_label: 'Đổi tên vai trò', hide_public_cycle: 'Tạm ẩn vụ công khai', unhide_public_cycle: 'Cho phép vụ công khai lại', unlock: 'Mở khóa kỳ lương',
};
export function AuditPage() {
  const [onlyAdmin, setOnlyAdmin] = useState(true);
  const { data, error } = useLoad(() => rpc<AuditRow[]>('admin_list_audit', { p_limit: 300 }));
  const rows = (data ?? []).filter((r) => !onlyAdmin || ACTION_LABEL[r.action]);
  return (
    <>
      <div className="toolbar"><label className="check"><input type="checkbox" checked={onlyAdmin} onChange={(e) => setOnlyAdmin(e.target.checked)} /> Chỉ thao tác quản trị</label></div>
      <Err e={error} />
      <table className="list"><thead><tr><th>Lúc</th><th>Người làm</th><th>Việc</th><th>Cơ sở</th><th>Lý do / chi tiết</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td>{fmtDateTime(r.at)}</td><td>{r.actor ?? '—'}</td><td>{ACTION_LABEL[r.action] ?? `${r.action} ${r.entity}`}</td><td>{r.org ?? '—'}</td>
            <td>{r.reason ?? ''}{r.after ? <small>{JSON.stringify(r.after).slice(0, 140)}</small> : null}</td>
          </tr>))}</tbody></table>
    </>
  );
}

// ============================================================ Tên vai trò
const ROLE_ORDER: { role: string; note: string }[] = [
  { role: 'owner', note: 'Người sở hữu cơ sở (có mọi quyền)' },
  { role: 'manager', note: 'Điều hành sản xuất hằng ngày; quyền tối thiểu, chủ cấp thêm' },
  { role: 'worker', note: 'Ghi nhật ký, thu hoạch, chấm công của mình' },
];
export function RolesPage() {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('platform_role_labels').select('role, name');
    if (e) throw new Error(e.message);
    return Object.fromEntries((rows ?? []).map((r) => [r.role as string, r.name as string]));
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) setDraft(data); }, [data]);
  async function save(role: string) {
    setErr(null); setMsg(null);
    try {
      const name = (draft[role] ?? '').trim();
      if (name === data?.[role]) { setMsg('Tên chưa thay đổi.'); return; }
      if (!window.confirm(`Đổi tên vai trò này thành "${name}"?\n\nTất cả cơ sở sẽ hiện tên mới ngay. Quyền của vai trò không đổi.`)) return;
      const n = await rpc<number>('admin_set_role_label', { p_role: role, p_name: name, p_reason: null });
      setMsg(`Đã đổi tên. ${n} cơ sở đã cập nhật; người dùng thấy tên mới khi mở lại app.`);
      reload();
    } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <p className="muted">Đổi tên hiển thị của các vai trò có sẵn. Đổi một lần là áp dụng cho mọi cơ sở (cả cơ sở tạo sau). Chỉ đổi tên, không đổi quyền.</p>
      <Err e={error ?? err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      {ROLE_ORDER.map((r) => (
        <section className="card" key={r.role}>
          <h2>{data?.[r.role] ?? r.role}</h2>
          <p className="muted">{r.note}</p>
          <input value={draft[r.role] ?? ''} maxLength={40} onChange={(e) => setDraft({ ...draft, [r.role]: e.target.value })} aria-label={`Tên mới của vai trò ${data?.[r.role] ?? r.role}`} />
          <div><button className="primary" onClick={() => void save(r.role)}>Lưu</button></div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Đăng ký bằng số điện thoại (chờ duyệt)
interface SignupRow { id: string; phone: string; full_name: string; org_name: string; org_type: string; status: 'pending' | 'approved' | 'rejected'; note: string | null; created_at: string; decided_at: string | null }
const SIGNUP_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
const SIGNUP_CLS: Record<string, string> = { pending: 'warn', approved: 'ok', rejected: 'bad' };
export function SignupsPage() {
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: rows, error: err2, reload } = useLoad(() => rpc<SignupRow[]>('admin_list_signups', { p_status: status }), [status]);

  async function decide(r: SignupRow, approve: boolean) {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt(`Lý do từ chối ${r.full_name} (${r.phone})? (hiện cho người đăng ký)`);
      if (!reason) return;
    } else if (!window.confirm(`Đã liên hệ qua Zalo ${r.phone} và xác nhận đúng người? Duyệt sẽ tạo cơ sở "${r.org_name}".`)) return;
    setBusy(true); setMsg(null);
    try { await rpc('admin_decide_signup', { p_id: r.id, p_approve: approve, p_reason: reason }); setMsg(approve ? 'Đã duyệt và tạo cơ sở.' : 'Đã từ chối.'); reload(); }
    catch (e) { setMsg(clean((e as Error).message)); } finally { setBusy(false); }
  }
  async function resetPw(r: SignupRow) {
    if (!window.confirm(`Đặt lại mật khẩu cho ${r.full_name} (${r.phone})? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
    setBusy(true); setMsg(null);
    try {
      const { data: res, error: e } = await supabase!.functions.invoke('owner-signup', { body: { action: 'admin_reset_password', signup_id: r.id } });
      if (e) throw new Error((await (e as { context?: Response }).context?.json?.().then((j: { error?: string }) => j.error).catch(() => null)) ?? e.message);
      const d = res as { phone: string; temp_password: string };
      setMsg(`Mật khẩu mới của ${d.phone}: ${d.temp_password} (gửi qua Zalo và dặn đổi mật khẩu ngay).`);
    } catch (e) { setMsg(clean((e as Error).message)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(SIGNUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted">{rows ? `${rows.length} đăng ký` : ''}</span>
      </div>
      <Err e={err2} />
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <p className="muted">Hộ không có email đăng ký bằng số điện thoại (Zalo). Hãy nhắn hoặc gọi Zalo đúng số đó để xác nhận người thật, rồi bấm Duyệt.</p>
      <table className="list"><thead><tr><th>Ngày đăng ký</th><th>Người đăng ký</th><th>Số điện thoại (Zalo)</th><th>Cơ sở</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {(rows ?? []).length === 0 && <tr><td colSpan={6} className="muted">Không có đăng ký nào.</td></tr>}
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.created_at)}</td>
              <td>{r.full_name}</td>
              <td><strong>{r.phone}</strong></td>
              <td>{r.org_name}<br /><small className="muted">{r.org_type === 'cooperative' ? 'Hợp tác xã' : 'Hộ'}</small></td>
              <td><span className={`badge ${SIGNUP_CLS[r.status]}`}>{SIGNUP_LABEL[r.status]}</span>{r.note && <><br /><small className="muted">{r.note}</small></>}</td>
              <td>
                {r.status === 'pending' && (<>
                  <button className="primary" disabled={busy} onClick={() => void decide(r, true)}>Duyệt</button>{' '}
                  <button disabled={busy} onClick={() => void decide(r, false)}>Từ chối</button>
                </>)}
                {r.status === 'approved' && <button disabled={busy} onClick={() => void resetPw(r)}>Đặt lại mật khẩu</button>}
              </td>
            </tr>
          ))}
        </tbody></table>
    </>
  );
}

// ============================================================ Đơn mua gói dịch vụ
interface OrderRow {
  id: string; org_id: string; org_name: string; plan_name: string; quarters: number; amount: number; full_name: string; phone: string; address: string;
  note: string | null; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; email_status: string | null; created_at: string; decided_at: string | null;
}
const ORDER_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
const ORDER_CLS: Record<string, string> = { pending: 'warn', approved: 'ok', rejected: 'bad' };
export function PlanOrdersPage() {
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);        // đơn đang mở form duyệt
  const [amount, setAmount] = useState('');
  const [quarters, setQuarters] = useState('1');
  const [method, setMethod] = useState('Chuyển khoản');
  const [note, setNote] = useState('');
  const { data: rows, error, reload } = useLoad(() => rpc<OrderRow[]>('admin_list_plan_orders', { p_status: status }), [status]);

  function startApprove(o: OrderRow) {
    setOpen(o.id); setAmount(String(o.amount)); setQuarters(String(o.quarters)); setNote('');
  }
  async function approve(o: OrderRow) {
    const amt = Number(amount.replace(/\D/g, ''));
    if (!window.confirm(`Xác nhận đã thu ${vnd(amt)} của ${o.full_name} và kích hoạt gói "${o.plan_name}" ${quarters} quý cho cơ sở "${o.org_name}"?`)) return;
    setBusy(true); setMsg(null);
    try {
      await rpc('admin_decide_plan_order', { p_id: o.id, p_approve: true, p_amount: amt, p_quarters: Number(quarters), p_method: method, p_note: note || null });
      setMsg('Đã ghi nhận thanh toán và kích hoạt gói.'); setOpen(null); reload();
    } catch (e) { setMsg(clean((e as Error).message)); } finally { setBusy(false); }
  }
  async function reject(o: OrderRow) {
    const reason = window.prompt(`Lý do từ chối đơn của ${o.full_name}? (hiện cho chủ cơ sở)`);
    if (!reason) return;
    setBusy(true); setMsg(null);
    try { await rpc('admin_decide_plan_order', { p_id: o.id, p_approve: false, p_note: reason }); setMsg('Đã từ chối.'); reload(); }
    catch (e) { setMsg(clean((e as Error).message)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(ORDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted">{rows ? `${rows.length} đơn` : ''}</span>
      </div>
      <Err e={error} />
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <p className="muted">Chủ cơ sở chọn mua gói trong app (Tài khoản → Gói dịch vụ). Hãy liên hệ theo số điện thoại, thu tiền rồi bấm Duyệt: hệ thống ghi nhận thanh toán và kích hoạt hoặc gia hạn gói cho cơ sở.</p>
      <table className="list"><thead><tr><th>Ngày</th><th>Người mua</th><th>Cơ sở và gói</th><th>Thành tiền</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {(rows ?? []).length === 0 && <tr><td colSpan={6} className="muted">Không có đơn nào.</td></tr>}
          {(rows ?? []).map((o) => (
            <Fragment key={o.id}>
              <tr>
                <td>{fmtDateTime(o.created_at)}</td>
                <td><strong>{o.full_name}</strong><br />{o.phone}<br /><small className="muted">{o.address}</small>{o.note && <><br /><small className="muted">Ghi chú: {o.note}</small></>}</td>
                <td>{o.org_name}<br /><small className="muted">{o.plan_name} · {o.quarters} quý</small></td>
                <td>{vnd(o.amount)}</td>
                <td><span className={`badge ${ORDER_CLS[o.status]}`}>{ORDER_LABEL[o.status]}</span>{o.admin_note && <><br /><small className="muted">{o.admin_note}</small></>}
                  {o.email_status && o.email_status !== 'sent' && <><br /><small className="muted">{o.email_status === 'skipped' ? 'Email: chưa cấu hình gửi (cần RESEND_API_KEY)' : `Email gửi lỗi: ${o.email_status.replace(/^failed:\s*/, '')}`}</small></>}</td>
                <td>{o.status === 'pending' && (<>
                  <button className="primary" disabled={busy} onClick={() => startApprove(o)}>Duyệt</button>{' '}
                  <button disabled={busy} onClick={() => void reject(o)}>Từ chối</button>
                </>)}</td>
              </tr>
              {open === o.id && (
                <tr><td colSpan={6}>
                  <div className="form" style={{ maxWidth: 520 }}>
                    <label>Số quý<input inputMode="numeric" value={quarters} onChange={(e) => setQuarters(e.target.value.replace(/\D/g, ''))} /></label>
                    <label>Số tiền đã thu (đồng)<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                    <label>Hình thức<input value={method} onChange={(e) => setMethod(e.target.value)} /></label>
                    <label>Ghi chú (không bắt buộc)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
                    <div className="actions">
                      <button className="primary" disabled={busy} onClick={() => void approve(o)}>Ghi nhận và kích hoạt gói</button>{' '}
                      <button disabled={busy} onClick={() => setOpen(null)}>Hủy</button>
                    </div>
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody></table>
    </>
  );
}
