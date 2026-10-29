import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { countFaces, describeFace, faceDistance, loadFace } from '../lib/face';
import { kioskCheck, kioskCycles, kioskFaceCheck, kioskPunch, kioskSetPin, type KioskCycle, type KioskInfo } from '../lib/kiosk';

type Step = 'login' | 'setpin' | 'enroll' | 'punch' | 'done';
type FaceApi = typeof import('@vladmandic/face-api');
type ModelState = 'loading' | 'ready' | 'failed';
interface Who { name: string; state: 'in' | 'out'; since: string | null; stale: boolean; isOwner: boolean; cycleName: string | null; lastCycle: string | null }
const GENERAL = 'general'; // “Việc chung”: không thuộc vụ nào
interface Shot { photo: string; descriptor: number[] | null }

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
const ENROLL_PROMPTS = ['Nhìn thẳng vào camera', 'Hơi nghiêng mặt sang trái', 'Hơi nghiêng mặt sang phải'];
const MAX_TRIES = 3; // số lần chụp tối đa khi khuôn mặt chưa khớp; lần cuối vẫn ghi công nhưng gắn cờ

/** Tải mô hình nhận diện khuôn mặt ngay khi mở máy chấm công (để lúc chấm công không phải chờ). */
function useFaceModel() {
  const [api, setApi] = useState<FaceApi | null>(null);
  const [state, setState] = useState<ModelState>('loading');
  useEffect(() => {
    let live = true;
    const timeout = window.setTimeout(() => { if (live) setState((s) => (s === 'loading' ? 'failed' : s)); }, 150000);
    loadFace().then((a) => { if (live) { setApi(a); setState('ready'); } }).catch(() => { if (live) setState('failed'); });
    return () => { live = false; window.clearTimeout(timeout); };
  }, []);
  return { api, state };
}

/** Camera trước + đếm số khuôn mặt trong khung (khi mô hình đã sẵn sàng). faces = null: chưa/không kiểm được. */
function useCamera(on: boolean, attempt: number, api: FaceApi | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<number | null>(null);
  const warmed = useRef(false);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
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
        if (!dead) setReady(true);
      } catch {
        if (!dead) setError('Chưa dùng được camera. Hãy cho phép trang này dùng camera (biểu tượng ổ khóa cạnh địa chỉ), rồi bấm Thử lại.');
      }
    })();
    return () => {
      dead = true;
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
      setFaces(null);
    };
  }, [on, attempt]);

  // Đếm khuôn mặt mỗi ~0,7 giây khi camera và mô hình đều sẵn sàng
  useEffect(() => {
    if (!on || !ready || !api) return;
    let dead = false;
    let timer = 0;
    const tick = async () => {
      const v = videoRef.current;
      if (dead || !v) return;
      try {
        const n = await countFaces(api, v);
        setFaces(n);
        // Lần đầu thấy một khuôn mặt: tính thử dấu vân ngay (lần đầu chậm), để lúc bấm Chụp không phải chờ lâu
        if (n === 1 && !warmed.current) { warmed.current = true; void describeFace(api, v).catch(() => undefined); }
      } catch { setFaces(null); }
      timer = window.setTimeout(() => void tick(), 700);
    };
    void tick();
    return () => { dead = true; window.clearTimeout(timer); };
  }, [on, ready, api]);

  /** Chụp một khung hình thành JPEG nhỏ (base64, không tiền tố) và tính dấu vân khuôn mặt */
  const shoot = useCallback(async (): Promise<Shot | null> => {
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
    const photo = c.toDataURL('image/jpeg', 0.6).split(',')[1];
    if (!photo) return null;
    const descriptor = api ? await describeFace(api, v).catch(() => null) : null;
    return { photo, descriptor };
  }, [api]);

  return { videoRef, ready, error, faces, shoot };
}

/**
 * Giao diện duy nhất của điện thoại làm MÁY CHẤM CÔNG (D111, D112). Không có đường vào các màn quản lý: thiết bị đăng nhập bằng tài khoản
 * thiết bị, máy chủ chỉ cho gọi các hàm kiosk_*. Muốn thoát phải nhập mật khẩu chủ cơ sở.
 */
