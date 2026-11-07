// Đợt thử đọc ảnh hóa đơn (G2-3, quyết định 23/10/2026 + 07/11/2026): cho nhiều mô hình miễn phí đọc cùng một bộ ảnh, lưu kết quả để so sánh.
// Không đụng CSDL, không đụng app. Cách chạy xem docs/HUONG_DAN_THU_DOC_HOA_DON.md.
//   node scripts/invoice-bench/run.mjs                 # chạy mọi mô hình đã có khóa, mọi ảnh trong thư mục anh/
//   node scripts/invoice-bench/run.mjs --engines cf-gemma3,groq-scout --limit 5
//   node scripts/invoice-bench/run.mjs --force         # đọc lại cả ảnh đã có kết quả
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(DIR, 'anh');
const OUT_DIR = path.join(DIR, 'ket-qua');
const RESULTS = path.join(OUT_DIR, 'results.json');

// ---- cấu hình: đọc từ .env (cùng thư mục) hoặc biến môi trường
function loadEnv() {
  const env = { ...process.env };
  const f = path.join(DIR, '.env');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = loadEnv();

// Mô hình mặc định; thêm bằng .env: CF_MODELS=@cf/...,@cf/...  và  GROQ_MODELS=id1,id2  (xem tên đang có bằng: node scripts/invoice-bench/run.mjs --models)
const list = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const ENGINES = [
  { id: 'cf-llama32', label: 'Cloudflare · Llama 3.2 11B Vision', kind: 'cf', model: '@cf/meta/llama-3.2-11b-vision-instruct' },
  { id: 'cf-mistral31', label: 'Cloudflare · Mistral Small 3.1 24B', kind: 'cf', model: '@cf/mistralai/mistral-small-3.1-24b-instruct' },
  { id: 'cf-gemma3', label: 'Cloudflare · Gemma 3 12B', kind: 'cf', model: '@cf/google/gemma-3-12b-it' },
  ...list(env.CF_MODELS).map((m) => ({ id: `cf:${m.split('/').pop()}`, label: `Cloudflare · ${m.split('/').pop()}`, kind: 'cf', model: m })),
  ...list(env.GROQ_MODELS || env.GROQ_MODEL).map((m) => ({ id: `groq:${m.split('/').pop()}`, label: `Groq · ${m.split('/').pop()}`, kind: 'groq', model: m })),
];

const PROMPT = `Bạn đọc ảnh một hóa đơn / phiếu giao hàng / phiếu bán hàng mua vật tư nông nghiệp (phân bón, thuốc, giống, thức ăn...) của Việt Nam.
Trích xuất đúng những gì NHÌN THẤY trên ảnh, KHÔNG đoán, KHÔNG tự tính. Chỗ nào không thấy hoặc không chắc thì để null.
Chỉ trả về MỘT đối tượng JSON, không kèm lời giải thích, theo đúng khuôn:
{
  "loai_chung_tu": "hoa_don" | "phieu_giao_hang" | "phieu_ban_hang" | "khac",
  "nha_cung_cap": { "ten": string|null, "ma_so_thue": string|null, "dien_thoai": string|null, "dia_chi": string|null },
  "ma_don": string|null,
  "ngay": "YYYY-MM-DD" | null,
  "tong_tien": number|null,
  "dong_hang": [ { "ten": string, "don_vi": string|null, "so_luong": number|null, "don_gia": number|null, "thanh_tien": number|null } ],
  "ghi_chu_khong_chac": string|null
}
Quy tắc: "nha_cung_cap" là BÊN BÁN (người bán hàng), không phải người mua. "ma_don" là số hóa đơn / số phiếu / mã đơn hàng. Số tiền là số nguyên đồng, bỏ dấu chấm/phẩy ngăn cách nghìn (ví dụ 1.250.000 thành 1250000). Số lượng có thể thập phân (dấu chấm). Mỗi mặt hàng một phần tử trong "dong_hang", giữ nguyên tên hàng như in trên ảnh (có dấu tiếng Việt). Ngày theo định dạng ngày/tháng/năm của Việt Nam, đổi sang YYYY-MM-DD. Nếu không phải chứng từ mua bán thì "dong_hang" là [].`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prepare(file) {
  // thu nhỏ vừa đủ rõ chữ, tự xoay theo EXIF, JPEG ~300KB: tiết kiệm hạn mức và dưới giới hạn 4MB của các dịch vụ
  const buf = await sharp(file).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return buf;
}

function parseJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { /* thử sửa lỗi nhỏ thường gặp: dấu phẩy thừa */ }
  try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}

function textOf(result) {
  if (!result) return '';
  if (typeof result.response === 'string') return result.response;
  if (result.response && typeof result.response === 'object') return JSON.stringify(result.response);
  const c = result.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => p.text ?? '').join('');
  return '';
}

async function callCf(engine, dataUrl) {
  const acc = env.CLOUDFLARE_ACCOUNT_ID, tok = env.CLOUDFLARE_API_TOKEN;
  const url = `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${engine.model}`;
  const body = {
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
    max_tokens: 2048, temperature: 0,
  };
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw Object.assign(new Error(`HTTP ${res.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`), { status: res.status });
  return { text: textOf(j.result), usage: j.result?.usage ?? null };
}

