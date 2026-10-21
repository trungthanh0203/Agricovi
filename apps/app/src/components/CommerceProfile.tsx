import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from './Collapsible';
import { ImagePicker, Thumb } from './ImagePicker';
import { useCatalog } from '../lib/catalog';
import {
  addImage, addSupply, CERT_STATUS_LABEL, confirmContact, createProfile, deleteImage, deleteListing, getProfile, grantConsent, hideProfile,
  lastReviewNote, latestConsent, listCerts, listImages, listListings, listSupply, missingItems, previewProfile, PROFILE_STATUS_LABEL, PROFILE_STATUS_TONE,
  saveListing, saveProfile, SCOPE_LABEL, submitForReview, SUPPLY_LABEL, setCertPublic, updateImage,
  type BizProfile, type CertRow, type Consent, type ImageRow, type Listing, type ListingForm, type Preview, type ProfileForm, type SupplyRow, type SupplyStatus,
} from '../lib/commerce';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { listLicenses, type LicenseRow } from '../lib/licenses';
import type { MyOrg } from '../lib/orgs';
import { isOwner } from '../lib/roles';

/**
 * Hồ sơ website (D55): giới thiệu cơ sở, liên hệ, hình ảnh, sản phẩm cung ứng, chứng chỉ; chủ đồng ý công khai rồi gửi duyệt.
 * Biên tập hồ sơ, quản lý và chủ soạn được; chỉ CHỦ đồng ý công khai, xác nhận liên hệ, gửi duyệt, tạm ẩn.
 */
