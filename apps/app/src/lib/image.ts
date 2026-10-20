/**
 * Thu nhỏ ảnh người dùng chọn thành ảnh JPEG nhỏ (cạnh dài tối đa `max` px) dạng data URL để lưu cùng bản ghi.
 * Ảnh nhỏ giúp tải nhanh trên điện thoại và không cần cấu hình kho lưu trữ riêng ở bản thử (D37).
 */
export async function fileToSmallImage(file: File, max = 480, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không xử lý được ảnh trên thiết bị này.');
  ctx.fillStyle = '#fff'; // ảnh PNG nền trong suốt -> nền trắng
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const url = canvas.toDataURL('image/jpeg', quality);
  if (url.length > 380_000) throw new Error('Ảnh quá lớn, hãy chọn ảnh khác.');
  return url;
}
