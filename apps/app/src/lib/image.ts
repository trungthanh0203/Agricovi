/**
 * Thu nhỏ ảnh người dùng chọn thành ảnh JPEG nhỏ (cạnh dài tối đa `max` px) dạng data URL để lưu cùng bản ghi.
 * Ảnh nhỏ giúp tải nhanh trên điện thoại và không cần cấu hình kho lưu trữ riêng ở bản thử (D37).
 */
export async function fileToSmallImage(file: File, max = 480, quality = 0.6): Promise<string> {
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
  if (url.length > 200_000) throw new Error('Ảnh quá lớn, hãy chọn ảnh khác.');
  return url;
}

/** Thu nhỏ ảnh thành hai tệp JPEG để đưa lên kho ảnh: bản đầy đủ (cạnh dài ≤ 1024 px, thường 80–180 KB) và bản nhỏ (≤ 240 px, vài KB) dùng cho danh sách. */
export async function fileToBlobs(file: File): Promise<{ full: Blob; thumb: Blob }> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh.');
  const bmp = await createImageBitmap(file);
  const make = async (max: number, quality: number): Promise<Blob> => {
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
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error('Không xử lý được ảnh trên thiết bị này.');
    return blob;
  };
  try {
    const full = await make(1024, 0.72);
    if (full.size > 900_000) throw new Error('Ảnh quá lớn, hãy chọn ảnh khác.');
    return { full, thumb: await make(240, 0.6) };
  } finally {
    bmp.close();
  }
}

/** Đổi data URL (ảnh cũ lưu trong cột) thành tệp để chuyển sang kho ảnh */
export async function dataUrlToFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], 'anh.jpg', { type: blob.type || 'image/jpeg' });
}