async function callGroq(engine, dataUrl) {
  const mk = (json) => ({
    model: engine.model, temperature: 0, max_tokens: 2048,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  });
  const send = (b) => fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  let res = await send(mk(true));
  if (res.status === 400) res = await send(mk(false)); // mô hình không hỗ trợ chế độ JSON cùng ảnh: thử lại không ép
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`), { status: res.status });
  return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage ?? null };
}

async function callEngine(engine, dataUrl) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await (engine.kind === 'cf' ? callCf(engine, dataUrl) : callGroq(engine, dataUrl)); }
    catch (e) {
      if (e.status === 429 && attempt < 2) { await sleep(20_000 * (attempt + 1)); continue; } // chạm hạn mức theo phút: đợi rồi thử lại
      throw e;
    }
  }
  throw new Error('không thành công');
}

function ready(engine) {
  if (engine.kind === 'cf') return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  return Boolean(env.GROQ_API_KEY);
}

async function listModels() {
  if (env.GROQ_API_KEY) {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` } });
    const j = await r.json().catch(() => ({}));
    console.log('\n== Groq: các mô hình đang có (chỉ vài mô hình hiểu ảnh; tên thường có "vision", "vl", "scout", "maverick", "llama-4", "gemma", "qwen") ==');
    for (const m of (j.data ?? []).map((x) => x.id).sort()) console.log('  ' + m);
    if (!r.ok) console.log('  LỖI', r.status, JSON.stringify(j).slice(0, 200));
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    console.log('\n== Cloudflare: mô hình có thể hiểu ảnh hoặc cùng họ ==');
    for (let page = 1; page <= 6; page++) {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
      const j = await r.json().catch(() => ({}));
      const rows = j.result ?? [];
      if (!r.ok || rows.length === 0) { if (!r.ok) console.log('  LỖI', r.status, JSON.stringify(j).slice(0, 200)); break; }
      for (const m of rows) if (/vision|vl|-vl|gemma|llava|mistral|llama-4|llama-3\.2|qwen|pixtral|ocr|florence|uform|image-to-text/i.test(`${m.name} ${m.task?.name ?? ''}`)) console.log(`  ${m.name}   [${m.task?.name ?? ''}]`);
    }
  }
}

async function main() {
  if (process.argv.includes('--models')) return listModels();
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const force = args.includes('--force');
  const only = opt('--engines')?.split(',').map((s) => s.trim());
  const limit = Number(opt('--limit') || 0);

  const engines = ENGINES.filter((e) => (!only || only.includes(e.id)));
  const usable = engines.filter(ready);
  for (const e of engines) if (!ready(e)) console.log(`⚠ Bỏ qua "${e.label}": chưa có khóa trong .env`);
  if (usable.length === 0) { console.error('Chưa có mô hình nào dùng được. Xem hướng dẫn: docs/HUONG_DAN_THU_DOC_HOA_DON.md (bước 3).'); process.exit(1); }

  if (!fs.existsSync(IMG_DIR)) { console.error(`Chưa có thư mục ảnh: ${IMG_DIR}`); process.exit(1); }
  let files = fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (limit) files = files.slice(0, limit);
  if (files.length === 0) { console.error('Thư mục anh/ chưa có ảnh (.jpg, .png, .webp).'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {};

  // Llama 3.2 Vision của Cloudflare đòi đồng ý giấy phép Meta một lần
  if (usable.some((e) => e.id === 'cf-llama32') && !results.__llamaAgreed) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;
      await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'agree' }) });
    } catch { /* bỏ qua */ }
    results.__llamaAgreed = true;
  }

  const dead = new Set();
  console.log(`Đọc ${files.length} ảnh bằng ${usable.length} mô hình (${usable.map((e) => e.id).join(', ')})`);
  for (const [n, file] of files.entries()) {
    const img = await prepare(path.join(IMG_DIR, file));
    const dataUrl = `data:image/jpeg;base64,${img.toString('base64')}`;
    results[file] ??= {};
    for (const e of usable) {
      if (dead.has(e.id)) continue;
      if (!force && results[file][e.id]?.parsed) continue;
      const t0 = Date.now();
      try {
        const { text, usage } = await callEngine(e, dataUrl);
        const parsed = parseJson(text);
        results[file][e.id] = { ok: Boolean(parsed), parsed, raw: parsed ? undefined : text, ms: Date.now() - t0, usage };
        console.log(`[${n + 1}/${files.length}] ${file} · ${e.id}: ${parsed ? `đọc được ${parsed.dong_hang?.length ?? 0} dòng` : 'KHÔNG ra JSON'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (err) {
        results[file][e.id] = { ok: false, error: String(err.message ?? err), ms: Date.now() - t0 };
        if ([401, 403, 404].includes(err.status)) { dead.add(e.id); console.log(`   → không dùng được "${e.label}" (tài khoản không có quyền hoặc mô hình không còn): bỏ qua mô hình này ở các ảnh sau`); }
        console.log(`[${n + 1}/${files.length}] ${file} · ${e.id}: LỖI ${String(err.message ?? err).slice(0, 160)}`);
      }
      fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1)); // lưu sau từng lần: dừng giữa chừng không mất
      await sleep(e.kind === 'groq' ? 2500 : 600);
    }
  }
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
  console.log('\nXong. Bước tiếp: node scripts/invoice-bench/report.mjs  (rồi mở scripts/invoice-bench/ket-qua/so-sanh.html)');
}

main().catch((e) => { console.error(e); process.exit(1); });
