import { useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { toLocalInput } from '../lib/hooks';
import { recordMeasures, saveMeasureLimit, voidMeasure } from '../lib/measures';
import {
  customKeyFromLabel, judge, latestByMetric, limitText, measureAlerts, metricDefs, metricInfo, parseNumber, type LimitLite,
} from '../lib/measureLogic';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

const fmtVal = (v: number, decimals: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: Math.max(decimals, 2) });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const VERDICT_TEXT = { low: 'thấp hơn ngưỡng', high: 'cao hơn ngưỡng' } as const;

/**
 * Số đo nhập tay của vụ (pH, độ mặn, DO, EC, nhiệt độ…): ghi nhanh nhiều chỉ số một lần (dùng được khi mất mạng), so với ngưỡng của cơ sở.
 * Chưa đặt ngưỡng thì không cảnh báo. Chủ/quản lý đặt ngưỡng và thêm chỉ số riêng. Hủy số đo cần mạng và lý do.
 */
export function CycleMeasures({ cycleId, canManage, online }: { cycleId: string; canManage: boolean; online: boolean }) {
  const { session } = useAuth();
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const allReadings = useTable('measureReadings');
  const allLimits = useTable('measureLimits');
  const { cropTypes } = useCatalog();
  const cycle = cycles.find((c) => c.id === cycleId);
  const orgId = cycle?.owner_org_id;
  const kind = cropTypes.find((c) => c.id === cycle?.crop_type_id)?.kind;

  const limits: LimitLite[] = useMemo(() => allLimits.filter((l) => l.organization_id === orgId), [allLimits, orgId]);
  const readings = useMemo(
    () => allReadings.filter((r) => r.cycle_id === cycleId).sort((a, b) => b.measured_at.localeCompare(a.measured_at)),
    [allReadings, cycleId],
  );
  const defs = useMemo(() => metricDefs(limits, kind === 'aquatic' ? 'aquatic' : 'crop'), [limits, kind]);
  const latest = useMemo(() => latestByMetric(readings), [readings]);
  const alerts = useMemo(() => measureAlerts(readings, limits), [readings, limits]);

  const [vals, setVals] = useState<Record<string, string>>({});
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [lim, setLim] = useState<Record<string, { min: string; max: string }>>({});
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  if (!cycle || kind === 'livestock') return null;
  const closed = cycle.status === 'ended' || cycle.status === 'cancelled';
  const me = session?.user.id;
  // đặt ngưỡng: chủ hoặc quản lý của cơ sở chủ vụ (máy chủ kiểm lại)
  const canLimits = Boolean(active && active.id === orgId && (active.roles.includes('owner') || active.roles.includes('manager')));
  const summary = readings.filter((r) => !r.voided_at).length === 0
    ? 'chưa có số đo'
    : alerts.length > 0 ? `${alerts.length} chỉ số ngoài ngưỡng` : `${latest.size} chỉ số, mới nhất ${fmtTime([...latest.values()].sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]!.measured_at)}`;

  async function save() {
    if (!me || !cycle) return;
    const items: { metric: string; value: number }[] = [];
    for (const d of defs) {
      const raw = vals[d.key]?.trim();
      if (!raw) continue;
      const n = parseNumber(raw);
      if (Number.isNaN(n)) return setError(`"${d.label}": hãy nhập một con số (ví dụ 7,5).`);
      items.push({ metric: d.key, value: n });
    }
    if (items.length === 0) return setError('Hãy nhập ít nhất một chỉ số.');
    if (new Date(when).getTime() > Date.now() + 3600_000) return setError('Thời điểm đo không được ở tương lai.');
    setBusy(true); setError(null);
    try { await recordMeasures(cycle, items, when, note, me); setVals({}); setNote(''); setWhen(toLocalInput(new Date())); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function doVoid(id: string) {
    setBusy(true); setError(null);
    try { await voidMeasure(id, reason); setVoiding(null); setReason(''); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function saveLimit(key: string, label?: string | null, unit?: string | null) {
    if (!orgId) return;
    const cur = lim[key] ?? { min: '', max: '' };
    const lo = cur.min.trim() ? parseNumber(cur.min) : null, hi = cur.max.trim() ? parseNumber(cur.max) : null;
    if (Number.isNaN(lo) || Number.isNaN(hi)) return setError('Ngưỡng phải là con số.');
    setBusy(true); setError(null); setMsg(null);
    try { await saveMeasureLimit(orgId, { metric: key, label, unit, min: lo, max: hi }); setMsg('Đã lưu ngưỡng.'); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function addCustom() {
    if (!orgId) return;
    if (newName.trim().length < 1 || newUnit.trim().length < 1) return setError('Hãy nhập tên và đơn vị của chỉ số.');
    setBusy(true); setError(null); setMsg(null);
    try {
      await saveMeasureLimit(orgId, { metric: customKeyFromLabel(newName), label: newName.trim(), unit: newUnit.trim(), min: null, max: null });
      setNewName(''); setNewUnit(''); setMsg('Đã thêm chỉ số. Đặt ngưỡng ở bên trên nếu cần.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function removeCustom(key: string, label: string | null | undefined, unit: string | null | undefined) {
    if (!orgId || !window.confirm('Ngừng dùng chỉ số này? Số đo đã ghi vẫn được giữ.')) return;
    setBusy(true); setError(null);
    try { await saveMeasureLimit(orgId, { metric: key, label, unit, min: null, max: null, active: false }); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Collapsible title="Số đo (pH, độ mặn, nhiệt độ…)" summary={summary} warn={alerts.length > 0}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      {alerts.map((a) => {
        const d = metricInfo(a.reading.metric, limits);
        const l = limits.find((x) => x.metric === a.reading.metric);
        return <p className="msg warn" role="status" key={a.reading.id}><strong>{d.label}</strong>: {fmtVal(a.reading.value, d.decimals)}{d.unit ? ` ${d.unit}` : ''} {VERDICT_TEXT[a.verdict]} ({limitText(l, d.unit)}). Đo lúc {fmtTime(a.reading.measured_at)}.</p>;
      })}

      {latest.size > 0 && (
        <div className="card slim">
          {[...latest.values()].sort((a, b) => a.metric.localeCompare(b.metric)).map((r) => {
            const d = metricInfo(r.metric, limits);
            const l = limits.find((x) => x.metric === r.metric);
            const v = judge(r.value, l);
            return (
              <div className="row" key={r.metric}>
                <span>{d.label} <span className="muted">· {fmtTime(r.measured_at)}</span></span>
                <strong>{fmtVal(r.value, d.decimals)}{d.unit ? ` ${d.unit}` : ''} {v === 'ok' && <span className="pill ok">Đạt</span>}{(v === 'low' || v === 'high') && <span className="pill warn">{v === 'low' ? 'Thấp' : 'Cao'}</span>}</strong>
              </div>
            );
          })}
        </div>
      )}

      {!closed && (
        <Collapsible inline title="＋ Ghi số đo" summary="nhập một hoặc nhiều chỉ số">
          <div className="inline-form">
            <label>Thời điểm đo<input type="datetime-local" value={when} max={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} /></label>
            {defs.map((d) => {
              const l = limits.find((x) => x.metric === d.key);
              return (
                <label key={d.key}>{d.label}{d.unit ? ` (${d.unit})` : ''} <span className="muted">{limitText(l, d.unit) === 'chưa đặt ngưỡng' ? '' : `· ngưỡng ${limitText(l, d.unit)}`}</span>
                  <input inputMode="decimal" value={vals[d.key] ?? ''} onChange={(e) => setVals({ ...vals, [d.key]: e.target.value })} placeholder="Để trống nếu không đo" />
                </label>
              );
            })}
            <label>Ghi chú (không bắt buộc)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đo buổi sáng, ao số 2" /></label>
            {!online && <p className="msg warn">Đang offline: số đo nằm trên điện thoại và tự gửi khi có mạng.</p>}
            <div className="btnrow">
              <button className="primary" disabled={busy} onClick={() => void save()}>Lưu</button>
              <button className="secondary" disabled={busy} onClick={() => { setVals({}); setNote(''); setError(null); }}>Xóa ô đã nhập</button>
            </div>
          </div>
        </Collapsible>
      )}

      {canLimits && (
        <Collapsible inline title="⚙ Ngưỡng cảnh báo" summary="chủ / quản lý đặt">
          <p className="muted">Để trống = không cảnh báo. Ngưỡng áp cho mọi vụ của cơ sở. Hãy hỏi cán bộ khuyến nông/thú y để chọn khoảng phù hợp.</p>
          {defs.map((d) => {
            const l = limits.find((x) => x.metric === d.key);
            const cur = lim[d.key] ?? { min: l?.min_value != null ? String(l.min_value) : '', max: l?.max_value != null ? String(l.max_value) : '' };
            return (
              <div className="inline-form" key={d.key}>
                <p><strong>{d.label}</strong>{d.unit ? ` (${d.unit})` : ''}</p>
                <div className="pair">
                  <label>Thấp nhất<input inputMode="decimal" value={cur.min} onChange={(e) => setLim({ ...lim, [d.key]: { ...cur, min: e.target.value } })} /></label>
                  <label>Cao nhất<input inputMode="decimal" value={cur.max} onChange={(e) => setLim({ ...lim, [d.key]: { ...cur, max: e.target.value } })} /></label>
                </div>
                <div className="btnrow">
                  <button className="primary" disabled={busy || !online} onClick={() => void saveLimit(d.key, l?.label ?? d.label, l?.unit ?? d.unit)}>Lưu ngưỡng</button>
                  {d.custom && <button className="secondary" disabled={busy || !online} onClick={() => void removeCustom(d.key, l?.label, l?.unit)}>Ngừng dùng chỉ số</button>}
                </div>
              </div>
            );
          })}
          <Collapsible inline title="＋ Thêm chỉ số riêng" summary="ví dụ NH3, độ kiềm">
            <div className="inline-form">
              <div className="pair">
                <label>Tên chỉ số<input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Ví dụ: NH3" /></label>
                <label>Đơn vị<input value={newUnit} maxLength={20} onChange={(e) => setNewUnit(e.target.value)} placeholder="Ví dụ: mg/l" /></label>
              </div>
              <div className="btnrow"><button className="primary" disabled={busy || !online} onClick={() => void addCustom()}>Thêm</button></div>
            </div>
          </Collapsible>
        </Collapsible>
      )}

      {readings.slice(0, 10).map((r) => {
        const d = metricInfo(r.metric, limits);
        return (
          <div className={r.voided_at ? 'card slim voided' : 'card slim'} key={r.id}>
            <div className="row">
              <strong className="grow">{d.label}: {fmtVal(r.value, d.decimals)}{d.unit ? ` ${d.unit}` : ''}</strong>
              <span className="muted">{fmtTime(r.measured_at)}</span>
            </div>
            {(r.note || r.author_name) && <p className="muted">{[r.author_name, r.note].filter(Boolean).join(' · ')}</p>}
            {r.voided_at ? <span className="pill err">Đã hủy{r.void_reason ? `: ${r.void_reason}` : ''}</span>
              : (canManage || r.created_by === me) && voiding !== r.id && <button className="link inline" disabled={!online} onClick={() => { setVoiding(r.id); setReason(''); }}>Hủy số đo</button>}
            {voiding === r.id && (
              <div className="inline-form">
                <label>Lý do hủy<input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: đọc nhầm máy" /></label>
                <div className="btnrow">
                  <button className="primary" disabled={busy || reason.trim().length < 3} onClick={() => void doVoid(r.id)}>Xác nhận hủy</button>
                  <button className="secondary" onClick={() => setVoiding(null)}>Không hủy</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {readings.length > 10 && <p className="muted">Hiện 10 số đo gần nhất trong {readings.length}.</p>}
    </Collapsible>
  );
}
