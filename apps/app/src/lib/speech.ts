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
interface WakeLockLike { release(): Promise<void> }

function ctor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => ctor() !== null;
/** iPhone/iPad: nhận dạng trong trình duyệt hay ngắt giữa chừng, nên chỉ nghe từng lượt, không tự bật lại */
const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent);

const ERRORS: Record<string, string> = {
  'not-allowed': 'Chưa cho phép dùng micro. Hãy cho phép micro cho ứng dụng trong phần cài đặt của trình duyệt.',
  'service-not-allowed': 'Chưa cho phép dùng micro. Hãy cho phép micro cho ứng dụng trong phần cài đặt của trình duyệt.',
  'audio-capture': 'Không tìm thấy micro trên máy.',
  network: 'Cần có mạng để chuyển giọng nói thành chữ. Có thể bấm biểu tượng micro trên bàn phím điện thoại để nói.',
};
/** Lỗi nặng: không thử bật lại */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);

/** Tối đa mỗi lần bấm Nói (giây), và thời gian im lặng thì tự dừng (giây) */
export const MAX_LISTEN_SECONDS = 120;
export const IDLE_STOP_SECONDS = 30;

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

const END_MARK = /[.!?…]$/;
/** Chữ cái đầu viết hoa (theo tiếng Việt), thêm dấu chấm cuối câu nếu chưa có dấu kết câu */
export function formatSentence(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const cap = t.charAt(0).toLocaleUpperCase('vi-VN') + t.slice(1);
  return END_MARK.test(cap) ? cap : `${cap}.`;
}

/**
 * Nối một câu vừa nghe vào chữ đang có trong ô: câu được viết hoa đầu câu và có dấu chấm cuối.
 * Chữ người dùng đã gõ/sửa được giữ nguyên; nếu chữ đó chưa kết thúc bằng dấu câu thì thêm dấu chấm trước khi nối.
 */
export function appendSentence(base: string, sentence: string): string {
  const s = formatSentence(sentence);
  if (!s) return base;
  const b = base.replace(/\s+$/, '');
  if (!b) return s;
  const glue = /[.!?…:;,\n]$/.test(b) ? ' ' : '. ';
  return `${b}${glue}${s}`;
}

export const fmtClock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/**
 * Nói vào máy, chuyển thành chữ tiếng Việt bằng nhận dạng có sẵn của trình duyệt/điện thoại (G2-6, V1), nhiều câu liền nhau:
 * mỗi lượt nghe một câu (không dùng chế độ liên tục vì trên Android hay lặp chữ), xong câu thì chốt vào ô qua `onCommit(câu)` rồi TỰ bật lượt nghe mới
 * cho đến khi bấm Dừng, im lặng quá IDLE_STOP_SECONDS, đủ MAX_LISTEN_SECONDS, hoặc rời màn hình. `onInterim(chữ)` nhận chữ đang nhận dở (để hiện mờ).
 * Giữ màn hình sáng khi đang nghe. Không ghi âm, không lưu gì.
 */
export function useSpeech(onCommit: (sentence: string) => void, onInterim?: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<Recognition | null>(null);
  const active = useRef(false);
  const startedAt = useRef(0);
  const lastHeard = useRef(0);
  const timer = useRef<number | null>(null);
  const wake = useRef<WakeLockLike | null>(null);
  const commitCb = useRef(onCommit);
  commitCb.current = onCommit;
  const interimCb = useRef(onInterim);
  interimCb.current = onInterim;

  const releaseWake = useCallback(() => { void wake.current?.release().catch(() => undefined); wake.current = null; }, []);

  const finish = useCallback((msg?: string) => {
    active.current = false;
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
    releaseWake();
    interimCb.current?.('');
    setListening(false);
    if (msg) setNotice(msg);
  }, [releaseWake]);

  const lap = useCallback(() => {
    const C = ctor();
    if (!C || !active.current) return;
    const r = new C();
    let latest = '';
    let failed = false;
    r.lang = 'vi-VN';
    r.continuous = false; // chế độ liên tục trên Android làm lặp chữ rất nhiều
    r.interimResults = true;
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]![0]?.transcript ?? '');
      latest = mergeTranscript(parts);
      if (latest) { lastHeard.current = Date.now(); interimCb.current?.(latest); }
    };
    r.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return; // im lặng: lượt sau nghe tiếp, quá lâu thì tự dừng
      failed = true;
      setError(ERRORS[e.error] ?? 'Không nhận dạng được giọng nói. Hãy thử lại hoặc gõ chữ.');
      if (FATAL.has(e.error)) finish();
    };
    r.onend = () => {
      if (rec.current === r) rec.current = null;
      const text = latest.trim();
      interimCb.current?.('');
      if (text) commitCb.current(text); // chốt câu vừa nghe (kể cả khi trình duyệt chưa đánh dấu "xong")
      if (!active.current) return;
      if (failed || isIOS()) { finish(); return; } // lỗi, hoặc iPhone: chỉ nghe từng lượt
      window.setTimeout(lap, 120); // nghe lượt kế tiếp ngay
    };
    rec.current = r;
    try { r.start(); } catch { finish(); setError('Không bật được micro. Hãy thử lại.'); rec.current = null; }
  }, [finish]);

  const start = useCallback(() => {
    if (!ctor() || active.current) return;
    rec.current?.abort();
    setError(null); setNotice(null); setElapsed(0);
    active.current = true;
    startedAt.current = Date.now();
    lastHeard.current = Date.now();
    setListening(true);
    // giữ màn hình sáng khi đang nghe (máy không hỗ trợ thì bỏ qua)
    const nav = navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLockLike> } };
    void nav.wakeLock?.request('screen').then((w) => { if (active.current) wake.current = w; else void w.release(); }).catch(() => undefined);
    timer.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(sec);
      if (sec >= MAX_LISTEN_SECONDS) { rec.current?.stop(); finish(`Đã nghe đủ ${MAX_LISTEN_SECONDS / 60} phút nên tự dừng. Bấm Nói để ghi tiếp.`); }
      else if (Date.now() - lastHeard.current > IDLE_STOP_SECONDS * 1000) { rec.current?.stop(); finish(`Không nghe thấy tiếng nói trong ${IDLE_STOP_SECONDS} giây nên đã dừng. Bấm Nói để ghi tiếp.`); }
    }, 1000);
    lap();
  }, [lap, finish]);

  const stop = useCallback(() => {
    active.current = false; // onend sẽ chốt câu đang dở rồi không bật lại
    rec.current?.stop();
    finish();
  }, [finish]);

  // rời màn hình / khóa máy thì dừng; thoát màn hình thì tắt hẳn, không chốt thêm
  useEffect(() => {
    const onHide = () => { if (document.hidden && active.current) stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      active.current = false;
      if (timer.current !== null) window.clearInterval(timer.current);
      commitCb.current = () => undefined;
      rec.current?.abort();
      releaseWake();
    };
  }, [stop, releaseWake]);

  return { listening, error, notice, elapsed, start, stop, supported: speechSupported() };
}
