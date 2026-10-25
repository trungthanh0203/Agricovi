// Song ngữ Việt – Anh cho WEBSITE (W8, D71). Dùng chung cho máy chủ (dịch HTML trước khi gửi) và trình duyệt (dịch nội dung chèn bằng mã).
//
// Nguyên tắc:
// - Tiếng Việt là bản gốc. Khóa là câu tiếng Việt đã chuẩn hóa khoảng trắng; không có khóa thì GIỮ NGUYÊN (không bao giờ làm mất chữ).
// - Chỉ dịch CHỮ HIỂN THỊ (nội dung văn bản, placeholder, title, aria-label, alt). KHÔNG dịch giá trị gửi lên máy chủ (value, tên trường, mã).
// - Nội dung do người dùng nhập (tên sản phẩm, mô tả, tin đăng…) giữ nguyên ngôn ngữ gốc; chỉ khi toàn bộ đoạn trùng một câu có sẵn mới bị dịch.
// - Nội dung quản trị soạn (trang, banner, bài viết, danh mục) có cột tiếng Anh riêng (migration 0052); chưa nhập thì hiện tiếng Việt.
import { EN_UI } from './i18n-ui';
import { EN_PAGES } from './i18n-pages';
import { EN_MSGS } from './i18n-msgs';

export type Lang = 'vi' | 'en';
export const LANGS: Lang[] = ['vi', 'en'];
/** Tiền tố đường dẫn của tiếng Anh: /en/… */
export const EN_PREFIX = '/en';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const EXACT: Record<string, string> = Object.fromEntries(Object.entries({ ...EN_UI, ...EN_PAGES, ...EN_MSGS }).map(([k, v]) => [norm(k), v]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Số tiền kiểu Việt (40.000đ) → kiểu Anh (40,000 VND) */
const money = (_m: string, n: string) => `${n.replace(/\./g, ',')} VND`;

// Quy tắc theo mẫu: chỉ áp dụng khi có SỐ đi kèm nên không làm hỏng văn bản người dùng
const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/(\d{1,3}(?:\.\d{3})+|\d+)đ(?![A-Za-zÀ-ỹ])/g, money],
  [/(\d+(?:[.,]\d+)?) ngày còn lại/g, '$1 days left'],
  [/còn (\d+) ngày/g, '$1 days left'],
  [/Tháng (\d{1,2})\/(\d{4})/g, (_m, mo, y) => `${MONTHS[Number(mo) - 1] ?? 'Month ' + mo} ${y}`],
  [/Tháng (\d{1,2})$/g, (_m, mo) => `Month ${mo}`],
  [/(\d+) báo giá mới/g, '$1 new quotes'],
  [/(\d+) báo giá/g, '$1 quote(s)'],
  [/(\d+) người quan tâm/g, '$1 interested'],
  [/(\d+) chưa xử lý/g, '$1 unprocessed'],
  [/(\d+) yêu cầu báo giá mới/g, '$1 new quote requests'],
  [/(\d+) yêu cầu báo giá/g, '$1 quote requests'],
  [/(\d+) đánh giá từ khách đã mua/g, '$1 reviews from verified buyers'],
  [/(\d+) đánh giá/g, '$1 review(s)'],
  [/(\d+) nhà cung cấp/g, '$1 supplier(s)'],
  [/(\d+) cơ sở/g, '$1 producer(s)'],
  [/(\d+) sản phẩm/g, '$1 product(s)'],
  [/(\d+) vật tư/g, '$1 supply item(s)'],
  [/(\d+) hoàn tất/g, '$1 completed'],
  [/(\d+) hủy\/từ chối/g, '$1 cancelled/declined'],
  [/(\d+) đơn mới/g, '$1 new order(s)'],
  [/(\d+) đơn\b/g, '$1 order(s)'],
  [/(\d+) lần\b/g, '$1 time(s)'],
  [/(\d+) giờ\b/g, '$1 h'],
  [/(\d+) ngày qua/g, 'last $1 days'],
  [/(\d+) ngày\b/g, '$1 days'],
  [/(\d+) người\b/g, '$1 people'],
  [/^\(cập nhật (.+)\)$/, '(updated $1)'],
  [/^Nhà vườn và hợp tác xã cài ứng dụng (.+) lên màn hình chính để ghi chép mọi lúc, kể cả khi mất mạng\.$/, 'Growers and cooperatives install $1 on their home screen to keep records anytime, even offline.'],
  [/^(\d+) tin\. Khách xem được danh sách;$/, '$1 listing(s). Visitors can see the list;'],
  [/^Không tìm thấy kết quả cho "(.*)"\.$/, 'No results found for "$1".'],
  [/^Không tìm thấy (.+) cho "(.*)"\.$/, 'No $1 found for "$2".'],
  [/^(.+) trên Agricovi\.$/, '$1 on Agricovi.'],
  [/^🛒 Giỏ hàng \((\d+)\)$/, '🛒 Cart ($1)'],
  [/^Vật tư \((\d+)\)$/, 'Items ($1)'],
  [/^Tin cần mua phù hợp với sản phẩm của bạn \((\d+)\)$/, 'Buy listings that match your products ($1)'],
  [/^Từ (?=\d)/, 'From '],
  [/^Hạn (?=\d)/, 'Expires '],
  [/^Hạn tin (?=\d)/, 'Listing expires '],
  [/^Thời gian: /, 'Time: '],
  [/^Đã gửi thư xác nhận tới (.+)$/, 'Confirmation email sent to $1'],
  [/^Xin chào, (.+)$/, 'Hello, $1'],
  [/^Tìm hiểu về (.+)$/, 'About $1'],
  [/^Tìm "(.*)"$/, 'Search "$1"'],
  [/^Hồ sơ được duyệt ngày (.+)$/, 'Profile approved on $1'],
  [/^Thông tin chụp lúc cơ sở bấm công khai \((.+), bản (\d+)\)\.\s*(.*)$/, 'Snapshot taken when the producer published it ($1, version $2). $3'],
  [/^Gian hàng đăng tối đa (\d+) vật tư trong giai đoạn này\.$/, 'A shop can list at most $1 supply items at this stage.'],
  [/^Bạn đang có quá nhiều tin còn hiệu lực \(tối đa (\d+) tin cùng loại\)\. Hãy đóng bớt tin cũ\.$/, 'You have too many active listings (maximum $1 of the same type). Please close some old ones.'],
  [/^Số lượng chốt phải lớn hơn 0 và không vượt số lượng đặt \((.+)\)\.$/, 'The agreed quantity must be above 0 and not exceed the ordered quantity ($1).'],
  [/^(.+) không được chứa số điện thoại, email, đường dẫn hoặc tài khoản mạng xã hội\. Liên hệ sẽ được mở khi hai bên cùng đồng ý trong hộp thư\.$/, (_m, w) => `${translateSegment(w)} must not contain phone numbers, emails, links or social media accounts. Contact details are shared only when both sides agree in the inbox.`],
  [/^Địa chỉ "(.+)" đã dành cho chức năng khác\. Hãy chọn tên khác\.$/, 'The address "$1" is reserved. Please choose another name.'],
];

