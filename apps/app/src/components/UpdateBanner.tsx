import { useEffect, useState } from 'react';
import { applyUpdate, onUpdateAvailable } from '../lib/pwa';

/** Báo có phiên bản mới của app; người dùng tự bấm cập nhật khi đã lưu xong việc đang làm. */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => onUpdateAvailable(setAvailable), []);
  if (!available) return null;
  return (
    <div className="notice" role="status">
      Có phiên bản mới của ứng dụng.{' '}
      <button className="link inline" onClick={applyUpdate}>Cập nhật ngay</button>
      <small className="muted"> (hãy lưu xong việc đang nhập trước khi bấm)</small>
    </div>
  );
}
