import { useRef, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { fileToSmallImage } from '../lib/image';

/** Chọn/chụp một ảnh, tự thu nhỏ; có nút Xóa ảnh. `value` là data URL hoặc rỗng. */
export function ImagePicker({ value, onChange, label = 'Hình ảnh', disabled }: {
  value: string; onChange: (v: string) => void; label?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="imgpick">
      <span className="lbl">{label}</span>
      <div className="row">
        {value ? <img src={value} alt="" className="thumb" /> : <span className="thumb empty" aria-hidden>🖼</span>}
        <button type="button" className="secondary" style={{ width: 'auto', margin: 0, padding: '0 14px' }} disabled={disabled} onClick={() => ref.current?.click()}>
          {value ? 'Đổi ảnh' : 'Chọn / chụp ảnh'}
        </button>
        {value && <button type="button" className="icon" disabled={disabled} aria-label="Xóa ảnh" onClick={() => onChange('')}>✕</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setErr(null);
          fileToSmallImage(f).then(onChange).catch((x) => setErr(friendlyError(x)));
        }} />
      {err && <p className="msg error" role="alert">{err}</p>}
    </div>
  );
}

/** Ảnh nhỏ trong bảng (không có ảnh thì không chiếm chỗ) */
export const Thumb = ({ src }: { src?: string | null }) => (src ? <img src={src} alt="" className="thumb sm" loading="lazy" /> : null);
