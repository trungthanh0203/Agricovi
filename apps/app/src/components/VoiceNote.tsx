import { useRef } from 'react';
import { useSpeech } from '../lib/speech';

/**
 * Ô "Nội dung việc": gõ chữ hoặc bấm 🎤 Nói để chuyển giọng nói thành chữ vào ô.
 * "Xóa & đọc lại" xóa hết chữ trong ô rồi nghe lại từ đầu (khi đọc sai hoặc chưa đúng).
 */
export function VoiceNote({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const cur = useRef(value);
  cur.current = value;
  const { listening, interim, error, start, stop, supported } = useSpeech((t) => onChange(cur.current ? `${cur.current} ${t}` : t));

  function redo() {
    stop();
    cur.current = '';
    onChange('');
    window.setTimeout(start, 250); // đợi lượt nghe cũ dừng hẳn rồi nghe lại
  }

  return (
    <div className="voicenote">
      <label>
        {label}
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ví dụ: Bón 20 ký NPK cho vụ dưa lưới" />
      </label>
      {listening && <p className="voice-live" role="status">🎤 Đang nghe… {interim && <em>{interim}</em>}</p>}
      {supported ? (
        <div className="btnrow">
          <button type="button" className={listening ? 'primary' : 'secondary'} onClick={listening ? stop : start} aria-pressed={listening}>
            {listening ? '⏹ Dừng' : '🎤 Nói'}
          </button>
          <button type="button" className="secondary" onClick={redo} disabled={!value && !listening}>🗑 Xóa &amp; đọc lại</button>
        </div>
      ) : (
        <p className="muted">Máy này chưa hỗ trợ nói vào ứng dụng. Hãy bấm biểu tượng micro trên bàn phím điện thoại rồi nói vào ô trên.</p>
      )}
      {error && <p className="msg warn" role="status">{error}</p>}
      {supported && <p className="muted voice-note">Giọng nói do trình duyệt của điện thoại xử lý; ứng dụng không ghi âm và không lưu lại. Hãy đọc lại chữ trước khi bấm Lưu.</p>}
    </div>
  );
}
