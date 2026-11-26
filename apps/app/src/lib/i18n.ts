import { i18n } from '@lingui/core';
import { getLang, LANG_KEY, type Lang } from './format';

/** Chưa dịch hết app nên chưa mở cho khách: chỉ hiện nút đổi ngôn ngữ khi chạy thử, hoặc máy đã từng chọn (mở app với ?lang=en). Xong bước 1 thì đổi thành true. */
const PUBLIC_SWITCH = false;

const loaders: Record<Lang, () => Promise<typeof import('../locales/vi.po')>> = {
  vi: () => import('../locales/vi.po'),
  en: () => import('../locales/en.po'),
};

/** Nạp đúng một gói ngôn ngữ trước khi vẽ app. Nạp lỗi thì dùng tiếng Việt. */
export async function initI18n(): Promise<void> {
  const asked = new URLSearchParams(window.location.search).get('lang');
  if (asked === 'vi' || asked === 'en') store(asked);
  let lang = getLang();
  let catalog;
  try { catalog = await loaders[lang](); } catch { lang = 'vi'; catalog = await loaders.vi(); }
  i18n.loadAndActivate({ locale: lang, messages: catalog.messages });
  document.documentElement.lang = lang;
}

function store(lang: Lang): boolean {
  try { localStorage.setItem(LANG_KEY, lang); return true; } catch { return false; }
}

export function showLangSwitch(): boolean {
  try { return PUBLIC_SWITCH || import.meta.env.DEV || localStorage.getItem(LANG_KEY) !== null; } catch { return false; }
}

/** Đổi ngôn ngữ rồi tải lại app (bản ghi chờ gửi nằm trong IndexedDB, không mất) */
export function setLang(lang: Lang): void {
  if (!store(lang)) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}
