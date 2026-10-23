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
 * Gộp các đoạn nhận dạng thành MỘT câu. Trên Android (Chrome/Samsung) mỗi lần cập nhật có thể trả về cả câu đang nói lẫn các bản
 * lặp lại cộng dồn của nó ("mạng", "mạng có", "mạng có vấn đề"…); nếu cứ nối tiếp sẽ bị lặp chữ, nên đoạn sau bắt đầu bằng đoạn trước thì thay thế đoạn trước.
 */
export function mergeTranscript(parts: string[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last !== undefined && (t === last || t.startsWith(last))) out[out.length - 1] = t;
    else if (last !== undefined && last.startsWith(t)) continue;
    else out.push(t);
  }
  return out.join(' ');
}

/**
 * Nói vào máy, chuyển thành chữ tiếng Việt bằng nhận dạng có sẵn của trình duyệt/điện thoại (G2-6, V1).
 * `onText(câu)` nhận TOÀN BỘ câu đã nghe được trong lượt này (mỗi lần cập nhật là một bản đầy đủ, người gọi thay chứ không nối thêm).
 * Mỗi lượt nghe một câu; muốn nói tiếp thì bấm Nói lại. Không ghi âm, không lưu gì.
 */
export function useSpeech(onText: (sentence: string) => void) {
  const [listening, setListening] = useState(false);
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
    r.continuous = false; // chế độ liên tục trên Android làm lặp chữ rất nhiều
    r.interimResults = true;
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]![0]?.transcript ?? '');
      const sentence = mergeTranscript(parts);
      if (sentence) cb.current(sentence);
    };
    r.onerror = (e) => { if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Không nhận dạng được giọng nói. Hãy thử lại hoặc gõ chữ.'); };
    r.onend = () => { setListening(false); if (rec.current === r) rec.current = null; };
    setError(null);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setError('Không bật được micro. Hãy thử lại.'); rec.current = null; }
  }, []);

  useEffect(() => () => { rec.current?.abort(); }, []);
  return { listening, error, start, stop, supported: speechSupported() };
}
