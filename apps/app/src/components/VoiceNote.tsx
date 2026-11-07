import { useRef, useState } from 'react';
import { appendSentence, fmtClock, MAX_LISTEN_SECONDS, useSpeech } from '../lib/speech';

/**
 * Ô "Nội dung việc": gõ chữ hoặc bấm 🎤 Nói để chuyển giọng nói thành chữ vào ô.
 * Nói được NHIỀU CÂU liền nhau (tối đa 2 phút mỗi lần): xong mỗi câu app tự chốt vào ô (viết hoa đầu câu, thêm dấu chấm) và nghe tiếp, bấm Dừng khi xong.
 * Chữ đang nhận dở hiện mờ bên dưới ô; gõ sửa trong ô lúc đang nói vẫn được, câu sau nối vào phần đã sửa.
 * "Xóa & đọc lại" xóa hết chữ trong ô rồi nghe lại từ đầu (khi đọc sai hoặc chưa đúng).
 */
export function VoiceNote({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const cur = useRef(value);
  cur.current = value;
  const [interim, setInterim] = useState('');
  const { listening, error, notice, elapsed, start, stop, supported } = useSpeech(
    (sentence) => { const next = appendSentence(cur.current, sentence); cur.current = next; onChange(next); },
    setInterim,
  );

  function redo() {
    stop();
    cur.current = '';
    onChange('');
    window.setTimeout(() => start(), 400); // đợi lượt nghe cũ dừng hẳn rồi nghe lại
  }

  return (
    <div className="voicenote">
      <label>
        {label}
        <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ví dụ: Bón 20 ký NPK cho vụ dưa lưới" />
      </label>
      {listening && (
        <p className="voice-live" role="status">
          🎤 Đang nghe {fmtClock(elapsed)} / {fmtClock(MAX_LISTEN_SECONDS)}… nói từng câu rõ ràng, bấm Dừng khi xong
          {interim && <><br /><em>{interim}</em></>}
        </p>
      )}
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
      {notice && !error && <p className="msg ok" role="status">{notice}</p>}
      {supported && <p className="muted voice-note">Cần có mạng. Giọng nói do trình duyệt của điện thoại xử lý; ứng dụng không ghi âm và không lưu lại. Điện thoại có thể kêu “tít” sau mỗi câu. Hãy đọc lại chữ trước khi bấm Lưu.</p>}
    </div>
  );
}
