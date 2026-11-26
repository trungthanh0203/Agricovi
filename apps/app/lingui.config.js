// Cấu hình dịch (xem docs/PHUONG_AN_VIET_ANH_APP.md). Tiếng Việt là bản gốc viết thẳng trong mã.
import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'vi',
  locales: ['vi', 'en'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['<rootDir>/src'] }],
  format: formatter({ lineNumbers: false }),
});
