import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { growthSummary, type GrowthRaw } from '../lib/growthLogic';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { todayLocal, useOnline } from '../lib/hooks';
import { parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { useTable } from '../lib/tables';

const num = (n: number | null, d = 0) => (n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d }));
const vn = (iso: string) => iso.split('-').reverse().join('/');

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

/**
 * Tăng trọng (ADG) và FCR của vụ vật nuôi, thủy sản: tính từ các lần CÂN MẪU và CÁM đã dùng. Nhập ngay ở đây (ô "Ghi lần cân", "Ghi cám đã dùng")
 * hoặc dùng sẵn việc "Cân heo"/"Cho ăn" ở Ghi việc và cám xuất từ Kho; app gộp các nguồn. Số ước tính, cần mạng. Phần tính ở lib/growthLogic.ts.
 */
export function CycleGrowth({ cycleId }: { cycleId: string }) {
  const online = useOnline();
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const events = useTable('countEvents');
  const harvests = useTable('harvests');
  const { cropTypes } = useCatalog();
  const cycle = cycles.find((c) => c.id === cycleId);
  const kind = cropTypes.find((c) => c.id === cycle?.crop_type_id)?.kind;
  const animal = kind === 'livestock' || kind === 'aquatic';
  const [raw, setRaw] = useState<GrowthRaw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const today = todayLocal();
  const [wDate, setWDate] = useState(today);
  const [wHeads, setWHeads] = useState('');
  const [wAvg, setWAvg] = useState('');
  const [wNote, setWNote] = useState('');
  const [fDate, setFDate] = useState(today);
  const [fKg, setFKg] = useState('');
  const [fName, setFName] = useState('');

  useEffect(() => {
    if (!animal || !online || !supabase) return;
    let live = true;
    void supabase.rpc('get_cycle_growth', { p_cycle: cycleId }).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { if (!/does not exist|schema cache|could not find/i.test(e.message)) setError(friendlyError(e)); return; } // CSDL chưa cập nhật thì im lặng
      setRaw(data as GrowthRaw);
    });
    return () => { live = false; };
  }, [cycleId, animal, online, reload]);

  const g = useMemo(() => (raw && cycle ? growthSummary(raw, cycle, events.filter((e) => e.cycle_id === cycleId && !e.voided_at), harvests.filter((h) => h.cycle_id === cycleId), true) : null),
    [raw, cycle, events, harvests, cycleId]);
  if (!animal) return null;

  const canWrite = online && cycle?.owner_org_id === active?.id && hasRole(active?.roles, 'manager', 'worker') && cycle?.status !== 'ended' && cycle?.status !== 'cancelled';
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); setReload((n) => n + 1); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function addWeigh() {
    const avg = parseNumber(wAvg), heads = wHeads.trim() ? Number(wHeads.replace(/[.,\s]/g, '')) : null;
    if (avg === null || Number.isNaN(avg) || avg <= 0) return setError('Cân nặng trung bình mỗi con (kg) phải lớn hơn 0.');
    if (heads !== null && (!Number.isInteger(heads) || heads <= 0)) return setError('Số con cân phải là số nguyên lớn hơn 0.');
    if (wDate > today) return setError('Ngày cân không được ở tương lai.');
    await run(async () => { await rpc('add_cycle_weighing', { p_cycle: cycleId, p_date: wDate, p_heads: heads, p_avg: avg, p_note: wNote || null }); setWAvg(''); setWHeads(''); setWNote(''); });
  }
  async function addFeed() {
    const kg = parseNumber(fKg);
    if (kg === null || Number.isNaN(kg) || kg <= 0) return setError('Lượng cám (kg) phải lớn hơn 0.');
    if (fDate > today) return setError('Ngày cho ăn không được ở tương lai.');
    await run(async () => { await rpc('add_cycle_feed', { p_cycle: cycleId, p_date: fDate, p_kg: kg, p_name: fName || null, p_note: null }); setFKg(''); setFName(''); });
  }
  function voidIt(kindName: 'weighing' | 'feed', id: string) {
    const reason = window.prompt('Lý do hủy (ít nhất 3 ký tự):');
    if (reason === null) return;
    void run(() => rpc('void_cycle_measure', { p_kind: kindName, p_id: id, p_reason: reason }));
  }

  const summary = !g ? (online ? 'Đang tải…' : 'Cần có mạng') : g.adgG === null ? 'cần ít nhất 2 lần cân' : `${num(g.adgG)} g/con/ngày${g.fcr !== null ? ` · FCR ${num(g.fcr, 2)}` : ''}`;
  return (
    <Collapsible title="Tăng trọng và FCR" summary={summary}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {g && (
        <>
          <div className="card slim">
            <div className="row"><span>Tăng trọng mỗi ngày (ADG)</span><strong>{g.adgG !== null ? `${num(g.adgG)} g/con/ngày` : '—'}</strong></div>
            <div className="row"><span>FCR (kg cám / kg tăng)</span><strong>{num(g.fcr, 2)}</strong></div>
            {g.days !== null && <div className="row"><span>Giữa hai lần cân</span><strong>{g.days} ngày{g.heads ? ` · ${num(g.heads)} con` : ''}</strong></div>}
            <div className="row"><span>Cám đã dùng giữa hai lần cân</span><strong>{g.feedBetweenKg !== null ? `${num(g.feedBetweenKg)} kg` : '—'}</strong></div>
            <div className="row"><span>Tổng cám đã dùng cả vụ</span><strong>{g.feedTotalKg !== null ? `${num(g.feedTotalKg)} kg` : '—'}</strong></div>
            {g.feedPerSoldKg !== null && <div className="row"><span>Cám trên mỗi kg xuất bán</span><strong>{num(g.feedPerSoldKg, 2)} kg</strong></div>}
          </div>
          {g.needMore === 'weighings' && <p className="muted">Cần ít nhất 2 lần cân ở các ngày khác nhau. Ghi bằng ô "Ghi lần cân" bên dưới (hoặc Ghi việc → "Cân heo").</p>}
          {g.needMore === 'feed' && <p className="muted">Chưa có cám đã dùng giữa hai lần cân. Ghi bằng ô "Ghi cám đã dùng" bên dưới, hoặc ghi việc "Cho ăn", hoặc xuất cám từ Kho (vật tư nhóm "Thức ăn").</p>}
          {raw?.feed.other_unit && <p className="msg warn">Có cám tính bằng đơn vị không quy ra kg được (bao, thùng…), chưa tính vào. Hãy đặt đơn vị cám là kg.</p>}
          {raw && !raw.feed.can_view && g.feedSource === 'logs' && <p className="muted">Bạn không xem được kho nên dùng cám ghi tay.</p>}
          {g.feedSource === 'logs' && raw?.feed.can_view && <p className="muted">Đang dùng cám ghi tay (ô nhập ở đây hoặc việc "Cho ăn") vì kho chưa có cám nhóm "Thức ăn" cho vụ này.</p>}
          {g.feedSource === 'stock' && (raw?.feed.manual_entries?.length ?? 0) > 0 && <p className="msg warn">Kho đã có cám xuất cho vụ nên số cám nhập ở đây chưa được tính vào FCR (tránh tính hai lần).</p>}
          {g.weighings.length > 0 && (
            <table className="grid">
              <thead><tr><th>Ngày cân</th><th className="num">Số con cân</th><th className="num">Cân TB (kg)</th>{canWrite && <th></th>}</tr></thead>
              <tbody>{g.weighings.map((w, i) => (
                <tr key={i}>
                  <td>{vn(w.date)}</td><td className="num">{num(w.pigs)}</td><td className="num">{num(w.avg_kg, 1)}</td>
                  {canWrite && <td className="act">{w.manual && w.id ? <button className="link" onClick={() => voidIt('weighing', w.id!)}>Hủy</button> : null}</td>}
                </tr>
              ))}</tbody>
            </table>
          )}
          {(raw?.feed.manual_entries ?? []).length > 0 && (
            <table className="grid">
              <thead><tr><th>Ngày</th><th>Cám nhập ở đây</th><th className="num">kg</th>{canWrite && <th></th>}</tr></thead>
              <tbody>{raw!.feed.manual_entries!.map((f) => (
                <tr key={f.id}><td>{vn(f.date)}</td><td>{f.name ?? ''}</td><td className="num">{num(f.kg, 1)}</td>{canWrite && <td className="act"><button className="link" onClick={() => voidIt('feed', f.id)}>Hủy</button></td>}</tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
      {canWrite && (
        <>
          <Collapsible inline title="＋ Ghi lần cân">
            <div className="inline-form">
              <div className="pair">
                <label>Ngày cân<input type="date" value={wDate} max={today} onChange={(e) => setWDate(e.target.value)} /></label>
                <label>Số con cân<input value={wHeads} inputMode="numeric" onChange={(e) => setWHeads(e.target.value)} placeholder="Không bắt buộc" /></label>
              </div>
              <label>Cân nặng trung bình mỗi con (kg)<input value={wAvg} inputMode="decimal" onChange={(e) => setWAvg(e.target.value)} /></label>
              <label>Ghi chú (không bắt buộc)<input value={wNote} maxLength={300} onChange={(e) => setWNote(e.target.value)} /></label>
              <div className="btnrow"><button className="primary" disabled={busy} onClick={() => void addWeigh()}>Lưu lần cân</button></div>
            </div>
          </Collapsible>
          <Collapsible inline title="＋ Ghi cám đã dùng">
            <div className="inline-form">
              <div className="pair">
                <label>Ngày<input type="date" value={fDate} max={today} onChange={(e) => setFDate(e.target.value)} /></label>
                <label>Lượng cám (kg)<input value={fKg} inputMode="decimal" onChange={(e) => setFKg(e.target.value)} /></label>
              </div>
              <label>Loại cám (không bắt buộc)<input value={fName} maxLength={120} onChange={(e) => setFName(e.target.value)} placeholder="Ví dụ: Cám heo vỗ béo" /></label>
              <div className="btnrow"><button className="primary" disabled={busy} onClick={() => void addFeed()}>Lưu</button></div>
              <p className="muted">Ghi tổng lượng cho ăn theo ngày. Nếu cơ sở đã xuất cám từ Kho cho vụ này thì app dùng số từ Kho, không cộng thêm số ghi ở đây.</p>
            </div>
          </Collapsible>
        </>
      )}
      <p className="muted">Số ước tính từ cân mẫu, để theo dõi xu hướng; không thay cho cân xuất chuồng.</p>
    </Collapsible>
  );
}
