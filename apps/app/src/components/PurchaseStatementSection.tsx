import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import {
  deleteSeller, fetchSellerStatus, fetchStatement, saveSeller, statementCells, statementCsv, statementGaps, statementTotals, STATEMENT_HEADERS, vnDate,
  type SellerStatus, type Statement,
} from '../lib/purchaseStatement';
import { downloadCsv } from '../lib/summary';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}`;

/** Kỳ nhanh: tháng này, tháng trước, quý này, năm nay (theo ngày hôm nay) */
function quickRange(kind: 'month' | 'prev' | 'quarter' | 'year', today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (kind === 'prev') { const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${last(py, pm)}` }; }
  if (kind === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad(qm)}-01`, to: today }; }
  return { from: `${y}-01-01`, to: today };
}

/**
 * Bảng kê thu mua nông sản trực tiếp từ người sản xuất (mục 13 lát 1; HTX). Dựng từ các phiếu thu mua đã lập, không bắt nhập lại; chỉ cần nhập THÔNG TIN NGƯỜI BÁN
 * (họ tên, CCCD, địa chỉ, điện thoại) một lần cho mỗi hộ, kèm xác nhận người bán đã đồng ý. In A4 ngang / lưu PDF hoặc tải Excel. Mẫu tham khảo, cần kế toán đối chiếu mẫu hiện hành.
 */
export function PurchaseStatementSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id;
  const today = todayLocal();
  const [from, setFrom] = useState(() => quickRange('prev', today).from);
  const [to, setTo] = useState(() => quickRange('prev', today).to);
  const [sellers, setSellers] = useState<SellerStatus[] | null>(null);
  const [st, setSt] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', idNumber: '', address: '', phone: '', consent: false, consentNote: '' });

  const loadSellers = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setSellers(await fetchSellerStatus(orgId)); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void loadSellers(); }, [loadSellers]);

  const gaps = useMemo(() => (st ? statementGaps(st.rows) : []), [st]);
  const totals = useMemo(() => (st ? statementTotals(st.rows) : null), [st]);

  if (!active || !orgId) return null;
  if (!canPerm(active.perms, 'coop', 'edit')) return <p className="muted">Bảng kê thu mua có thông tin cá nhân người bán nên chỉ người có quyền quản lý HTX mới lập được.</p>;

  async function build() {
    if (to < from) return setError('Ngày kết thúc không được trước ngày bắt đầu.');
    setBusy(true); setError(null); setInfo(null);
    try { setSt(await fetchStatement(orgId!, from, to)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  function startEdit(s: SellerStatus) {
    setEditing(s.household_org_id); setError(null); setInfo(null);
    setForm({ fullName: s.full_name ?? '', idNumber: '', address: s.address ?? '', phone: s.phone ?? '', consent: false, consentNote: '' });
  }
  async function saveForm(householdId: string) {
    if (!form.consent) return setError('Hãy tích ô xác nhận người bán đã đồng ý cho HTX lưu thông tin.');
    setBusy(true); setError(null);
    try { await saveSeller(orgId!, householdId, form); setEditing(null); setInfo('Đã lưu thông tin người bán.'); await loadSellers(); if (st) setSt(null); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function removeSeller(s: SellerStatus) {
    if (!window.confirm(`Xóa thông tin người bán của ${s.household_name}? Bảng kê sau này sẽ thiếu thông tin cho hộ này.`)) return;
    setBusy(true); setError(null);
    try { await deleteSeller(orgId!, s.household_org_id); setEditing(null); setInfo('Đã xóa thông tin người bán.'); await loadSellers(); if (st) setSt(null); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const done = (sellers ?? []).filter((s) => s.has_profile).length;
  const warns = gaps.filter((g) => g.level === 'warn').length;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: bảng kê thu mua cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
      <div className="no-print">
        <p className="muted">Lập bảng kê từ các phiếu thu mua đã có (Sản xuất → Thu mua từ hộ). Chỉ cần nhập thông tin người bán một lần cho mỗi hộ. Đây là mẫu tham khảo: hãy đối chiếu với mẫu hiện hành của cơ quan thuế và hỏi kế toán trước khi nộp.</p>

        <Collapsible title="Thông tin người bán" summary={sellers ? `${done}/${sellers.length} hộ đã có` : 'đang tải…'} warn={sellers !== null && done < sellers.length} defaultOpen={sellers !== null && done < sellers.length}>
          <p className="muted">Là dữ liệu cá nhân: chỉ nhập khi người bán đồng ý. Số CCCD chỉ hiện 4 số cuối ở đây; số đầy đủ chỉ có trên bảng kê khi người có quyền quản lý HTX dựng. Mỗi lần lưu hoặc dựng bảng kê đều được ghi nhật ký kiểm toán.</p>
          {(sellers ?? []).map((s) => (
            <div className="card slim" key={s.household_org_id}>
              <div className="row">
                <strong className="grow">{s.household_name}</strong>
                <span className={s.has_profile ? 'pill ok' : 'pill warn'}>{s.has_profile ? 'Đã có thông tin' : 'Chưa có'}</span>
              </div>
              {s.has_profile && <p className="muted">{s.full_name} · CCCD {s.id_masked} · {s.address}{s.phone ? ` · ${s.phone}` : ''}</p>}
              {editing !== s.household_org_id && <div className="btnrow"><button type="button" className="secondary" disabled={busy || !online} onClick={() => startEdit(s)}>{s.has_profile ? 'Sửa' : '＋ Nhập thông tin'}</button></div>}
              {editing === s.household_org_id && (
                <div className="inline-form">
                  <label>Họ tên người bán<input value={form.fullName} maxLength={120} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
                  <div className="pair">
                    <label>Số CCCD (12 số) hoặc CMND (9 số)<input inputMode="numeric" value={form.idNumber} maxLength={12} onChange={(e) => setForm({ ...form, idNumber: e.target.value.replace(/\D/g, '') })} /></label>
                    <label>Điện thoại (không bắt buộc)<input inputMode="tel" value={form.phone} maxLength={15} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  </div>
                  <label>Địa chỉ<input value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ví dụ: Ấp 3, xã Tân Phú, tỉnh Đồng Nai" /></label>
                  <label className="check"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /> Người bán đã đồng ý cho HTX lưu họ tên, số giấy tờ và địa chỉ để lập bảng kê thu mua</label>
                  <label>Ghi chú về việc đồng ý (không bắt buộc)<input value={form.consentNote} maxLength={300} onChange={(e) => setForm({ ...form, consentNote: e.target.value })} placeholder="Ví dụ: đồng ý trực tiếp ngày 10/11/2026" /></label>
                  <div className="btnrow">
                    <button type="button" className="primary" disabled={busy || !online} onClick={() => void saveForm(s.household_org_id)}>Lưu</button>
                    <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy</button>
                    {s.has_profile && <button type="button" className="link" disabled={busy || !online} onClick={() => void removeSeller(s)}>Xóa thông tin (người bán rút lại đồng ý)</button>}
                  </div>
                  {s.has_profile && <p className="muted">Khi sửa, hãy nhập lại số CCCD vì app không hiện số đầy đủ.</p>}
                </div>
              )}
            </div>
          ))}
          {sellers !== null && sellers.length === 0 && <p className="muted">HTX chưa có hộ thành viên nào.</p>}
        </Collapsible>

        <div className="chips" role="group" aria-label="Kỳ nhanh">
          {([['prev', 'Tháng trước'], ['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay']] as const).map(([k, label]) => (
            <button key={k} type="button" className="chip" onClick={() => { const r = quickRange(k, today); setFrom(r.from); setTo(r.to); setSt(null); }}>{label}</button>
          ))}
        </div>
        <div className="pair">
          <label>Từ ngày<input type="date" value={from} max={today} onChange={(e) => { setFrom(e.target.value); setSt(null); }} /></label>
          <label>Đến ngày<input type="date" value={to} max={today} onChange={(e) => { setTo(e.target.value); setSt(null); }} /></label>
        </div>
        <div className="btnrow"><button type="button" className="primary" disabled={busy || !online} onClick={() => void build()}>{busy ? 'Đang dựng…' : 'Dựng bảng kê'}</button></div>

        {st && (
          <>
            <Collapsible title="Còn thiếu gì trước khi nộp" summary={gaps.length === 0 ? 'đủ' : `${warns} cần bổ sung`} warn={warns > 0} defaultOpen={warns > 0}>
              {gaps.length === 0 && <p className="msg ok">Chưa phát hiện thiếu sót nào.</p>}
              {gaps.map((g, i) => <p key={i} className={g.level === 'warn' ? 'msg warn' : 'muted'}>{g.level === 'warn' ? '⚠ ' : '• '}{g.text}</p>)}
              <p className="muted">Chỉ là nhắc, không chặn việc in hay tải.</p>
            </Collapsible>
            <div className="btnrow">
              <button type="button" className="primary" disabled={st.rows.length === 0} onClick={() => window.print()}>In / Lưu PDF (A4 ngang)</button>
              <button type="button" className="secondary" disabled={st.rows.length === 0} onClick={() => downloadCsv(`bang-ke-thu-mua-${st.from}_${st.to}.csv`, statementCsv(st, active.name))}>Tải Excel</button>
            </div>
          </>
        )}
      </div>

      {st && totals && (
        <div id="print-root" className="statement">
          <h2>BẢNG KÊ THU MUA NÔNG SẢN TRỰC TIẾP TỪ NGƯỜI SẢN XUẤT</h2>
          <p className="muted">Mẫu tham khảo, đối chiếu với mẫu hiện hành của cơ quan thuế trước khi nộp.</p>
          <p><strong>Đơn vị thu mua:</strong> {active.name} · Mã số thuế: ……………………</p>
          <p><strong>Kỳ:</strong> từ {vnDate(st.from)} đến {vnDate(st.to)}</p>
          <div className="logbook-scroll">
            <table className="grid">
              <thead><tr>{STATEMENT_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {st.rows.length === 0 && <tr><td colSpan={STATEMENT_HEADERS.length} className="muted">Không có phiếu thu mua trong kỳ.</td></tr>}
                {st.rows.map((r, i) => (
                  <tr key={r.receipt_id}>{statementCells(r, i + 1).map((c, j) => <td key={j} className={!r.seller && (j === 3) ? 'bad' : j >= 9 ? 'num' : ''}>{j >= 10 && c ? money(Number(c)) : c}</td>)}</tr>
                ))}
                {st.rows.length > 0 && <tr><td colSpan={9}><strong>Cộng ({totals.receipts} phiếu)</strong></td><td className="num"><strong>{totals.quantity.toLocaleString('vi-VN')}</strong></td><td></td><td className="num"><strong>{money(totals.amount)}</strong></td><td className="num"><strong>{money(totals.cash)}</strong></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="logbook-sign"><span>Người lập bảng kê</span><span>Kế toán</span><span>Chủ nhiệm / Giám đốc HTX</span></div>
        </div>
      )}
    </>
  );
}
