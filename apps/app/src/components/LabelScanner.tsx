import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { findByRegNo, suggestGroup, suggestUnit } from '../lib/invoiceMatch';
import { getScanUsage, MAX_PHOTOS, prepareImage, scanLabel, type LabelDraft, type ScanUsage } from '../lib/invoiceScan';
import type { MaterialRow, UnitRow } from '../lib/db';

/** Các ô của form vật tư mà việc đọc nhãn có thể điền */
export type LabelKey = 'name' | 'group' | 'desc' | 'brand' | 'manufacturer' | 'registration_no' | 'active_ingredient' | 'withdrawal_days'
  | 'usage_guide' | 'usage_method' | 'safety_warning' | 'quality_specs' | 'limit_elements' | 'unitId';
export type LabelPatch = Partial<Record<LabelKey, string>>;

interface Row { key: LabelKey; label: string; scanned: string; shown: string; current: string; currentShown: string; critical: boolean; long: boolean }
interface Photo { id: string; preview: string; data: string }

/**
 * "📷 Chụp nhãn / tờ hướng dẫn": chọn ảnh (tối đa 3: mặt trước, mặt sau, tờ hướng dẫn) → đọc → màn kiểm tra từng trường với ô tích "dùng".
 * Vật tư mới: các ô còn trống được tích sẵn. Sửa vật tư đã có: chỉ ô còn trống được tích sẵn; ô đã có giá trị thì hiện cả giá trị cũ, tích mới ghi đè.
 * Ảnh KHÔNG được lưu. Thời gian cách ly, số đăng ký và liều dùng ảnh hưởng an toàn nên luôn nhắc đối chiếu với bao bì thật.
 */