const isFull = (re: RegExp) => re.source.startsWith('^') && re.source.endsWith('$');
const FULL_RULES = RULES.filter(([re]) => isFull(re));
const PART_RULES = RULES.filter(([re]) => !isFull(re));
const EMOJI_PREFIX = /^([^\p{L}\p{N}]{1,6}\s+)(.+)$/u;
const decodeEnt = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const HAS_VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

/** extra: cụm từ do quản trị nhập thêm (bảng site_translations, loại glossary) — ưu tiên hơn từ điển có sẵn */
export type Extra = Record<string, string>;
function translateSegment(seg: string, extra?: Extra): string {
  const t = norm(decodeEnt(seg));
  if (!t) return seg;
  const hit = extra?.[t] ?? EXACT[t];
  if (hit !== undefined) return hit;
  const m = EMOJI_PREFIX.exec(t);
  if (m && (extra?.[m[2]!] ?? EXACT[m[2]!]) !== undefined) return norm(m[1]!) + ' ' + (extra?.[m[2]!] ?? EXACT[m[2]!]);
  // câu trọn vẹn khớp mẫu thì dịch cả câu trước; còn lại mới áp các quy tắc từng cụm có số
  for (const [re, rep] of FULL_RULES) if (re.test(t)) return t.replace(re, rep as string);
  let out = t;
  for (const [re, rep] of PART_RULES) out = out.replace(re, rep as string);
  if (out !== t) return out;
  return seg;
}

