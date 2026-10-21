import qrcode from 'qrcode-generator';
import { supabase } from './supabase';

/**
 * Mã QR (D50): chứa nội dung chữ tiếng Việt đọc được ngay bằng bất kỳ ứng dụng quét QR nào (không cần mạng, không cần đăng nhập).
 * Vẽ bằng SVG tự sinh, tải về được dưới dạng ảnh PNG để in dán.
 */
qrcode.stringToBytes = (str: string) => Array.from(new TextEncoder().encode(str)); // UTF-8: giữ đúng dấu tiếng Việt

/** Tạo thẻ SVG của mã QR; nội dung quá dài thì thu bớt từ cuối cho vừa. */
export function qrSvg(text: string, cellSize = 4): { svg: string; text: string; truncated: boolean } {
  let t = text;
  for (let i = 0; i < 40; i++) {
    try {
      const qr = qrcode(0, 'L');
      qr.addData(t, 'Byte');
      qr.make();
      return { svg: qr.createSvgTag({ cellSize, margin: 2, scalable: true }), text: t, truncated: t !== text };
    } catch {
      t = t.slice(0, Math.floor(t.length * 0.85));
    }
  }
  throw new Error('Nội dung quá dài để tạo mã QR.');
}

/** Ảnh PNG (data URL) của mã QR để tải về */
export function qrPng(svg: string, size = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Không tạo được ảnh.'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Không tạo được ảnh.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

const vnDate = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—');

// ------------------------------------------------------------------ mã QR tài khoản
export interface AccountQrInput {
  name: string;
  orgName: string;
  orgType: 'household' | 'cooperative';
  orgId: string;
  roles: string;
  /** Chỉ đưa vào mã khi người dùng chọn */
  contact?: string | null;
  licenses?: { name: string; expires: string | null }[];
}

export function buildAccountQr(a: AccountQrInput): string {
  const lines = [
    'AGRICONNECT - THÔNG TIN TÀI KHOẢN',
    `Họ tên: ${a.name}`,
    `Cơ sở: ${a.orgName} (${a.orgType === 'cooperative' ? 'Hợp tác xã' : 'Hộ / trang trại'})`,
    `Vai trò: ${a.roles}`,
  ];
  if (a.contact) lines.push(`Liên hệ: ${a.contact}`);
  if (a.licenses && a.licenses.length > 0) {
    lines.push('Giấy phép, chứng chỉ:');
    for (const l of a.licenses) lines.push(`- ${l.name}${l.expires ? ` (hạn ${vnDate(l.expires)})` : ''}`);
  }
  lines.push(`Mã cơ sở: ${a.orgId}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ mã QR của vụ
export interface CycleTrace {
  cycle_id: string;
  name: string;
  crop: string | null;
  org: string | null;
  status: string;
  farm: string | null;
  location: string | null;
  area_size: number | null;
  area_unit: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  end_date: string | null;
  template: string | null;
  materials: { name: string; category: string | null; unit: string; quantity: number; first: string | null; last: string | null }[];
  generated_at: string;
}

export async function fetchCycleTrace(cycleId: string): Promise<CycleTrace> {
  if (!supabase || !navigator.onLine) throw new Error('OFFLINE: Cần có mạng để lấy thông tin vụ mới nhất cho mã QR.');
  const { data, error } = await supabase.rpc('get_cycle_trace', { p_cycle: cycleId });
  if (error) throw new Error(error.message);
  return data as CycleTrace;
}

export function buildCycleQr(t: CycleTrace): string {
  const size = t.area_size != null ? ` · ${Number(t.area_size).toLocaleString('vi-VN')} ${t.area_unit === 'ha' ? 'ha' : 'm2'}` : '';
  const lines = [
    'AGRICONNECT - TRUY XUẤT MÙA VỤ',
    `Mùa vụ: ${t.name}`,
    `Sản phẩm: ${t.crop ?? '—'}`,
    `Nơi trồng: ${t.farm ?? '—'}${t.location ? `, ${t.location}` : ''}${size}`,
    `Đơn vị: ${t.org ?? '—'}`,
    `Bắt đầu: ${vnDate(t.start_date)}`,
    `Kết thúc: ${t.end_date ? vnDate(t.end_date) : `dự kiến ${vnDate(t.expected_end_date)}`}`,
  ];
  if (t.template) lines.push(`Quy trình: ${t.template}`);
  if (t.materials.length > 0) {
    lines.push('Phân, thuốc, vật tư đã dùng:');
    for (const m of t.materials) {
      const when = m.first ? ` (${m.first === m.last ? vnDate(m.first) : `${vnDate(m.first)} - ${vnDate(m.last)}`})` : '';
      lines.push(`- ${m.name}${m.category ? ` [${m.category}]` : ''}: ${Number(m.quantity).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${m.unit.toLowerCase()}${when}`);
    }
  } else {
    lines.push('Vật tư đã dùng: chưa ghi');
  }
  lines.push(`Cập nhật: ${new Date(t.generated_at).toLocaleString('vi-VN')}`, `Mã vụ: ${t.cycle_id}`);
  return lines.join('\n');
}
