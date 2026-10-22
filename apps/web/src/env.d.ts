/// <reference path="../.astro/types.d.ts" />
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare namespace App {
  interface Locals {
    /** Ngôn ngữ của yêu cầu: 'en' khi địa chỉ bắt đầu bằng /en (middleware) */
    lang: 'vi' | 'en';
    /** Đã xử lý ở middleware (tránh làm lại khi rewrite) */
    i18nPass?: boolean;
    /** Đường dẫn gốc tiếng Việt (đã bỏ /en) */
    pathVi: string;
    /** Bản dịch của quản trị (chỉ có khi lang = 'en') */
    tr?: import('./lib/translations').Translations;
  }
}