export function LabelScanner({ orgId, isNew, current, groups, units, materials, selfId, onApply, onOpenExisting, onCancel }: {
  orgId: string; isNew: boolean; current: Partial<Record<LabelKey, string>>;
  groups: { id: string; label: string }[]; units: UnitRow[]; materials: MaterialRow[]; selfId: string | null;
  onApply: (p: LabelPatch) => void; onOpenExisting: (id: string) => void; onCancel: () => void;
}) {
  const [stage, setStage] = useState<'pick' | 'reading' | 'review'>('pick');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ScanUsage | null>(null);
  const [draft, setDraft] = useState<LabelDraft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [use, setUse] = useState<Record<string, boolean>>({});
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => { void getScanUsage(orgId).then(setUsage); }, [orgId]);
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setError(`Tối đa ${MAX_PHOTOS} ảnh.`);
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const f of Array.from(list).slice(0, room)) added.push({ id: crypto.randomUUID(), preview: URL.createObjectURL(f), data: await prepareImage(f) });
      setPhotos((p) => [...p, ...added]);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function read() {
    setError(null);
    setStage('reading');
    try {
      const { label, usage: u } = await scanLabel(orgId, photos.map((p) => p.data));
      setUsage(u);
      const grp = suggestGroup(label.loai, groups);
      const unit = isNew ? suggestUnit(label.don_vi, units) : null;
      const cur = (k: LabelKey) => (isNew && k === 'unitId' ? '' : (current[k] ?? '').trim()); // vật tư mới: đơn vị đang hiện chỉ là mặc định, coi như chưa chọn
      const mk = (key: LabelKey, labelText: string, scanned: string | null, opt: { shown?: string; currentShown?: string; critical?: boolean; long?: boolean } = {}): Row | null => {
        if (!scanned) return null;
        return { key, label: labelText, scanned, shown: opt.shown ?? scanned, current: cur(key), currentShown: opt.currentShown ?? cur(key), critical: Boolean(opt.critical), long: Boolean(opt.long) };
      };
      const groupLabel = (id: string | null | undefined) => groups.find((g) => g.id === id)?.label ?? '';
      const list = [
        mk('name', 'Tên vật tư', label.ten),
        mk('group', 'Nhóm vật tư', grp, { shown: groupLabel(grp), currentShown: groupLabel(current.group) }),
        isNew ? mk('unitId', 'Đơn vị tính', unit, { shown: units.find((u2) => u2.id === unit)?.name ?? '', currentShown: units.find((u2) => u2.id === current.unitId)?.name ?? '' }) : null,
        mk('brand', 'Xuất xứ / thương hiệu', label.xuat_xu),
        mk('manufacturer', 'Nhà sản xuất', label.nha_san_xuat),
        mk('registration_no', 'Số đăng ký lưu hành', label.so_dang_ky, { critical: true }),
        mk('active_ingredient', 'Hoạt chất / thành phần', label.thanh_phan, { long: true }),
        mk('withdrawal_days', 'Thời gian cách ly (ngày)', label.thoi_gian_cach_ly_ngay !== null ? String(label.thoi_gian_cach_ly_ngay) : null, { critical: true }),
        mk('desc', 'Mô tả (quy cách)', label.quy_cach ? `Quy cách: ${label.quy_cach}` : null),
        mk('usage_guide', 'Hướng dẫn sử dụng', label.huong_dan_su_dung, { critical: true, long: true }),
        mk('usage_method', 'Phương thức sử dụng', label.cach_dung, { long: true }),
        mk('safety_warning', 'Cảnh báo an toàn', label.canh_bao_an_toan, { critical: true, long: true }),
        mk('quality_specs', 'Chỉ tiêu chất lượng', label.chi_tieu_chat_luong, { long: true }),
        mk('limit_elements', 'Hàm lượng yếu tố hạn chế', label.ham_luong_yeu_to_han_che, { long: true }),
      ].filter((r): r is Row => r !== null);
      // bỏ ô đọc ra giống hệt giá trị đang có; mặc định tích ô còn trống
      const shownRows = list.filter((r) => r.current !== r.scanned);
      setRows(shownRows);
      setUse(Object.fromEntries(shownRows.map((r) => [r.key, r.current === ''])));
      setDraft(label);
      setStage('review');
    } catch (e) {
      setError(friendlyError(e));
      setStage('pick');
    }
  }

  function apply() {
    const patch: LabelPatch = {};
    for (const r of rows) if (use[r.key]) patch[r.key] = r.scanned;
    onApply(patch);
  }

  if (stage !== 'review') {
    const reading = stage === 'reading';
    const noQuota = usage !== null && usage.remaining <= 0;
    return (
      <div className="card">
        <h2>📷 Chụp nhãn / tờ hướng dẫn vật tư</h2>
        <p>Chụp <strong>bao bì, nhãn</strong> hoặc <strong>tờ hướng dẫn</strong> của vật tư (tối đa {MAX_PHOTOS} ảnh: mặt trước, mặt sau, tờ hướng dẫn). App đọc và <strong>điền sẵn</strong> vào form, bạn kiểm tra rồi mới lưu.</p>
        <p className="muted">Mẹo: chụp từng mặt riêng, thấy hết chữ, đủ sáng, tránh bóng loáng; chai cong thì chụp nghiêng nhẹ để không chói.</p>
        {usage && <p className={noQuota ? 'msg warn' : 'muted'} role="status">Còn <strong>{usage.remaining}</strong>/{usage.limit} lần đọc ảnh trong tháng này (dùng chung với chụp phiếu nhập hàng).</p>}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
        <div className="btnrow">
          <button type="button" className="secondary" disabled={busy || reading || photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()}>📷 Chụp ảnh</button>
          <button type="button" className="secondary" disabled={busy || reading || photos.length >= MAX_PHOTOS} onClick={() => gallery.current?.click()}>🖼 Chọn ảnh có sẵn</button>
        </div>
        {photos.length > 0 && (
          <div className="scan-thumbs">
            {photos.map((p, i) => (
              <figure key={p.id}>
                <img src={p.preview} alt={`Ảnh ${i + 1}`} />
                <button type="button" className="link inline" disabled={reading} onClick={() => { URL.revokeObjectURL(p.preview); setPhotos((s) => s.filter((x) => x.id !== p.id)); }}>Bỏ ảnh {i + 1}</button>
              </figure>
            ))}
          </div>
        )}
        {busy && <p className="muted" role="status">Đang xử lý ảnh…</p>}
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Tôi đồng ý gửi ảnh tới dịch vụ đọc ảnh (Cloudflare) để lấy chữ. Ảnh chỉ gửi khi bấm "Đọc nhãn" và <strong>không được lưu lại</strong>.</span>
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {reading && <p className="msg ok" role="status">Đang đọc nhãn… khoảng 10–40 giây, vui lòng đợi.</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={photos.length === 0 || !consent || busy || reading || noQuota} onClick={() => void read()}>{reading ? 'Đang đọc…' : 'Đọc nhãn'}</button>
          <button type="button" className="secondary" disabled={reading} onClick={onCancel}>Hủy, nhập tay</button>
        </div>
      </div>
    );
  }

  const dup = findByRegNo(draft?.so_dang_ky, materials, selfId);
  const dupMat = dup ? materials.find((m) => m.id === dup) : null;
  return (
    <div className="card">
      <h2>Kiểm tra thông tin đã đọc</h2>
      <p className="msg warn" role="status"><strong>Đây chỉ là bản nháp.</strong> Hãy đối chiếu với bao bì thật, nhất là <strong>thời gian cách ly, liều dùng, cảnh báo an toàn và số đăng ký</strong>, vì sai có thể gây hại.</p>
      {dupMat && (
        <div className="msg warn" role="status">
          Số đăng ký này trùng với vật tư <strong>{dupMat.name}</strong> đã có trong danh mục. Nên cập nhật vật tư đó thay vì tạo thêm.
          <div className="btnrow"><button type="button" className="secondary" onClick={() => onOpenExisting(dupMat.id)}>Mở "{dupMat.name}" để cập nhật</button></div>
        </div>
      )}
      {draft?.ghi_chu_khong_chac && <p className="muted">Ghi chú khi đọc: {draft.ghi_chu_khong_chac}</p>}
      {(draft?.so_lo || draft?.han_dung) && <p className="muted">Số lô / hạn dùng in trên bao ({[draft.so_lo, draft.han_dung].filter(Boolean).join(' · ')}) thuộc từng lần nhập kho nên không điền vào vật tư.</p>}
      {rows.length === 0 && <p className="msg warn">Không có thông tin mới nào để điền (đã giống hệt hoặc không đọc được). Bạn có thể chụp lại rõ hơn.</p>}
      {rows.map((r) => (
        <div key={r.key} className={`scan-line${r.critical ? ' warn' : ''}`}>
          <label className="check">
            <input type="checkbox" checked={Boolean(use[r.key])} onChange={(e) => setUse((u) => ({ ...u, [r.key]: e.target.checked }))} />
            <span><strong>{r.label}</strong>{r.critical ? ' ⚠ đối chiếu bao bì' : ''}</span>
          </label>
          <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>{r.long && r.shown.length > 400 ? `${r.shown.slice(0, 400)}…` : r.shown}</p>
          {r.current !== '' && <p className="muted" style={{ margin: 0 }}>Đang có: {r.currentShown.length > 200 ? `${r.currentShown.slice(0, 200)}…` : r.currentShown} {use[r.key] ? '(sẽ được thay)' : '(giữ nguyên; tích để thay)'}</p>}
        </div>
      ))}
      <div className="btnrow">
        <button type="button" className="primary" disabled={rows.length === 0} onClick={apply}>Điền vào form</button>
        <button type="button" className="secondary" onClick={() => { setStage('pick'); setError(null); }}>Chụp lại</button>
        <button type="button" className="secondary" onClick={onCancel}>Hủy, nhập tay</button>
      </div>
      <p className="muted">Chưa lưu gì cả. Bước tiếp theo bạn xem lại form rồi mới bấm Lưu.</p>
    </div>
  );
}
