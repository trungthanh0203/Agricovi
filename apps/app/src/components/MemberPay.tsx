import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { addRate, fmtVnd, listRates, setRateActive, type RateRow } from '../lib/work';

/**
 * Trả công của MỘT người (D85): đơn giá theo giờ riêng cho người này (không còn giá chung theo tổ hoặc cơ sở).
 * Mỗi dòng có ngày hiệu lực; đổi giá = thêm dòng mới (kỳ lương đã khóa không đổi). Chỉ chủ cơ sở đặt giá.
 * Lương cố định theo tháng và thưởng/phạt sẽ thêm ở lát sau.
 */
export function MemberPay({ orgId, workerId }: { orgId: string; workerId: string | null }) {
  const online = useOnline();
  const [rates, setRates] = useState<RateRow[]>([]);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try { setRates((await listRates(orgId)).filter((r) => r.worker_id === workerId && r.rate_type === 'hour')); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, workerId]);
  useEffect(() => { void load(); }, [load]);

  if (!workerId) return <p className="muted">Người này chưa có hồ sơ chấm công nên chưa đặt được đơn giá. Hồ sơ được tạo khi tạo tài khoản nhân viên hoặc khi người đó chấm công lần đầu.</p>;

  const current = rates.filter((r) => r.is_active && r.valid_from <= todayLocal())[0];
  const submit = () => {
    const a = Number(amount.replace(/[.,\s]/g, ''));
    if (!amount.trim() || Number.isNaN(a) || a < 0) return setError('Đơn giá phải là số tiền (đồng), không âm.');
    setBusy(true); setError(null);
    addRate(orgId, { type: 'hour', workerId, teamId: null, unit: null, amount: a, validFrom: from })
      .then(() => { setAmount(''); return load(); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="inline-form">
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Đặt đơn giá cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p>{current ? <>Đơn giá hiện tại: <strong>{fmtVnd(current.amount)}/giờ</strong> (từ {new Date(current.valid_from).toLocaleDateString('vi-VN')})</> : <span className="muted">Chưa có đơn giá theo giờ: công của người này chưa tính được tiền.</span>}</p>
      <div className="pair">
        <label>Đơn giá mới (đồng/giờ)<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Có hiệu lực từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !online} onClick={submit}>Lưu đơn giá</button>
        <button type="button" className="secondary" onClick={() => { setAmount(''); setFrom(todayLocal()); setError(null); }}>Hủy</button>
      </div>
      {rates.length > 0 && (
        <table className="grid">
          <thead><tr><th>Lịch sử đơn giá</th><th className="num">Số tiền</th><th></th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className={r.is_active ? '' : 'off'}>
                <td>từ {new Date(r.valid_from).toLocaleDateString('vi-VN')}{r.is_active ? '' : ' · đã dừng'}</td>
                <td className="num">{fmtVnd(r.amount)}<span className="sub">/ giờ</span></td>
                <td className="act"><button className="icon" disabled={busy || !online} aria-label={r.is_active ? 'Dừng đơn giá' : 'Dùng lại đơn giá'}
                  onClick={() => { setBusy(true); void setRateActive(r.id, !r.is_active).then(load).catch((e) => setError(friendlyError(e))).finally(() => setBusy(false)); }}>{r.is_active ? '⏸' : '▶'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Khi tính lương, máy chủ lấy đơn giá có hiệu lực tại ngày công. Muốn đổi giá, thêm dòng mới có ngày hiệu lực mới rồi dừng dòng cũ.</p>
    </div>
  );
}
