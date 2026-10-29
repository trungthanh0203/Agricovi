/**
 * Nhận diện khuôn mặt ngay trên điện thoại cho Máy chấm công (D112): đếm số khuôn mặt trong khung và tính "dấu vân" 128 số.
 * Thư viện (~1,3 MB) và mô hình (~6,7 MB, đặt ở /models) chỉ tải khi mở màn Máy chấm công, nhờ trình duyệt lưu nên các lần sau không tải lại.
 * Kết quả đối chiếu do MÁY CHỦ quyết định; ở đây chỉ tính số.
 */

type FaceApi = typeof import('@vladmandic/face-api');

let loading: Promise<FaceApi> | null = null;

/** Tải thư viện + mô hình một lần. Lỗi thì ném ra (máy chấm công vẫn dùng được, chỉ không kiểm khuôn mặt). */
export function loadFace(): Promise<FaceApi> {
  loading ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    await (faceapi.tf as unknown as { ready(): Promise<void> }).ready();
    const base = `${import.meta.env.BASE_URL}models`;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(base),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
      faceapi.nets.faceRecognitionNet.loadFromUri(base),
    ]);
    // Chạy thử một lần trên ảnh trống: lần đầu trình duyệt phải biên dịch mô hình (có thể mất cả chục giây), làm trước ở đây để lúc chấm công không phải chờ
    try {
      const blank = document.createElement('canvas');
      blank.width = blank.height = 160;
      await faceapi.detectAllFaces(blank, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
      await faceapi.nets.faceLandmark68TinyNet.detectLandmarks(blank);
      await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blank);
    } catch { /* bỏ qua: chỉ là khởi động trước */ }
    return faceapi;
  })().catch((e) => {
    loading = null; // cho phép thử tải lại
    throw e;
  });
  return loading;
}

const options = (api: FaceApi) => new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

/** Số khuôn mặt thấy trong khung hình hiện tại */
export async function countFaces(api: FaceApi, video: HTMLVideoElement): Promise<number> {
  return (await api.detectAllFaces(video, options(api))).length;
}

/** Dấu vân 128 số của khuôn mặt DUY NHẤT trong khung; null nếu không thấy hoặc thấy nhiều khuôn mặt */
export async function describeFace(api: FaceApi, video: HTMLVideoElement): Promise<number[] | null> {
  const all = await api.detectAllFaces(video, options(api)).withFaceLandmarks(true).withFaceDescriptors();
  const only = all.length === 1 ? all[0] : undefined;
  if (!only) return null;
  return Array.from(only.descriptor).map((x) => Math.round(x * 1e5) / 1e5);
}

export function faceDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(s);
}
