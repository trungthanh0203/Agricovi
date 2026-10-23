import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile } from './HomeStats';
import { useAuth } from '../lib/auth';
import { addDays } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import {
  buildReportCsv, deleteSavedReport, fmtCell, listSavedReports, REPORT_TYPES, reportTotals, runReport, saveReport,
  type ReportParams, type ReportResult, type ReportType, type SavedReport,
} from '../lib/reports';
import { downloadCsv } from '../lib/summary';
import { useTable } from '../lib/tables';

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const prevMonth = (d: string) => { const x = new Date(`${monthStart(d)}T00:00:00`); x.setMonth(x.getMonth() - 1); return x.toLocaleDateString('en-CA'); };

/**
 * Báo cáo theo nhu cầu (D48): chọn loại, nhóm theo, khoảng ngày, vụ → xem bảng + tổng → xuất CSV hoặc lưu lại (của tôi / chia sẻ cả cơ sở).
 * Cần mạng; máy chủ tính số và kiểm quyền theo mục.
 */
export function ReportBuilder() {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const cycles = useTable('cycles').filter((c) => c.owner_org_id === active?.id);
  const types = useMemo(() => REPORT_TYPES.filter((t) => t.allowed(active?.perms, active?.roles)), [active]);
  const today = todayLocal();

  const [type, setType] = useState<ReportType>(types[0]?.id ?? 'expenses');
  const info = types.find((t) => t.id === type) ?? types[0];
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [cycleId, setCycleId] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  const orgId = active?.id;
  const loadSaved = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setSaved(await listSavedReports(orgId)); } catch { setSaved([]); }
  }, [orgId]);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  if (!active || !info) return <p className="muted">Bạn chưa có quyền xem loại báo cáo nào. Hãy nhờ chủ cơ sở cấp quyền.</p>;
  const grp = group && info.groups.some((g) => g.id === group) ? group : info.groups[0]?.id ?? '';
  const params = (): ReportParams => ({ from, to, ...(cycleId ? { cycle_id: cycleId } : {}), ...(grp ? { group: grp } : {}) });

  async function run(t: ReportType, p: ReportParams) {
    setBusy(true);
    setError(null);
    try { setResult(await runReport(active!.id, t, p)); } catch (e) { setResult(null); setError(friendlyError(e)); } finally { setBusy(false); }
  }
  function openSaved(s: SavedReport) {
    setType(s.report_type);
    setGroup(s.params.group ?? '');
    if (s.params.from) setFrom(s.params.from);
    if (s.params.to) setTo(s.params.to);
    setCycleId(s.params.cycle_id ?? '');
    void run(s.report_type, s.params);
  }
  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };
  const tot = result ? reportTotals(result) : {};

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: báo cáo cần có mạng để tính.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {saved.length > 0 && (
        <Collapsible title="Báo cáo đã lưu" summary={`${saved.length} báo cáo`}>
          {saved.map((s) => (
            <div className="row member" key={s.id}>
              <span className="grow">{s.name}<span className="sub">{REPORT_TYPES.find((t) => t.id === s.report_type)?.label}{s.shared ? ' · chia sẻ cả cơ sở' : ' · của tôi'}</span></span>
              <button className="secondary" style={{ minHeight: 40, width: 'auto', margin: 0, padding: '0 12px' }} disabled={busy || !online} onClick={() => openSaved(s)}>Mở</button>
              {(s.owner_id === uid) && (
                <button className="icon" disabled={busy || !online} aria-label={`Xóa báo cáo ${s.name}`}
                  onClick={() => { if (window.confirm(`Xóa báo cáo "${s.name}"?`)) void deleteSavedReport(s.id).then(loadSaved).catch((e) => setError(friendlyError(e))); }}>🗑</button>
              )}
            </div>
          ))}
        </Collapsible>
      )}

      <div className="card">
        <h2>Tạo báo cáo</h2>
        <div className="inline-form">
          <label>Loại báo cáo
            <select value={info.id} onChange={(e) => { setType(e.target.value as ReportType); setGroup(''); setResult(null); }}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <small>{info.hint}</small>
          </label>
          {info.groups.length > 0 && (
            <label>Nhóm theo
              <select value={grp} onChange={(e) => setGroup(e.target.value)}>{info.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
            </label>
          )}
          <div className="chips" role="group" aria-label="Chọn nhanh khoảng thời gian">
            <button className="chip" onClick={() => preset(addDays(today, -29), today)}>30 ngày qua</button>
            <button className="chip" onClick={() => preset(monthStart(today), today)}>Tháng này</button>
            <button className="chip" onClick={() => { const s = prevMonth(today); preset(s, addDays(monthStart(today), -1)); }}>Tháng trước</button>
            <button className="chip" onClick={() => preset(`${today.slice(0, 4)}-01-01`, today)}>Năm nay</button>
          </div>
          <div className="pair">
            <label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {info.id !== 'purchases' && (
            <label>Vụ (không bắt buộc)
              <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                <option value="">— Tất cả các vụ —</option>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}
              </select>
            </label>
          )}
          <button className="primary" disabled={busy || !online} onClick={() => void run(info.id, params())}>{busy ? 'Đang tính…' : 'Xem báo cáo'}</button>
        </div>
      </div>

      {result && (
        <>
          <h2 className="sect">{result.title}</h2>
          <p className="muted">Từ {new Date(result.from).toLocaleDateString('vi-VN')} đến {new Date(result.to).toLocaleDateString('vi-VN')} · tính lúc {new Date(result.generated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
          {Object.keys(tot).length > 0 && (
            <div className="kpis">
              {result.columns.filter((c) => c.sum).slice(0, 4).map((c) => (
                <KpiTile key={c.key} label={`Tổng: ${c.label}`} value={fmtCell(tot[c.key], c.kind)} tone={c.kind === 'money' ? 'info' : 'neutral'} />
              ))}
            </div>
          )}
          <div className="scrollx">
            <table className="grid">
              <thead><tr>{result.columns.map((c) => <th key={c.key} className={c.kind === 'text' ? '' : 'num'}>{c.label}</th>)}</tr></thead>
              <tbody>
                {result.rows.length === 0 && <tr><td colSpan={result.columns.length} className="muted">Không có số liệu trong khoảng này.</td></tr>}
                {result.rows.map((row, i) => (
                  <tr key={i}>{result.columns.map((c) => <td key={c.key} className={c.kind === 'text' ? '' : 'num'}>{fmtCell(row[c.key], c.kind)}</td>)}</tr>
                ))}
                {result.rows.length > 0 && Object.keys(tot).length > 0 && (
                  <tr><td><strong>Tổng</strong></td>{result.columns.slice(1).map((c) => <td key={c.key} className="num"><strong>{c.sum ? fmtCell(tot[c.key], c.kind) : ''}</strong></td>)}</tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="btnrow">
            <button className="secondary" onClick={() => downloadCsv(`bao-cao-${result.type}-${result.from}_${result.to}.csv`, buildReportCsv(result, active.name))}>Xuất CSV</button>
            <button className="secondary" disabled={!online} onClick={() => setSaving(!saving)}>Lưu báo cáo này</button>
          </div>
          {saving && (
            <div className="card">
              <div className="inline-form">
                <label>Tên báo cáo<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chi phí theo vụ quý này" /></label>
                <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Chia sẻ cho mọi người trong cơ sở (người xem vẫn chỉ thấy số nếu có quyền)</label>
                <p className="muted">Chỉ lưu loại báo cáo và bộ lọc; mỗi lần mở sẽ tính số mới.</p>
                <div className="btnrow">
                  <button className="primary" disabled={busy || name.trim().length < 2} onClick={() => {
                    setBusy(true);
                    setError(null);
                    saveReport(active.id, name, result.type, { from: result.from, to: result.to, group: result.group === 'default' ? undefined : result.group, ...(cycleId ? { cycle_id: cycleId } : {}) }, shared)
                      .then(() => { setSaving(false); setName(''); setShared(false); return loadSaved(); })
                      .catch((e) => setError(friendlyError(e)))
                      .finally(() => setBusy(false));
                  }}>Lưu</button>
                  <button type="button" className="secondary" onClick={() => setSaving(false)}>Hủy</button>
                </div>
              </div>
            </div>
          )}
          {result.type === 'cycles' && <p className="muted">Báo cáo này lấy số tổng kết hiện tại của từng vụ (không phụ thuộc khoảng ngày chọn, chỉ lọc vụ có hoạt động trong khoảng).</p>}
        </>
      )}
    </>
  );
}
