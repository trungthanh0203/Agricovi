import { useRef, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { fileToSmallImage } from '../lib/image';
import { uploadImage, useImageSrc, type ImageKind } from '../lib/media';
import { useOrgs } from '../lib/orgs';

/**
 * Hình từ cột image: ảnh cũ (data URL) hoặc tham chiếu kho ảnh ("storage:…") đều hiện được.
 * `size` 't' = ảnh nhỏ cho danh sách, 'f' = ảnh đầy đủ.
 */
export function Img({ value, alt = '', className, size = 't' }: { value: string | null | undefined; alt?: string; className?: string; size?: 't' | 'f' }) {
  const src = useImageSrc(value, size);
  if (!value) return null;
  if (!src) return <span className={`${className ?? ''} empty`.trim()} aria-hidden>🖼</span>; // đang tải hoặc mất mạng chưa tải được
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

/**
 * Chọn/chụp một ảnh, tự thu nhỏ; có nút Xóa ảnh. `value` là rỗng, data URL (ảnh cũ) hoặc tham chiếu kho ảnh.
 * Có `store` (loại ảnh) thì ảnh được đưa lên kho ảnh của cơ sở đang chọn (cần mạng); không có thì giữ dạng data URL như trước
 * (dùng cho ảnh công khai của website, chưa chuyển sang kho ảnh).
 */
export function ImagePicker({ value, onChange, label = 'Hình ảnh', disabled, store }: {
  value: string; onChange: (v: string) => void; label?: string; disabled?: boolean; store?: ImageKind;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { active } = useOrgs();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File) {
    setErr(null);
    setBusy(true);
    try {
      if (store && active) {
        // Không xóa ảnh cũ trong kho ở đây: nếu người dùng bấm Hủy thì bản ghi vẫn cần ảnh cũ. Ảnh không còn dùng sẽ được dọn sau (xem docs/HUONG_DAN_G2_1_ANH.md)
        onChange(await uploadImage(f, active.id, store));
      } else {
        onChange(await fileToSmallImage(f));
      }
    } catch (x) {
      setErr(friendlyError(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="imgpick">
      <span className="lbl">{label}</span>
      <div className="row">
        {value ? <Img value={value} className="thumb" /> : <span className="thumb empty" aria-hidden>🖼</span>}
        <button type="button" className="secondary" style={{ width: 'auto', margin: 0, padding: '0 14px' }} disabled={disabled || busy} onClick={() => ref.current?.click()}>
          {busy ? 'Đang tải ảnh…' : value ? 'Đổi ảnh' : 'Chọn / chụp ảnh'}
        </button>
        {value && <button type="button" className="icon" disabled={disabled || busy} aria-label="Xóa ảnh" onClick={() => onChange('')}>✕</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }} />
      {err && <p className="msg error" role="alert">{err}</p>}
    </div>
  );
}

/** Ảnh nhỏ trong bảng (không có ảnh thì không chiếm chỗ) */
export const Thumb = ({ src }: { src?: string | null }) => (src ? <Img value={src} className="thumb sm" /> : null);