export function CommerceProfile({ org }: { org: MyOrg }) {
  const online = useOnline();
  const owner = isOwner(org.roles);
  const [profile, setProfile] = useState<BizProfile | null | undefined>(undefined);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [note, setNote] = useState<{ decision: string | null; note: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const p = await getProfile(org.id);
      setProfile(p);
      if (p) { setConsent(await latestConsent(p.id)); setNote(await lastReviewNote(p.id).catch(() => null)); }
    } catch (e) { setError(friendlyError(e)); setProfile(null); }
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); await load(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }

  if (!online && profile === undefined) return <p className="msg warn">Cần có mạng để soạn hồ sơ website.</p>;
  if (profile === undefined) return <p className="muted">Đang tải…</p>;
  if (profile === null) {
    return (
      <>
        {error && <p className="msg error" role="alert">{error}</p>}
        <p>Hồ sơ website giới thiệu cơ sở và sản phẩm của bạn tới người mua. Bạn soạn, kiểm tra bản xem trước, đồng ý công khai rồi gửi duyệt; <strong>chỉ khi được duyệt thông tin mới lên website</strong>.</p>
        <button className="primary" disabled={busy || !online} onClick={() => void run(() => createProfile(org.id, org.name)).catch(() => undefined)}>Tạo hồ sơ website</button>
      </>
    );
  }
  const miss = missingItems(profile, consent);
  const st = profile.status;
  const locked = st === 'pending_review';

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Soạn và gửi duyệt cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}

      <div className="card">
        <div className="row"><h2 className="grow">Trạng thái hồ sơ</h2><span className={PROFILE_STATUS_TONE[st]}>{PROFILE_STATUS_LABEL[st]}</span></div>
        {st === 'changes_requested' && note?.note && <p className="msg warn">Kiểm duyệt viên yêu cầu sửa: {note.note}</p>}
        {st === 'published' && <p className="muted">Hồ sơ đang hiện trên website{profile.slug ? ` (/${profile.slug})` : ''}. Sửa xong thì gửi duyệt lại; bản cũ vẫn hiện tới khi được duyệt.</p>}
        {st === 'pending_review' && <p className="muted">Đã gửi duyệt. Bạn vẫn xem được nhưng nên chờ kết quả trước khi sửa tiếp.</p>}
        {miss.length > 0 && (
          <>
            <p><strong>Còn thiếu để gửi duyệt:</strong></p>
            <ul className="checklist">{miss.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        )}
        {owner ? (
          <div className="btnrow">
            <button className="primary" disabled={busy || !online || miss.length > 0 || locked}
              onClick={() => void run(() => submitForReview(profile.id), 'Đã gửi duyệt. Khi được duyệt, hồ sơ sẽ lên website.').catch(() => undefined)}>
              {st === 'published' ? 'Gửi duyệt lại' : 'Gửi duyệt'}
            </button>
            {(st === 'published' || st === 'pending_review') && (
              <button className="secondary" disabled={busy || !online}
                onClick={() => { if (window.confirm('Tạm ẩn hồ sơ khỏi website ngay? Bạn có thể gửi duyệt lại sau.')) void run(() => hideProfile(profile.id, false), 'Đã tạm ẩn.').catch(() => undefined); }}>Tạm ẩn</button>
            )}
          </div>
        ) : <p className="muted">Chỉ chủ cơ sở đồng ý công khai và gửi duyệt.</p>}
      </div>

      <Collapsible title="Thông tin giới thiệu" summary={profile.display_name} defaultOpen>
        <IntroForm p={profile} busy={busy || !online} onSave={(f) => run(() => saveProfile(profile.id, f), 'Đã lưu.')} />
      </Collapsible>
      <Collapsible title="Liên hệ" summary={profile.contact_confirmed_at ? 'đã xác nhận' : 'chưa xác nhận'} warn={!profile.contact_confirmed_at && Boolean(profile.contact_phone || profile.contact_email)}>
        <ContactForm p={profile} owner={owner} busy={busy || !online} onSave={(f) => run(() => saveProfile(profile.id, f), 'Đã lưu. Liên hệ đổi thì chủ cần xác nhận lại.')}
          onConfirm={(on) => run(() => confirmContact(profile.id, on), on ? 'Đã xác nhận thông tin liên hệ.' : 'Đã bỏ xác nhận.')} />
      </Collapsible>
      <Collapsible title="Hình ảnh cơ sở" summary="ảnh giới thiệu">
        <ImagesBlock org={org} profileId={profile.id} listingId={null} owner={owner} />
      </Collapsible>
      <Collapsible title="Sản phẩm cung ứng" summary="sản phẩm người mua thấy trên website">
        <ProductsBlock org={org} profileId={profile.id} owner={owner} />
      </Collapsible>
      <Collapsible title="Chứng chỉ công khai" summary="chọn từ Giấy phép, chứng chỉ">
        <CertsBlock org={org} profileId={profile.id} />
      </Collapsible>
      <Collapsible title="Đồng ý công khai" summary={consent ? `đã đồng ý ${new Date(consent.granted_at).toLocaleDateString('vi-VN')}` : 'chưa đồng ý'} warn={!consent}>
        <ConsentBlock owner={owner} consent={consent} busy={busy || !online}
          onGrant={(scope) => run(() => grantConsent(org.id, profile.id, scope), 'Đã ghi nhận đồng ý công khai.')}
          onWithdraw={() => run(() => hideProfile(profile.id, true), 'Đã rút đồng ý và gỡ hồ sơ khỏi website.')} />
      </Collapsible>
      <Collapsible title="Xem trước website" summary="đúng như người mua sẽ thấy">
        <PreviewBlock profileId={profile.id} consent={consent} />
      </Collapsible>
    </>
  );
}

