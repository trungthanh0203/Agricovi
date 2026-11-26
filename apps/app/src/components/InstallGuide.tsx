import { useEffect, useState } from 'react';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';

type Platform = 'desktop' | 'android' | 'ios';

const PLATFORMS: { id: Platform; icon: string; title: MessageDescriptor; steps: MessageDescriptor[]; result: MessageDescriptor }[] = [
  {
    id: 'desktop', icon: '💻', title: msg`Máy tính (Chrome / Edge)`,
    steps: [
      msg`Mở trang web này bằng Chrome hoặc Edge.`,
      msg`Ở cuối thanh địa chỉ, bấm vào biểu tượng "Cài đặt" (hình máy tính có mũi tên).`,
      msg`Bấm "Cài đặt" trong hộp thoại hiện ra.`,
    ],
    result: msg`App sẽ có biểu tượng riêng trên màn hình/Dock, mở lên không cần trình duyệt.`,
  },
  {
    id: 'android', icon: '🤖', title: msg`Điện thoại Android (Chrome)`,
    steps: [
      msg`Mở trang web này bằng Chrome.`,
      msg`Chờ vài giây, bảng "Thêm vào Màn hình chính" sẽ tự hiện, bấm vào đó. Nếu không thấy, bấm menu 3 chấm ở góc trên rồi chọn "Cài đặt ứng dụng".`,
      msg`Bấm "Cài đặt" hoặc "Thêm".`,
    ],
    result: msg`Biểu tượng app xuất hiện ngay ở màn hình chính điện thoại.`,
  },
  {
    id: 'ios', icon: '🍎', title: msg`iPhone / iPad (Safari)`,
    steps: [
      msg`Mở trang web này bằng Safari (bắt buộc: Chrome trên iPhone không cài được).`,
      msg`Bấm nút Chia sẻ (hình vuông có mũi tên đi lên) ở thanh dưới cùng.`,
      msg`Kéo xuống, chọn "Thêm vào MH chính" (Add to Home Screen), rồi bấm "Thêm".`,
    ],
    result: msg`Biểu tượng app xuất hiện ở màn hình chính, mở lên như một app bình thường.`,
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

type Kind = 'phone' | 'desktop';
const kindOf = (p: Platform): Kind => (p === 'desktop' ? 'desktop' : 'phone');
const KIND_LABEL: Record<Kind, MessageDescriptor> = { phone: msg`📱 Cài cho điện thoại`, desktop: msg`💻 Cài cho máy tính` };

/**
 * Hướng dẫn cài app về máy (trang đăng nhập/đăng ký). Có HAI lựa chọn: cài cho điện thoại hoặc cho máy tính (D222); mở sẵn lựa chọn đúng với
 * thiết bị đang dùng, đổi được. Hai cách cài dùng cùng một app và cùng dữ liệu. Nếu trình duyệt cho phép cài ngay (Chrome, Edge) thì có thêm nút
 * "Cài app ngay" (chỉ hiện khi lựa chọn trùng với thiết bị đang dùng). Không hiện khi app đã được cài.
 */
export function InstallGuide() {
  const { t, i18n } = useLingui();
  const [platform] = useState<Platform>(detectPlatform);
  const [kind, setKind] = useState<Kind>(() => kindOf(detectPlatform()));
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
  const here = kind === kindOf(platform);
  return (
    <section className="install" aria-labelledby="install-title">
      <h2 id="install-title"><Trans>📲 Cài app về máy để dùng tiện hơn</Trans></h2>
      <div className="seg" role="group" aria-label={t`Chọn nơi cài`}>
        {(['phone', 'desktop'] as Kind[]).map((k) => (
          <button key={k} type="button" className={k === kind ? 'primary' : 'secondary'} aria-pressed={k === kind} onClick={() => setKind(k)}>{i18n._(KIND_LABEL[k])}</button>
        ))}
      </div>
      <p className="muted"><Trans>Hai cách cài dùng cùng một tài khoản và cùng dữ liệu: đăng nhập ở đâu cũng thấy như nhau.</Trans></p>
      {here && evt && (
        <button className="primary" onClick={() => { void evt.prompt().then(() => evt.userChoice).then((c) => { if (c.outcome === 'accepted') setEvt(null); }); }}>
          <Trans>Cài app ngay</Trans>
        </button>
      )}
      {!here && <p className="msg warn">{kind === 'desktop' ? t`Muốn cài cho máy tính, hãy mở trang này bằng máy tính rồi làm theo các bước dưới đây.` : t`Muốn cài cho điện thoại, hãy mở trang này bằng điện thoại rồi làm theo các bước dưới đây.`}</p>}
      {PLATFORMS.filter((p) => kindOf(p.id) === kind).map((p) => (
        <details key={p.id} className="install-card" open>
          <summary><span className="install-ico" aria-hidden>{p.icon}</span><span className="install-name">{i18n._(p.title)}</span></summary>
          <ol>{p.steps.map((s) => <li key={s.id}>{i18n._(s)}</li>)}</ol>
          <p className="install-result">→ {i18n._(p.result)}</p>
        </details>
      ))}
    </section>
  );
}
