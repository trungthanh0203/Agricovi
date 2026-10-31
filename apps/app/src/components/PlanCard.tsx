import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

interface SalePlan { id: string; name: string; max_cycles: number; price_per_quarter: number; is_trial?: boolean }
interface MyOrder { id: string; plan_name: string; quarters: number; amount: number; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string }
interface Purchase { purchased: boolean; quarters?: number; amount?: number; since?: string; until?: string }
const ORDER_LABEL = { pending: 'Chờ xử lý', approved: 'Đã kích hoạt', rejected: 'Chưa duyệt' } as const;

/**
 * Gói dịch vụ (D131, D132), hai khung:
 *  - trên "Gói đang dùng": tên gói, hạn sử dụng, số vụ được dùng, đã mua, nút Gia hạn thêm;
 *  - dưới "Các gói đăng ký của Agricovi": bảng các gói (tên gói và số vụ tối đa, giá/quý, nút Đăng ký). Bấm Đăng ký mở biểu mẫu mua của gói đó:
 *    họ tên, điện thoại, địa chỉ, số quý. Yêu cầu hiện ở trang quản trị nền tảng (có email thông báo); Agricovi liên hệ, thu tiền rồi duyệt thì gói được kích hoạt.
 */
export function PlanCard() {
  const { active, stale, fetchUsage } = useOrgs();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<SalePlan[]>([]);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [buying, setBuying] = useState<string | null>(null);   // gói đang mở biểu mẫu mua
  const orgId = active?.id;

  // Chỉ tải lại khi ĐỔI cơ sở (không phụ thuộc đối tượng `active`, vốn đổi chỗ nhớ mỗi khi danh sách cơ sở được làm mới) và không xóa số cũ khi tải lại
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    setUsage(null);
    setError(null);
    fetchUsage(activeId)
      .then((u) => alive && setUsage(u))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => { alive = false; };
  }, [activeId, fetchUsage]);

  const loadSale = useCallback(async () => {
    if (!orgId || !supabase || !navigator.onLine) return;
    try {
      const [p, o, pu] = await Promise.all([
        supabase.rpc('list_purchasable_plans', { p_org: orgId }), supabase.rpc('my_plan_orders', { p_org: orgId }), supabase.rpc('my_plan_purchase', { p_org: orgId }),
      ]);
      if (!p.error) setPlans((p.data ?? []) as SalePlan[]);
      if (!o.error) setOrders((o.data ?? []) as MyOrder[]);
      if (!pu.error) setPurchase(pu.data as Purchase);
    } catch { /* bỏ qua: khu vực mua chỉ hiện khi có dữ liệu */ }
  }, [orgId]);
  useEffect(() => { void loadSale(); }, [loadSale]);

  if (!active) return null;
  const isCurrent = usage?.is_current === true;
  // Gia hạn thêm: mở biểu mẫu của chính gói đang dùng nếu gói đó đang bán; không thì chỉ cuộn tới danh sách để chọn gói
  const renew = () => {
    const same = plans.find((p) => p.name === usage?.plan_name && !p.is_trial);
    setBuying(same?.id ?? null);
    window.setTimeout(() => document.getElementById('plan-sale')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const buyPlan = plans.find((p) => p.id === buying) ?? null;

  return (
    <>
      <div className="card plan-frame">
        <h3 className="sub">Gói đang dùng</h3>
        {stale && <p className="msg warn">Đang hiển thị dữ liệu đã lưu trên thiết bị (chưa cập nhật từ máy chủ).</p>}
        {error && <p className="msg error">{error}</p>}
        {!usage && !error && <p className="muted">Đang tải…</p>}
        {usage && (
          <>
            <p><strong>{usage.plan_name}</strong> · {isCurrent ? `hạn đến ${date(usage.period_end)}` : `đã hết hạn ngày ${date(usage.period_end)}`} <span className={isCurrent ? 'pill ok' : 'pill warn'}>{isCurrent ? STATUS_LABEL[usage.status] : 'Hết hạn'}</span></p>
            <p>Số vụ được dùng: <strong>{usage.used_cycles}/{usage.max_cycles}</strong></p>
            <p>Đã mua: {purchase?.purchased ? <strong>{purchase.quarters} quý · {vnd(purchase.amount ?? 0)}</strong> : <span className="muted">chưa mua (đang dùng thử)</span>}</p>
            {!isCurrent && <p className="msg warn">Gói đã hết hạn: bạn vẫn xem và ghi dữ liệu cũ được, nhưng chưa tạo được vụ mới. Hãy gia hạn hoặc chọn gói bên dưới.</p>}
            {plans.some((p) => !p.is_trial) && <div className="btnrow"><button type="button" className="primary" onClick={renew}>Gia hạn thêm</button></div>}
          </>
        )}
      </div>

      {plans.length > 0 && (
        <div className="card plan-frame" id="plan-sale">
          <h3 className="sub">Các gói đăng ký của Agricovi</h3>
          <div className="tablewrap">
            <table className="grid">
              <thead><tr><th>Gói</th><th>Giá/quý</th><th></th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className={buying === p.id ? 'sel' : ''}>
                    <td><strong>{p.name}</strong><span className="sub">Tối đa {p.max_cycles} vụ</span></td>
                    <td>{p.is_trial ? 'Miễn phí' : vnd(p.price_per_quarter)}</td>
                    <td className="act">
                      {p.is_trial
                        ? <span className="pill">Dùng thử</span>
                        : <button type="button" className="secondary" onClick={() => setBuying(buying === p.id ? null : p.id)}>{buying === p.id ? 'Đóng' : 'Đăng ký'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {buyPlan && <BuyForm key={buyPlan.id} orgId={active.id} plan={buyPlan} onSent={() => void loadSale()} onClose={() => setBuying(null)} />}
        </div>
      )}

      {orders.length > 0 && (
        <div className="card plan-frame">
          <h3 className="sub">Yêu cầu mua của bạn</h3>
          {orders.map((o) => (
            <div className="row member" key={o.id}>
              <span className="grow">{o.plan_name} · {o.quarters} quý · {vnd(o.amount)}<small className="muted"> · {date(o.created_at)}{o.admin_note ? ` · ${o.admin_note}` : ''}</small></span>
              <span className={o.status === 'approved' ? 'pill ok' : o.status === 'rejected' ? 'pill err' : 'pill warn'}>{ORDER_LABEL[o.status]}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Biểu mẫu mua một gói: họ tên, điện thoại, địa chỉ, số quý, ghi chú */
function BuyForm({ orgId, plan, onSent, onClose }: { orgId: string; plan: SalePlan; onSent: () => void; onClose: () => void }) {
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

  if (done) {
    return (
      <>
        <p className="msg ok" role="status">Đã gửi yêu cầu mua gói <strong>{plan.name}</strong>. Agricovi sẽ liên hệ số {phone} sớm nhất; bạn xem trạng thái ở mục "Yêu cầu mua của bạn".</p>
        <button type="button" className="secondary" onClick={onClose}>Đóng</button>
      </>
    );
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <p>Đăng ký gói <strong>{plan.name}</strong>: tối đa <strong>{plan.max_cycles} vụ</strong> cùng lúc, <strong>{vnd(plan.price_per_quarter)}</strong>/quý.</p>
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
      <div className="btnrow">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu mua'}</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
    </form>
  );
}
