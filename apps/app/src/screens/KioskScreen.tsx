import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { kioskCheck, kioskPunch, kioskSetPin, verifyOwnerToExit, type KioskInfo } from '../lib/kiosk';

type Step = 'login' | 'setpin' | 'punch' | 'done';
interface Who { name: string; state: 'in' | 'out'; since: string | null; stale: boolean }
interface Detector { detect(source: CanvasImageSource): Promise<unknown[]> }

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

/** Camera trước + (nếu trình duyệt hỗ trợ) đếm số khuôn mặt trong khung. faces = null: máy không kiểm được. */
function useCamera(on: boolean, attempt: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<number | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let dead = false;
    setError(null);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        const v = videoRef.current;
        if (dead || !v) { stream.getTracks().forEach((t) => t.stop()); return; }
        v.srcObject = stream;
        await v.play();
        setReady(true);
        const Det = (window as unknown as { FaceDetector?: new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => Detector }).FaceDetector;
        if (Det) {
          const det = new Det({ fastMode: true, maxDetectedFaces: 3 });
          setFaces(0);
          const tick = async () => {
            if (dead) return;
            try { setFaces((await det.detect(v)).length); } catch { setFaces(null); return; } // không hỗ trợ: bỏ kiểm khuôn mặt
            timer = window.setTimeout(() => void tick(), 600);
          };
          void tick();
        } else setFaces(null);
      } catch {
        if (!dead) setError('Chưa dùng được camera. Hãy cho phép trang này dùng camera (biểu tượng ổ khóa cạnh địa chỉ), rồi bấm Thử lại.');
      }
    })();
    return () => {
      dead = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
      setFaces(null);
    };
  }, [on, attempt]);

  /** Chụp một khung hình thành JPEG nhỏ (base64, không có tiền tố) */
  const capture = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const w = 320;
    const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6).split(',')[1] ?? null;
  }, []);

  return { videoRef, ready, error, faces, capture };
}

/**
 * Giao diện duy nhất của điện thoại làm MÁY CHẤM CÔNG (D111). Không có đường vào các màn quản lý: thiết bị đăng nhập bằng tài khoản
 * thiết bị, máy chủ chỉ cho gọi các hàm kiosk_*. Muốn thoát phải nhập mật khẩu chủ cơ sở.
 */
