import { useRef } from 'react';
import { useSpeech } from '../lib/speech';

/**
 * Ô "Nội dung việc": gõ chữ hoặc bấm 🎤 Nói để chuyển giọng nói thành chữ vào ô.
 * Mỗi lượt nói là một câu, được nối sau phần chữ đã có trong ô; chữ hiện dần khi đang nói.
 * "Xóa & đọc lại" xóa hết chữ trong ô rồi nghe lại từ đầu (khi đọc sai hoặc chưa đúng).
 */
export function VoiceNote({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const cur = useRef(value);
  cur.current = value;
  const base = useRef(''); // phần chữ có sẵn trước lượt nói này
  const { listening, error, start, stop, supported } = useSpeech((sentence) => onChange(base.current ? `${base.current} ${sentence}` : sentence));

  function talk() {
    base.current = cur.current.trim();
    start();
  }

  function redo() {
    stop();
    base.current = '';
    cur.current = '';
    onChange('');
    window.setTimeout(() => { base.current = ''; start(); }, 300); // đợi lượt nghe cũ dừng hẳn rồi nghe lại
  }

  return (
    <div className="voicenote">
      <label>
        {label}
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ví dụ: Bón 20 ký NPK cho vụ dưa lưới" />
      </label>
      {listening && <p className="voice-live" role="status">🎤 Đang nghe… hãy nói rõ từng câu</p>}
      {supported ? (
        <div className="btnrow">
          <button type="button" className={listening ? 'primary' : 'secondary'} onClick={listening ? stop : talk} aria-pressed={listening}>
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
