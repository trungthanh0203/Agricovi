/** Thu nhỏ ảnh người dùng chọn thành JPEG nhỏ dạng data URL (chưa dùng Storage: mỗi chỗ chỉ 1–2 ảnh nhỏ, D62). Chỉ chạy ở trình duyệt. */
export async function smallImage(file: File, max = 640, limit = 100_000): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không xử lý được ảnh trên thiết bị này.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  for (const q of [0.7, 0.58, 0.46, 0.36]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= limit) return url;
  }
  throw new Error('Ảnh quá phức tạp để nén gọn. Hãy chọn ảnh khác.');
}