// ------------------------------------------------------------------ thông tin giới thiệu
function IntroForm({ p, busy, onSave }: { p: BizProfile; busy: boolean; onSave: (f: Partial<ProfileForm>) => Promise<unknown> }) {
  const [f, setF] = useState({
    display_name: p.display_name, tagline: p.tagline ?? '', description: p.description ?? '', province: p.province ?? '', district: p.district ?? '', commune: p.commune ?? '',
    location_precision: p.location_precision, established_year: p.established_year == null ? '' : String(p.established_year),
    total_area: p.total_area == null ? '' : String(p.total_area), area_unit: p.area_unit, practices: p.practices ?? '', capacity_note: p.capacity_note ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="inline-form">
      <label>Tên hiển thị trên website<input value={f.display_name} maxLength={120} onChange={set('display_name')} /></label>
      <label>Câu giới thiệu ngắn<input value={f.tagline} maxLength={160} onChange={set('tagline')} placeholder="Ví dụ: Dưa lưới VietGAP, giao hàng toàn quốc" /></label>
      <label>Mô tả (giới thiệu cơ sở, lợi thế, quy trình)<textarea rows={5} value={f.description} onChange={set('description')} /></label>
      <div className="pair">
        <label>Tỉnh/thành<input value={f.province} onChange={set('province')} /></label>
        <label>Quận/huyện<input value={f.district} onChange={set('district')} /></label>
      </div>
      <label>Xã/phường<input value={f.commune} onChange={set('commune')} /></label>
      <label>Mức địa chỉ hiện công khai
        <select value={f.location_precision} onChange={set('location_precision')}>
          <option value="province">Chỉ tỉnh/thành</option><option value="district">Đến quận/huyện</option><option value="commune">Đến xã/phường</option>
        </select>
        <small>Chỉ hiện đến mức bạn chọn; không bao giờ hiện địa chỉ chi tiết hơn.</small>
      </label>
      <div className="pair">
        <label>Năm thành lập<input value={f.established_year} inputMode="numeric" onChange={set('established_year')} /></label>
        <label>Tổng diện tích
          <span className="pair"><input value={f.total_area} inputMode="decimal" onChange={set('total_area')} />
            <select value={f.area_unit} onChange={set('area_unit')}><option value="ha">ha</option><option value="m2">m²</option></select></span>
        </label>
      </div>
      <label>Phương thức canh tác<input value={f.practices} maxLength={500} onChange={set('practices')} placeholder="Nhà màng, tưới nhỏ giọt, hữu cơ…" /></label>
      <label>Năng lực, sản lượng<input value={f.capacity_note} maxLength={500} onChange={set('capacity_note')} placeholder="Ví dụ: 20 tấn/vụ, 3 vụ/năm" /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <button className="primary" disabled={busy} onClick={() => {
        if (f.display_name.trim().length < 2) return setErr('Hãy nhập tên hiển thị.');
        const year = f.established_year.trim() === '' ? null : Number(f.established_year);
        if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return setErr('Năm thành lập chưa đúng.');
        const area = f.total_area.trim() === '' ? null : Number(f.total_area.replace(',', '.'));
        if (area !== null && (Number.isNaN(area) || area < 0)) return setErr('Diện tích phải là số không âm.');
        setErr(null);
        void onSave({ ...f, established_year: year, total_area: area }).catch(() => undefined);
      }}>Lưu</button>
    </div>
  );
}

function ContactForm({ p, owner, busy, onSave, onConfirm }: {
  p: BizProfile; owner: boolean; busy: boolean; onSave: (f: Partial<ProfileForm>) => Promise<unknown>; onConfirm: (on: boolean) => Promise<unknown>;
}) {
  const [f, setF] = useState({ contact_phone: p.contact_phone ?? '', contact_email: p.contact_email ?? '', contact_zalo: p.contact_zalo ?? '', website_url: p.website_url ?? '', facebook_url: p.facebook_url ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="inline-form">
      <p className="muted">Thông tin này chỉ lên website khi chủ đồng ý công khai nhóm "liên hệ" và đã xác nhận bên dưới.</p>
      <label>Điện thoại<input type="tel" value={f.contact_phone} onChange={set('contact_phone')} /></label>
      <label>Zalo<input value={f.contact_zalo} onChange={set('contact_zalo')} /></label>
      <label>Email<input type="email" value={f.contact_email} onChange={set('contact_email')} /></label>
      <label>Website của bạn (nếu có)<input value={f.website_url} onChange={set('website_url')} placeholder="https://" /></label>
      <label>Trang Facebook (nếu có)<input value={f.facebook_url} onChange={set('facebook_url')} placeholder="https://" /></label>
      <button className="primary" disabled={busy} onClick={() => void onSave(f).catch(() => undefined)}>Lưu liên hệ</button>
      {owner ? (
        <label className="check">
          <input type="checkbox" checked={Boolean(p.contact_confirmed_at)} disabled={busy} onChange={(e) => void onConfirm(e.target.checked).catch(() => undefined)} />
          Tôi xác nhận thông tin liên hệ trên là đúng và đồng ý để người mua liên hệ
        </label>
      ) : <p className="muted">{p.contact_confirmed_at ? '✔ Chủ cơ sở đã xác nhận liên hệ.' : 'Chủ cơ sở cần xác nhận liên hệ.'}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ hình ảnh (cơ sở hoặc một sản phẩm)
function ImagesBlock({ org, profileId, listingId, owner }: { org: MyOrg; profileId: string; listingId: string | null; owner: boolean }) {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setRows((await listImages(profileId)).filter((r) => r.listing_id === listingId)); } catch (e) { setErr(friendlyError(e)); }
  }, [profileId, listingId]);
  useEffect(() => { void load(); }, [load]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  const max = listingId ? 4 : 6;
  return (
    <>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="imggrid">
        {rows.map((r) => (
          <figure key={r.id}>
            {r.image && <img src={r.image} alt={r.caption ?? ''} />}
            <input defaultValue={r.caption ?? ''} placeholder="Chú thích" maxLength={120} aria-label="Chú thích ảnh" onBlur={(e) => { if (e.target.value !== (r.caption ?? '')) void run(() => updateImage(r.id, { caption: e.target.value || null })); }} />
            <label className="check"><input type="checkbox" checked={r.is_public_allowed} disabled={busy} onChange={(e) => void run(() => updateImage(r.id, { is_public_allowed: e.target.checked }))} /> Cho phép hiện công khai</label>
            <button className="icon" disabled={busy} aria-label="Xóa ảnh" onClick={() => void run(() => deleteImage(r.id))}>🗑</button>
          </figure>
        ))}
      </div>
      {rows.length < max && <ImagePicker value="" label={`Thêm ảnh (tối đa ${max})`} disabled={busy} onChange={(v) => { if (v) void run(() => addImage(org.id, profileId, listingId, v, owner, rows.length)); }} />}
      <p className="muted">Ảnh chưa tích "Cho phép hiện công khai" thì không bao giờ lên website (và chỉ lên khi chủ đồng ý nhóm "hình ảnh").</p>
    </>
  );
}

// ------------------------------------------------------------------ sản phẩm cung ứng
function ProductsBlock({ org, profileId, owner }: { org: MyOrg; profileId: string; owner: boolean }) {
  const [rows, setRows] = useState<Listing[]>([]);
  const [supply, setSupply] = useState<Map<string, SupplyRow>>(new Map());
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await listListings(profileId)); setSupply(await listSupply(profileId)); } catch (e) { setErr(friendlyError(e)); }
  }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(friendlyError(e)); throw e; } finally { setBusy(false); }
  }
  const cur = rows.find((r) => r.id === editing) ?? null;
  return (
    <>
      {err && <p className="msg error" role="alert">{err}</p>}
      {!editing && <button className="secondary" onClick={() => setEditing('new')}>+ Thêm sản phẩm</button>}
      {editing && (
        <ListingForm key={editing} orgId={org.id} initial={cur} busy={busy} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await saveListing(org.id, profileId, cur?.id ?? null, f); setEditing(null); })} />
      )}
      {editing && cur && <div className="card"><h2>Hình ảnh của "{cur.name}"</h2><ImagesBlock org={org} profileId={profileId} listingId={cur.id} owner={owner} /></div>}
      <table className="grid">
        <thead><tr><th>Sản phẩm ({rows.length})</th><th>Tình trạng</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Chưa có sản phẩm. Thêm sản phẩm bạn muốn bán để người mua tìm thấy.</td></tr>}
          {rows.map((l) => {
            const s = supply.get(l.id);
            return (
              <tr key={l.id} className={l.include_in_publication ? '' : 'off'}>
                <td>{l.name}<span className="sub">{[l.specification, l.unit && `đơn vị ${l.unit}`, l.season].filter(Boolean).join(' · ')}{l.include_in_publication ? '' : ' · không công khai'}</span></td>
                <td>{s ? <><span className={s.status === 'available' ? 'pill ok' : 'pill'}>{SUPPLY_LABEL[s.status]}</span><span className="sub">cập nhật {new Date(s.status_updated_on).toLocaleDateString('vi-VN')}</span></> : <span className="muted">chưa có</span>}</td>
                <td className="act">
                  <button className="icon" aria-label={`Sửa ${l.name}`} onClick={() => setEditing(editing === l.id ? null : l.id)}>✎</button>{' '}
                  <button className="icon" disabled={busy} aria-label={`Xóa ${l.name}`} onClick={() => { if (window.confirm(`Xóa sản phẩm "${l.name}"?`)) void run(() => deleteListing(l.id)).catch(() => undefined); }}>🗑</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 0 && <SupplyForm rows={rows} busy={busy} onSave={(id, s) => run(() => addSupply(org.id, id, s))} />}
    </>
  );
}

function ListingForm({ orgId, initial, busy, onSave, onClose }: { orgId: string; initial: Listing | null; busy: boolean; onSave: (f: ListingForm) => Promise<unknown>; onClose: () => void }) {
  const { cropTypes } = useCatalog();
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []).filter((c) => c.owner_org_id === orgId);
  const [f, setF] = useState({
    name: initial?.name ?? '', description: initial?.description ?? '', specification: initial?.specification ?? '', unit: initial?.unit ?? '', season: initial?.season ?? '',
    price_note: initial?.price_note ?? '', min_order: initial?.min_order ?? '', cycle_id: initial?.cycle_id ?? '', crop_type_id: initial?.crop_type_id ?? '', include: initial?.include_in_publication ?? true,
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="card">
      <h2>{initial ? `Sửa: ${initial.name}` : 'Thêm sản phẩm cung ứng'}</h2>
      <div className="inline-form">
        <label>Tên sản phẩm<input value={f.name} maxLength={120} onChange={set('name')} placeholder="Ví dụ: Dưa lưới Taki" /></label>
        <label>Thuộc sản phẩm đã khai báo (không bắt buộc)
          <select value={f.crop_type_id} onChange={set('crop_type_id')}><option value="">— Không chọn —</option>{cropTypes.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label>Mô tả<textarea rows={3} value={f.description} onChange={set('description')} /></label>
        <label>Quy cách<input value={f.specification} onChange={set('specification')} placeholder="Quả 1,5–2 kg, độ ngọt 12–14 Brix" /></label>
        <div className="pair">
          <label>Đơn vị bán<input value={f.unit} maxLength={30} onChange={set('unit')} placeholder="kg, thùng…" /></label>
          <label>Mùa vụ<input value={f.season} maxLength={120} onChange={set('season')} placeholder="Tháng 10 – 12" /></label>
        </div>
        <div className="pair">
          <label>Giá tham khảo<input value={f.price_note} maxLength={120} onChange={set('price_note')} placeholder="Liên hệ / 35.000đ/kg" /></label>
          <label>Đặt tối thiểu<input value={f.min_order} maxLength={120} onChange={set('min_order')} placeholder="50 kg" /></label>
        </div>
        <label>Liên kết vụ để người mua xem truy xuất (không bắt buộc)
          <select value={f.cycle_id} onChange={set('cycle_id')}><option value="">— Không liên kết —</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}</select>
          <small>Chỉ hiện truy xuất nếu vụ đó đã được bạn bấm "Công khai vụ lên website".</small>
        </label>
        <label className="check"><input type="checkbox" checked={f.include} onChange={(e) => setF({ ...f, include: e.target.checked })} /> Đưa sản phẩm này lên website</label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (f.name.trim().length < 2) return setErr('Hãy nhập tên sản phẩm.');
            setErr(null);
            void onSave({ name: f.name, description: f.description, specification: f.specification, unit: f.unit, season: f.season, price_note: f.price_note, min_order: f.min_order, cycle_id: f.cycle_id || null, crop_type_id: f.crop_type_id || null, include_in_publication: f.include }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
        {!initial && <p className="muted">Lưu xong, bấm ✎ ở sản phẩm để thêm hình ảnh.</p>}
      </div>
    </div>
  );
}

/** Cập nhật tình trạng cung ứng: thêm một dòng mới (có ngày); hiện trên website ngay, không cần duyệt lại */
function SupplyForm({ rows, busy, onSave }: { rows: Listing[]; busy: boolean; onSave: (id: string, s: { status: SupplyStatus; from: string; to: string; note: string }) => Promise<unknown> }) {
  const [id, setId] = useState('');
  const [status, setStatus] = useState<SupplyStatus>('expected');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Collapsible inline title="Cập nhật tình trạng cung ứng" summary="đang có hàng, dự kiến, hết hàng…">
      <div className="inline-form">
        <label>Sản phẩm<select value={id || rows[0]!.id} onChange={(e) => setId(e.target.value)}>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Tình trạng<select value={status} onChange={(e) => setStatus(e.target.value as SupplyStatus)}>{(Object.keys(SUPPLY_LABEL) as SupplyStatus[]).map((k) => <option key={k} value={k}>{SUPPLY_LABEL[k]}</option>)}</select></label>
        {status === 'available' && <p className="muted">"Đang có hàng" là bạn xác nhận hiện đang có hàng để bán.</p>}
        <div className="pair">
          <label>Dự kiến từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>Ghi chú sản lượng<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Khoảng 2 tấn" /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <button className="secondary" disabled={busy} onClick={() => {
          if (from && to && to < from) return setErr('Ngày kết thúc không thể trước ngày bắt đầu.');
          setErr(null);
          void onSave(id || rows[0]!.id, { status, from, to, note }).then(() => { setNote(''); }).catch(() => undefined);
        }}>Cập nhật tình trạng</button>
      </div>
    </Collapsible>
  );
}

