import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { useOrgs, type PlanUsage } from '../lib/orgs';
import { useMyName } from '../lib/profile';
import { callFunction } from '../lib/staff';
import { supabase } from '../lib/supabase';

const STATUS_LABEL: Record<PlanUsage['status'], string> = {
  trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa',
};
const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const date = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

interface SalePlan { id: string; name: string; max_cycles: number; price_per_quarter: number }
interface MyOrder { id: string; plan_name: string; quarters: number; amount: number; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string }
const ORDER_LABEL = { pending: 'Chờ xử lý', approved: 'Đã kích hoạt', rejected: 'Chưa duyệt' } as const;

/**
 * Gói dịch vụ (D131), hai khu vực:
 *  - trên: gói đang dùng (tên gói, hạn sử dụng, số vụ được dùng);
 *  - dưới: các gói Agricovi cung cấp; chọn gói, điền họ tên, điện thoại, địa chỉ để gửi yêu cầu mua. Yêu cầu hiện ở trang quản trị nền tảng
 *    (có email thông báo); Agricovi liên hệ, thu tiền rồi duyệt thì gói được kích hoạt.
 */
export function PlanCard() {
  const { active, stale, fetchUsage } = useOrgs();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<SalePlan[]>([]);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const orgId = active?.id;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setUsage(null);
    setError(null);
    fetchUsage(active.id)
      .then((u) => alive && setUsage(u))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => { alive = false; };
  }, [active, fetchUsage]);

  const loadSale = useCallback(async () => {
    if (!orgId || !supabase || !navigator.onLine) return;
    try {
      const [p, o] = await Promise.all([supabase.rpc('list_purchasable_plans', { p_org: orgId }), supabase.rpc('my_plan_orders', { p_org: orgId })]);
      if (!p.error) setPlans((p.data ?? []) as SalePlan[]);
      if (!o.error) setOrders((o.data ?? []) as MyOrder[]);
    } catch { /* bỏ qua: khu vực mua chỉ hiện khi có dữ liệu */ }
  }, [orgId]);
  useEffect(() => { void loadSale(); }, [loadSale]);

  if (!active) return null;
  const isCurrent = usage?.is_current === true;

  return (
    <>
      <h3 className="sub">Gói đang dùng</h3>
      {stale && <p className="msg warn">Đang hiển thị dữ liệu đã lưu trên thiết bị (chưa cập nhật từ máy chủ).</p>}
      {error && <p className="msg error">{error}</p>}
      {!usage && !error && <p className="muted">Đang tải…</p>}
      {usage && (
        <div className="plan-now">
          <p><strong>{usage.plan_name}</strong> · {isCurrent ? `hạn đến ${date(usage.period_end)}` : `đã hết hạn ngày ${date(usage.period_end)}`}</p>
          <p>Số vụ được dùng: <strong>{usage.used_cycles}/{usage.max_cycles}</strong> <span className={isCurrent ? 'pill ok' : 'pill warn'}>{isCurrent ? STATUS_LABEL[usage.status] : 'Hết hạn'}</span></p>
          {!isCurrent && <p className="msg warn">Gói đã hết hạn: bạn vẫn xem và ghi dữ liệu cũ được, nhưng chưa tạo được vụ mới. Hãy chọn mua gói bên dưới để gia hạn.</p>}
        </div>
      )}

      {plans.length > 0 && (
        <>
          <h3 className="sub">Các gói của Agricovi</h3>
          <p className="muted">Chọn một gói rồi điền thông tin liên hệ. Agricovi sẽ liên hệ để hướng dẫn thanh toán và kích hoạt gói cho bạn.</p>
          {plans.map((p) => (
            <Collapsible key={p.id} inline title={`${p.name}`} summary={`${p.max_cycles} vụ · ${vnd(p.price_per_quarter)}/quý`}>
              <BuyForm orgId={active.id} plan={p} onSent={() => void loadSale()} />
            </Collapsible>
          ))}
        </>
      )}

      {orders.length > 0 && (
        <>
          <h3 className="sub">Yêu cầu mua của bạn</h3>
          {orders.map((o) => (
            <div className="row member" key={o.id}>
              <span className="grow">{o.plan_name} · {o.quarters} quý · {vnd(o.amount)}<small className="muted"> · {date(o.created_at)}{o.admin_note ? ` · ${o.admin_note}` : ''}</small></span>
              <span className={o.status === 'approved' ? 'pill ok' : o.status === 'rejected' ? 'pill err' : 'pill warn'}>{ORDER_LABEL[o.status]}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** Biểu mẫu mua một gói: họ tên, điện thoại, địa chỉ, số quý, ghi chú */
function BuyForm({ orgId, plan, onSent }: { orgId: string; plan: SalePlan; onSent: () => void }) {
  const { session } = useAuth();
  const myName = useMyName(session?.user.id, session?.user.email ?? undefined);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [quarters, setQuarters] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const name = fullName || myName;
  const q = Number(quarters);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (name.trim().length < 2) return setError('Hãy nhập họ tên.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Hãy nhập số điện thoại để chúng tôi liên hệ.');
    if (address.trim().length < 3) return setError('Hãy nhập địa chỉ.');
    if (!navigator.onLine) return setError('Gửi yêu cầu cần có mạng.');
    setBusy(true);
    try {
      await callFunction({ action: 'create', organization_id: orgId, plan_id: plan.id, quarters: q, full_name: name, phone, address, note: note || null }, 'plan-order');
      setDone(true);
      onSent();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="msg ok" role="status">Đã gửi yêu cầu mua gói <strong>{plan.name}</strong>. Agricovi sẽ liên hệ số {phone} sớm nhất; bạn xem trạng thái ở mục "Yêu cầu mua của bạn".</p>;
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <p>Gói <strong>{plan.name}</strong>: tối đa <strong>{plan.max_cycles} vụ</strong> cùng lúc, <strong>{vnd(plan.price_per_quarter)}</strong>/quý.</p>
      <label>Họ tên<input value={name} maxLength={80} autoComplete="name" onChange={(e) => setFullName(e.target.value)} /></label>
      <label>Số điện thoại<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <label>Địa chỉ<input value={address} maxLength={300} autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} /></label>
      <label>Số quý muốn mua
        <select value={quarters} onChange={(e) => setQuarters(e.target.value)}>
          {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n} quý ({n * 3} tháng)</option>)}
        </select>
        <small>Thành tiền: <strong>{vnd(plan.price_per_quarter * q)}</strong></small>
      </label>
      <label>Ghi chú (không bắt buộc)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: gọi buổi sáng" /></label>
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="btnrow"><button type="submit" className="primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu mua'}</button></div>
    </form>
  );
}
