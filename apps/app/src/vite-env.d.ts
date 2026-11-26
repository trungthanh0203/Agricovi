/** Mã phiên bản lúc build: mã commit rút gọn và giờ build (vite.config.ts) */
declare const __APP_VERSION__: string;

/** Tệp dịch, được @lingui/vite-plugin biên dịch lúc build */
declare module '*.po' {
  export const messages: import('@lingui/core').Messages;
}
