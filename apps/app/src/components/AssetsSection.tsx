import { normalizeDecimal, numberToInput } from '../lib/format';
import { useCallback, useEffect, useState } from 'react';
import { Collapsible } from './Collapsible';
import { areaPath } from '../lib/areas';
import { ASSET_KIND_LABEL, createAsset, deleteAsset, disposeAsset, fetchAssets, monthlyAmount, nextMaintenance, pastMonths, postDepreciation, previewDepreciation, recordMaintenance, updateAsset, type Asset, type AssetKind, type DepPreview } from '../lib/assets';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';

interface Form { id: string; version: number | null; name: string; kind: AssetKind; areaId: string; date: string; cost: string; life: string; salvage: string; every: string; note: string }
const blank = (): Form => ({ id: crypto.randomUUID(), version: null, name: '', kind: 'greenhouse', areaId: '', date: todayLocal(), cost: '', life: '5', salvage: '0', every: '', note: '' });
const monthText = (iso: string) => `tháng ${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Khai báo → Tài sản (H9). Sổ tài sản, khấu hao đường thẳng theo tháng (chủ xem trước rồi bấm ghi; chia vào các vụ theo diện tích × số ngày) và nhắc bảo dưỡng.
 * Form thêm và sửa dùng chung một khung. Cần có mạng; quyền theo mục Chi phí.
 */
export function AssetsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const allAreas = useTable('areas');
  const orgId = active?.id;
  const areas = allAreas.filter((a) => a.organization_id === orgId);
  const canEdit = Boolean(active && canPerm(active.perms, 'expenses', 'edit'));
  const [rows, setRows] = useState<Asset[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [maint, setMaint] = useState<{ id: string; assetId: string; date: string; note: string } | null>(null);
  const [disp, setDisp] = useState<{ id: string; date: string } | null>(null);
  const months = pastMonths(todayLocal());
  const [month, setMonth] = useState<string>(months[0] ?? '');
  const [pv, setPv] = useState<DepPreview | null>(null);
  const [op, setOp] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchAssets(orgId)); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!active || !orgId) return null;

  const placeName = (id: string | null) => (id ? areaPath(id, areas) : 'Cả cơ sở');
  async function run(fn: () => Promise<unknown>, ok?: string): Promise<boolean> {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await load(); if (ok) setMsg(ok); return true; } catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(false); }
  }

  async function save() {
    if (!form) return;
    const cost = parseNumber(form.cost), salvage = parseNumber(form.salvage || '0'), life = Number(normalizeDecimal(form.life));
    const every = form.every.trim() ? Number(form.every) : null;
    if (form.name.trim().length < 1) return setError('Hãy nhập tên tài sản.');
    if (cost === null || Number.isNaN(cost) || cost <= 0) return setError('Hãy nhập giá mua lớn hơn 0.');
    if (salvage === null || Number.isNaN(salvage) || salvage < 0 || salvage > cost) return setError('Giá trị còn lại phải từ 0 đến giá mua.');
    if (!(life >= 0.5 && life <= 50)) return setError('Số năm sử dụng từ 0,5 đến 50.');
    if (every !== null && !(Number.isInteger(every) && every >= 1 && every <= 120)) return setError('Chu kỳ bảo dưỡng tính theo tháng, từ 1 đến 120.');
    const input = { id: form.id, name: form.name.trim(), kind: form.kind, areaId: form.areaId || null, date: form.date, cost, lifeYears: life, salvage, every, note: form.note.trim() };
    const ok = await run(() => (form.version === null ? createAsset(orgId!, input) : updateAsset(form.version, input)), form.version === null ? 'Đã thêm tài sản.' : 'Đã lưu thay đổi.');
    if (ok) setForm(null);
  }

  async function preview() {
    setError(null); setMsg(null); setBusy(true);
    try { setPv(await previewDepreciation(orgId!, month)); } catch (e) { setError(friendlyError(e)); setPv(null); } finally { setBusy(false); }
  }
  async function post() {
    setBusy(true); setError(null);
    try {
      const r = await postDepreciation(orgId!, month, op);
      setMsg(`Đã ghi khấu hao ${monthText(month)} cho ${r.assets} tài sản (${r.created} khoản chi phí vào vụ).${r.skipped_groups > 0 ? ` ${r.skipped_groups} nơi chưa ghi vì tháng đó không có vụ nào đã khai diện tích; có thể ghi lại sau.` : ''}`);
      setPv(null); setOp(crypto.randomUUID()); await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const today = todayLocal();
  const dueCount = (rows ?? []).filter((a) => { const n = nextMaintenance(a); return n !== null && n <= today; }).length;

  return (
    <div>
      {!online && <p className="msg warn" role="status">Đang offline: tài sản chỉ thêm, sửa và ghi khấu hao khi có mạng.</p>}
      {canEdit && !form && <button className="primary" disabled={!online} onClick={() => { setError(null); setMsg(null); setForm(blank()); }}>＋ Thêm tài sản</button>}
      {!canEdit && <p className="muted">Bạn chỉ được xem tài sản. Cần quyền sửa mục Chi phí để thêm hoặc ghi khấu hao.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}

      {form && (
        <div className="card inline-form">
          <p><strong>{form.version === null ? 'Thêm tài sản' : 'Sửa tài sản'}</strong></p>
          <label>Tên tài sản<input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Nhà màng số 1" /></label>
          <div className="pair">
            <label>Loại
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AssetKind })}>
                {Object.entries(ASSET_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Đặt ở
              <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                <option value="">Cả cơ sở (dùng chung)</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{areaPath(a.id, areas)}</option>)}
              </select>
            </label>
          </div>
          <div className="pair">
            <label>Ngày mua<input type="date" value={form.date} max={todayLocal()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Giá mua (đồng)<input value={form.cost} inputMode="numeric" onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
          </div>
          <div className="pair">
            <label>Dùng được (năm)<input value={form.life} inputMode="decimal" onChange={(e) => setForm({ ...form, life: e.target.value })} /></label>
            <label>Giá trị còn lại khi bỏ (đồng)<input value={form.salvage} inputMode="numeric" onChange={(e) => setForm({ ...form, salvage: e.target.value })} /></label>
          </div>
          <label>Bảo dưỡng mỗi (tháng; để trống nếu không cần nhắc)<input value={form.every} inputMode="numeric" onChange={(e) => setForm({ ...form, every: e.target.value })} /></label>
          <label>Ghi chú (không bắt buộc)<input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <p className="muted">Khấu hao mỗi tháng khoảng {formatMoney(monthlyAmount({ cost: parseNumber(form.cost) ?? 0, salvage: parseNumber(form.salvage || '0') ?? 0, life_years: Number(normalizeDecimal(form.life)) || 0 }))}, bắt đầu từ tháng sau tháng mua.</p>
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !online} onClick={() => void save()}>{form.version === null ? 'Lưu tài sản' : 'Lưu thay đổi'}</button>
            <button type="button" className="secondary" onClick={() => { setForm(null); setError(null); }}>Hủy</button>
          </div>
        </div>
      )}

      {canEdit && (
        <Collapsible title="Ghi khấu hao theo tháng" summary="chia vào các vụ theo diện tích × số ngày">
          <div className="inline-form">
            <p className="muted">Chọn tháng đã qua hết, xem cách ghi rồi bấm ghi. Mỗi tháng của một tài sản chỉ ghi một lần.</p>
            <label>Tháng
              <select value={month} onChange={(e) => { setMonth(e.target.value); setPv(null); setOp(crypto.randomUUID()); }}>
                {months.map((m) => <option key={m} value={m}>{monthText(m)}</option>)}
              </select>
            </label>
            <div className="btnrow"><button type="button" className="secondary" disabled={busy || !online} onClick={() => void preview()}>Xem cách ghi</button></div>
            {pv && (
              <div className="card slim">
                {pv.manual_exists && <p className="msg warn">Tháng này đã có chi phí "Khấu hao nhà/chuồng" nhập tay. Kiểm tra để khỏi tính trùng.</p>}
                {pv.items.length === 0 ? <p className="muted">Không có tài sản nào phải khấu hao trong tháng này.</p> : (
                  <>
                    <table className="grid">
                      <thead><tr><th>Tài sản</th><th>Đặt ở</th><th>Khấu hao</th><th></th></tr></thead>
                      <tbody>{pv.items.map((i) => <tr key={i.asset_id}><td>{i.name}</td><td>{i.area_name ?? 'Cả cơ sở'}</td><td>{formatMoney(i.amount)}</td><td>{i.posted ? 'đã ghi' : ''}</td></tr>)}</tbody>
                    </table>
                    {pv.items.some((i) => !i.posted) && <div className="btnrow"><button type="button" className="primary" disabled={busy || !online} onClick={() => void post()}>Ghi khấu hao {monthText(month)}</button></div>}
                  </>
                )}
              </div>
            )}
          </div>
        </Collapsible>
      )}

      {rows && rows.length === 0 && <p className="muted">Chưa có tài sản nào.</p>}
      {rows && dueCount > 0 && <p className="msg warn" role="status">{dueCount} tài sản đến hạn bảo dưỡng.</p>}
      {(rows ?? []).map((a) => {
        const next = nextMaintenance(a);
        const due = next !== null && next <= today;
        return (
          <div className={a.status === 'disposed' ? 'card slim voided' : 'card slim'} key={a.id}>
            <div className="row"><strong>{a.name}</strong><span className="muted">{ASSET_KIND_LABEL[a.kind]}</span></div>
            <p className="muted">{placeName(a.area_id)} · mua {fmtDate(a.purchase_date)} · {formatMoney(a.cost)} · dùng {numberToInput(a.life_years)} năm</p>
            {a.status === 'disposed'
              ? <p className="muted">Đã thanh lý {a.disposed_date ? fmtDate(a.disposed_date) : ''}</p>
              : <p>Khấu hao khoảng {formatMoney(monthlyAmount(a))}/tháng{next ? <span className={due ? 'msg warn' : 'muted'}> · bảo dưỡng {due ? 'đã đến hạn từ' : 'kế tiếp'} {fmtDate(next)}</span> : null}</p>}
            {canEdit && a.status === 'active' && maint?.assetId !== a.id && disp?.id !== a.id && (
              <div className="btnrow">
                <button type="button" className="secondary" disabled={!online} onClick={() => setForm({ id: a.id, version: a.version, name: a.name, kind: a.kind, areaId: a.area_id ?? '', date: a.purchase_date, cost: String(a.cost), life: String(a.life_years), salvage: String(a.salvage), every: a.maintain_every_months ? String(a.maintain_every_months) : '', note: a.note ?? '' })}>Sửa</button>
                <button type="button" className="secondary" disabled={!online} onClick={() => setMaint({ id: crypto.randomUUID(), assetId: a.id, date: todayLocal(), note: '' })}>Đã bảo dưỡng</button>
                <button type="button" className="secondary" disabled={!online} onClick={() => setDisp({ id: a.id, date: todayLocal() })}>Thanh lý</button>
                <button type="button" className="secondary" disabled={busy || !online} onClick={() => { if (window.confirm('Xóa tài sản nhập nhầm? Chỉ xóa được khi chưa ghi khấu hao.')) void run(() => deleteAsset(a.id), 'Đã xóa tài sản.'); }}>Xóa</button>
              </div>
            )}
            {maint?.assetId === a.id && (
              <div className="inline-form">
                <label>Ngày bảo dưỡng<input type="date" value={maint.date} max={todayLocal()} onChange={(e) => setMaint({ ...maint, date: e.target.value })} /></label>
                <label>Ghi chú (không bắt buộc)<input value={maint.note} maxLength={300} onChange={(e) => setMaint({ ...maint, note: e.target.value })} /></label>
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || !online} onClick={async () => { if (await run(() => recordMaintenance(maint.id, a.id, maint.date, maint.note), 'Đã ghi bảo dưỡng.')) setMaint(null); }}>Lưu</button>
                  <button type="button" className="secondary" onClick={() => setMaint(null)}>Hủy</button>
                </div>
              </div>
            )}
            {disp?.id === a.id && (
              <div className="inline-form">
                <label>Ngày thanh lý<input type="date" value={disp.date} min={a.purchase_date} max={todayLocal()} onChange={(e) => setDisp({ ...disp, date: e.target.value })} /></label>
                <p className="muted">Từ tháng thanh lý trở đi không tính khấu hao nữa.</p>
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || !online} onClick={async () => { if (await run(() => disposeAsset(a.id, a.version, disp.date), 'Đã thanh lý tài sản.')) setDisp(null); }}>Thanh lý</button>
                  <button type="button" className="secondary" onClick={() => setDisp(null)}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
