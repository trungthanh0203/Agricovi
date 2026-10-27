import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

/**
 * Nhắc cách ly khi thu hoạch ở vụ CHƯA có việc nào được ghi: app không biết thuốc/phân đã dùng nên không tự tính thời gian cách ly
 * theo từng loại thuốc. Khi đó dựa vào các mốc "ngưng thuốc/phân N ngày trước thu" của quy trình (nếu có). Vụ đã ghi việc dùng thuốc thì
 * đã có cảnh báo chính xác ở khung Cách ly nên không nhắc.
 */
export function SafetyReminder({ cycleId }: { cycleId: string }) {
  const { active } = useOrgs();
  const logs = useTable('logs');
  const milestones = useTable('milestones');
  if (!active) return null;
  if (logs.some((l) => l.cycle_id === cycleId && !l.voided_at)) return null;
  const stops = milestones.filter((m) => m.cycle_id === cycleId && m.anchor === 'end' && /ngưng/i.test(m.title) && !m.done_at);
  return (
    <div className="msg warn" role="status">
      <strong>Nhắc an toàn thực phẩm:</strong> vụ này chưa ghi việc nào nên app không biết thuốc và phân đã dùng, chưa tính được thời gian cách ly.
      Nên ghi việc (nút ＋ Ghi việc, chọn vật tư đã dùng) mỗi lần phun thuốc, bón phân.
      {stops.length > 0
        ? <> Nếu không ghi, hãy chắc bạn đã làm đủ các mốc: {stops.map((m) => `"${m.title}" (${m.offset_days} ngày trước thu)`).join(', ')}, rồi đánh dấu "đã làm" ở khối Mốc nhắc việc của vụ.</>
        : <> Nếu không ghi, hãy chắc đã ngưng thuốc và phân đủ số ngày ghi trên nhãn trước khi thu hoạch.</>}
    </div>
  );
}
