// Dùng: node --import tsx --import ./scripts/lingui-test-loader.mjs --test …  Test chạy bằng tiếng Việt (chữ gốc trong mã).
import { createRequire, register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./lingui-test-hooks.mjs', import.meta.url);

const require = createRequire(new URL('../apps/app/package.json', import.meta.url));
const { i18n } = await import(pathToFileURL(require.resolve('@lingui/core')).href.replace(/\.cjs$/, '.mjs'));
i18n.loadAndActivate({ locale: 'vi', messages: {} });
