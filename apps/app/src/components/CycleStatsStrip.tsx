import { Collapsible } from './Collapsible';
import { ProportionBar } from './charts';
import { shortMoney } from './HomeStats';
import { AREA_UNITS, fmtArea, getAreaUnit } from '../lib/areaUnits';
import { budgetTone, pctOf, statWarnings, type CycleStat } from '../lib/cycleStatsLogic';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const kg = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`;

function Tile({ label, value, tone, title }: { label: string; value: string; tone?: 'ok' | 'bad' | 'info' | 'neutral'; title?: string }) {
  return <div className={`mini-kpi ${tone ?? 'neutral'}`} title={title}><span>{label}</span><strong>{value}</strong></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="stat-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Plan({ label, pct, text }: { label: string; pct: number; text: string }) {
  const tone = label.startsWith('Ngân sách') ? budgetTone(pct) : 'ok';
  return (
    <div className="plan-line">
      <span>{label}: <strong>{pct}%</strong> <span className="muted">({text})</span></span>
      <div className="progress" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i style={{ width: `${Math.min(100, pct)}%`, background: `var(--c-${tone})` }} />
      </div>
    </div>
  );
}

/**
 * Dòng thống kê của một vụ trong danh sách mùa vụ (D93): 4 số chính (Chi phí · Thu hoạch · Doanh thu · Lãi/lỗ), thanh so với kế hoạch
 * (ngân sách, sản lượng), và "Xem thêm" chia nhóm Chi phí / Sản lượng / Hiệu quả / Tiến độ và công / Tiền chưa thu. Chỉ hiện số người xem có quyền.
 */
export function CycleStatsStrip({ s, countUnit = 'cây' }: { s: CycleStat; countUnit?: string }) {
  const budgetPct = pctOf(s.cost_total, s.budget_amount);
  const yieldPct = pctOf(s.harvest_net, s.target_yield_kg);
  const warns = statWarnings(s);
  // năng suất theo diện tích: đơn vị người dùng chọn (m² thì tính trên 1.000 m²)
  const unitId = getAreaUnit();
  const unit = AREA_UNITS.find((u) => u.id === unitId) ?? AREA_UNITS[0]!;
  const f = unit.id === 'm2' ? 1 : unit.m2 / 1000;
  const perLabel = unit.id === 'm2' ? '1.000 m²' : unit.short;
  const lossPct = s.harvest_gross && s.harvest_gross > 0 && s.harvest_loss !== null ? Math.round((s.harvest_loss / s.harvest_gross) * 1000) / 10 : null;
  return (
    <div className="cycle-stats">
      <div className="mini-kpis">
        {s.cost_total !== null && <Tile label="Chi phí" value={shortMoney(s.cost_total)} tone="bad" title={money(s.cost_total)} />}
        {s.harvest_net !== null && <Tile label="Thu hoạch" value={kg(s.harvest_net)} tone="info" />}
        {s.revenue !== null && <Tile label="Doanh thu" value={shortMoney(s.revenue)} tone="ok" title={money(s.revenue)} />}
        {s.profit !== null && <Tile label={s.profit >= 0 ? 'Lãi tạm tính' : 'Lỗ tạm tính'} value={shortMoney(Math.abs(s.profit))} tone={s.profit >= 0 ? 'ok' : 'bad'} title={money(s.profit)} />}
      </div>
      {(s.open_incidents ?? 0) > 0 && <p className="yield-line"><span className="pill warn">Sự cố</span> {s.open_incidents} đang mở{(s.overdue_actions ?? 0) > 0 ? `, ${s.overdue_actions} việc khắc phục quá hạn` : ''}</p>}
      {s.yield_per_1000m2 !== null && <p className="muted yield-line">Năng suất: <strong>{kg(s.yield_per_1000m2 * f)}/{perLabel}</strong>{s.area_m2 !== null ? ` · diện tích ${fmtArea(s.area_m2, unitId)}` : ''}</p>}
      {budgetPct !== null && s.budget_amount !== null && s.cost_total !== null && <Plan label="Ngân sách đã dùng" pct={budgetPct} text={`${shortMoney(s.cost_total)} / ${shortMoney(s.budget_amount)}`} />}
      {yieldPct !== null && s.target_yield_kg !== null && s.harvest_net !== null && <Plan label="Sản lượng so với dự kiến" pct={yieldPct} text={`${kg(s.harvest_net)} / ${kg(s.target_yield_kg)}`} />}
      <Collapsible inline title="Xem thêm số liệu" summary={warns.length > 0 ? `${warns.length} lưu ý` : undefined} warn={warns.length > 0}>
        {s.cost_total !== null && s.cost_material !== null && s.cost_labor !== null && s.cost_other !== null && (
          <>
            <h3 className="sub">Chi phí</h3>
            <ProportionBar format={money} ariaLabel="Cơ cấu chi phí của vụ"
              segments={[{ label: 'Vật tư đã dùng', value: s.cost_material, tone: 'info' }, { label: 'Tiền công', value: s.cost_labor, tone: 'warn' }, { label: 'Chi khác', value: s.cost_other, tone: 'other' }]} />
            <Row label="Tổng chi phí" value={money(s.cost_total)} />
          </>
        )}
        {(s.harvest_net !== null || s.sold !== null) && (
          <>
            <h3 className="sub">Sản lượng</h3>
            {s.harvest_gross !== null && <Row label="Thu hoạch gộp" value={kg(s.harvest_gross)} />}
            {s.harvest_loss !== null && <Row label="Hao hụt" value={`${kg(s.harvest_loss)}${lossPct !== null ? ` (${lossPct}%)` : ''}`} />}
            {s.harvest_net !== null && <Row label="Thu hoạch sau hao hụt" value={kg(s.harvest_net)} />}
            {s.sold !== null && <Row label="Đã bán" value={kg(s.sold)} />}
            {s.unsold !== null && <Row label="Còn tồn chưa bán" value={kg(Math.max(0, s.unsold))} />}
            {s.avg_price !== null && <Row label="Giá bán trung bình" value={`${money(s.avg_price)}/kg`} />}
          </>
        )}
        {(s.cost_per_kg !== null || s.profit_per_kg !== null) && (
          <>
            <h3 className="sub">Hiệu quả</h3>
            {s.cost_per_kg !== null && <Row label="Giá thành mỗi kg" value={`${money(s.cost_per_kg)}/kg`} />}
            {s.profit_per_kg !== null && <Row label={s.profit_per_kg >= 0 ? 'Lãi mỗi kg' : 'Lỗ mỗi kg'} value={`${money(Math.abs(s.profit_per_kg))}/kg`} />}
          </>
        )}
        {s.area_m2 !== null && (
          <>
            <h3 className="sub">Diện tích và năng suất</h3>
            <Row label="Diện tích trồng" value={fmtArea(s.area_m2, unitId)} />
            {s.plant_count !== null && <Row label={`Số ${countUnit}`} value={`${s.plant_count.toLocaleString('vi-VN')}${s.density_per_1000m2 !== null ? ` (${s.density_per_1000m2.toLocaleString('vi-VN')} ${countUnit}/1.000 m²)` : ''}`} />}
            {s.variety && <Row label="Giống" value={s.variety} />}
            {s.yield_per_1000m2 !== null && <Row label={`Năng suất / ${perLabel}`} value={kg(s.yield_per_1000m2 * f)} />}
            {s.kg_per_plant !== null && <Row label="Thu hoạch mỗi cây" value={kg(s.kg_per_plant)} />}
            {s.cost_per_1000m2 !== null && <Row label={`Chi phí / ${perLabel}`} value={money(s.cost_per_1000m2 * f)} />}
            {s.revenue_per_1000m2 !== null && <Row label={`Doanh thu / ${perLabel}`} value={money(s.revenue_per_1000m2 * f)} />}
            {s.profit_per_1000m2 !== null && <Row label={s.profit_per_1000m2 >= 0 ? `Lãi / ${perLabel}` : `Lỗ / ${perLabel}`} value={money(Math.abs(s.profit_per_1000m2 * f))} />}
          </>
        )}
        {s.labor_hours !== null && (
          <>
            <h3 className="sub">Tiến độ và công</h3>
            {s.days_elapsed !== null && s.days_planned !== null && <Row label="Số ngày đã chạy" value={`${s.days_elapsed}/${s.days_planned} ngày`} />}
            {s.delay_days !== null && s.delay_days > 0 && <Row label="Đang trễ tiến độ" value={`${s.delay_days} ngày`} />}
            <Row label="Giờ công" value={`${s.labor_hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`} />
            {s.workers !== null && <Row label="Số người đã làm" value={String(s.workers)} />}
            {s.logs !== null && <Row label="Số nhật ký việc" value={String(s.logs)} />}
          </>
        )}
        {s.receivable !== null && s.receivable > 0 && (<><h3 className="sub">Tiền chưa thu</h3><Row label="Khách còn nợ của vụ này" value={money(s.receivable)} /></>)}
        {warns.length > 0 && <div className="msg warn" role="status">{warns.map((w) => <p key={w}>{w}</p>)}</div>}
      </Collapsible>
    </div>
  );
}
