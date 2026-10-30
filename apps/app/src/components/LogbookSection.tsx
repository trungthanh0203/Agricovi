import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useCatalog } from '../lib/catalog';
import { cycleCountUnit } from '../lib/countUnit';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { toCsv } from '../lib/logbook/csv';
import { loadLogbookData } from '../lib/logbook/fetch';
import { auditGaps } from '../lib/logbook/gaps';
import { vnDate } from '../lib/logbook/helpers';
import { dataForBook, logbookSetFor, type LogbookData } from '../lib/logbook';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';
import { areaPath } from '../lib/areas';

/**
 * Sổ nhật ký (P5 gọn): dựng các sổ VietGAP từ dữ liệu đã ghi, xem trên màn hình, in A4 ngang, tải file Excel (CSV),
 * và danh sách "còn thiếu gì trước khi nộp". Cần mạng. Không bắt nhập lại: sổ chỉ đọc nhật ký, kho, thu hoạch, sự cố, số lượng.
 */
export function LogbookSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes, workTypes } = useCatalog();
  const mine = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id && c.status !== 'cancelled').sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '')), [cycles, active]);
  const [cycleId, setCycleId] = useState('');
  const cycle = mine.find((c) => c.id === cycleId) ?? mine[0] ?? null;
  const crop = cropTypes.find((t) => t.id === cycle?.crop_type_id);
  const set = logbookSetFor(crop?.kind);
  const [bookId, setBookId] = useState('');
  const book = set.books.find((b) => b.id === bookId) ?? set.books[0]!;
  const today = todayLocal();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const effFrom = from || cycle?.start_date || today.slice(0, 4) + '-01-01';
  const [data, setData] = useState<LogbookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !cycle || !online) return;
    let live = true;
    setLoading(true); setError(null);
    loadLogbookData({
      orgId: active.id, orgName: active.name, cycle, from: effFrom, to, workTypes, canViewStock: canPerm(active.perms, 'inventory', 'view'),
      productName: crop?.name ?? '', productKind: crop?.kind, unit: cycleCountUnit(cycle, cropTypes),
    }).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(friendlyError(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, cycle?.id, effFrom, to, online]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  if (mine.length === 0) return <p className="muted">Chưa có vụ nào. Hãy tạo vụ ở màn Sản xuất trước.</p>;
  if (!canPerm(active.perms, 'summary') && !canPerm(active.perms, 'declare')) return <p className="muted">Bạn chưa có quyền xem sổ nhật ký.</p>;

  const view = data ? dataForBook(book, data) : null;
  const rows = view ? book.build(view) : [];
  const gaps = data ? auditGaps(data, today) : [];
  const fileName = `${book.id}-${(cycle?.code ?? 'so').replace(/[^\w-]+/g, '_')}-${to}.csv`;

  function download() {
    const blob = new Blob([toCsv(book.headers, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: sổ nhật ký cần có mạng để dựng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="no-print">
        <label>Vụ
          <select value={cycle?.id ?? ''} onChange={(e) => { setCycleId(e.target.value); setBookId(''); setData(null); }}>
            {mine.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name ?? cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? 'Vụ'} · {(areaPath(c.area_id, areas) || '')}</option>)}
          </select>
        </label>
        <div className="pair">
          <label>Từ ngày<input type="date" value={effFrom} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>Sổ
          <select value={book.id} onChange={(e) => setBookId(e.target.value)}>
            {set.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>

        {data && (
          <Collapsible title="Còn thiếu gì trước khi nộp" summary={gaps.length === 0 ? 'đủ' : `${gaps.filter((g) => g.level === 'warn').length} cần bổ sung · ${gaps.filter((g) => g.level === 'info').length} nhắc thêm`} warn={gaps.some((g) => g.level === 'warn')}>
            {gaps.length === 0 && <p className="msg ok">Chưa phát hiện thiếu sót nào trong dữ liệu đã ghi.</p>}
            {gaps.map((g, i) => <p key={i} className={g.level === 'warn' ? 'msg warn' : 'muted'}>{g.level === 'warn' ? '⚠ ' : '• '}{g.text}</p>)}
            <p className="muted">Đây là kiểm tra tự động trên dữ liệu đã ghi, không thay thế việc đối chiếu với bảng kiểm của đơn vị chứng nhận.</p>
          </Collapsible>
        )}

        <div className="btnrow">
          <button className="primary" disabled={!data || rows.length === 0} onClick={() => window.print()}>In sổ (A4 ngang)</button>
          <button className="secondary" disabled={!data || rows.length === 0} onClick={download}>Tải file Excel</button>
        </div>
        {loading && <p className="muted">Đang dựng sổ…</p>}
        {data && !data.usesAvailable && <p className="msg warn">Bạn không có quyền xem kho nên cột tên thuốc, hoạt chất, số lô để trống.</p>}
      </div>

      {data && view && (
        <div id="print-root" className="logbook">
          <h2>{book.title}</h2>
          <p><strong>{data.orgName}</strong>{data.areaName ? ` · ${data.areaName}` : ''}{data.areaLocation ? ` · ${data.areaLocation}` : ''}</p>
          {cycle && <p>Vụ / lô: <strong>{cycle.code ?? cycle.name ?? '—'}</strong>{data.productName ? ` · ${data.productName}` : ''}{cycle.variety_name ? ` · giống ${cycle.variety_name}` : ''}{cycle.planted_area_m2 ? ` · ${cycle.planted_area_m2.toLocaleString('vi-VN')} m²` : ''}{cycle.supervisor_name ? ` · phụ trách: ${cycle.supervisor_name}` : ''}</p>}
          <p>Từ {vnDate(effFrom)} đến {vnDate(to)}</p>
          {book.note && <p className="muted">{book.note}</p>}
          <div className="logbook-scroll">
            <table className="grid">
              <thead><tr><th>STT</th>{book.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={book.headers.length + 1} className="muted">Chưa có bản ghi nào trong khoảng ngày này.</td></tr>}
                {rows.map((r, i) => <tr key={i}><td>{i + 1}</td>{r.map((c, j) => <td key={j} className={c.startsWith('CẢNH BÁO') ? 'bad' : ''}>{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div className="logbook-sign"><span>Người ghi chép</span><span>Cán bộ kỹ thuật / thú y</span><span>Chủ cơ sở</span></div>
        </div>
      )}
    </>
  );
}
