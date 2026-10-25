import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { growthSummary, type GrowthRaw } from '../lib/growthLogic';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useOnline } from '../lib/hooks';
import { useTable } from '../lib/tables';

const num = (n: number | null, d = 0) => (n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d }));
const vn = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Tăng trọng (ADG) và FCR của lứa nuôi (P3 gọn): tính từ việc "Cân heo" và cám đã xuất cho vụ. Chỉ hiện với sản phẩm vật nuôi.
 * Số ước tính từ cân mẫu, cần mạng để lấy dữ liệu. Phần tính nằm ở lib/growthLogic.ts.
 */
export function CycleGrowth({ cycleId }: { cycleId: string }) {
  const online = useOnline();
  const cycles = useTable('cycles');
  const events = useTable('countEvents');
  const harvests = useTable('harvests');
  const { cropTypes } = useCatalog();
  const cycle = cycles.find((c) => c.id === cycleId);
  const livestock = cropTypes.find((c) => c.id === cycle?.crop_type_id)?.kind === 'livestock';
  const [raw, setRaw] = useState<GrowthRaw | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!livestock || !online || !supabase) return;
    let live = true;
    void supabase.rpc('get_cycle_growth', { p_cycle: cycleId }).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { if (!/does not exist|schema cache|could not find/i.test(e.message)) setError(friendlyError(e)); return; } // CSDL chưa cập nhật thì im lặng
      setRaw(data as GrowthRaw);
    });
    return () => { live = false; };
  }, [cycleId, livestock, online]);

  const g = useMemo(() => (raw && cycle ? growthSummary(raw, cycle, events.filter((e) => e.cycle_id === cycleId && !e.voided_at), harvests.filter((h) => h.cycle_id === cycleId), true) : null),
    [raw, cycle, events, harvests, cycleId]);
  if (!livestock) return null;

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
          {g.needMore === 'weighings' && <p className="muted">Cần ít nhất 2 lần cân ở các ngày khác nhau. Ghi việc → "Cân heo" (áp dụng gói "Heo thịt" ở Danh mục việc nếu chưa có).</p>}
          {g.needMore === 'feed' && <p className="muted">Chưa có cám đã dùng giữa hai lần cân. Chọn cám ở ô "Vật tư đã dùng" khi ghi việc "Cho ăn" (vật tư nhóm "Thức ăn"), hoặc nhập "Lượng cho ăn".</p>}
          {raw?.feed.other_unit && <p className="msg warn">Có cám tính bằng đơn vị không quy ra kg được (bao, thùng…), chưa tính vào. Hãy đặt đơn vị cám là kg.</p>}
          {raw && !raw.feed.can_view && g.feedSource === 'logs' && <p className="muted">Bạn không xem được kho nên dùng lượng cho ăn ghi tay.</p>}
          {g.feedSource === 'logs' && raw?.feed.can_view && <p className="muted">Đang dùng "Lượng cho ăn" ghi tay vì kho chưa có cám nhóm "Thức ăn" cho vụ này.</p>}
          {g.weighings.length > 0 && (
            <table className="grid">
              <thead><tr><th>Ngày cân</th><th className="num">Số con cân</th><th className="num">Cân TB (kg)</th></tr></thead>
              <tbody>{g.weighings.map((w, i) => <tr key={i}><td>{vn(w.date)}</td><td className="num">{num(w.pigs)}</td><td className="num">{num(w.avg_kg, 1)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="muted">Số ước tính từ cân mẫu, để theo dõi xu hướng; không thay cho cân xuất chuồng.</p>
        </>
      )}
    </Collapsible>
  );
}
