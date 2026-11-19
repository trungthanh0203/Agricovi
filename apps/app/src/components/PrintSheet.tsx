import { useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fmtDate } from '../lib/dates';
import { qrSvg } from '../lib/qr';
import { DOW, groupByTeam, hhmm, listDays, type SheetData, type SheetPrefs } from '../lib/timesheets';

/**
 * Trang in bảng chấm công (D199): A4 ngang, một cột mỗi ngày, ô đủ cao để viết tay, khung "Cách ghi" in ngay trên bảng.
 * Hiện toàn màn hình; khi in chỉ in trang này (CSS `body.ts-printing`). `code` rỗng = bản xem trước chưa lưu.
 */
export function PrintSheet({ orgName, data, code, prefs, onPrefs, toolbar }: {
  orgName: string; data: SheetData; code: string | null; prefs: SheetPrefs; onPrefs: (p: SheetPrefs) => void; toolbar: ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add('ts-printing');
    return () => document.body.classList.remove('ts-printing');
  }, []);

  const days = useMemo(() => listDays(data.from_date, data.to_date), [data.from_date, data.to_date]);
  const months = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = [];
    for (const d of days) {
      const k = `${d.year}-${d.month}`;
      const last = out[out.length - 1];
      if (last && last.key === k) last.n += 1; else out.push({ key: k, label: `Tháng ${d.month}/${d.year}`, n: 1 });
    }
    return out;
  }, [days]);
  const groups = useMemo(() => groupByTeam(data.workers), [data.workers]);
  const qr = useMemo(() => (code ? qrSvg(`AGRICO-BC:${code}`, 3).svg : null), [code]);
  const dense = days.length > 16;
  const hours = data.mode === 'hours';
  const teamNames = groups.map((g) => g.team).filter(Boolean) as string[];
  let stt = 0;

  const head = (
    <thead>
      <tr>
        <th rowSpan={2} className="c-stt">STT</th>
        <th rowSpan={2} className="c-name">Họ và tên</th>
        {months.map((m) => <th key={m.key} colSpan={m.n} className="c-month">{m.label}</th>)}
        <th rowSpan={2} className="c-total">{hours ? 'Tổng giờ' : 'Tổng ngày công'}</th>
        {prefs.noteColumn && <th rowSpan={2} className="c-note">Ghi chú</th>}
      </tr>
      <tr>
        {days.map((d) => (
          <th key={d.date} className={prefs.shadeSunday && d.dow === 0 ? 'c-day sun' : 'c-day'}><b>{d.day}</b><small>{DOW[d.dow]}</small></th>
        ))}
      </tr>
    </thead>
  );
  const rows = (items: typeof data.workers, showTeam: boolean) => items.map((w) => {
    stt += 1;
    return (
      <tr key={w.worker_id}>
        <td className="c-stt">{stt}</td>
        <td className="c-name">{w.name}{showTeam && w.team ? <small> · {w.team}</small> : null}</td>
        {days.map((d) => <td key={d.date} className={prefs.shadeSunday && d.dow === 0 ? 'sun' : undefined} />)}
        <td />
        {prefs.noteColumn && <td />}
      </tr>
    );
  });
  const colSpan = 3 + days.length + (prefs.noteColumn ? 1 : 0);

  const sheet = (
    <div id="print-root" className="ts-print-root">
      <div className="ts-toolbar no-print">
        <div className="ts-opts">
          <label className="check"><input type="checkbox" checked={prefs.perTeamPage} onChange={(e) => onPrefs({ ...prefs, perTeamPage: e.target.checked })} /> Mỗi tổ một trang</label>
          <label className="check"><input type="checkbox" checked={prefs.shadeSunday} onChange={(e) => onPrefs({ ...prefs, shadeSunday: e.target.checked })} /> Tô nền chủ nhật</label>
          <label className="check"><input type="checkbox" checked={prefs.noteColumn} onChange={(e) => onPrefs({ ...prefs, noteColumn: e.target.checked })} /> Cột ghi chú</label>
        </div>
        <div className="ts-actions">{toolbar}</div>
      </div>

      <div className={dense ? 'ts-page ts-dense' : 'ts-page'}>
        <header className="ts-head">
          <div>
            <p className="ts-org">{orgName}</p>
            <h1>BẢNG CHẤM CÔNG</h1>
            <p>Từ ngày <strong>{fmtDate(data.from_date)}</strong> đến ngày <strong>{fmtDate(data.to_date)}</strong> ({days.length} ngày){teamNames.length > 0 && teamNames.length <= 3 ? <> · Tổ: {teamNames.join(', ')}</> : null}</p>
            {data.note && <p>{data.note}</p>}
          </div>
          <div className="ts-code">
            {qr ? <div className="ts-qr" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
            <p>Mã bảng: <strong>{code ?? '(cấp khi lưu)'}</strong></p>
          </div>
        </header>

        {prefs.perTeamPage ? groups.map((g, i) => (
          <section key={g.team ?? 'none'} className={i < groups.length - 1 ? 'ts-section brk' : 'ts-section'}>
            <p className="ts-team">{g.team ? `Tổ: ${g.team}` : 'Chưa vào tổ'}</p>
            <table className="ts-table">{head}<tbody>{rows(g.items, false)}</tbody></table>
          </section>
        )) : (
          <table className="ts-table">
            {head}
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.team ?? 'none'} label={g.team ? `Tổ: ${g.team}` : groups.length > 1 ? 'Chưa vào tổ' : null} colSpan={colSpan}>{rows(g.items, false)}</GroupRows>
              ))}
            </tbody>
          </table>
        )}

        <section className="ts-guide">
          <h2>Cách ghi (đọc kỹ trước khi ghi)</h2>
          <p>Ca làm mặc định: <strong>{hhmm(data.shift_start)} – {hhmm(data.shift_end)}</strong>, nghỉ giữa ca <strong>{data.break_minutes} phút</strong>.</p>
          <ul>
            {hours ? (
              <li><b>Ghi số giờ</b> làm thực tế cả ngày vào ô, ví dụ <b>8</b> hoặc <b>6,5</b> (kể cả giờ làm thêm).</li>
            ) : (
              <>
                <li><b>✓</b> đi làm đủ ca &nbsp; <b>½</b> làm nửa ca</li>
                <li>Làm khác ca mặc định: ghi <b>số giờ</b> làm cả ngày (ví dụ <b>6,5</b>) thay cho ✓.</li>
              </>
            )}
            <li><b>P</b> nghỉ phép năm &nbsp; <b>Ô</b> nghỉ ốm &nbsp; <b>V</b> nghỉ việc gia đình &nbsp; <b>K</b> nghỉ không lương hoặc không báo trước</li>
            <li><b>–</b> (gạch ngang) = không làm việc ngày đó (nghỉ tuần, không có việc). <b>Ô để trống = chưa ghi.</b></li>
            <li>Ghi bằng bút mực, chữ số rõ ràng, mỗi ô một ký hiệu. Ghi sai thì gạch một đường rồi viết lại bên cạnh, không viết đè.</li>
            <li>Hết kỳ: cộng vào cột Tổng và nộp bảng cho chủ hoặc quản lý.</li>
          </ul>
        </section>

        <footer className="ts-sign">
          <div><p>Người lập bảng</p><small>(ký, ghi rõ họ tên)</small></div>
          <div><p>Chủ / Quản lý duyệt</p><small>(ký, ghi rõ họ tên)</small></div>
          <div><p>Ngày nhập vào hệ thống</p><small>…… / …… / ……………</small></div>
        </footer>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}

/** Một nhóm hàng (một tổ) trong bảng liền mạch: dòng tiêu đề tổ rồi các hàng người */
function GroupRows({ label, colSpan, children }: { label: string | null; colSpan: number; children: ReactNode }) {
  return (
    <>
      {label && <tr className="ts-grp"><td colSpan={colSpan}>{label}</td></tr>}
      {children}
    </>
  );
}
