import { effectiveModel, featuresOf } from '../lib/models';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

/**
 * Nhắc cách ly khi thu hoạch ở vụ KHÔNG ghi việc (mô hình Tự làm trong gia đình / Chủ và người làm công tháng, chưa bật Ghi việc):
 * app không biết loại thuốc đã dùng nên dựa vào mốc "ngưng thuốc/phân N ngày trước thu" của quy trình. Vụ có ghi việc thì đã có cảnh báo chính xác theo từng thuốc.
 */
export function SafetyReminder({ cycleId }: { cycleId: string }) {
  const { active } = useOrgs();
  const cycle = useTable('cycles').find((c) => c.id === cycleId);
  const milestones = useTable('milestones');
  if (!cycle || !active) return null;
  const logsOn = featuresOf(effectiveModel(cycle.mgmt_model, active.mgmtModel), cycle.mgmt_options ?? []).logs !== 'off';
  if (logsOn) return null;
  const stops = milestones.filter((m) => m.cycle_id === cycleId && m.anchor === 'end' && /ngưng/i.test(m.title) && !m.done_at);
  return (
    <div className="msg warn" role="status">
      <strong>Nhắc an toàn thực phẩm:</strong> vụ này không ghi việc dùng thuốc nên app không tự tính thời gian cách ly.
      {stops.length > 0
        ? <> Hãy chắc bạn đã làm đủ các mốc: {stops.map((m) => `"${m.title}" (${m.offset_days} ngày trước thu)`).join(', ')}, rồi đánh dấu "đã làm" ở khối Mốc nhắc việc của vụ.</>
        : <> Hãy chắc đã ngưng thuốc và phân đủ số ngày ghi trên nhãn trước khi thu hoạch.</>}
    </div>
  );
}
