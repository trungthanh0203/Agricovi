import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { EMPTY_DETAILS, fetchOrgDetails, missingCount, saveOrgDetails, type OrgDetails } from '../lib/orgDetails';
import { useOrgs } from '../lib/orgs';
import { isOwner } from '../lib/roles';
import { AddressFields } from './AddressFields';
import { Collapsible } from './Collapsible';

/**
 * Tài khoản → Thông tin cơ sở (D187): nơi chủ hộ/HTX bổ sung thông tin ngoài lúc đăng ký (người đại diện, liên hệ, địa chỉ,
 * sản phẩm chính, diện tích…; HTX thêm chức danh và số đăng ký). Riêng tư, không tự đưa lên website. Chủ sửa, quản lý chỉ xem.
 */
export function OrgDetailsSection() {
  const { active } = useOrgs();
  const [d, setD] = useState<OrgDetails>(EMPTY_DETAILS);
  const [version, setVersion] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const orgId = active?.id;
  const canEdit = Boolean(active && isOwner(active.roles));
  const isCoop = active?.type === 'cooperative';

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { const r = await fetchOrgDetails(orgId); setD(r.details); setVersion(r.version); setLoaded(true); } catch { /* chưa tải được: giữ trống */ }
  }, [orgId]);
  useEffect(() => { setLoaded(false); setD(EMPTY_DETAILS); setVersion(null); void load(); }, [load]);

  if (!active) return null;
  const set = (k: keyof OrgDetails) => (e: { target: { value: string } }) => setD((cur) => ({ ...cur, [k]: e.target.value }));
  const missing = loaded ? missingCount(d, active.type) : 0;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!orgId) return;
    const year = d.started_year.trim();
    if (year && !/^\d{4}$/.test(year)) return setMsg({ ok: false, text: 'Năm bắt đầu gồm 4 chữ số, ví dụ 2019.' });
    const area = d.total_area_m2.trim();
    if (area && (Number.isNaN(Number(area.replace(',', '.'))) || Number(area.replace(',', '.')) < 0)) return setMsg({ ok: false, text: 'Diện tích phải là số không âm (đơn vị m²).' });
    setBusy(true);
    try {
      const v = await saveOrgDetails(orgId, { ...d, total_area_m2: area.replace(',', '.') }, version);
      setVersion(v);
      setMsg({ ok: true, text: 'Đã lưu thông tin cơ sở.' });
    } catch (err) {
      if (/CONFLICT/.test(String((err as Error).message))) { await load(); setMsg({ ok: false, text: 'Thông tin vừa được sửa ở nơi khác. Đã tải lại bản mới, hãy kiểm tra rồi lưu lại.' }); }
      else setMsg({ ok: false, text: friendlyError(err) });
    } finally { setBusy(false); }
  }

  return (
    <Collapsible title="Thông tin cơ sở" warn={missing > 0}
      summary={!loaded ? undefined : missing > 0 ? `còn thiếu ${missing} mục nên bổ sung` : 'đã đủ thông tin cơ bản'}>
      <form className="inline-form" onSubmit={(e) => void onSave(e)} noValidate>
        <p className="muted">Thông tin này chỉ chủ và quản lý xem được, dùng cho hồ sơ, báo cáo và liên hệ. Không tự đưa lên website.{!canEdit && ' Chỉ chủ cơ sở sửa được.'}</p>
        <fieldset disabled={!canEdit || busy} className="plain">
          <div className="pair">
            <label>{isCoop ? 'Người đại diện' : 'Chủ hộ'}<input value={d.rep_name} maxLength={120} autoComplete="name" onChange={set('rep_name')} /></label>
            {isCoop && <label>Chức danh<input value={d.rep_position} maxLength={80} placeholder="Chủ nhiệm, Giám đốc…" onChange={set('rep_position')} /></label>}
          </div>
          <label>Số điện thoại liên hệ<input type="tel" inputMode="tel" value={d.phone} maxLength={30} autoComplete="tel" onChange={set('phone')} /></label>
          <AddressFields value={{ province: d.province, ward: d.ward, address: d.address }} onChange={(a) => setD((cur) => ({ ...cur, ...a }))}
            addressLabel={isCoop ? 'Địa chỉ trụ sở' : 'Địa chỉ cơ sở'} />
          <label>Sản phẩm chính<input value={d.main_products} maxLength={300} placeholder="Ví dụ: dưa lưới, heo thịt" onChange={set('main_products')} /></label>
          <div className="pair">
            <label>Tổng diện tích sản xuất (m²)<input inputMode="decimal" value={d.total_area_m2} onChange={set('total_area_m2')} placeholder="Ví dụ: 5000" /></label>
            <label>Năm bắt đầu sản xuất<input inputMode="numeric" maxLength={4} value={d.started_year} onChange={set('started_year')} placeholder="Ví dụ: 2019" /></label>
          </div>
          {isCoop && <label>Số đăng ký HTX / giấy phép<input value={d.registration_no} maxLength={60} onChange={set('registration_no')} /></label>}
          <label>Mã số thuế (nếu có)<input value={d.tax_code} maxLength={30} onChange={set('tax_code')} /></label>
          <label>Giấy chứng nhận (VietGAP, OCOP…)<input value={d.certificates} maxLength={300} onChange={set('certificates')} placeholder="Ví dụ: VietGAP dưa lưới (hết hạn 06/2027)" /></label>
          <label>Ghi chú<textarea rows={2} maxLength={500} value={d.note} onChange={set('note')} /></label>
        </fieldset>
        {!navigator.onLine && <p className="muted">Đang offline: lưu thông tin cần có mạng.</p>}
        {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role="status">{msg.text}</p>}
        {canEdit && (
          <div className="btnrow">
            <button type="submit" className="primary" disabled={busy || !navigator.onLine}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setMsg(null); void load(); }}>Hủy</button>
          </div>
        )}
      </form>
    </Collapsible>
  );
}
