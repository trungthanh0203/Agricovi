/**
 * Tọa độ thửa (mục 9): vòng [vĩ độ, kinh độ]. Tính diện tích cùng công thức với máy chủ (set_area_boundary, migration 0196):
 * chiếu phẳng cục bộ rồi công thức đa giác. Máy chủ tính lại khi lưu; số ở đây chỉ để xem trước khi vẽ.
 */
export type LatLng = [number, number];

const M_PER_DEG = (6371008.8 * Math.PI) / 180;

export function polygonAreaM2(ring: LatLng[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / n;
  const c = Math.cos((lat0 * Math.PI) / 180);
  const xs = ring.map((p) => p[1] * M_PER_DEG * c), ys = ring.map((p) => p[0] * M_PER_DEG);
  let acc = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; acc += xs[i]! * ys[j]! - xs[j]! * ys[i]!; }
  return Math.round((Math.abs(acc) / 2) * 10) / 10;
}

/** Khoảng cách xấp xỉ giữa hai điểm (mét) */
export function distanceM(a: LatLng, b: LatLng): number {
  const c = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * M_PER_DEG, (a[1] - b[1]) * M_PER_DEG * c);
}

/** Hai đoạn thẳng có cắt nhau không (không tính chung đầu mút) */
function cross(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d = (a: LatLng, b: LatLng, c: LatLng) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Ranh tự cắt nhau (hình số 8): diện tích sẽ sai nên báo người dùng vẽ lại */
export function selfIntersects(ring: LatLng[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // hai cạnh kề nhau qua điểm đầu/cuối
      if (cross(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/** Xuất GeoJSON (kinh độ trước, vĩ độ sau, vòng khép kín) để dùng ở mục hồ sơ xuất khẩu sau này */
export function toGeoJson(ring: LatLng[], props: Record<string, unknown> = {}) {
  const coords = [...ring, ring[0]!].map((p) => [p[1], p[0]]);
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [coords] } };
}
