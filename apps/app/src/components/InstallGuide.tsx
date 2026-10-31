import { useEffect, useState } from 'react';

type Platform = 'desktop' | 'android' | 'ios';

const PLATFORMS: { id: Platform; icon: string; title: string; steps: string[]; result: string }[] = [
  {
    id: 'desktop', icon: '💻', title: 'Máy tính (Chrome / Edge)',
    steps: [
      'Mở trang web này bằng Chrome hoặc Edge.',
      'Ở cuối thanh địa chỉ, bấm vào biểu tượng "Cài đặt" (hình máy tính có mũi tên).',
      'Bấm "Cài đặt" trong hộp thoại hiện ra.',
    ],
    result: 'App sẽ có biểu tượng riêng trên màn hình/Dock, mở lên không cần trình duyệt.',
  },
  {
    id: 'android', icon: '🤖', title: 'Điện thoại Android (Chrome)',
    steps: [
      'Mở trang web này bằng Chrome.',
      'Chờ vài giây, bảng "Thêm vào Màn hình chính" sẽ tự hiện, bấm vào đó. Nếu không thấy, bấm menu 3 chấm ở góc trên rồi chọn "Cài đặt ứng dụng".',
      'Bấm "Cài đặt" hoặc "Thêm".',
    ],
    result: 'Biểu tượng app xuất hiện ngay ở màn hình chính điện thoại.',
  },
  {
    id: 'ios', icon: '🍎', title: 'iPhone / iPad (Safari)',
    steps: [
      'Mở trang web này bằng Safari (bắt buộc: Chrome trên iPhone không cài được).',
      'Bấm nút Chia sẻ (hình vuông có mũi tên đi lên) ở thanh dưới cùng.',
      'Kéo xuống, chọn "Thêm vào MH chính" (Add to Home Screen), rồi bấm "Thêm".',
    ],
    result: 'Biểu tượng app xuất hiện ở màn hình chính, mở lên như một app bình thường.',
  },
];

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Đã cài rồi (đang chạy như app độc lập) thì không cần hướng dẫn nữa */
function installed(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/**
 * Hướng dẫn cài app về máy (trang đăng nhập/đăng ký). Mở sẵn mục đúng với thiết bị đang dùng; nếu trình duyệt cho phép cài ngay
 * (Chrome, Edge) thì có thêm nút "Cài app ngay". Không hiện khi app đã được cài.
 */
export function InstallGuide() {
  const [platform] = useState<Platform>(detectPlatform);
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [done, setDone] = useState(installed());

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => { setDone(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (done) return null;
  return (
    <section className="install" aria-labelledby="install-title">
      <h2 id="install-title">📲 Cài app về máy để dùng tiện hơn</h2>
      {evt && (
        <button className="primary" onClick={() => { void evt.prompt().then(() => evt.userChoice).then((c) => { if (c.outcome === 'accepted') setEvt(null); }); }}>
          Cài app ngay
        </button>
      )}
      {PLATFORMS.map((p) => (
        <details key={p.id} className="install-card" open={p.id === platform}>
          <summary><span className="install-ico" aria-hidden>{p.icon}</span><span className="install-name">{p.title}</span></summary>
          <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="install-result">→ {p.result}</p>
        </details>
      ))}
    </section>
  );
}
