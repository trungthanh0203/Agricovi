import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { addDays } from '../lib/dates';
import { addRate, fmtVnd, listRates, setRateActive, setRateEnd, type RateRow } from '../lib/work';

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
  const [to, setTo] = useState('');
  const [endEdit, setEndEdit] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try { setRates((await listRates(orgId)).filter((r) => r.worker_id === workerId && (r.rate_type === 'hour' || r.rate_type === 'month'))); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, workerId]);
  useEffect(() => { void load(); }, [load]);

  if (!workerId) return <p className="muted">Người này chưa có hồ sơ chấm công nên chưa đặt được đơn giá. Hồ sơ được tạo khi tạo tài khoản nhân viên hoặc khi người đó chấm công lần đầu.</p>;

  const today = todayLocal();
  const currentOf = (t: 'hour' | 'month') => rates.filter((r) => r.is_active && r.rate_type === t && r.valid_from <= today && (!r.valid_to || r.valid_to >= today))[0];
  const fmt = (d: string) => new Date(d).toLocaleDateString('vi-VN');
  const curHour = currentOf('hour'), curMonth = currentOf('month');
  const submit = () => {
    const a = Number(amount.replace(/[.,\s]/g, ''));
    if (!amount.trim() || Number.isNaN(a) || a < 0) return setError('Đơn giá phải là số tiền (đồng), không âm.');
    if (to && to < from) return setError('Ngày hết hiệu lực không thể trước ngày bắt đầu.');
    setBusy(true); setError(null);
    // dòng cùng loại đang mở (chưa có ngày hết hiệu lực) và bắt đầu trước thì tự kết thúc vào hôm trước ngày bắt đầu của dòng mới
    const open = rates.filter((r) => r.rate_type === kind && r.is_active && !r.valid_to && r.valid_from < from);
    addRate(orgId, { type: kind, workerId, teamId: null, unit: null, amount: a, validFrom: from, validTo: to || null })
      .then(() => Promise.all(open.map((r) => setRateEnd(r.id, addDays(from, -1)))))
      .then(() => { setAmount(''); setTo(''); return load(); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="inline-form">
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Đặt đơn giá cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p>{curHour ? <>Theo giờ: <strong>{fmtVnd(curHour.amount)}/giờ</strong> (từ {fmt(curHour.valid_from)}{curHour.valid_to ? ` đến ${fmt(curHour.valid_to)}` : ', chưa hết hạn'})</> : <span className="muted">Chưa có đơn giá theo giờ.</span>}</p>
      <p>{curMonth ? <>Lương cố định: <strong>{fmtVnd(curMonth.amount)}/tháng</strong> (từ {fmt(curMonth.valid_from)}{curMonth.valid_to ? ` đến ${fmt(curMonth.valid_to)}` : ', chưa hết hạn'})</> : <span className="muted">Chưa có lương cố định theo tháng.</span>}</p>
      {!curHour && !curMonth && <p className="msg warn">Chưa có cách trả công nào: công của người này chưa tính được tiền.</p>}
      <div className="pair">
        <label>Thêm hoặc đổi cách trả
          <select value={kind} onChange={(e) => setKind(e.target.value as 'hour' | 'month')}>
            <option value="hour">Theo giờ làm</option>
            <option value="month">Lương cố định tháng</option>
          </select>
        </label>
        <label>{kind === 'hour' ? 'Đơn giá (đồng/giờ)' : 'Lương (đồng/tháng)'}<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <div className="pair">
        <label>Có hiệu lực từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hết hiệu lực vào ngày<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="muted">Ngày hết hiệu lực không bắt buộc. Khi thêm dòng mới, dòng cũ cùng loại tự kết thúc vào hôm trước ngày bắt đầu của dòng mới.</p>
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !online} onClick={submit}>Lưu đơn giá</button>
        <button type="button" className="secondary" onClick={() => { setAmount(''); setFrom(todayLocal()); setTo(''); setError(null); }}>Hủy</button>
      </div>
      {rates.length > 0 && (
        <table className="grid">
          <thead><tr><th>Lịch sử</th><th className="num">Số tiền</th><th></th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className={r.is_active ? '' : 'off'}>
                <td>{r.rate_type === 'month' ? 'Lương tháng' : 'Theo giờ'}<span className="sub">từ {fmt(r.valid_from)}{r.valid_to ? ` đến ${fmt(r.valid_to)}` : ' · chưa hết hạn'}{r.is_active ? '' : ' · đã dừng'}</span>
                  {endEdit?.id === r.id ? (
                    <span className="inline-form">
                      <input type="date" value={endEdit.value} min={r.valid_from} onChange={(e) => setEndEdit({ id: r.id, value: e.target.value })} />
                      <span className="btnrow">
                        <button type="button" className="primary" disabled={busy || !online} onClick={() => {
                          if (endEdit.value && endEdit.value < r.valid_from) return setError('Ngày hết hiệu lực không thể trước ngày bắt đầu.');
                          setBusy(true); void setRateEnd(r.id, endEdit.value || null).then(() => { setEndEdit(null); return load(); }).catch((e) => setError(friendlyError(e))).finally(() => setBusy(false));
                        }}>Lưu</button>
                        <button type="button" className="secondary" onClick={() => setEndEdit(null)}>Hủy</button>
                      </span>
                    </span>
                  ) : <button type="button" className="link inline" disabled={busy || !online} onClick={() => setEndEdit({ id: r.id, value: r.valid_to ?? '' })}>Đặt ngày hết hiệu lực</button>}
                </td>
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
