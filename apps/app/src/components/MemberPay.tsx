import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { addRate, fmtVnd, listRates, setRateActive, type RateRow } from '../lib/work';

/**
 * Trả công của MỘT người (D86): đặt riêng cho người này, không còn giá chung theo tổ hoặc cơ sở. Hai cách: THEO GIỜ (đồng/giờ) hoặc
 * LƯƠNG CỐ ĐỊNH THEO THÁNG (đồng/tháng); có thể có cả hai. Mỗi dòng có ngày hiệu lực; đổi = thêm dòng mới (kỳ lương đã khóa không đổi).
 * Chỉ chủ cơ sở (hoặc người được cấp quyền Tiền công) đặt. Thưởng, phạt, tạm ứng nhập ở Báo cáo → Tiền công khi tính lương.
 */
export function MemberPay({ orgId, workerId }: { orgId: string; workerId: string | null }) {
  const online = useOnline();
  const [rates, setRates] = useState<RateRow[]>([]);
  const [kind, setKind] = useState<'hour' | 'month'>('hour');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try { setRates((await listRates(orgId)).filter((r) => r.worker_id === workerId && (r.rate_type === 'hour' || r.rate_type === 'month'))); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, workerId]);
  useEffect(() => { void load(); }, [load]);

  if (!workerId) return <p className="muted">Người này chưa có hồ sơ chấm công nên chưa đặt được đơn giá. Hồ sơ được tạo khi tạo tài khoản nhân viên hoặc khi người đó chấm công lần đầu.</p>;

  const currentOf = (t: 'hour' | 'month') => rates.filter((r) => r.is_active && r.rate_type === t && r.valid_from <= todayLocal())[0];
  const curHour = currentOf('hour'), curMonth = currentOf('month');
  const submit = () => {
    const a = Number(amount.replace(/[.,\s]/g, ''));
    if (!amount.trim() || Number.isNaN(a) || a < 0) return setError('Đơn giá phải là số tiền (đồng), không âm.');
    setBusy(true); setError(null);
    addRate(orgId, { type: kind, workerId, teamId: null, unit: null, amount: a, validFrom: from })
      .then(() => { setAmount(''); return load(); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="inline-form">
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Đặt đơn giá cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p>{curHour ? <>Theo giờ: <strong>{fmtVnd(curHour.amount)}/giờ</strong> (từ {new Date(curHour.valid_from).toLocaleDateString('vi-VN')})</> : <span className="muted">Chưa có đơn giá theo giờ.</span>}</p>
      <p>{curMonth ? <>Lương cố định: <strong>{fmtVnd(curMonth.amount)}/tháng</strong> (từ {new Date(curMonth.valid_from).toLocaleDateString('vi-VN')})</> : <span className="muted">Chưa có lương cố định theo tháng.</span>}</p>
      {!curHour && !curMonth && <p className="msg warn">Chưa có cách trả công nào: công của người này chưa tính được tiền.</p>}
      <label>Thêm hoặc đổi cách trả
        <select value={kind} onChange={(e) => setKind(e.target.value as 'hour' | 'month')}>
          <option value="hour">Theo giờ làm (đồng/giờ)</option>
          <option value="month">Lương cố định theo tháng (đồng/tháng)</option>
        </select>
      </label>
      <div className="pair">
        <label>{kind === 'hour' ? 'Đơn giá (đồng/giờ)' : 'Lương (đồng/tháng)'}<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Có hiệu lực từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !online} onClick={submit}>Lưu đơn giá</button>
        <button type="button" className="secondary" onClick={() => { setAmount(''); setFrom(todayLocal()); setError(null); }}>Hủy</button>
      </div>
      {rates.length > 0 && (
        <table className="grid">
          <thead><tr><th>Lịch sử</th><th className="num">Số tiền</th><th></th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className={r.is_active ? '' : 'off'}>
                <td>{r.rate_type === 'month' ? 'Lương tháng' : 'Theo giờ'}<span className="sub">từ {new Date(r.valid_from).toLocaleDateString('vi-VN')}{r.is_active ? '' : ' · đã dừng'}</span></td>
                <td className="num">{fmtVnd(r.amount)}<span className="sub">/ {r.rate_type === 'month' ? 'tháng' : 'giờ'}</span></td>
                <td className="act"><button className="icon" disabled={busy || !online} aria-label={r.is_active ? 'Dừng đơn giá' : 'Dùng lại đơn giá'}
                  onClick={() => { setBusy(true); void setRateActive(r.id, !r.is_active).then(load).catch((e) => setError(friendlyError(e))).finally(() => setBusy(false)); }}>{r.is_active ? '⏸' : '▶'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Công đã xác nhận được tính theo đơn giá giờ có hiệu lực tại ngày công. Lương cố định trả nguyên số tiền một lần mỗi tháng (tháng của ngày cuối kỳ); nghỉ không phép hay vào giữa tháng thì nhập khoản Phạt/khấu trừ khi tính lương. Muốn đổi, thêm dòng mới có ngày hiệu lực mới rồi dừng dòng cũ.</p>
    </div>
  );
}
