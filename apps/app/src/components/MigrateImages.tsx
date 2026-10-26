import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { migrateOldImages, type MigrateReport } from '../lib/media';
import { syncDown } from '../lib/production';

/**
 * Chuyển ảnh cũ (lưu trong cột dữ liệu) của cơ sở sang kho ảnh mới (G2-1). Chỉ chủ cơ sở thấy.
 * An toàn: ảnh được tải lên kho TRƯỚC, chỉ khi thành công mới đổi tham chiếu; ảnh nào lỗi thì giữ nguyên ảnh cũ; chạy lại được.
 */
export function MigrateImages({ orgId }: { orgId: string }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [report, setReport] = useState<MigrateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setReport(null);
    setProgress(null);
    try {
      const r = await migrateOldImages(orgId, (d, t) => setProgress([d, t]));
      setReport(r);
      await syncDown().catch(() => undefined); // tải lại danh sách để thấy tham chiếu mới
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted">Ảnh phân khu, sản phẩm, vật tư, giấy phép đã thêm trước đây đang nằm trong dữ liệu, làm app tải chậm. Bấm nút dưới để chuyển sang kho ảnh mới (nhanh hơn, nhẹ hơn). Cần có mạng; ảnh nào chuyển lỗi sẽ được giữ nguyên, bấm lại là thử tiếp.</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {busy && progress && <p className="msg ok" role="status">Đang chuyển ảnh {progress[0]}/{progress[1]}… xin đừng đóng app.</p>}
      {report && (
        <p className={report.failed > 0 ? 'msg warn' : 'msg ok'} role="status">
          {report.moved + report.failed === 0 ? 'Không còn ảnh cũ cần chuyển.' : `Đã chuyển ${report.moved} ảnh${report.failed > 0 ? `, ${report.failed} ảnh chưa chuyển được (bấm lại để thử tiếp)` : ''}.`}
        </p>
      )}
      <button className="secondary" disabled={busy || !online} onClick={() => void run()}>{busy ? 'Đang chuyển…' : 'Chuyển ảnh cũ sang kho ảnh mới'}</button>
    </>
  );
}
