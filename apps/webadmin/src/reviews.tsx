import { useState } from 'react';
import { clean, Err, fmtDateTime, rpc, useLoad } from '@agriconnect/admin-kit';

/** Duyệt hồ sơ nhà cung cấp và quản lý vụ công khai: chuyển từ quản trị nền tảng sang quản trị website (D63). Hiện chỉ quản trị viên nền tảng gọi được (hàm admin_* ở CSDL). */
// ============================================================ Duyệt hồ sơ
interface ProfileRow { profile_id: string; org: string; display_name: string; province: string | null; status: string; slug: string | null; changed_at: string }
interface PackImg { src: string; caption: string | null }
interface PackProfile { display_name: string; tagline?: string; description?: string; province?: string; district?: string; commune?: string; established_year?: number; total_area?: number; area_unit?: string; practices?: string; capacity_note?: string; images?: PackImg[]; certifications?: { name: string; issuer?: string; status: string; number?: string; expires?: string }[]; contact?: { phone?: string; email?: string; zalo?: string; website?: string; facebook?: string } }
interface ReviewPack { scope: string[]; consent_at: string; preview: { profile: PackProfile; products: { id: string; supply_status: string | null; snapshot: { name: string; description?: string; specification?: string; unit?: string; season?: string; price_note?: string; min_order?: string; trace_code?: string; images?: PackImg[] } }[] } }
function ReviewPackView({ pack, onClose }: { pack: ReviewPack; onClose: () => void }) {
  const p = pack.preview.profile;
  return (
    <section className="card">
      <div className="toolbar"><strong>Xem trước đúng như website sẽ hiện</strong><button onClick={onClose}>Đóng</button></div>
      <p className="muted">Chủ đã đồng ý công khai: {pack.scope.join(', ')} (lúc {fmtDateTime(pack.consent_at)}). Chỉ những nhóm này mới lên website.</p>
      <h2>{p.display_name}</h2>
      {p.tagline && <p><em>{p.tagline}</em></p>}
      <p className="muted">{[p.commune, p.district, p.province].filter(Boolean).join(', ')}</p>
      {(p.images ?? []).map((i, k) => <img key={k} src={i.src} alt={i.caption ?? ''} style={{ height: 90, borderRadius: 6, marginRight: 6 }} />)}
      <p>{p.description}</p>
      <p className="muted">{[p.established_year && 'Thành lập ' + p.established_year, p.total_area != null && 'Diện tích ' + p.total_area + ' ' + (p.area_unit === 'm2' ? 'm²' : 'ha'), p.practices, p.capacity_note].filter(Boolean).join(' · ')}</p>
      {(p.certifications ?? []).map((c, k) => <p key={k}>🏅 {c.name} {c.number ? '· số ' + c.number : ''} <span className="muted">({c.status})</span></p>)}
      {pack.preview.products.map((x) => (
        <p key={x.id}><strong>{x.snapshot.name}</strong> — {[x.snapshot.specification, x.snapshot.unit, x.snapshot.season, x.snapshot.price_note, x.snapshot.min_order].filter(Boolean).join(' · ')} {x.supply_status && <span className="muted">[{x.supply_status}]</span>} {x.snapshot.trace_code && <span className="muted">truy xuất {x.snapshot.trace_code}</span>}</p>
      ))}
      {p.contact ? <p>📞 {[p.contact.phone, p.contact.zalo && 'Zalo ' + p.contact.zalo, p.contact.email, p.contact.website, p.contact.facebook].filter(Boolean).join(' · ')}</p> : <p className="muted">Không công khai liên hệ.</p>}
    </section>
  );
}
export function ReviewsPage() {
  const [tab, setTab] = useState<'pending_review' | 'published' | 'hidden'>('pending_review');
  const { data, error, reload } = useLoad(() => rpc<ProfileRow[]>('admin_list_profiles', { p_status: tab }), [tab]);
  const [err, setErr] = useState<string | null>(null);
  const [pack, setPack] = useState<ReviewPack | null>(null);
  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try { await fn(); setPack(null); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <div className="toolbar">
        {([['pending_review', 'Chờ duyệt'], ['published', 'Đang công khai'], ['hidden', 'Đã ẩn']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <Err e={error ?? err} />
      {pack && <ReviewPackView pack={pack} onClose={() => setPack(null)} />}
      <table className="list"><thead><tr><th>Hồ sơ</th><th>Cơ sở</th><th>Tỉnh/thành</th><th>Cập nhật</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">Không có hồ sơ nào ở mục này. (Hồ sơ do chủ cơ sở soạn và gửi duyệt trong app, mục Tổ chức → Hồ sơ website.)</td></tr>}
          {(data ?? []).map((p) => (
            <tr key={p.profile_id}>
              <td><strong>{p.display_name}</strong>{p.slug && <small>/{p.slug}</small>}</td><td>{p.org}</td><td>{p.province}</td><td>{fmtDateTime(p.changed_at)}</td>
              <td className="acts">
                <button onClick={() => { setErr(null); rpc<ReviewPack>('review_pack', { p_profile: p.profile_id }).then(setPack).catch((e) => setErr(clean(e instanceof Error ? e.message : String(e)))); }}>Xem trước</button>
                {tab === 'pending_review' && <>
                  <button className="primary" onClick={() => void act(() => rpc('approve_and_publish', { p_profile: p.profile_id, p_note: null }))}>Duyệt và công khai</button>
                  <button onClick={() => { const n = window.prompt('Nội dung cần chủ cơ sở chỉnh sửa?'); if (n) void act(() => rpc('review_profile', { p_profile: p.profile_id, p_decision: 'changes_requested', p_note: n })); }}>Yêu cầu sửa</button>
                </>}
                {tab === 'published' && <button className="danger" onClick={() => { if (window.confirm('Tạm ẩn hồ sơ này khỏi website?')) void act(() => rpc('hide_profile', { p_profile: p.profile_id, p_withdraw: false })); }}>Tạm ẩn</button>}
              </td>
            </tr>))}
        </tbody></table>
    </>
  );
}

// ============================================================ Vụ công khai
interface PubCycle { cycle_id: string; code: string; name: string; org: string; visible: boolean; hidden_by_admin: boolean; published_at: string }
export function PublicCyclesPage() {
  const { data, error, reload } = useLoad(() => rpc<PubCycle[]>('admin_list_public_cycles'));
  const [err, setErr] = useState<string | null>(null);
  async function hide(c: PubCycle, hide: boolean) {
    const reason = window.prompt(hide ? 'Lý do tạm ẩn vụ này (ít nhất 5 ký tự)?' : 'Lý do cho phép công khai lại?');
    if (!reason) return;
    setErr(null);
    try { await rpc('admin_hide_public_cycle', { p_cycle: c.cycle_id, p_hide: hide, p_reason: reason }); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); }
  }
  return (
    <>
      <p className="muted">Các vụ do chủ cơ sở bấm "Công khai vụ lên website". Quản trị viên chỉ có thể tạm ẩn khi thông tin sai hoặc vi phạm; chủ cơ sở không công khai lại được cho tới khi bạn cho phép.</p>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Mã</th><th>Vụ</th><th>Cơ sở</th><th>Công khai lúc</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có vụ nào được công khai.</td></tr>}
          {(data ?? []).map((c) => (
            <tr key={c.cycle_id}>
              <td><code>{c.code}</code></td><td>{c.name}</td><td>{c.org}</td><td>{fmtDateTime(c.published_at)}</td>
              <td>{c.hidden_by_admin ? <span className="badge bad">Bị ẩn bởi quản trị</span> : c.visible ? <span className="badge ok">Đang công khai</span> : <span className="badge">Chủ đã ngừng</span>}</td>
              <td>{c.hidden_by_admin ? <button onClick={() => void hide(c, false)}>Cho phép lại</button> : c.visible && <button className="danger" onClick={() => void hide(c, true)}>Tạm ẩn</button>}</td>
            </tr>))}
        </tbody></table>
    </>
  );
}