/** Dịch một đoạn chữ hiển thị. Giữ khoảng trắng đầu/cuối; không có bản dịch thì trả nguyên văn. */
export function translate(raw: string, extra?: Extra): string {
  if (!raw || !HAS_VI.test(raw)) return raw;
  const lead = /^\s*/.exec(raw)![0];
  const tail = /\s*$/.exec(raw)![0];
  const core = raw.trim();
  const whole = translateSegment(core, extra);
  if (whole !== core) return lead + whole + tail;
  // Nhiều đoạn nối bằng " · ", " — " hoặc ": ": dịch từng đoạn (đoạn động như tên, số giữ nguyên), lồng nhau cũng được
  const deep = (text: string, seps: string[]): string => {
    const whole = translateSegment(text, extra);
    if (whole !== text) return whole;
    const [sep, ...rest] = seps;
    if (sep === undefined || !text.includes(sep)) return sep === undefined ? text : deep(text, rest);
    return text.split(sep).map((p) => deep(p, rest)).join(sep);
  };
  const out = deep(core, [' · ', ' — ', ': ']);
  if (out !== core) return lead + out + tail;
  return raw;
}

/** Còn sót chữ tiếng Việt? (dùng cho kiểm thử độ phủ) */
export const hasVietnamese = (s: string) => HAS_VI.test(s);
export const hasTranslation = (s: string) => EXACT[norm(s)] !== undefined;

/** Đường dẫn nội bộ nào được thêm tiền tố /en (không đụng tới tệp, ảnh, quản trị, API) */
export function localizePath(path: string, lang: Lang): string {
  if (lang !== 'en') return path;
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (path === EN_PREFIX || path.startsWith(EN_PREFIX + '/') || path.startsWith(EN_PREFIX + '?') || path.startsWith(EN_PREFIX + '#')) return path;
  if (/^\/(anh|admin|_astro|api|sitemap|robots|favicon)/.test(path)) return path;
  if (/^\/[^?#]*\.[A-Za-z0-9]{2,5}([?#]|$)/.test(path)) return path;   // có đuôi tệp (.js, .png, .xml…)
  return path === '/' ? EN_PREFIX + '/' : EN_PREFIX + path;
}
/** Bỏ tiền tố /en để ra đường dẫn gốc tiếng Việt */
export function stripLang(path: string): { path: string; lang: Lang } {
  if (path === EN_PREFIX) return { path: '/', lang: 'en' };
  if (path.startsWith(EN_PREFIX + '/')) return { path: path.slice(EN_PREFIX.length) || '/', lang: 'en' };
  return { path, lang: 'vi' };
}

/**
 * Dịch cả trang HTML (chạy ở máy chủ cho /en/…): dịch các đoạn chữ giữa thẻ và các thuộc tính hiển thị, thêm tiền tố /en vào liên kết nội bộ.
 * Bỏ qua nội dung trong <script>, <style>, <textarea>, <code>; không đụng tới value/name/id/class.
 */
export function translateHtml(html: string, extra?: Extra): string {
  const parts = html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<textarea\b[\s\S]*?<\/textarea>)/i);
  return parts.map((part, i) => (i % 2 === 1 ? openTag(part, extra) : translateMarkup('>' + part + '<', extra).slice(1, -1))).join('');
}
/** Với <textarea>: chỉ dịch thuộc tính của thẻ mở (placeholder…), không đụng tới nội dung người nhập */
function openTag(part: string, extra?: Extra): string {
  if (!/^<textarea(?![a-z])/i.test(part)) return part;
  const m = /^<textarea[^>]*>/i.exec(part);
  return m ? translateMarkup(m[0], extra) + part.slice(m[0].length) : part;
}
function translateMarkup(m: string, extra?: Extra): string {
  // thuộc tính hiển thị và đường dẫn nằm trong thẻ
  let out = m.replace(/<([A-Za-z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (all, tag: string, attrs: string, slash: string) => {
    if (!attrs) return all;
    const a = attrs.replace(/\s(placeholder|title|aria-label|alt|content|label)="([^"]*)"/g, (_x, name: string, v: string) => {
      if (name === 'content' && !/\s(?:property|name)="(?:og:title|og:description|description|og:site_name)"/.test(attrs)) return _x;
      const tv = translate(v, extra);
      return tv === v ? _x : ` ${name}="${tv.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"`;
    }).replace(/\s(href|action)="(\/[^"]*)"/g, (_x, name: string, v: string) => ` ${name}="${localizePath(v, 'en')}"`);
    return `<${tag}${a}${slash}>`;
  });
  // chữ giữa các thẻ
  out = out.replace(/>([^<>]+)</g, (all, text: string) => {
    const tt = translate(text, extra);
    return tt === text ? all : `>${tt.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}<`;
  });
  return out;
}