// ------------------------------------------------------------------ chứng chỉ
function CertsBlock({ org, profileId }: { org: MyOrg; profileId: string }) {
  const [lic, setLic] = useState<LicenseRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setLic(await listLicenses(org.id)); setCerts(await listCerts(profileId)); } catch (e) { setErr(friendlyError(e)); }
  }, [org.id, profileId]);
  useEffect(() => { void load(); }, [load]);
  async function toggle(l: LicenseRow, on: boolean) {
    setBusy(true); setErr(null);
    try { await setCertPublic(org.id, profileId, l, on); await load(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <>
      {err && <p className="msg error" role="alert">{err}</p>}
      {lic.length === 0 && <p className="muted">Chưa có giấy phép, chứng chỉ. Thêm ở tab Tài khoản → Giấy phép, chứng chỉ rồi quay lại đây chọn cái nào hiện công khai.</p>}
      {lic.map((l) => {
        const c = certs.find((x) => x.license_id === l.id);
        return (
          <label className="check" key={l.id}>
            <input type="checkbox" checked={Boolean(c)} disabled={busy} onChange={(e) => void toggle(l, e.target.checked)} />
            <span>{l.name}{l.issuer ? ` — ${l.issuer}` : ''}{l.expires_date ? ` (hạn ${new Date(l.expires_date).toLocaleDateString('vi-VN')})` : ''}{c && <small className="muted"> · {CERT_STATUS_LABEL[c.status] ?? c.status}</small>}</span>
          </label>
        );
      })}
      <p className="muted">Chứng chỉ do bạn tự khai báo sẽ hiện nhãn "Tự khai báo (chưa xác minh)". Chỉ kiểm duyệt viên của nền tảng mới nâng lên "đã kiểm tra" hoặc "đã xác minh".</p>
    </>
  );
}

// ------------------------------------------------------------------ đồng ý công khai
function ConsentBlock({ owner, consent, busy, onGrant, onWithdraw }: {
  owner: boolean; consent: Consent | null; busy: boolean; onGrant: (scope: string[]) => Promise<unknown>; onWithdraw: () => Promise<unknown>;
}) {
  const [scope, setScope] = useState<string[]>(consent?.scope ?? ['profile', 'contact', 'images', 'certifications']);
  const [agree, setAgree] = useState(false);
  const toggle = (k: string) => setScope((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  if (!owner) return <p className="muted">{consent ? `Chủ cơ sở đã đồng ý công khai: ${consent.scope.map((k) => SCOPE_LABEL[k]).join('; ')}.` : 'Chủ cơ sở chưa đồng ý công khai.'}</p>;
  return (
    <>
      <p>Chọn nhóm thông tin bạn <strong>đồng ý công khai trên website</strong>. Nhóm không chọn sẽ không bao giờ hiện ra.</p>
      {Object.keys(SCOPE_LABEL).map((k) => (
        <label className="check" key={k}>
          <input type="checkbox" checked={k === 'profile' ? true : scope.includes(k)} disabled={k === 'profile' || busy} onChange={() => toggle(k)} /> {SCOPE_LABEL[k]}
        </label>
      ))}
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Tôi là chủ cơ sở và đồng ý công khai các thông tin đã chọn. Tôi hiểu có thể tạm ẩn hoặc rút đồng ý bất cứ lúc nào, và hồ sơ chỉ lên website sau khi được kiểm duyệt.</label>
      <div className="btnrow">
        <button className="primary" disabled={busy || !agree} onClick={() => void onGrant(['profile', ...scope.filter((k) => k !== 'profile')]).then(() => setAgree(false)).catch(() => undefined)}>
          {consent ? 'Cập nhật đồng ý' : 'Đồng ý công khai'}
        </button>
        {consent && <button className="secondary" disabled={busy} onClick={() => { if (window.confirm('Rút đồng ý và gỡ hồ sơ khỏi website ngay?')) void onWithdraw().catch(() => undefined); }}>Rút đồng ý</button>}
      </div>
      <p className="muted">Đổi nhóm công khai thì cần gửi duyệt lại để có hiệu lực.</p>
    </>
  );
}

// ------------------------------------------------------------------ xem trước
export function PreviewView({ pv }: { pv: Preview }) {
  const p = pv.profile;
  const place = [p.commune, p.district, p.province].filter(Boolean).join(', ');
  return (
    <div className="preview">
      <h2>{p.display_name}</h2>
      {p.tagline && <p><em>{p.tagline}</em></p>}
      {place && <p className="muted">📍 {place}</p>}
      {p.images && p.images.length > 0 && <div className="imggrid">{p.images.map((i, k) => <figure key={k}><img src={i.src} alt={i.caption ?? ''} />{i.caption && <figcaption>{i.caption}</figcaption>}</figure>)}</div>}
      {p.description && <p>{p.description}</p>}
      <ul className="facts">
        {p.established_year && <li>Thành lập: {p.established_year}</li>}
        {p.total_area != null && <li>Diện tích: {Number(p.total_area).toLocaleString('vi-VN')} {p.area_unit === 'm2' ? 'm²' : 'ha'}</li>}
        {p.practices && <li>Canh tác: {p.practices}</li>}
        {p.capacity_note && <li>Năng lực: {p.capacity_note}</li>}
      </ul>
      {p.certifications && p.certifications.length > 0 && (
        <><h3 className="sub">Chứng chỉ</h3>{p.certifications.map((c, k) => <p key={k}>🏅 {c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.number ? ` · số ${c.number}` : ''}{c.expires ? ` · hạn ${new Date(c.expires).toLocaleDateString('vi-VN')}` : ''} <span className="muted">({CERT_STATUS_LABEL[c.status] ?? c.status})</span></p>)}</>
      )}
      {pv.products.length > 0 && <h3 className="sub">Sản phẩm</h3>}
      {pv.products.map((x) => (
        <div className="card slim" key={x.id}>
          <strong>{x.snapshot.name}</strong>{x.snapshot.crop && <span className="muted"> · {x.snapshot.crop}</span>}
          {x.snapshot.images && x.snapshot.images.length > 0 && <div className="imggrid">{x.snapshot.images.map((i, k) => <figure key={k}><img src={i.src} alt={i.caption ?? ''} /></figure>)}</div>}
          {x.snapshot.description && <p>{x.snapshot.description}</p>}
          <p className="muted">{[x.snapshot.specification, x.snapshot.unit && `Đơn vị: ${x.snapshot.unit}`, x.snapshot.season && `Mùa vụ: ${x.snapshot.season}`, x.snapshot.price_note && `Giá: ${x.snapshot.price_note}`, x.snapshot.min_order && `Đặt tối thiểu: ${x.snapshot.min_order}`].filter(Boolean).join(' · ')}</p>
          {x.supply_status && <span className={x.supply_status === 'available' ? 'pill ok' : 'pill'}>{SUPPLY_LABEL[x.supply_status]}</span>}
          {x.snapshot.trace_code && <p className="muted">🔎 Truy xuất nguồn gốc: {x.snapshot.trace_code}</p>}
        </div>
      ))}
      {p.contact ? (
        <><h3 className="sub">Liên hệ</h3><ul className="facts">
          {p.contact.phone && <li>📞 {p.contact.phone}</li>}{p.contact.zalo && <li>Zalo: {p.contact.zalo}</li>}{p.contact.email && <li>✉ {p.contact.email}</li>}
          {p.contact.website && <li>🌐 {p.contact.website}</li>}{p.contact.facebook && <li>Facebook: {p.contact.facebook}</li>}
        </ul></>
      ) : <p className="muted">Thông tin liên hệ chưa hiện (chưa đồng ý công khai nhóm liên hệ hoặc chưa xác nhận).</p>}
    </div>
  );
}

function PreviewBlock({ profileId, consent }: { profileId: string; consent: Consent | null }) {
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = consent?.scope ?? ['profile'];
  return (
    <>
      <p className="muted">Bản xem trước dựng theo nhóm thông tin bạn đã đồng ý{consent ? '' : ' (chưa đồng ý: chỉ gồm phần giới thiệu)'}.</p>
      <button className="secondary" disabled={busy} onClick={() => { setBusy(true); setErr(null); previewProfile(profileId, scope).then(setPv).catch((e) => setErr(friendlyError(e))).finally(() => setBusy(false)); }}>{busy ? 'Đang dựng…' : 'Xem trước'}</button>
      {err && <p className="msg error" role="alert">{err}</p>}
      {pv && <PreviewView pv={pv} />}
    </>
  );
}

export { Thumb };
