// Hook nạp mô-đun cho test: tệp của app có dùng macro dịch thì biên dịch macro (sau khi tsx đã đổi TypeScript sang JavaScript).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../apps/app/package.json', import.meta.url));
const appDir = fileURLToPath(new URL('../apps/app/', import.meta.url));

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.includes('/apps/app/src/') || !result.source) return result;
  const source = String(result.source);
  if (!/@lingui\/(core|react)\/macro/.test(source)) return result;
  const babel = require('@babel/core');
  const filename = fileURLToPath(url.split('?')[0]);
  const { code } = babel.transformSync(source, {
    filename, cwd: appDir, babelrc: false, configFile: false,
    parserOpts: { plugins: ['typescript'] },
    plugins: [[require.resolve('@lingui/babel-plugin-lingui-macro'), { linguiConfig: require('@lingui/conf').getConfig({ cwd: appDir }) }]],
  });
  // nguồn nhận được có thể còn là TypeScript: đổi sang JavaScript bằng esbuild (đi kèm Vite)
  const js = require('esbuild').transformSync(code, { loader: 'ts', format: 'esm', sourcemap: 'inline', sourcefile: filename });
  return { ...result, format: 'module', source: js.code };
}
