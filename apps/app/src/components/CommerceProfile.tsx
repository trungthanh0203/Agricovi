import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from './Collapsible';
import { ImagePicker } from './ImagePicker';
import { useCatalog } from '../lib/catalog';
import {
  addImage, addSupply, CERT_STATUS_LABEL, confirmContact, createProfile, deleteImage, deleteListing, getProfile, grantConsent, hideProfile,
  lastReviewNote, latestConsent, listCerts, listImages, listListings, listSupply, missingItems, previewProfile, PROFILE_STATUS_LABEL, PROFILE_STATUS_TONE,
  saveListing, saveProfile, SCOPE_LABEL, submitForReview, SUPPLY_LABEL, setCertPublic, updateImage,
  listSiteCategories, type SiteCategory, type BizProfile, type CertRow, type Consent, type ImageRow, type Listing, type ListingForm, type Preview, type ProfileForm, type SupplyRow, type SupplyStatus,
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
 * Mỗi phần có thông báo "đã lưu"/lỗi ngay tại chỗ, và giữ nguyên dữ liệu đã nhập (không tự xóa khi lỗi hoặc khi chưa hiện ở danh sách).
 */
type Note = { kind: 'ok' | 'error'; text: string };
const hhmm = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Chạy một thao tác ghi: khóa nút khi đang chạy, ghi thông báo thành công/lỗi ngay tại phần đó */
function useAction() {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  async function run(fn: () => Promise<unknown>, okText?: string): Promise<boolean> {
    setBusy(true); setNote(null);
    try { await fn(); if (okText) setNote({ kind: 'ok', text: `${okText} (lúc ${hhmm()})` }); return true; }
    catch (e) { setNote({ kind: 'error', text: friendlyError(e) }); return false; }
    finally { setBusy(false); }
  }
  return { busy, off: busy || !online, online, note, setNote, run };
}
const NoteView = ({ note }: { note: Note | null }) => note
  ? <p className={`msg ${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}>{note.kind === 'ok' ? '✔ ' : '⚠ '}{note.text}</p>
  : null;

export function CommerceProfile({ org }: { org: MyOrg }) {
  const online = useOnline();
  const owner = isOwner(org.roles);
  const [profile, setProfile] = useState<BizProfile | null | undefined>(undefined);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [review, setReview] = useState<{ decision: string | null; note: string | null } | null>(null);
  const [counts, setCounts] = useState({ images: 0, products: 0, certs: 0 });
  const status = useAction();

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const p = await getProfile(org.id);
      setProfile(p);
      if (p) {
        setConsent(await latestConsent(p.id));
        setReview(await lastReviewNote(p.id).catch(() => null));
        const [im, pr, ce] = await Promise.all([listImages(p.id), listListings(p.id), listCerts(p.id)]);
        setCounts({ images: im.filter((i) => i.listing_id === null).length, products: pr.length, certs: ce.length });
      }
    } catch (e) { status.setNote({ kind: 'error', text: friendlyError(e) }); setProfile((cur) => (cur === undefined ? null : cur)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);

  if (!online && profile === undefined) return <p className="msg warn">Cần có mạng để soạn hồ sơ website.</p>;
  if (profile === undefined) return <p className="muted">Đang tải…</p>;
  if (profile === null) {
    return (
      <>
        <NoteView note={status.note} />
        <p>Hồ sơ website giới thiệu cơ sở và sản phẩm của bạn tới người mua. Bạn soạn, xem trước, đồng ý công khai rồi gửi duyệt; <strong>chỉ khi được duyệt thông tin mới lên website</strong>.</p>
        <button className="primary" disabled={status.off} onClick={() => void status.run(async () => { await createProfile(org.id, org.name); await load(); }, 'Đã tạo hồ sơ')}>Tạo hồ sơ website</button>
      </>
    );
  }
  const miss = missingItems(profile, consent);
  const st = profile.status;
  const hasContact = Boolean(profile.contact_phone || profile.contact_email || profile.contact_zalo);
  const introOk = Boolean(profile.description && profile.description.trim().length >= 20 && profile.province);

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Soạn và gửi duyệt cần có mạng.</p>}

      <div className="card">
        <div className="row"><h2 className="grow">Trạng thái hồ sơ</h2><span className={PROFILE_STATUS_TONE[st]}>{PROFILE_STATUS_LABEL[st]}</span></div>
        {st === 'changes_requested' && review?.note && <p className="msg warn">Kiểm duyệt viên yêu cầu sửa: {review.note}</p>}
        {st === 'published' && <p className="muted">Đang hiện trên website. Sửa xong hãy gửi duyệt lại; bản cũ vẫn hiện tới khi được duyệt.</p>}
        {st === 'pending_review' && <p className="muted">Đã gửi duyệt, đang chờ kiểm duyệt viên. Nên chờ kết quả trước khi sửa tiếp.</p>}
        {miss.length > 0 && st !== 'pending_review' && (
          <>
            <p><strong>Còn thiếu để gửi duyệt:</strong></p>
            <ul className="checklist">{miss.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        )}
        <NoteView note={status.note} />
        {owner ? (
          <div className="btnrow">
            <button className="primary" disabled={status.off || miss.length > 0 || st === 'pending_review'}
              onClick={() => void status.run(async () => { await submitForReview(profile.id); await load(); }, 'Đã gửi duyệt. Khi được duyệt, hồ sơ sẽ lên website')}>
              {st === 'published' ? 'Gửi duyệt lại' : 'Gửi duyệt'}
            </button>
            {(st === 'published' || st === 'pending_review') && (
              <button className="secondary" disabled={status.off}
                onClick={() => { if (window.confirm('Tạm ẩn hồ sơ khỏi website ngay? Bạn có thể gửi duyệt lại sau.')) void status.run(async () => { await hideProfile(profile.id, false); await load(); }, 'Đã tạm ẩn hồ sơ'); }}>Tạm ẩn</button>
            )}
          </div>
        ) : <p className="muted">Chỉ chủ cơ sở đồng ý công khai và gửi duyệt.</p>}
      </div>

      <Collapsible title="1. Giới thiệu" summary={introOk ? '✔ đủ thông tin' : 'thiếu mô tả hoặc tỉnh/thành'} warn={!introOk} defaultOpen={!introOk}>
        <IntroForm p={profile} onSaved={load} />
      </Collapsible>
      <Collapsible title="2. Liên hệ" summary={profile.contact_confirmed_at ? '✔ đã xác nhận' : hasContact ? 'chưa xác nhận' : 'chưa nhập'} warn={hasContact && !profile.contact_confirmed_at}>
        <ContactForm p={profile} owner={owner} onSaved={load} />
      </Collapsible>
      <Collapsible title="3. Hình ảnh cơ sở" summary={`${counts.images} ảnh`}>
        <ImagesBlock org={org} profileId={profile.id} listingId={null} owner={owner} onChanged={load} />
      </Collapsible>
      <Collapsible title="4. Sản phẩm cung ứng" summary={`${counts.products} sản phẩm`}>
        <ProductsBlock org={org} profileId={profile.id} owner={owner} onChanged={load} />
      </Collapsible>
      <Collapsible title="5. Chứng chỉ công khai" summary={`${counts.certs} chứng chỉ`}>
        <CertsBlock org={org} profileId={profile.id} onChanged={load} />
      </Collapsible>
      <Collapsible title="6. Đồng ý công khai" summary={consent ? `✔ ${new Date(consent.granted_at).toLocaleDateString('vi-VN')}` : 'chưa đồng ý'} warn={!consent}>
        <ConsentBlock org={org} profileId={profile.id} owner={owner} consent={consent} onChanged={load} />
      </Collapsible>
      <Collapsible title="7. Xem trước website" summary="đúng như người mua sẽ thấy">
        <PreviewBlock profileId={profile.id} consent={consent} />
      </Collapsible>
    </>
  );
}

// ------------------------------------------------------------------ 1. giới thiệu
function IntroForm({ p, onSaved }: { p: BizProfile; onSaved: () => Promise<unknown> }) {
  const act = useAction();
  const [f, setF] = useState({
    display_name: p.display_name, tagline: p.tagline ?? '', description: p.description ?? '', province: p.province ?? '', district: p.district ?? '', commune: p.commune ?? '',
    location_precision: p.location_precision, established_year: p.established_year == null ? '' : String(p.established_year),
    total_area: p.total_area == null ? '' : String(p.total_area), area_unit: p.area_unit, practices: p.practices ?? '', capacity_note: p.capacity_note ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function save() {
    if (f.display_name.trim().length < 2) return act.setNote({ kind: 'error', text: 'Hãy nhập tên hiển thị (ít nhất 2 ký tự).' });
    if (f.description.trim().length < 20) return act.setNote({ kind: 'error', text: 'Mô tả cần ít nhất 20 ký tự để gửi duyệt được.' });
    if (!f.province.trim()) return act.setNote({ kind: 'error', text: 'Hãy nhập tỉnh/thành.' });
    const year = f.established_year.trim() === '' ? null : Number(f.established_year);
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return act.setNote({ kind: 'error', text: 'Năm thành lập chưa đúng.' });
    const area = f.total_area.trim() === '' ? null : Number(f.total_area.replace(',', '.'));
    if (area !== null && (Number.isNaN(area) || area < 0)) return act.setNote({ kind: 'error', text: 'Diện tích phải là số không âm.' });
    const patch: Partial<ProfileForm> = { ...f, established_year: year, total_area: area };
    void act.run(async () => { await saveProfile(p.id, patch); await onSaved(); }, 'Đã lưu phần giới thiệu');
  }
  return (
    <div className="inline-form">
      <label>Tên hiển thị trên website<input value={f.display_name} maxLength={120} onChange={set('display_name')} /></label>
      <label>Câu giới thiệu ngắn<input value={f.tagline} maxLength={160} onChange={set('tagline')} placeholder="Ví dụ: Dưa lưới VietGAP, giao hàng toàn quốc" /></label>
      <label>Mô tả (ít nhất 20 ký tự)<textarea rows={5} value={f.description} onChange={set('description')} /></label>
      <div className="pair">
        <label>Tỉnh/thành<input value={f.province} onChange={set('province')} /></label>
        <label>Quận/huyện<input value={f.district} onChange={set('district')} /></label>
      </div>
      <label>Xã/phường<input value={f.commune} onChange={set('commune')} /></label>
      <label>Địa chỉ hiện công khai đến mức
        <select value={f.location_precision} onChange={set('location_precision')}>
          <option value="province">Chỉ tỉnh/thành</option><option value="district">Đến quận/huyện</option><option value="commune">Đến xã/phường</option>
        </select>
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
      <NoteView note={act.note} />
      <button className="primary" disabled={act.off} onClick={save}>{act.busy ? 'Đang lưu…' : 'Lưu'}</button>
    </div>
  );
}

// ------------------------------------------------------------------ 2. liên hệ
function ContactForm({ p, owner, onSaved }: { p: BizProfile; owner: boolean; onSaved: () => Promise<unknown> }) {
  const act = useAction();
  const [f, setF] = useState({ contact_phone: p.contact_phone ?? '', contact_email: p.contact_email ?? '', contact_zalo: p.contact_zalo ?? '', website_url: p.website_url ?? '', facebook_url: p.facebook_url ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const changed = (['contact_phone', 'contact_email', 'contact_zalo', 'website_url', 'facebook_url'] as const).some((k) => (f[k].trim() || null) !== (p[k] ?? null));
  return (
    <div className="inline-form">
      <p className="muted">Chỉ lên website khi chủ đồng ý công khai nhóm "liên hệ" và đã xác nhận bên dưới.</p>
      <label>Điện thoại<input type="tel" value={f.contact_phone} onChange={set('contact_phone')} /></label>
      <label>Zalo<input value={f.contact_zalo} onChange={set('contact_zalo')} /></label>
      <label>Email<input type="email" value={f.contact_email} onChange={set('contact_email')} /></label>
      <label>Website (nếu có)<input value={f.website_url} onChange={set('website_url')} placeholder="https://" /></label>
      <label>Trang Facebook (nếu có)<input value={f.facebook_url} onChange={set('facebook_url')} placeholder="https://" /></label>
      <button className="primary" disabled={act.off} onClick={() => void act.run(async () => { await saveProfile(p.id, f); await onSaved(); }, 'Đã lưu liên hệ' + (owner ? '. Hãy tích xác nhận bên dưới' : ''))}>{act.busy ? 'Đang lưu…' : 'Lưu liên hệ'}</button>
      {changed && <p className="muted">Bạn có thay đổi chưa lưu.</p>}
      {owner ? (
        <label className="check">
          <input type="checkbox" checked={Boolean(p.contact_confirmed_at)} disabled={act.off || changed}
            onChange={(e) => void act.run(async () => { await confirmContact(p.id, e.target.checked); await onSaved(); }, e.target.checked ? 'Đã xác nhận thông tin liên hệ' : 'Đã bỏ xác nhận')} />
          Tôi xác nhận thông tin liên hệ đúng và đồng ý để người mua liên hệ{changed ? ' (lưu trước rồi mới xác nhận)' : ''}
        </label>
      ) : <p className="muted">{p.contact_confirmed_at ? '✔ Chủ cơ sở đã xác nhận liên hệ.' : 'Chủ cơ sở cần xác nhận liên hệ.'}</p>}
      <NoteView note={act.note} />
    </div>
  );
}

// ------------------------------------------------------------------ 3. hình ảnh (cơ sở hoặc một sản phẩm)
function ImagesBlock({ org, profileId, listingId, owner, onChanged }: { org: MyOrg; profileId: string; listingId: string | null; owner: boolean; onChanged: () => Promise<unknown> }) {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const act = useAction();
  const load = useCallback(async () => {
    try { setRows((await listImages(profileId)).filter((r) => r.listing_id === listingId)); } catch (e) { act.setNote({ kind: 'error', text: friendlyError(e) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, listingId]);
  useEffect(() => { void load(); }, [load]);
  const after = async () => { await load(); await onChanged(); };
  const max = 2; // chưa dùng Storage: mỗi chỗ chỉ 1–2 ảnh nhỏ để nhẹ cơ sở dữ liệu (quyết định 22/10/2026)
  return (
    <>
      <div className="imggrid">
        {rows.map((r) => (
          <figure key={r.id}>
            {r.image && <img src={r.image} alt={r.caption ?? ''} />}
            <input defaultValue={r.caption ?? ''} placeholder="Chú thích (gõ xong chạm ra ngoài để lưu)" maxLength={120} aria-label="Chú thích ảnh"
              onBlur={(e) => { if (e.target.value !== (r.caption ?? '')) void act.run(async () => { await updateImage(r.id, { caption: e.target.value || null }); await load(); }, 'Đã lưu chú thích'); }} />
            <label className="check"><input type="checkbox" checked={r.is_public_allowed} disabled={act.off || !owner}
              onChange={(e) => void act.run(async () => { await updateImage(r.id, { is_public_allowed: e.target.checked }); await load(); }, e.target.checked ? 'Ảnh được phép hiện công khai' : 'Ảnh sẽ không hiện công khai')} /> Cho phép hiện công khai</label>
            <button className="icon" disabled={act.off} aria-label="Xóa ảnh" onClick={() => { if (window.confirm('Xóa ảnh này?')) void act.run(async () => { await deleteImage(r.id); await after(); }, 'Đã xóa ảnh'); }}>🗑</button>
          </figure>
        ))}
      </div>
      {rows.length === 0 && <p className="muted">Chưa có ảnh nào.</p>}
      {rows.length < max
        ? <ImagePicker value="" label={`Thêm ảnh (${rows.length}/${max})`} disabled={act.off}
            onChange={(v) => { if (v) void act.run(async () => { await addImage(org.id, profileId, listingId, v, owner, rows.length); await after(); }, owner ? 'Đã thêm ảnh' : 'Đã thêm ảnh (chờ chủ cơ sở cho phép hiện công khai)'); }} />
        : <p className="muted">Đã đủ {max} ảnh.</p>}
      <NoteView note={act.note} />
      <p className="muted">Ảnh chỉ lên website khi được tích "Cho phép hiện công khai" (chỉ chủ tích được) và chủ đồng ý nhóm "hình ảnh" ở bước 6.</p>
    </>
  );
}

// ------------------------------------------------------------------ 4. sản phẩm cung ứng
function ProductsBlock({ org, profileId, owner, onChanged }: { org: MyOrg; profileId: string; owner: boolean; onChanged: () => Promise<unknown> }) {
  const [rows, setRows] = useState<Listing[]>([]);
  const [supply, setSupply] = useState<Map<string, SupplyRow>>(new Map());
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const act = useAction();
  const load = useCallback(async () => {
    try { setRows(await listListings(profileId)); setSupply(await listSupply(profileId)); } catch (e) { act.setNote({ kind: 'error', text: friendlyError(e) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  const after = async () => { await load(); await onChanged(); };
  const cur = rows.find((r) => r.id === editing) ?? null;
  return (
    <>
      <NoteView note={act.note} />
      {!editing && <button className="secondary" onClick={() => { act.setNote(null); setEditing('new'); }}>+ Thêm sản phẩm</button>}
      {editing && (
        <ListingFormView key={cur?.id ?? 'new'} orgId={org.id} initial={cur} busy={act.off} onClose={() => setEditing(null)}
          onSave={(f) => act.run(async () => { const id = await saveListing(org.id, profileId, cur?.id ?? null, f); await after(); setEditing(id); },
            cur ? 'Đã lưu sản phẩm' : 'Đã thêm sản phẩm. Bên dưới bạn có thể thêm hình ảnh cho sản phẩm này')} />
      )}
      {editing && cur && <div className="card slim"><h3 className="sub">Hình ảnh của "{cur.name}"</h3><ImagesBlock org={org} profileId={profileId} listingId={cur.id} owner={owner} onChanged={onChanged} /></div>}
      <table className="grid">
        <thead><tr><th>Sản phẩm ({rows.length})</th><th>Tình trạng cung ứng</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Chưa có sản phẩm. Thêm sản phẩm bạn muốn bán để người mua tìm thấy.</td></tr>}
          {rows.map((l) => {
            const s = supply.get(l.id);
            return (
              <tr key={l.id}>
                <td>{l.name}<span className="sub">{[l.specification, l.unit && `đơn vị ${l.unit}`, l.season].filter(Boolean).join(' · ')}{l.include_in_publication ? '' : ' · KHÔNG đưa lên website'}</span></td>
                <td>{s
                  ? <><span className={s.status === 'available' ? 'pill ok' : 'pill'}>{SUPPLY_LABEL[s.status]}</span>
                    <span className="sub">{[s.expected_from && `từ ${new Date(s.expected_from).toLocaleDateString('vi-VN')}`, s.expected_to && `đến ${new Date(s.expected_to).toLocaleDateString('vi-VN')}`, s.capacity_note].filter(Boolean).join(' · ') || `cập nhật ${new Date(s.status_updated_on).toLocaleDateString('vi-VN')}`}</span></>
                  : <span className="muted">chưa cập nhật</span>}</td>
                <td className="act">
                  <button className="icon" aria-label={`Sửa ${l.name}`} onClick={() => { act.setNote(null); setEditing(editing === l.id ? null : l.id); }}>✎</button>{' '}
                  <button className="icon" disabled={act.off} aria-label={`Xóa ${l.name}`}
                    onClick={() => { if (window.confirm(`Xóa sản phẩm "${l.name}"?`)) void act.run(async () => { await deleteListing(l.id); if (editing === l.id) setEditing(null); await after(); }, `Đã xóa "${l.name}"`); }}>🗑</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 0 && <SupplyForm orgId={org.id} rows={rows} onSaved={load} />}
    </>
  );
}

function ListingFormView({ orgId, initial, busy, onSave, onClose }: { orgId: string; initial: Listing | null; busy: boolean; onSave: (f: ListingForm) => Promise<boolean>; onClose: () => void }) {
  const { cropTypes } = useCatalog();
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []).filter((c) => c.owner_org_id === orgId);
  const [f, setF] = useState({
    name: initial?.name ?? '', description: initial?.description ?? '', specification: initial?.specification ?? '', unit: initial?.unit ?? '', season: initial?.season ?? '',
    price_note: initial?.price_note ?? '', min_order: initial?.min_order ?? '', cycle_id: initial?.cycle_id ?? '', crop_type_id: initial?.crop_type_id ?? '', include: initial?.include_in_publication ?? true,
    category_id: initial?.category_id ?? '', price_from: initial?.price_from != null ? String(initial.price_from) : '',
  });
  const [siteCats, setSiteCats] = useState<SiteCategory[]>([]);
  useEffect(() => { void listSiteCategories().then(setSiteCats).catch(() => setSiteCats([])); }, []);
  const catLabel = (c: SiteCategory) => { const p = siteCats.find((x) => x.id === c.parent_id); return p ? `${p.name} › ${c.name}` : c.name; };
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
        {siteCats.length > 0 && (
          <label>Danh mục trên website
            <select value={f.category_id} onChange={set('category_id')}><option value="">— Chưa chọn —</option>{siteCats.map((c) => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}</select>
            <small>Chọn để người mua tìm thấy sản phẩm trong đúng mục (ví dụ Trái cây, Rau củ quả).</small>
          </label>
        )}
        <label>Mô tả<textarea rows={3} value={f.description} onChange={set('description')} /></label>
        <label>Quy cách<input value={f.specification} onChange={set('specification')} placeholder="Quả 1,5–2 kg, độ ngọt 12–14 Brix" /></label>
        <div className="pair">
          <label>Đơn vị bán<input value={f.unit} maxLength={30} onChange={set('unit')} placeholder="kg, thùng…" /></label>
          <label>Mùa vụ<input value={f.season} maxLength={120} onChange={set('season')} placeholder="Tháng 10 – 12" /></label>
        </div>
        <div className="pair">
          <label>Giá "từ" (đồng, không bắt buộc)<input value={f.price_from} inputMode="numeric" onChange={set('price_from')} placeholder="40000" /></label>
          <label>Giá ghi chữ<input value={f.price_note} maxLength={120} onChange={set('price_note')} placeholder="Liên hệ / 35.000đ/kg" /></label>
          <label>Đặt tối thiểu<input value={f.min_order} maxLength={120} onChange={set('min_order')} placeholder="50 kg" /></label>
        </div>
        <label>Vụ để người mua xem truy xuất (không bắt buộc)
          <select value={f.cycle_id} onChange={set('cycle_id')}><option value="">— Không liên kết —</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}</select>
          <small>Chỉ hiện truy xuất nếu vụ đó đã được bạn bấm "Mở công khai website".</small>
        </label>
        <label className="check"><input type="checkbox" checked={f.include} onChange={(e) => setF({ ...f, include: e.target.checked })} /> Đưa sản phẩm này lên website</label>
        {err && <p className="msg error" role="alert">⚠ {err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (f.name.trim().length < 2) return setErr('Hãy nhập tên sản phẩm (ít nhất 2 ký tự).');
            setErr(null);
            void onSave({ name: f.name, description: f.description, specification: f.specification, unit: f.unit, season: f.season, price_note: f.price_note, min_order: f.min_order, cycle_id: f.cycle_id || null, crop_type_id: f.crop_type_id || null, include_in_publication: f.include, category_id: f.category_id || null, price_from: f.price_from.trim() ? Number(f.price_from.replace(/[^0-9]/g, '')) || null : null });
          }}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>{initial ? 'Đóng' : 'Hủy'}</button>
        </div>
      </div>
    </div>
  );
}

/** Cập nhật tình trạng cung ứng: thêm một dòng mới (có ngày). Sản phẩm đã lên website thì đổi ngay, không cần duyệt lại. Giữ nguyên dữ liệu đã nhập. */
function SupplyForm({ orgId, rows, onSaved }: { orgId: string; rows: Listing[]; onSaved: () => Promise<unknown> }) {
  const act = useAction();
  const [id, setId] = useState('');
  const [status, setStatus] = useState<SupplyStatus>('expected');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const pick = rows.find((r) => r.id === id) ?? rows[0]!;
  function save() {
    if (from && to && to < from) return act.setNote({ kind: 'error', text: 'Ngày kết thúc không thể trước ngày bắt đầu.' });
    void act.run(async () => { await addSupply(orgId, pick.id, { status, from, to, note }); await onSaved(); },
      `Đã cập nhật "${pick.name}": ${SUPPLY_LABEL[status]}. Sản phẩm đã được duyệt sẽ đổi trên website ngay; sản phẩm mới thêm sẽ lên sau khi hồ sơ được duyệt`);
  }
  return (
    <div className="card slim">
      <h3 className="sub">Cập nhật tình trạng cung ứng</h3>
      <div className="inline-form">
        <label>Sản phẩm<select value={pick.id} onChange={(e) => { setId(e.target.value); act.setNote(null); }}>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Tình trạng<select value={status} onChange={(e) => setStatus(e.target.value as SupplyStatus)}>{(Object.keys(SUPPLY_LABEL) as SupplyStatus[]).map((k) => <option key={k} value={k}>{SUPPLY_LABEL[k]}</option>)}</select></label>
        {status === 'available' && <p className="muted">"Đang có hàng" nghĩa là bạn xác nhận hiện có hàng để bán.</p>}
        <div className="pair">
          <label>Dự kiến từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>Ghi chú sản lượng<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Khoảng 2 tấn" /></label>
        <NoteView note={act.note} />
        <button className="secondary" disabled={act.off} onClick={save}>{act.busy ? 'Đang lưu…' : 'Cập nhật tình trạng'}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 5. chứng chỉ
function CertsBlock({ org, profileId, onChanged }: { org: MyOrg; profileId: string; onChanged: () => Promise<unknown> }) {
  const [lic, setLic] = useState<LicenseRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const act = useAction();
  const load = useCallback(async () => {
    try { setLic(await listLicenses(org.id)); setCerts(await listCerts(profileId)); } catch (e) { act.setNote({ kind: 'error', text: friendlyError(e) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id, profileId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      {lic.length === 0 && <p className="muted">Chưa có giấy phép, chứng chỉ. Thêm ở tab Tài khoản → Giấy phép, chứng chỉ rồi quay lại đây chọn cái nào hiện công khai.</p>}
      {lic.map((l) => {
        const c = certs.find((x) => x.license_id === l.id);
        return (
          <label className="check" key={l.id}>
            <input type="checkbox" checked={Boolean(c)} disabled={act.off}
              onChange={(e) => void act.run(async () => { await setCertPublic(org.id, profileId, l, e.target.checked); await load(); await onChanged(); }, e.target.checked ? `Đã chọn công khai "${l.name}"` : `Đã bỏ "${l.name}" khỏi website`)} />
            <span>{l.name}{l.issuer ? ` — ${l.issuer}` : ''}{l.expires_date ? ` (hạn ${new Date(l.expires_date).toLocaleDateString('vi-VN')})` : ''}{c && <small className="muted"> · {CERT_STATUS_LABEL[c.status] ?? c.status}</small>}</span>
          </label>
        );
      })}
      <NoteView note={act.note} />
      <p className="muted">Chứng chỉ bạn tự khai báo sẽ hiện nhãn "Tự khai báo (chưa xác minh)". Chỉ kiểm duyệt viên mới nâng lên "đã xác minh". Chủ cần đồng ý nhóm "chứng chỉ" ở bước 6.</p>
    </>
  );
}

// ------------------------------------------------------------------ 6. đồng ý công khai
function ConsentBlock({ org, profileId, owner, consent, onChanged }: { org: MyOrg; profileId: string; owner: boolean; consent: Consent | null; onChanged: () => Promise<unknown> }) {
  const act = useAction();
  const [scope, setScope] = useState<string[]>(consent?.scope ?? ['profile', 'contact', 'images', 'certifications']);
  const [agree, setAgree] = useState(false);
  const toggle = (k: string) => setScope((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  if (!owner) return <p className="muted">{consent ? `Chủ cơ sở đã đồng ý công khai: ${consent.scope.map((k) => SCOPE_LABEL[k]).join('; ')}.` : 'Chủ cơ sở chưa đồng ý công khai.'}</p>;
  return (
    <>
      <p>Chọn nhóm thông tin bạn <strong>đồng ý công khai trên website</strong>. Nhóm không chọn sẽ không bao giờ hiện ra.</p>
      {Object.keys(SCOPE_LABEL).map((k) => (
        <label className="check" key={k}>
          <input type="checkbox" checked={k === 'profile' ? true : scope.includes(k)} disabled={k === 'profile' || act.off} onChange={() => toggle(k)} /> {SCOPE_LABEL[k]}
        </label>
      ))}
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Tôi là chủ cơ sở và đồng ý công khai các thông tin đã chọn. Tôi hiểu có thể tạm ẩn hoặc rút đồng ý bất cứ lúc nào, và hồ sơ chỉ lên website sau khi được kiểm duyệt.</label>
      <NoteView note={act.note} />
      <div className="btnrow">
        <button className="primary" disabled={act.off || !agree}
          onClick={() => void act.run(async () => { await grantConsent(org.id, profileId, ['profile', ...scope.filter((k) => k !== 'profile')]); setAgree(false); await onChanged(); }, 'Đã ghi nhận đồng ý công khai')}>
          {consent ? 'Cập nhật đồng ý' : 'Đồng ý công khai'}
        </button>
        {consent && <button className="secondary" disabled={act.off}
          onClick={() => { if (window.confirm('Rút đồng ý và gỡ hồ sơ khỏi website ngay?')) void act.run(async () => { await hideProfile(profileId, true); await onChanged(); }, 'Đã rút đồng ý và gỡ hồ sơ khỏi website'); }}>Rút đồng ý</button>}
      </div>
      {consent && <p className="muted">Đang có hiệu lực: {consent.scope.map((k) => (SCOPE_LABEL[k] ?? k).split(' (')[0]).join('; ')}. Đổi nhóm công khai thì cần gửi duyệt lại.</p>}
    </>
  );
}

// ------------------------------------------------------------------ 7. xem trước
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
      ) : <p className="muted">Liên hệ chưa hiện (chưa đồng ý nhóm liên hệ hoặc chưa xác nhận).</p>}
    </div>
  );
}

function PreviewBlock({ profileId, consent }: { profileId: string; consent: Consent | null }) {
  const act = useAction();
  const [pv, setPv] = useState<Preview | null>(null);
  const scope = consent?.scope ?? ['profile'];
  return (
    <>
      <p className="muted">Dựng theo nhóm thông tin bạn đã đồng ý{consent ? '' : ' (chưa đồng ý: chỉ có phần giới thiệu)'}. Bấm lại để cập nhật sau khi sửa.</p>
      <button className="secondary" disabled={act.off} onClick={() => void act.run(async () => setPv(await previewProfile(profileId, scope)))}>{act.busy ? 'Đang dựng…' : pv ? 'Dựng lại' : 'Xem trước'}</button>
      <NoteView note={act.note} />
      {pv && <PreviewView pv={pv} />}
    </>
  );
}
