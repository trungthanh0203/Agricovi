import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { formatMoney, formatQty } from '../lib/inventory';
import {
  coopHouseholdOverview, listProcurementItems, mySharing, saveProcurementItem, setCoopSharing,
  type HouseholdCycleOverview, type MySharing, type ProcurementRow,
} from '../lib/members';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { Collapsible } from './Collapsible';

/** HTX khai danh mục sản phẩm bao tiêu (D148): hộ ghi vụ sản phẩm này mặc định "theo HTX"; có danh mục thì hộ bắt buộc chia sẻ dữ liệu sản xuất */
export function ProcurementPanel({ coopId, canEdit }: { coopId: string; canEdit: boolean }) {
  const { cropTypes } = useCatalog();
  const [rows, setRows] = useState<ProcurementRow[] | null>(null);
  const [crop, setCrop] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setRows(await listProcurementItems(coopId)); setErr(null); } catch (e) { setErr(friendlyError(e)); }
  }, [coopId]);
  useEffect(() => { void load(); }, [load]);

  async function save(cropId: string, p: number | null, active: boolean) {
    setBusy(true); setErr(null);
    try { await saveProcurementItem(coopId, cropId, p, active); await load(); setCrop(''); setPrice(''); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  const active = (rows ?? []).filter((r) => r.is_active);
  const choices = cropTypes.filter((c) => c.is_active && !(rows ?? []).some((r) => r.crop_type_id === c.id && r.is_active)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  return (
    <Collapsible title="Sản phẩm HTX bao tiêu" summary={rows === null ? 'Đang tải…' : active.length ? `${active.length} sản phẩm` : 'Chưa khai'}>
      <p className="muted">Hộ ghi vụ các sản phẩm này sẽ được gợi ý ghi "theo HTX". Khi đã có sản phẩm bao tiêu, hộ thuộc HTX cần cho HTX xem dữ liệu sản xuất (để truy xuất nguồn gốc).</p>
      {err && <p className="msg error" role="alert">{err}</p>}
      {rows !== null && active.length === 0 && <p className="muted">Chưa có sản phẩm nào.</p>}
      {active.map((r) => (
        <div className="row" key={r.id}>
          <span><strong>{r.crop_types?.name ?? '—'}</strong>{r.ref_price_per_kg != null ? ` · giá tham chiếu ${formatMoney(r.ref_price_per_kg)}/kg` : ''}</span>
          {canEdit && <button type="button" className="link" disabled={busy} onClick={() => void save(r.crop_type_id, r.ref_price_per_kg, false)}>Bỏ</button>}
        </div>
      ))}
      {canEdit && (
        <div className="inline-form">
          <label>Thêm sản phẩm
            <select value={crop} onChange={(e) => setCrop(e.target.value)}>
              <option value="">— Chọn sản phẩm —</option>
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Giá thu mua tham chiếu (đ/kg, có thể bỏ trống)
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <div className="actions">
            <button type="button" className="primary" disabled={busy || !crop || !navigator.onLine} onClick={() => void save(crop, price ? Number(price) : null, true)}>Thêm vào danh mục</button>
          </div>
        </div>
      )}
    </Collapsible>
  );
}

/** HTX xem tổng quan sản xuất của một hộ (chỉ xem; theo hộ đồng ý). */
export function HouseholdOverviewPanel({ coopId, householdId, name, onClose }: { coopId: string; householdId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<{ shared: boolean; cycles: HouseholdCycleOverview[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    coopHouseholdOverview(coopId, householdId).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [coopId, householdId]);

  return (
    <div className="card">
      <div className="row"><strong>Sản xuất của {name}</strong><button type="button" className="link" onClick={onClose}>Đóng</button></div>
      {err && <p className="msg error" role="alert">{err}</p>}
      {!data && !err && <p className="muted">Đang tải…</p>}
      {data && !data.shared && <p className="msg warn" role="status">Hộ này chưa đồng ý cho HTX xem dữ liệu sản xuất. HTX chỉ thấy hồ sơ hộ do HTX nhập. Hãy đề nghị hộ bật chia sẻ ở mục Hợp tác xã trong app của hộ.</p>}
      {data?.shared && data.cycles.length === 0 && <p className="muted">Hộ chưa có vụ nào.</p>}
      {data?.shared && data.cycles.map((c) => {
        const pct = c.stages_total > 0 ? Math.round((c.stages_done / c.stages_total) * 100) : 0;
        return (
          <div className="card slim" key={c.id}>
            <div className="row">
              <strong>{c.name}{c.code ? ` · ${c.code}` : ''}</strong>
              <span className="pill">{CYCLE_STATUS_LABEL_VI[c.status as keyof typeof CYCLE_STATUS_LABEL_VI] ?? c.status}{c.kind === 'coop' ? ' · theo HTX' : ' · vụ riêng'}</span>
            </div>
            <p className="muted">{c.crop} · {c.area}{c.start_date ? ` · bắt đầu ${fmtDate(c.start_date)}` : ''}{c.expected_end_date ? ` · dự kiến xong ${fmtDate(c.expected_end_date)}` : ''}</p>
            {c.stages_total > 0 && <p>Tiến độ {c.stages_done}/{c.stages_total} việc ({pct}%)</p>}
            <p className="muted">
              {c.last_log_at ? `Ghi việc gần nhất ${fmtDate(c.last_log_at)}` : 'Chưa ghi việc'} · {c.logs_30d} lần ghi trong 30 ngày
              {c.harvest_kg > 0 ? ` · đã thu ${formatQty(c.harvest_kg)} kg` : ''}
            </p>
            {c.open_incidents > 0 && <p className="msg warn" role="status">{c.open_incidents} sự cố chưa xử lý xong</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Hộ thuộc HTX: xem và đổi việc chia sẻ dữ liệu sản xuất cho HTX */
export function HouseholdSharing({ householdId, isOwner }: { householdId: string; isOwner: boolean }) {
  const [s, setS] = useState<MySharing | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setS((await mySharing(householdId))[0] ?? null); } catch (e) { setErr(friendlyError(e)); }
  }, [householdId]);
  useEffect(() => { void load(); }, [load]);
  if (!s) return err ? <p className="msg error" role="alert">{err}</p> : null;
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={s.share_production} disabled={busy || !isOwner || (s.required && s.share_production)}
          onChange={async (e) => { setBusy(true); setErr(null); try { await setCoopSharing(householdId, e.target.checked); await load(); } catch (x) { setErr(friendlyError(x)); } finally { setBusy(false); } }} />
        Cho {s.coop_name} xem (không sửa) dữ liệu sản xuất của hộ: vụ, nhật ký việc, thu hoạch, sự cố
      </label>
      {s.required && <p className="muted">HTX bao tiêu sản phẩm nên phần này bắt buộc (để truy xuất nguồn gốc).</p>}
      {!s.share_production && <p className="msg warn" role="status">HTX chưa xem được dữ liệu sản xuất của hộ.</p>}
      <p className="muted">Chi phí, doanh thu và công nợ riêng của hộ không chia sẻ cho HTX.</p>
      {err && <p className="msg error" role="alert">{err}</p>}
    </>
  );
}