export function KioskScreen({ info }: { info: KioskInfo }) {
  const { signOut } = useAuth();
  const [step, setStep] = useState<Step>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [punchId, setPunchId] = useState('');
  const [done, setDone] = useState<{ text: string; photo: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [attempt, setAttempt] = useState(0); // tăng số này để bật lại camera
  const cam = useCamera(step === 'punch', attempt);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  // Giữ màn hình sáng khi máy đặt cố định
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    void nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  const reset = useCallback(() => {
    setStep('login'); setPhone(''); setPin(''); setCode(''); setPin2(''); setWho(null); setError(null); setDone(null); setBusy(false);
  }, []);
  // Bước chụp ảnh bỏ dở thì quay về màn đầu sau 90 giây (xóa PIN khỏi bộ nhớ); màn kết quả tự đóng sau 6 giây
  useEffect(() => {
    if (step !== 'punch' && step !== 'done') return;
    const t = window.setTimeout(reset, step === 'punch' ? 90000 : 6000);
    return () => window.clearTimeout(t);
  }, [step, reset]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!phone.trim() || !pin.trim()) return setError('Hãy nhập số điện thoại và PIN.');
    setBusy(true);
    const r = await kioskCheck(phone, pin);
    setBusy(false);
    if (!r.ok) return setError(r.message ?? 'Có lỗi, hãy thử lại.');
    setWho({ name: String(r.name), state: r.state as 'in' | 'out', since: (r.since as string | null) ?? null, stale: Boolean(r.stale) });
    setPunchId(crypto.randomUUID());
    setDone(null);
    setStep('punch');
  }

  async function onSetPin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (pin !== pin2) return setError('Hai lần nhập PIN chưa giống nhau.');
    setBusy(true);
    const r = await kioskSetPin(phone, code, pin);
    setBusy(false);
    if (!r.ok) return setError(r.message ?? 'Có lỗi, hãy thử lại.');
    reset();
    setDone({ text: 'Đã đặt PIN. Bây giờ bạn nhập số điện thoại và PIN để vào ca.', photo: '' });
  }

  async function onPunch() {
    if (busy || !who) return;
    const photo = cam.capture();
    if (!photo) return setError('Chưa chụp được ảnh. Hãy đợi camera sáng lên rồi bấm lại.');
    setBusy(true);
    setError(null);
    const action = who.state === 'in' ? 'out' : 'in';
    const r = await kioskPunch(phone, pin, action, punchId, photo, cam.faces === null ? null : cam.faces === 1);
    setBusy(false);
    if (!r.ok) {
      // PIN hoặc trạng thái đã đổi: quay về màn đầu để nhập lại
      if (['BAD_LOGIN', 'LOCKED', 'NO_PIN', 'NO_KIOSK', 'ALREADY_IN', 'NOT_IN'].includes(r.code ?? '')) {
        reset();
        setError(r.message ?? null);
        return;
      }
      return setError(r.message ?? 'Có lỗi, hãy thử lại.');
    }
    const at = hhmm(String(r.at));
    const late = r.stale ? ' Ca hôm trước chưa kết thúc, chủ cơ sở sẽ xem lại giờ.' : '';
    setDone({ text: `${who.name}: đã ${action === 'in' ? 'VÀO ca' : 'RA ca'} lúc ${at}.${late}`, photo });
    setPin('');
    setStep('done');
  }

  const faceHint =
    cam.faces === null ? null
      : cam.faces === 0 ? 'Hãy đưa khuôn mặt vào khung.'
        : cam.faces > 1 ? 'Chỉ một người đứng trước camera.' : null;
  const canShoot = cam.ready && !busy && (cam.faces === null || cam.faces === 1);

  return (
    <main className="auth kiosk">
      <p className="muted kiosk-top">
        Máy chấm công · {info.name}{info.area_name ? ` · ${info.area_name}` : ''} · {info.org_name}
        <br />{now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · <strong>{hhmm(now.toISOString())}</strong>
      </p>

      {step === 'login' && (
        <>
          <h1>Chấm công</h1>
          {done && <p className="msg ok" role="status">{done.text}</p>}
          <form onSubmit={onLogin} noValidate className="inline-form">
            <label>
              Số điện thoại
              <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ví dụ 0912345678" />
            </label>
            <label>
              PIN
              <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            {error && <p className="msg error" role="alert">{error}</p>}
            <button type="submit" className="primary kiosk-big" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Tiếp tục'}</button>
          </form>
          <button className="link" onClick={() => { setError(null); setDone(null); setPin(''); setStep('setpin'); }}>Đặt PIN lần đầu / quên PIN</button>
        </>
      )}

      {step === 'setpin' && (
        <>
          <h1>Đặt PIN</h1>
          <p className="muted">Nhờ chủ cơ sở cấp mã (6 số, dùng một lần trong 24 giờ). PIN gồm 4 đến 6 chữ số, chỉ mình bạn biết, đừng cho ai mượn.</p>
          <form onSubmit={onSetPin} noValidate className="inline-form">
            <label>Số điện thoại<input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label>Mã chủ cấp<input inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
            <label>PIN mới<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
            <label>Nhập lại PIN mới<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
            {error && <p className="msg error" role="alert">{error}</p>}
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu PIN'}</button>
              <button type="button" className="secondary" onClick={reset}>Quay lại</button>
            </div>
          </form>
        </>
      )}

      {step === 'punch' && who && (
        <>
          <h1>Xin chào {who.name}</h1>
          {who.state === 'in' && (
            <p className={who.stale ? 'msg warn' : 'muted'}>
              {who.stale ? `Ca hôm trước (vào lúc ${hhmm(who.since)}) chưa kết thúc. Bấm Ra ca để đóng; chủ cơ sở sẽ xem lại giờ.` : `Bạn vào ca lúc ${hhmm(who.since)}.`}
            </p>
          )}
          <div className="kiosk-cam">
            <video ref={cam.videoRef} playsInline muted />
            {!cam.ready && !cam.error && <p className="muted">Đang bật camera…</p>}
          </div>
          {cam.error ? (
            <>
              <p className="msg error" role="alert">{cam.error}</p>
              <button className="secondary" onClick={() => setAttempt((n) => n + 1)}>Thử lại</button>
            </>
          ) : (
            faceHint && <p className="msg warn">{faceHint}</p>
          )}
          {error && <p className="msg error" role="alert">{error}</p>}
          {/* Chỉ một nút, theo trạng thái thật của người này */}
          <button className="primary kiosk-big" disabled={!canShoot} onClick={() => void onPunch()}>
            {busy ? 'Đang ghi…' : who.state === 'in' ? 'RA CA' : 'VÀO CA'}
          </button>
          <button className="link" onClick={reset}>Hủy</button>
        </>
      )}

      {step === 'done' && done && (
        <>
          <h1>Đã ghi nhận</h1>
          {done.photo && <img className="kiosk-photo" alt="Ảnh vừa chụp" src={`data:image/jpeg;base64,${done.photo}`} />}
          <p className="msg ok" role="status">{done.text}</p>
          <button className="secondary" onClick={reset}>Xong</button>
        </>
      )}

      <ExitKiosk orgId={info.organization_id} onExit={() => void signOut()} />
    </main>
  );
}

function ExitKiosk({ orgId, onExit }: { orgId: string; onExit: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOwnerToExit(id, pw, orgId);
      onExit();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="kiosk-exit">
      <summary>Thoát chế độ máy chấm công (chỉ chủ cơ sở)</summary>
      <form onSubmit={submit} noValidate className="inline-form">
        <label>Email hoặc số điện thoại của chủ<input autoComplete="off" value={id} onChange={(e) => setId(e.target.value)} /></label>
        <label>Mật khẩu<input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {error && <p className="msg error" role="alert">{error}</p>}
        <button type="submit" className="secondary" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Thoát'}</button>
      </form>
    </details>
  );
}
