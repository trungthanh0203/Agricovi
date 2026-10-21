import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { clean, downloadCsv, fmtDate, fmtDateTime, rpc, supabase, vnd } from './supabase';

/** Tải dữ liệu bằng một hàm; trả {data, error, reload, loading} */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fn().then(setData).catch((e) => setError(clean(e instanceof Error ? e.message : String(e)))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

const Err = ({ e }: { e: string | null }) => (e ? <p className="msg error" role="alert">{e}</p> : null);

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
  const [amount, setAmount] = useState('');
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
  const typePlans = (plans ?? []).filter((p) => p.org_type === d.org.type && p.is_active);

  function pay(e: FormEvent) {
    e.preventDefault();
    const a = Number(amount.replace(/[.,\s]/g, ''));
    if (Number.isNaN(a) || a < 0 || !amount.trim()) return setErr('Số tiền không hợp lệ.');
    void run(() => rpc('admin_record_payment', { p_org: id, p_amount: a, p_paid_at: paidAt, p_method: method, p_note: note, p_quarters: Number(quarters), p_plan: planId || null }), 'Đã ghi nhận thanh toán và gia hạn.');
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
            <label>Số tiền (đồng)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" /></label>
            <label>Ngày thu<input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
            <label>Hình thức<input value={method} onChange={(e) => setMethod(e.target.value)} /></label>
            <label>Gia hạn (quý)<select value={quarters} onChange={(e) => setQuarters(e.target.value)}>{[1, 2, 3, 4, 6, 8].map((q) => <option key={q} value={q}>{q} quý</option>)}</select></label>
            <label>Gói (để trống = giữ gói hiện tại)<select value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">— Giữ gói hiện tại —</option>{typePlans.map((p) => <option key={p.id} value={p.id}>{p.name} ({vnd(p.price_per_quarter)}/quý)</option>)}</select></label>
            <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="primary" disabled={busy}>Ghi nhận và gia hạn</button>
          </form>
        </section>
        <section className="card">
          <h2>Đổi gói / đặt hạn dùng</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (!setPlan || !until) return setErr('Hãy chọn gói và hạn.'); void run(() => rpc('admin_set_org_plan', { p_org: id, p_plan: setPlan, p_period_end: new Date(`${until}T23:59:59`).toISOString(), p_reason: reason }), 'Đã cập nhật gói.'); }}>
            <label>Gói<select value={setPlan} onChange={(e) => setSetPlan(e.target.value)}><option value="">— Chọn gói —</option>{typePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
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

// ============================================================ Duyệt hồ sơ
interface ProfileRow { profile_id: string; org: string; display_name: string; province: string | null; status: string; slug: string | null; changed_at: string }
interface PackImg { src: string; caption: string | null }
interface PackProfile { display_name: string; tagline?: string; description?: string; province?: string; district?: string; commune?: string; established_year?: number; total_area?: number; area_unit?: string; practices?: string; capacity_note?: string; images?: PackImg[]; certifications?: { name: string; issuer?: string; status: string; number?: string; expires?: string }[]; contact?: { phone?: string; email?: string; zalo?: string; website?: string; facebook?: string } }
interface ReviewPack { scope: string[]; consent_at: string; preview: { profile: PackProfile; products: { id: string; supply_status: string | null; snapshot: { name: string; description?: string; specification?: string; unit?: string; season?: string; price_note?: string; min_order?: string; trace_code?: string; images?: PackImg[] } }[] } }
function ReviewPackView({ pack, onClose }: { pack: ReviewPack; onClose: () => void }) {
  const p = pack.preview.profile;
  return (
    <section className="card">
      <div className="toolbar"><strong>Xem trước đúng như website sẽ hiện</strong><button onClick={onClose}>Đóng</button></div>
      <p className="muted">Chủ đã đồng ý công khai: {pack.scope.join(', ')} (lúc {fmtDateTime(pack.consent_at)}). Chỉ những nhóm này mới lên website.</p>
      <h2>{p.display_name}</h2>
      {p.tagline && <p><em>{p.tagline}</em></p>}
      <p className="muted">{[p.commune, p.district, p.province].filter(Boolean).join(', ')}</p>
      {(p.images ?? []).map((i, k) => <img key={k} src={i.src} alt={i.caption ?? ''} style={{ height: 90, borderRadius: 6, marginRight: 6 }} />)}
      <p>{p.description}</p>
      <p className="muted">{[p.established_year && 'Thành lập ' + p.established_year, p.total_area != null && 'Diện tích ' + p.total_area + ' ' + (p.area_unit === 'm2' ? 'm²' : 'ha'), p.practices, p.capacity_note].filter(Boolean).join(' · ')}</p>
      {(p.certifications ?? []).map((c, k) => <p key={k}>🏅 {c.name} {c.number ? '· số ' + c.number : ''} <span className="muted">({c.status})</span></p>)}
      {pack.preview.products.map((x) => (
        <p key={x.id}><strong>{x.snapshot.name}</strong> — {[x.snapshot.specification, x.snapshot.unit, x.snapshot.season, x.snapshot.price_note, x.snapshot.min_order].filter(Boolean).join(' · ')} {x.supply_status && <span className="muted">[{x.supply_status}]</span>} {x.snapshot.trace_code && <span className="muted">truy xuất {x.snapshot.trace_code}</span>}</p>
      ))}
      {p.contact ? <p>📞 {[p.contact.phone, p.contact.zalo && 'Zalo ' + p.contact.zalo, p.contact.email, p.contact.website, p.contact.facebook].filter(Boolean).join(' · ')}</p> : <p className="muted">Không công khai liên hệ.</p>}
    </section>
  );
}
export function ReviewsPage() {
  const [tab, setTab] = useState<'pending_review' | 'published' | 'hidden'>('pending_review');
  const { data, error, reload } = useLoad(() => rpc<ProfileRow[]>('admin_list_profiles', { p_status: tab }), [tab]);
  const [err, setErr] = useState<string | null>(null);
  const [pack, setPack] = useState<ReviewPack | null>(null);
  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try { await fn(); setPack(null); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <div className="toolbar">
        {([['pending_review', 'Chờ duyệt'], ['published', 'Đang công khai'], ['hidden', 'Đã ẩn']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <Err e={error ?? err} />
      {pack && <ReviewPackView pack={pack} onClose={() => setPack(null)} />}
      <table className="list"><thead><tr><th>Hồ sơ</th><th>Cơ sở</th><th>Tỉnh/thành</th><th>Cập nhật</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">Không có hồ sơ nào ở mục này. (Hồ sơ do chủ cơ sở soạn và gửi duyệt trong app, mục Tổ chức → Hồ sơ website.)</td></tr>}
          {(data ?? []).map((p) => (
            <tr key={p.profile_id}>
              <td><strong>{p.display_name}</strong>{p.slug && <small>/{p.slug}</small>}</td><td>{p.org}</td><td>{p.province}</td><td>{fmtDateTime(p.changed_at)}</td>
              <td className="acts">
                <button onClick={() => { setErr(null); rpc<ReviewPack>('review_pack', { p_profile: p.profile_id }).then(setPack).catch((e) => setErr(clean(e instanceof Error ? e.message : String(e)))); }}>Xem trước</button>
                {tab === 'pending_review' && <>
                  <button className="primary" onClick={() => void act(() => rpc('approve_and_publish', { p_profile: p.profile_id, p_note: null }))}>Duyệt và công khai</button>
                  <button onClick={() => { const n = window.prompt('Nội dung cần chủ cơ sở chỉnh sửa?'); if (n) void act(() => rpc('review_profile', { p_profile: p.profile_id, p_decision: 'changes_requested', p_note: n })); }}>Yêu cầu sửa</button>
                </>}
                {tab === 'published' && <button className="danger" onClick={() => { if (window.confirm('Tạm ẩn hồ sơ này khỏi website?')) void act(() => rpc('hide_profile', { p_profile: p.profile_id, p_withdraw: false })); }}>Tạm ẩn</button>}
              </td>
            </tr>))}
        </tbody></table>
    </>
  );
}

// ============================================================ Vụ công khai
interface PubCycle { cycle_id: string; code: string; name: string; org: string; visible: boolean; hidden_by_admin: boolean; published_at: string }
export function PublicCyclesPage() {
  const { data, error, reload } = useLoad(() => rpc<PubCycle[]>('admin_list_public_cycles'));
  const [err, setErr] = useState<string | null>(null);
  async function hide(c: PubCycle, hide: boolean) {
    const reason = window.prompt(hide ? 'Lý do tạm ẩn vụ này (ít nhất 5 ký tự)?' : 'Lý do cho phép công khai lại?');
    if (!reason) return;
    setErr(null);
    try { await rpc('admin_hide_public_cycle', { p_cycle: c.cycle_id, p_hide: hide, p_reason: reason }); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <p className="muted">Các vụ do chủ cơ sở bấm "Công khai vụ lên website". Quản trị viên chỉ có thể tạm ẩn khi thông tin sai hoặc vi phạm; chủ cơ sở không công khai lại được cho tới khi bạn cho phép.</p>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Mã</th><th>Vụ</th><th>Cơ sở</th><th>Công khai lúc</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có vụ nào được công khai.</td></tr>}
          {(data ?? []).map((c) => (
            <tr key={c.cycle_id}>
              <td><code>{c.code}</code></td><td>{c.name}</td><td>{c.org}</td><td>{fmtDateTime(c.published_at)}</td>
              <td>{c.hidden_by_admin ? <span className="badge bad">Bị ẩn bởi quản trị</span> : c.visible ? <span className="badge ok">Đang công khai</span> : <span className="badge">Chủ đã ngừng</span>}</td>
              <td>{c.hidden_by_admin ? <button onClick={() => void hide(c, false)}>Cho phép lại</button> : c.visible && <button className="danger" onClick={() => void hide(c, true)}>Tạm ẩn</button>}</td>
            </tr>))}
        </tbody></table>
    </>
  );
}

// ============================================================ Nhật ký kiểm toán
interface AuditRow { id: number; at: string; actor: string | null; org: string | null; action: string; entity: string; entity_id: string | null; before: unknown; after: unknown; reason: string | null }
const ACTION_LABEL: Record<string, string> = {
  record_payment: 'Ghi nhận thanh toán', set_plan: 'Đổi gói / đặt hạn', suspend_org: 'Tạm khóa cơ sở', unsuspend_org: 'Mở khóa cơ sở', create_plan: 'Tạo gói', update_plan: 'Sửa gói',
  set_setting: 'Sửa cấu hình', hide_public_cycle: 'Tạm ẩn vụ công khai', unhide_public_cycle: 'Cho phép vụ công khai lại', unlock: 'Mở khóa kỳ lương',
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
