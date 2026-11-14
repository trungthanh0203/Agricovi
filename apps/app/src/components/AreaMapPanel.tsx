import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clearAreaBoundary, saveAreaBoundary, type AreaGeo } from '../lib/areaGeo';
import { friendlyError } from '../lib/errors';
import { distanceM, polygonAreaM2, selfIntersects, type LatLng } from '../lib/geo';

/**
 * Bản đồ thửa (mục 9). Tải riêng (lazy) nên cơ sở không bật tính năng thì không tốn dung lượng.
 *  - Chế độ vẽ (`editId`): chạm bản đồ để thêm góc, kéo điểm để chỉnh, hoặc đứng tại góc ruộng bấm lấy GPS.
 *  - Chế độ xem (không `editId`): hiện ranh mọi khu của cơ sở.
 * Ảnh nền vệ tinh Esri World Imagery (miễn phí, ghi nguồn) hoặc OpenStreetMap (chỉ dùng nhẹ).
 */
export interface MapArea { id: string; name: string }

const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const fmtM2 = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha` : `${Math.round(n).toLocaleString('vi-VN')} m²`);
const dot = L.divIcon({ className: 'geo-dot', iconSize: [18, 18], iconAnchor: [9, 9] });

export default function AreaMapPanel({ areas, geos, editId, canEdit, online, currentSizeM2, onSaved, onUseSize, onClose }: {
  areas: MapArea[];
  geos: AreaGeo[];
  editId?: string;
  canEdit: boolean;
  online: boolean;
  /** Diện tích đang khai của khu (m²), để so sánh khi dùng diện tích vẽ được */
  currentSizeM2?: number | null;
  onSaved: () => void;
  onUseSize?: (m2: number) => Promise<void>;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const editing = Boolean(editId) && canEdit;
  const saved = geos.find((g) => g.area_id === editId) ?? null;
  const [points, setPoints] = useState<LatLng[]>(() => (saved ? saved.ring : []));
  const [flags, setFlags] = useState({ tap: false, gps: false });
  const [sat, setSat] = useState(true);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const areaM2 = useMemo(() => polygonAreaM2(points), [points]);
  const crossing = useMemo(() => selfIntersects(points), [points]);
  const dirty = saved ? JSON.stringify(saved.ring) !== JSON.stringify(points) : points.length > 0;

  // khởi tạo bản đồ một lần
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { center: [14.06, 108.28], zoom: 6, zoomControl: true });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    if (editing) map.on('click', (e: L.LeafletMouseEvent) => { setPoints([...pointsRef.current, [e.latlng.lat, e.latlng.lng]]); setFlags((f) => ({ ...f, tap: true })); });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lớp nền
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    baseRef.current?.remove();
    baseRef.current = L.tileLayer(sat ? SAT : OSM, { maxZoom: 19, attribution: sat ? 'Ảnh © Esri, Maxar, Earthstar Geographics' : '© OpenStreetMap' }).addTo(map);
    baseRef.current.bringToBack();
  }, [sat]);

  // vẽ lại các lớp mỗi khi điểm đổi
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current; if (!map || !layer) return;
    layer.clearLayers();
    for (const g of geos) {
      if (g.area_id === editId) continue;
      const a = areas.find((x) => x.id === g.area_id);
      L.polygon(g.ring, { color: '#ffd54f', weight: 2, fillOpacity: editing ? 0.1 : 0.25 }).bindTooltip(`${a?.name ?? 'Khu'} · ${fmtM2(g.area_m2)}`, { permanent: !editing, direction: 'center', className: 'geo-label' }).addTo(layer);
    }
    if (editId) {
      if (points.length >= 3) L.polygon(points, { color: crossing ? '#e53935' : '#00e676', weight: 3, fillOpacity: 0.25 }).addTo(layer);
      else if (points.length === 2) L.polyline(points, { color: '#00e676', weight: 3 }).addTo(layer);
      if (editing) {
        points.forEach((p, i) => {
          const m = L.marker(p, { icon: dot, draggable: true }).addTo(layer);
          m.on('dragend', () => { const ll = m.getLatLng(); setPoints(pointsRef.current.map((q, j) => (j === i ? [ll.lat, ll.lng] : q))); });
        });
      }
    }
  }, [points, geos, editId, editing, crossing, areas]);

  // đưa bản đồ tới đúng chỗ khi mở
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const rings = editId ? (points.length ? [points] : []) : geos.map((g) => g.ring);
    const all = rings.flat();
    if (all.length > 0) map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 19 });
    else if (editing && navigator.geolocation) locate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate(addPoint: boolean) {
    if (!navigator.geolocation) return setGpsNote('Thiết bị không hỗ trợ định vị.');
    setGpsNote('Đang lấy vị trí… (nên ra chỗ thoáng, đợi vài giây)');
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll: LatLng = [pos.coords.latitude, pos.coords.longitude];
      mapRef.current?.setView(ll, Math.max(mapRef.current.getZoom(), 18));
      if (addPoint) { setPoints([...pointsRef.current, ll]); setFlags((f) => ({ ...f, gps: true })); }
      const acc = Math.round(pos.coords.accuracy);
      setGpsNote(`Sai số GPS khoảng ±${acc} m${acc > 15 ? ' (hơi lớn: hãy ra chỗ thoáng hoặc chấm tay trên ảnh vệ tinh cho chính xác hơn)' : ''}.`);
    }, () => setGpsNote('Không lấy được vị trí. Hãy cho phép định vị cho app trong cài đặt điện thoại, hoặc chạm trên bản đồ.'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function save() {
    if (!editId) return;
    if (points.length < 3) return setError('Cần ít nhất 3 góc để tạo thành ranh.');
    if (crossing) return setError('Ranh đang bị cắt chéo nhau (hình số 8). Hãy kéo các điểm cho đúng thứ tự rồi lưu.');
    setBusy(true); setError(null);
    try {
      const g = await saveAreaBoundary(editId, points, flags.tap && flags.gps ? 'mixed' : flags.gps ? 'gps' : 'draw');
      setDone(`Đã lưu ranh: ${fmtM2(g.area_m2)} (${g.point_count} góc).`);
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!editId || !window.confirm('Xóa ranh của khu này khỏi bản đồ? Diện tích đã khai không bị đổi.')) return;
    setBusy(true); setError(null);
    try { await clearAreaBoundary(editId); setPoints([]); setDone('Đã xóa ranh.'); onSaved(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function useSize() {
    if (!onUseSize || !saved) return;
    const m2 = saved.area_m2;
    if (currentSizeM2 && Math.abs(currentSizeM2 - m2) > 1 && !window.confirm(`Diện tích đang khai là ${fmtM2(currentSizeM2)}. Đổi thành ${fmtM2(m2)} theo ranh đã vẽ?`)) return;
    setBusy(true); setError(null);
    try { await onUseSize(m2); setDone(`Đã đặt diện tích khu là ${fmtM2(m2)}.`); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const perimeter = points.length > 1 ? points.reduce((s, p, i) => s + distanceM(p, points[(i + 1) % points.length]!), 0) : 0;
  return (
    <div className="inline-form geo-panel">
      <div className="btnrow no-print">
        <button type="button" className="secondary" onClick={() => setSat(!sat)}>{sat ? 'Xem bản đồ đường' : 'Xem ảnh vệ tinh'}</button>
        <button type="button" className="secondary" onClick={() => locate(false)}>📍 Vị trí của tôi</button>
        <button type="button" className="link" onClick={onClose}>Đóng bản đồ</button>
      </div>
      <div ref={host} className="geo-map" role="application" aria-label="Bản đồ" />
      {gpsNote && <p className="muted" role="status">{gpsNote}</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {done && <p className="msg ok" role="status">{done}</p>}
      {editing ? (
        <>
          <p className="muted">
            {points.length === 0 ? 'Chạm lên bản đồ để đặt từng góc của thửa (theo thứ tự đi vòng quanh). Hoặc đứng tại góc ruộng và bấm "Lấy GPS tại góc". Kéo điểm để chỉnh.' : `${points.length} góc · diện tích ≈ ${fmtM2(areaM2)}${perimeter > 0 ? ` · chu vi ≈ ${Math.round(perimeter).toLocaleString('vi-VN')} m` : ''}`}
          </p>
          {crossing && <p className="msg warn" role="alert">Ranh đang bị cắt chéo nhau, diện tích sẽ sai. Hãy kéo điểm cho đúng thứ tự.</p>}
          <div className="btnrow">
            <button type="button" className="secondary" disabled={busy} onClick={() => locate(true)}>🧭 Lấy GPS tại góc</button>
            <button type="button" className="secondary" disabled={busy || points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>↩ Bỏ điểm cuối</button>
            <button type="button" className="secondary" disabled={busy || points.length === 0} onClick={() => setPoints([])}>Vẽ lại từ đầu</button>
          </div>
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !online || points.length < 3 || !dirty} onClick={() => void save()}>Lưu ranh</button>
            {saved && onUseSize && <button type="button" className="secondary" disabled={busy || !online || dirty} onClick={() => void useSize()}>Dùng làm diện tích khu</button>}
            {saved && <button type="button" className="secondary" disabled={busy || !online} onClick={() => void remove()}>Xóa ranh</button>}
          </div>
          {!online && <p className="msg warn">Cần có mạng để lưu ranh và tải ảnh bản đồ.</p>}
        </>
      ) : (
        <p className="muted">{geos.length === 0 ? 'Chưa có khu nào được vẽ ranh. Vào từng khu, bấm "Vẽ ranh trên bản đồ".' : `${geos.length} khu đã có ranh. Bấm vào hình để xem tên và diện tích.`}</p>
      )}
    </div>
  );
}
