// Soạn nội dung BẢN TIN SÁNG từ số đếm của máy chủ (H2 lát 2, D183). Phần thuần, có test (supabase/tests/digest_compose.test.mjs).
// Chỉ có số đếm và biểu tượng loại; KHÔNG ghi số tiền hay tên khách vì thông báo hiện trên màn hình khóa.

export interface DigestCounts {
  tasks: { crop: number; livestock: number; aquatic: number; other: number };
  vaccine: number; milestones: number; assets: number; payables: number; receivables: number; licenses: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Trả null khi không có gì để nhắc (khi đó không gửi) */
export function composeDigest(raw: Partial<DigestCounts> | null | undefined): { title: string; body: string; tag: string; url: string } | null {
  const t = raw?.tasks ?? { crop: 0, livestock: 0, aquatic: 0, other: 0 };
  const parts: string[] = [];
  if (n(t.crop) > 0) parts.push(`🌱 ${n(t.crop)} việc cây trồng`);
  if (n(t.livestock) > 0) parts.push(`🐖 ${n(t.livestock)} việc vật nuôi`);
  if (n(t.aquatic) > 0) parts.push(`🐟 ${n(t.aquatic)} việc thủy sản`);
  if (n(t.other) > 0) parts.push(`📋 ${n(t.other)} việc khác`);
  if (n(raw?.vaccine) > 0) parts.push(`💉 ${n(raw?.vaccine)} mũi tiêm`);
  if (n(raw?.milestones) > 0) parts.push(`⏰ ${n(raw?.milestones)} mốc an toàn`);
  if (n(raw?.assets) > 0) parts.push(`🛠️ ${n(raw?.assets)} bảo dưỡng`);
  const debts = n(raw?.payables) + n(raw?.receivables);
  if (debts > 0) parts.push(`💳 ${debts} khoản công nợ`);
  if (n(raw?.licenses) > 0) parts.push(`📜 ${n(raw?.licenses)} giấy phép sắp hết hạn`);
  if (parts.length === 0) return null;
  return { title: 'Acovin · việc hôm nay', body: `${parts.join(' · ')}. Mở app để xem chi tiết.`, tag: 'agricovi-digest', url: '/' };
}