export function KioskScreen({ info }: { info: KioskInfo }) {
  const { signOut } = useAuth();
  const model = useFaceModel();
  const [step, setStep] = useState<Step>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [pin2, setPin2] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [punchId, setPunchId] = useState('');
  const [tries, setTries] = useState(1);
  const [cycles, setCycles] = useState<KioskCycle[]>([]);
  const [cycleChoice, setCycleChoice] = useState(''); // id vụ, GENERAL, hoặc '' (chưa chọn)
  const [armed, setArmed] = useState(true); // cho phép tự chụp khi thấy mặt; tắt sau mỗi lần chụp, bật lại khi người đó rời khung
  const [shots, setShots] = useState<Shot[]>([]);
  const [done, setDone] = useState<{ text: string; photo: string } | null>(null);
  // Kết quả Vào/Ra ca gần nhất: hiện to ở màn kết quả và nhắc lại ở màn đầu một lúc để người làm chắc chắn đã được ghi
  const [result, setResult] = useState<{ action: 'in' | 'out'; name: string; time: string; day: string; late: boolean; photo: string; at: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [attempt, setAttempt] = useState(0); // tăng số này để bật lại camera
  const cam = useCamera(step === 'punch' || step === 'enroll', attempt, model.api);

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
    setStep('login'); setPhone(''); setPin(''); setCode(''); setPin2(''); setConsent(false); setWho(null); setShots([]); setTries(1);
    setError(null); setDone(null); setBusy(false);
  }, []);
  // Bước chụp ảnh bỏ dở thì quay về màn đầu (xóa PIN khỏi bộ nhớ); màn kết quả tự đóng sau 6 giây
  useEffect(() => {
    if (step === 'login' || step === 'setpin') return;
    const t = window.setTimeout(reset, step === 'done' ? 12000 : step === 'enroll' ? 180000 : 90000);
    return () => window.clearTimeout(t);
  }, [step, reset]);

  // Đổi bước thì cuộn lên đầu để người dùng luôn thấy nội dung mới (kết quả, lỗi)
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  // Dòng nhắc kết quả gần nhất ở màn đầu tự mất sau 1 phút
  useEffect(() => {
    if (!result) return;
    const left = result.at + 60000 - Date.now();
    const t = window.setTimeout(() => setResult((cur) => (cur && cur.at === result.at && step !== 'done' ? null : cur)), Math.max(left, 1000));
    return () => window.clearTimeout(t);
  }, [result, step]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!phone.trim() || !pin.trim()) return setError('Hãy nhập số điện thoại và PIN.');
    setBusy(true);
    const r = await kioskCheck(phone, pin);
    setBusy(false);
    if (!r.ok) return setError(r.message ?? 'Có lỗi, hãy thử lại.');
    const w: Who = {
      name: String(r.name), state: r.state as 'in' | 'out', since: (r.since as string | null) ?? null, stale: Boolean(r.stale),
      isOwner: Boolean(r.is_owner), cycleName: (r.cycle_name as string | null) ?? null, lastCycle: (r.last_cycle as string | null) ?? null,
    };
    setWho(w);
    setArmed(true);
    setCycleChoice('');
    if (w.state === 'out') {
      // Vào ca: chọn vụ đang làm để tính chi phí nhân công theo vụ. Chọn sẵn vụ lần trước, hoặc vụ duy nhất.
      const list = await kioskCycles();
      setCycles(list);
      const prev = list.find((c) => c.id === w.lastCycle);
      setCycleChoice(prev ? prev.id : list.length === 1 && list[0] ? list[0].id : list.length === 0 ? GENERAL : '');
    }
    setPunchId(crypto.randomUUID());
    setTries(1);
    setDone(null);
    setStep('punch');
  }

  async function savePin(face?: { descriptors: number[][]; photo: string }) {
    setBusy(true);
    const r = await kioskSetPin(phone, code, pin, face);
    setBusy(false);
    if (!r.ok) {
      setShots([]);
      setStep('setpin');
      return setError(r.message ?? 'Có lỗi, hãy thử lại.');
    }
    reset();
    setDone({ text: 'Đã đặt PIN. Bây giờ bạn nhập số điện thoại và PIN để vào ca.', photo: '' });
  }

  function onSetPin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN gồm 4 đến 6 chữ số.');
    if (pin !== pin2) return setError('Hai lần nhập PIN chưa giống nhau.');
    if (model.state === 'failed') return void savePin(); // máy không nhận diện được khuôn mặt: chỉ đặt PIN
    if (!consent) return setError('Hãy tích đồng ý cho lưu dữ liệu khuôn mặt để chấm công.');
    setShots([]);
    setStep('enroll');
  }

  async function onEnrollShot() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const s = await cam.shoot();
    setBusy(false);
    if (!s || !s.descriptor) return setError('Chưa thấy rõ khuôn mặt của bạn. Hãy nhìn thẳng vào camera, đủ sáng, rồi chụp lại.');
    const next = [...shots, s];
    if (next.length < 3) { setShots(next); return; }
    // ba ảnh phải là cùng một người
    const d = next.map((x) => x.descriptor as number[]);
    const [d0, d1, d2] = d;
    if (!d0 || !d1 || !d2 || Math.max(faceDistance(d0, d1), faceDistance(d0, d2), faceDistance(d1, d2)) > 0.5) {
      setShots([]);
      return setError('Ba ảnh chưa giống nhau (có thể có người khác vào khung hình). Hãy chụp lại từ đầu.');
    }
    setShots(next);
    await savePin({ descriptors: d, photo: next[0]?.photo ?? '' });
  }

  async function onPunch() {
    if (busy || !who) return;
    setBusy(true);
    setError(null);
    const s = await cam.shoot();
    if (!s) { setBusy(false); return setError('Chưa chụp được ảnh. Hãy đợi camera sáng lên rồi bấm lại.'); }
    // Khuôn mặt chưa khớp thì cho chụp lại (tối đa MAX_TRIES lần); lần cuối vẫn ghi công và gắn cờ cho chủ xem
    if (s.descriptor && tries < MAX_TRIES) {
      const f = await kioskFaceCheck(phone, pin, s.descriptor);
      if (f.ok && f.state === 'mismatch') {
        setTries(tries + 1);
        setBusy(false);
        return setError('Chưa nhận ra bạn. Hãy nhìn thẳng vào camera, đủ sáng, bỏ khẩu trang/nón rồi bấm lại.');
      }
    }
    const action = who.state === 'in' ? 'out' : 'in';
    const r = await kioskPunch(phone, pin, action, punchId, s.photo, cam.faces === null ? null : cam.faces === 1, s.descriptor, tries, action === 'in' && cycleChoice !== GENERAL ? cycleChoice || null : null);
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
    setDone(null);
    setResult({
      action, name: who.name, time: hhmm(String(r.at)), late: Boolean(r.stale), photo: s.photo, at: Date.now(),
      day: new Date(String(r.at)).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }),
    });
    setPin('');
    setStep('done');
  }

  // Tự chụp: thấy đúng một khuôn mặt giữ yên khoảng 1 giây thì chụp luôn, người làm không phải bấm nút (nút vẫn còn để bấm tay)
  const punchRef = useRef(onPunch);
  punchRef.current = onPunch;
  useEffect(() => {
    if (step === 'punch' && cam.faces === 0) setArmed(true);
  }, [step, cam.faces]);
  const autoReady = step === 'punch' && armed && !busy && cam.ready && model.state === 'ready' && cam.faces === 1 && !(who?.state === 'out' && cycleChoice === '');
  useEffect(() => {
    if (!autoReady) return;
    const t = window.setTimeout(() => { setArmed(false); void punchRef.current(); }, 1200);
    return () => window.clearTimeout(t);
  }, [autoReady]);

  const faceHint =
    model.state !== 'ready' || cam.faces === null ? null
      : cam.faces === 0 ? 'Hãy đưa khuôn mặt vào khung.'
        : cam.faces > 1 ? 'Chỉ một người đứng trước camera.' : step === 'punch' && armed ? 'Giữ yên, máy sắp tự chụp…' : null;
  // Mô hình đang tải thì chờ; tải lỗi thì vẫn chấm công được (không kiểm khuôn mặt, chủ xem ảnh bằng mắt)
  const needCycle = who?.state === 'out' && cycleChoice === '';
  const canShoot = cam.ready && !busy && !needCycle && model.state !== 'loading' && (cam.faces === null || cam.faces === 1);

  const camera = (
    <>
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
        <>
          {model.state === 'loading' && <p className="muted">Đang chuẩn bị nhận diện khuôn mặt (lần đầu mất vài chục giây)…</p>}
          {model.state === 'failed' && <p className="msg warn">Máy này chưa nhận diện được khuôn mặt. Vẫn chấm công được, chủ cơ sở sẽ xem ảnh để đối chiếu.</p>}
          {faceHint && <p className="msg warn">{faceHint}</p>}
        </>
      )}
    </>
  );

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
          {result && (
            <p className="msg ok" role="status">
              ✔ Vừa ghi: {result.name} đã <strong>{result.action === 'in' ? 'VÀO' : 'RA'} ca lúc {result.time}</strong>
            </p>
          )}
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
          <p className="muted">Nhờ chủ cơ sở cấp mã (6 số, dùng một lần trong 24 giờ). PIN gồm 4 đến 6 chữ số, chỉ mình bạn biết, đừng cho ai mượn. Sau đó máy sẽ chụp 3 ảnh khuôn mặt của bạn để làm mẫu.</p>
          <form onSubmit={onSetPin} noValidate className="inline-form">
            <label>Số điện thoại<input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label>Mã chủ cấp<input inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
            <label>PIN mới<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
            <label>Nhập lại PIN mới<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
            {model.state !== 'failed' && (
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                Tôi đồng ý cho cơ sở lưu dữ liệu khuôn mặt của tôi để chấm công. Chủ cơ sở xóa dữ liệu này khi tôi nghỉ việc hoặc khi tôi yêu cầu.
              </label>
            )}
            {error && <p className="msg error" role="alert">{error}</p>}
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang lưu…' : model.state === 'failed' ? 'Lưu PIN' : 'Tiếp: chụp khuôn mặt'}</button>
              <button type="button" className="secondary" onClick={reset}>Quay lại</button>
            </div>
          </form>
        </>
      )}

      {step === 'enroll' && (
        <>
          <h1>Chụp khuôn mặt làm mẫu</h1>
          <p className="muted">Ảnh {Math.min(shots.length + 1, 3)}/3: <strong>{ENROLL_PROMPTS[Math.min(shots.length, 2)]}</strong>. Bỏ khẩu trang, nón; đứng nơi đủ sáng.</p>
          {camera}
          {error && <p className="msg error" role="alert">{error}</p>}
          <button className="primary kiosk-big" disabled={!canShoot} onClick={() => void onEnrollShot()}>
            {busy ? 'Đang xử lý…' : `Chụp ảnh ${Math.min(shots.length + 1, 3)}/3`}
          </button>
          <button className="link" onClick={reset}>Hủy</button>
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
          {who.state === 'in' && who.cycleName && <p className="muted">Đang làm cho: <strong>{who.cycleName}</strong></p>}
          {who.state === 'out' && cycles.length > 0 && (
            <fieldset className="kiosk-cycles">
              <legend>Hôm nay bạn làm cho vụ nào?</legend>
              {cycles.map((c) => (
                <label key={c.id} className="check"><input type="radio" name="cycle" checked={cycleChoice === c.id} onChange={() => setCycleChoice(c.id)} />{c.name}</label>
              ))}
              <label className="check"><input type="radio" name="cycle" checked={cycleChoice === GENERAL} onChange={() => setCycleChoice(GENERAL)} />Việc chung (không thuộc vụ nào)</label>
            </fieldset>
          )}
          {camera}
          {error && <p className="msg error" role="alert">{error}</p>}
          {/* Chỉ một nút, theo trạng thái thật của người này */}
          <button className="primary kiosk-big" disabled={!canShoot} onClick={() => void onPunch()}>
            {busy ? 'Đang ghi…' : who.state === 'in' ? 'RA CA' : 'VÀO CA'}
          </button>
          <button className="link" onClick={reset}>Hủy</button>
          {who.isOwner && (
            <button className="secondary kiosk-leave" disabled={busy} onClick={() => {
              if (window.confirm('Thoát chế độ máy chấm công trên điện thoại này? Muốn dùng lại phải liên kết lại từ tài khoản chủ.')) void signOut();
            }}>Thoát chế độ máy chấm công (chủ cơ sở)</button>
          )}
        </>
      )}

      {step === 'done' && result && (
        <div className="kiosk-result" role="status" aria-live="polite">
          <div className="kiosk-tick">✔</div>
          <h1>{result.action === 'in' ? 'ĐÃ VÀO CA' : 'ĐÃ RA CA'}</h1>
          <p className="kiosk-name">{result.name}</p>
          <p className="kiosk-time">{result.time}</p>
          <p className="muted">{result.day}</p>
          {result.late && <p className="msg warn">Ca hôm trước chưa kết thúc, chủ cơ sở sẽ xem lại giờ.</p>}
          {result.photo && <img className="kiosk-photo" alt="Ảnh vừa chụp" src={`data:image/jpeg;base64,${result.photo}`} />}
          <button className="primary kiosk-big" onClick={reset}>Xong</button>
        </div>
      )}

    </main>
  );
}
