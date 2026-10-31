import { useState } from 'react';
import { Collapsible } from './Collapsible';
import { clearSyncPerf, pageLoadMs, perfReport, readSyncPerf, type SyncPerf } from '../lib/perf';
import { syncDown } from '../lib/production';

/**
 * Đo hiệu năng đồng bộ (Đợt 0, docs/PLAN_HIEU_NANG.md), chỉ chủ/quản lý thấy. Cho biết mỗi lần đồng bộ mất bao lâu, tải bao nhiêu dữ liệu và trên máy đang giữ bao nhiêu dòng.
 * Bấm "Chép kết quả" rồi dán gửi cho người phát triển.
 */
export function PerfPanel() {
  const [list, setList] = useState<SyncPerf[]>(readSyncPerf);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const last = list[0];

  async function measure() {
    if (busy || !navigator.onLine) return setNote('Cần có mạng để đo.');
    setBusy(true);
    setNote('');
    try { await syncDown(); } catch { /* lần đo vẫn được ghi kèm dấu lỗi */ }
    setList(readSyncPerf());
    setBusy(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(perfReport()); setNote('Đã chép. Hãy dán vào tin nhắn gửi cho người phát triển.'); }
    catch { setNote('Không chép được, hãy chụp màn hình bảng này gửi đi.'); }
  }

  return (
    <Collapsible title="Đo hiệu năng (cho quản trị)" summary={last ? `đồng bộ gần nhất ${last.ms} ms · ${last.kb} KB` : 'chưa có số đo'}>
      <p className="muted">Mỗi lần mở app hoặc có mạng lại, app đồng bộ dữ liệu và ghi lại số đo ở đây. Muốn đo ngay: bấm "Đồng bộ lại và đo", chờ xong rồi bấm "Chép kết quả".</p>
      <p>Tải trang lần mở này: <strong>{pageLoadMs() ?? '—'} ms</strong></p>
      {list.length > 0 && (
        <div className="tablewrap">
          <table className="grid">
            <thead><tr><th>Giờ</th><th className="num">Thời gian</th><th className="num">Dữ liệu tải</th><th className="num">Yêu cầu</th><th></th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.at}>
                  <td>{new Date(s.at).toLocaleTimeString('vi-VN')}{s.first ? ' (mở app)' : ''}</td>
                  <td className="num">{s.ms} ms</td>
                  <td className="num">{s.kb} KB</td>
                  <td className="num">{s.requests}</td>
                  <td>{s.ok ? '' : <span className="pill err" title={s.err}>Lỗi</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {last?.top && last.top.length > 0 && (
        <>
          <p className="muted">Các yêu cầu nặng nhất của lần đo gần nhất:</p>
          <div className="tablewrap">
            <table className="grid">
              <thead><tr><th>Bảng / hàm</th><th className="num">Lần</th><th className="num">KB</th><th className="num">ms</th></tr></thead>
              <tbody>{last.top.slice(0, 8).map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{t.n}</td><td className="num">{t.kb}</td><td className="num">{t.ms}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {list.filter((s) => !s.ok && s.err).slice(0, 2).map((s) => <p key={s.at} className="msg error" role="alert">Lỗi lúc {new Date(s.at).toLocaleTimeString('vi-VN')}: {s.err}</p>)}
      {last && <p className="muted">Số dòng đang giữ trên máy: {Object.entries(last.rows).filter(([, v]) => v >= 0).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => void measure()}>{busy ? 'Đang đo…' : 'Đồng bộ lại và đo'}</button>
        <button type="button" className="secondary" disabled={list.length === 0} onClick={() => void copy()}>Chép kết quả</button>
        <button type="button" className="secondary" disabled={list.length === 0} onClick={() => { clearSyncPerf(); setList([]); }}>Xóa số đo</button>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
    </Collapsible>
  );
}
