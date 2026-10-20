import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { isOwner } from '../lib/roles';
import { loadTeams } from '../lib/teams';
import { addRate, fmtVnd, listRates, listWorkers, setRateActive, type RateRow, type WorkerLite } from '../lib/work';

/**
 * Đơn giá công (D18, D42): chỉ chủ đặt/sửa; quản lý chỉ xem. Có hai loại: theo GIỜ và theo SẢN LƯỢNG.
 * Phạm vi: cả cơ sở, một tổ, hoặc một người — cụ thể nhất thắng (người > tổ > cả cơ sở). Đổi giá = thêm dòng mới có ngày hiệu lực.
 */
export function RatesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [rates, setRates] = useState<RateRow[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<'hour' | 'quantity'>('hour');
  const [scope, setScope] = useState<'org' | 'team' | 'worker'>('org');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('kg');
  const [from, setFrom] = useState(todayLocal());

  const orgId = active?.id;
  const canEdit = isOwner(active?.roles);

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const [r, w, t] = await Promise.all([listRates(orgId), listWorkers(orgId), loadTeams(orgId)]);
      setRates(r); setWorkers(w); setTeams(t.teams.map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const nameOf = (r: RateRow) =>
    r.worker_id ? `Người: ${workers.find((w) => w.id === r.worker_id)?.full_name ?? '—'}` : r.team_id ? `Tổ: ${teams.find((t) => t.id === r.team_id)?.name ?? '—'}` : 'Cả cơ sở';

  function submit(e: FormEvent) {
    e.preventDefault();
    const a = Number(amount.replace(/[.,\s]/g, ''));
    if (!amount.trim() || Number.isNaN(a) || a < 0) return setError('Đơn giá phải là số tiền (đồng), không âm.');
    if (type === 'quantity' && !unit.trim()) return setError('Hãy nhập đơn vị sản lượng (kg, giỏ, cây…).');
    if (scope !== 'org' && !target) return setError(scope === 'team' ? 'Hãy chọn tổ.' : 'Hãy chọn người.');
    setBusy(true);
    setError(null);
    addRate(active!.id, { type, workerId: scope === 'worker' ? target : null, teamId: scope === 'team' ? target : null, unit: unit.trim(), amount: a, validFrom: from })
      .then(() => { setAmount(''); return load(); })
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setBusy(false));
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm đơn giá cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {!canEdit && <p className="muted">Chỉ chủ cơ sở được đặt đơn giá. Bạn xem được bảng bên dưới.</p>}

      {canEdit && (
        <form className="card inline-form" onSubmit={submit} noValidate>
          <h2>Thêm đơn giá</h2>
          <div className="pair">
            <label>Tính theo
              <select value={type} onChange={(e) => setType(e.target.value as 'hour' | 'quantity')}>
                <option value="hour">Giờ làm</option>
                <option value="quantity">Sản lượng</option>
              </select>
            </label>
            <label>Áp dụng cho
              <select value={scope} onChange={(e) => { setScope(e.target.value as 'org' | 'team' | 'worker'); setTarget(''); }}>
                <option value="org">Cả cơ sở</option>
                <option value="team">Một tổ</option>
                <option value="worker">Một người</option>
              </select>
            </label>
          </div>
          {scope === 'team' && (
            <label>Tổ<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— Chọn tổ —</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          )}
          {scope === 'worker' && (
            <label>Người<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— Chọn người —</option>{workers.filter((w) => w.status === 'active').map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}</select></label>
          )}
          <div className="pair">
            <label>{type === 'hour' ? 'Đơn giá (đồng/giờ)' : 'Đơn giá (đồng/đơn vị)'}<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></label>
            {type === 'quantity' && <label>Đơn vị<input value={unit} onChange={(e) => setUnit(e.target.value)} /></label>}
          </div>
          <label>Có hiệu lực từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <button type="submit" className="primary" disabled={busy || !online}>Thêm đơn giá</button>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Đơn giá ({rates.length})</th><th className="num">Số tiền</th>{canEdit && <th></th>}</tr></thead>
        <tbody>
          {rates.length === 0 && <tr><td colSpan={3} className="muted">Chưa có đơn giá. Chưa có đơn giá thì công và sản lượng chưa tính được tiền.</td></tr>}
          {rates.map((r) => (
            <tr key={r.id} className={r.is_active ? '' : 'off'}>
              <td>{r.rate_type === 'hour' ? 'Theo giờ' : `Theo sản lượng (${r.unit})`}<span className="sub">{nameOf(r)} · từ {new Date(r.valid_from).toLocaleDateString('vi-VN')}{r.is_active ? '' : ' · đã dừng'}</span></td>
              <td className="num">{fmtVnd(r.amount)}<span className="sub">/ {r.rate_type === 'hour' ? 'giờ' : r.unit}</span></td>
              {canEdit && <td className="act"><button className="icon" disabled={busy || !online} aria-label={r.is_active ? 'Dừng đơn giá' : 'Dùng lại đơn giá'}
                onClick={() => { setBusy(true); void setRateActive(r.id, !r.is_active).then(load).catch((e) => setError(friendlyError(e))).finally(() => setBusy(false)); }}>{r.is_active ? '⏸' : '▶'}</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Khi tính tiền, máy chủ chọn đơn giá cụ thể nhất: người &gt; tổ &gt; cả cơ sở. Muốn đổi giá, thêm dòng mới có ngày hiệu lực mới rồi dừng dòng cũ; kỳ đã khóa không bị đổi.</p>
    </>
  );
}
