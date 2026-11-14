import { useEffect, useMemo, useState } from 'react';
import type { CycleStat } from '../lib/cycleStatsLogic';
import { statWarnings } from '../lib/cycleStatsLogic';
import { buildCycleQr, cycleCode, fetchCycleTrace, qrSvg } from '../lib/qr';
import { useOnline } from '../lib/hooks';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const kg = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`;
const vn = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—');

export interface ProfitReportInfo {
  cycleId: string;
  title: string;
  orgName: string;
  cropName: string;
  areaPath: string;
  startDate: string | null;
  endDate: string | null;
  statusLabel: string;
}

/**
 * Báo cáo lãi/lỗ MỘT TRANG của vụ (mục 5 báo cáo đối thủ): chỉ tổng doanh thu, tổng chi phí (3 nhóm), lãi/lỗ, sản lượng, giá thành.
 * KHÔNG có chi tiết từng người lao động hay nhà cung cấp, để gửi người mua, ngân hàng, hội. In A4 dọc / lưu PDF bằng chức năng in của trình duyệt.
 * Mã QR là mã truy xuất công khai của vụ (không chứa số tiền).
 */
export function CycleProfitReport({ info, s }: { info: ProfitReportInfo; s: CycleStat }) {
  const online = useOnline();
  const [qrText, setQrText] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    if (!navigator.onLine) return;
    fetchCycleTrace(info.cycleId).then((t) => { if (!off) setQrText(buildCycleQr(t)); }).catch(() => undefined);
    return () => { off = true; };
  }, [info.cycleId]);

  const qr = useMemo(() => {
    if (!qrText) return null;
    try { return qrSvg(qrText).svg; } catch { return null; }
  }, [qrText]);

  const warns = statWarnings(s);
  const profit = s.profit;
  return (
    <div className="inline-form profit-wrap">
      <div className="no-print btnrow">
        <button type="button" className="primary" onClick={() => window.print()}>In / Lưu PDF (A4 dọc)</button>
        {!online && <span className="muted">Không có mạng: báo cáo vẫn in được nhưng chưa có mã QR.</span>}
      </div>
      <div id="print-root" className="profit-report">
        <h2>BÁO CÁO LÃI / LỖ MÙA VỤ</h2>
        <p className="pr-sub"><strong>{info.title}</strong> · Mã vụ {cycleCode(info.cycleId)}</p>
        <p className="muted">
          {info.orgName}{info.cropName ? ` · ${info.cropName}` : ''}{info.areaPath ? ` · Khu: ${info.areaPath}` : ''}<br />
          Bắt đầu {vn(info.startDate)}{info.endDate ? ` · Kết thúc ${vn(info.endDate)}` : ''} · Tình trạng: {info.statusLabel}
        </p>

        <table className="grid pr-table">
          <tbody>
            {s.revenue !== null && <tr><th>Tổng doanh thu</th><td>{money(s.revenue)}</td></tr>}
            {s.cost_total !== null && <tr><th>Tổng chi phí</th><td>{money(s.cost_total)}</td></tr>}
            {s.cost_material !== null && <tr className="pr-sub-row"><th>· Vật tư đã dùng</th><td>{money(s.cost_material)}</td></tr>}
            {s.cost_labor !== null && <tr className="pr-sub-row"><th>· Tiền công</th><td>{money(s.cost_labor)}</td></tr>}
            {s.cost_other !== null && <tr className="pr-sub-row"><th>· Chi khác</th><td>{money(s.cost_other)}</td></tr>}
            {profit !== null && <tr className={`pr-total ${profit >= 0 ? 'ok' : 'bad'}`}><th>{profit >= 0 ? 'LÃI tạm tính' : 'LỖ tạm tính'}</th><td>{money(Math.abs(profit))}</td></tr>}
          </tbody>
        </table>

        <table className="grid pr-table">
          <tbody>
            {s.harvest_net !== null && <tr><th>Sản lượng thu hoạch (sau hao hụt)</th><td>{kg(s.harvest_net)}</td></tr>}
            {s.sold !== null && <tr><th>Đã bán</th><td>{kg(s.sold)}</td></tr>}
            {s.avg_price !== null && <tr><th>Giá bán trung bình</th><td>{money(s.avg_price)}/kg</td></tr>}
            {s.cost_per_kg !== null && <tr><th>Giá thành mỗi kg</th><td>{money(s.cost_per_kg)}/kg</td></tr>}
            {s.profit_per_kg !== null && <tr><th>{s.profit_per_kg >= 0 ? 'Lãi mỗi kg' : 'Lỗ mỗi kg'}</th><td>{money(Math.abs(s.profit_per_kg))}/kg</td></tr>}
            {s.area_m2 !== null && <tr><th>Diện tích</th><td>{s.area_m2.toLocaleString('vi-VN')} m²</td></tr>}
            {s.yield_per_1000m2 !== null && <tr><th>Năng suất</th><td>{kg(s.yield_per_1000m2)}/1.000 m²</td></tr>}
          </tbody>
        </table>

        {warns.length > 0 && (
          <div className="pr-warn"><strong>Lưu ý:</strong><ul>{warns.map((w) => <li key={w}>{w}</li>)}</ul></div>
        )}

        <div className="pr-foot">
          <div>
            <p className="muted">Số liệu lấy từ phần mềm AgriConnect, tính tại thời điểm {new Date().toLocaleString('vi-VN')}. Lãi/lỗ là số tạm tính từ các khoản đã ghi trong hệ thống.</p>
            <div className="logbook-sign"><span>Người lập</span><span>Chủ cơ sở xác nhận</span></div>
          </div>
          {qr && (
            <div className="pr-qr">
              <div className="qrbox" role="img" aria-label="Mã QR truy xuất vụ" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="muted">Quét để xem thông tin truy xuất của vụ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
