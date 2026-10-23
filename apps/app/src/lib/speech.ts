import { useCallback, useEffect, useRef, useState } from 'react';

/** Phần của Web Speech API mà app dùng (trình duyệt dùng tên SpeechRecognition hoặc webkitSpeechRecognition; thư viện kiểu của TypeScript chưa có) */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function ctor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => ctor() !== null;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Chưa cho phép dùng micro. Hãy cho phép micro cho ứng dụng trong phần cài đặt của trình duyệt.',
  'service-not-allowed': 'Chưa cho phép dùng micro. Hãy cho phép micro cho ứng dụng trong phần cài đặt của trình duyệt.',
  'no-speech': 'Không nghe thấy tiếng nói. Hãy bấm Nói và thử lại.',
  'audio-capture': 'Không tìm thấy micro trên máy.',
  network: 'Cần có mạng để chuyển giọng nói thành chữ. Có thể bấm biểu tượng micro trên bàn phím điện thoại để nói.',
};

/**
 * Nói vào máy, chuyển thành chữ tiếng Việt bằng nhận dạng có sẵn của trình duyệt/điện thoại (G2-6, V1).
 * `onText` nhận từng đoạn chữ đã nhận dạng xong. Không ghi âm, không lưu gì.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    rec.current?.abort();
    const r = new C();
    r.lang = 'vi-VN';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) { if (t.trim()) cb.current(t.trim()); } else live += t;
      }
      setInterim(live);
    };
    r.onerror = (e) => { if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Không nhận dạng được giọng nói. Hãy thử lại hoặc gõ chữ.'); };
    r.onend = () => { setListening(false); setInterim(''); if (rec.current === r) rec.current = null; };
    setError(null);
    setInterim('');
    rec.current = r;
    try { r.start(); setListening(true); } catch { setError('Không bật được micro. Hãy thử lại.'); rec.current = null; }
  }, []);

  useEffect(() => () => { rec.current?.abort(); }, []);
  return { listening, interim, error, start, stop, supported: speechSupported() };
}
