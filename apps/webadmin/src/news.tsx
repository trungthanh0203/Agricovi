import { useState, type FormEvent } from 'react';
import { clean, Err, fmtDateTime, rpc, supabase, useLoad } from '@agriconnect/admin-kit';
import { newsSections } from '@agriconnect/shared';
import { canPublish } from './site';

/**
 * Nguồn tin tự động: danh sách nguồn RSS; mỗi tuần (GitHub Actions) hoặc khi bấm "Lấy tin ngay", hệ thống lấy tiêu đề, tóm tắt và liên kết về
 * làm BẢN NHÁP trong "Bài viết và tin hội chợ". Biên tập viên xem, chỉnh rồi mới đăng. Hướng dẫn: docs/HUONG_DAN_QUAN_TRI_WEBSITE.md.
 */
interface Src { id: string; name: string; feed_url: string; channel: string; section: string | null; keywords: string[]; is_active: boolean; max_items: number; last_run_at: string | null; last_status: string | null; last_count: number }
interface Form { id: string | null; name: string; feed_url: string; channel: string; section: string; keywords: string; is_active: boolean; max_items: string }
const CHANNEL: Record<string, string> = { nong_nghiep: 'Tin nông nghiệp', xuat_khau: 'Tin xuất khẩu', hoi_cho: 'Tin hội chợ' };
const empty: Form = { id: null, name: '', feed_url: '', channel: 'nong_nghiep', section: '', keywords: '', is_active: true, max_items: '10' };

export function SiteNewsSourcesPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(() => rpc<Src[]>('site_list_news_sources'));
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chief = canPublish(roles);

  const edit = (s: Src) => setF({ id: s.id, name: s.name, feed_url: s.feed_url, channel: s.channel, section: s.section ?? '', keywords: s.keywords.join(', '), is_active: s.is_active, max_items: String(s.max_items) });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      await rpc('site_save_news_source', { p_id: f.id, p_name: f.name, p_feed_url: f.feed_url, p_channel: f.channel, p_section: f.channel === 'hoi_cho' ? '' : f.section, p_keywords: f.keywords, p_active: f.is_active, p_max: Number(f.max_items) || 10 });
      setF(null); setMsg('Đã lưu nguồn tin.'); reload();
    } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
    setBusy(false);
  }
  async function remove(s: Src) {
    if (!window.confirm(`Xóa nguồn "${s.name}"? Các bản nháp đã lấy về vẫn giữ nguyên.`)) return;
    try { await rpc('site_delete_news_source', { p_id: s.id }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  async function runNow(sourceId?: string) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { data: res, error: e } = await supabase!.functions.invoke('news-fetch', { body: sourceId ? { source_id: sourceId } : {} });
      if (e) throw new Error(e.message);
      const r = (res as { results?: { name: string; added: number; status: string }[] }).results ?? [];
      const total = r.reduce((a, x) => a + x.added, 0);
      setMsg(`Đã chạy ${r.length} nguồn, thêm ${total} bản nháp mới.` + r.filter((x) => x.status !== 'ok').map((x) => ` ${x.name}: ${x.status}.`).join(''));
      reload();
    } catch (x) { setErr('Chưa lấy được tin: ' + clean(x instanceof Error ? x.message : String(x)) + ' (Hàm news-fetch đã được triển khai chưa?)'); }
    setBusy(false);
  }

  return (
    <>
      <p className="muted">Hệ thống tự lấy tin mới mỗi tuần một lần từ các nguồn bạn khai báo (địa chỉ RSS). Chỉ lấy <b>tiêu đề, tóm tắt ngắn và liên kết về bài gốc</b> làm bản nháp trong
        {' '}<b>Bài viết và tin hội chợ</b>; bạn xem, chỉnh rồi mới đăng. Tin hội chợ cần bạn điền thêm ngày, nơi tổ chức.</p>
      <Err e={error ?? err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      {!f && (
        <div className="toolbar">
          <button className="primary" onClick={() => { setMsg(null); setF(empty); }}>+ Thêm nguồn tin</button>
          <button disabled={busy || (data ?? []).length === 0} onClick={() => void runNow()}>{busy ? 'Đang lấy tin…' : '⬇ Lấy tin ngay'}</button>
        </div>
      )}
      {f && (
        <section className="card">
          <h2>{f.id ? 'Sửa nguồn tin' : 'Thêm nguồn tin'}</h2>
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Tên nguồn (hiện là "Nguồn: …" ở bài viết)<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></label>
            <label>Địa chỉ RSS (bắt đầu bằng https://)<input value={f.feed_url} onChange={(e) => setF({ ...f, feed_url: e.target.value })} required placeholder="https://tenbao.vn/rss/nong-nghiep.rss" />
              <small>Mở trang tin của báo, tìm biểu tượng RSS hoặc chữ "RSS" ở chân trang, sao chép địa chỉ.</small></label>
            <label>Đưa vào chuyên mục
              <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value, section: '' })}>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {newsSections(f.channel as 'nong_nghiep' | 'xuat_khau' | 'hoi_cho').length > 0 ? (
              <label>Mục con trong chuyên mục
                <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">(Chung, không chọn mục con)</option>{newsSections(f.channel as 'nong_nghiep' | 'xuat_khau' | 'hoi_cho').map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}</select></label>
            ) : <p className="muted">Tin hội chợ tự chia thành Sắp diễn ra / Đã diễn ra / Lịch theo ngày nên không chọn mục con.</p>}
            <label>Từ khóa lọc (cách nhau bằng dấu phẩy; để trống là lấy hết)
              <input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="nông sản, xuất khẩu gạo, hội chợ" />
              <small>Báo tổng hợp nên đặt từ khóa để không lấy tin không liên quan. Không phân biệt dấu và chữ hoa.</small></label>
            <label>Số tin tối đa mỗi lần<input type="number" min={1} max={30} value={f.max_items} onChange={(e) => setF({ ...f, max_items: e.target.value })} /></label>
            <label><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Đang bật (tắt thì tạm không lấy)</label>
            <div className="toolbar"><button className="primary" disabled={busy}>Lưu</button><button type="button" onClick={() => setF(null)}>Hủy</button></div>
          </form>
        </section>
      )}
      <table className="list"><thead><tr><th>Nguồn</th><th>Vào chuyên mục</th><th>Lần chạy gần nhất</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong>{!s.is_active && <small>Đang tắt</small>}<small>{s.feed_url}</small>{s.keywords.length > 0 && <small>Từ khóa: {s.keywords.join(', ')}</small>}</td>
              <td>{CHANNEL[s.channel]}{s.section ? ` / ${s.section}` : ''}</td>
              <td>{s.last_run_at ? fmtDateTime(s.last_run_at) : 'Chưa chạy'}<small>{s.last_status ?? ''}</small></td>
              <td className="acts">
                <button onClick={() => edit(s)}>Sửa</button>
                <button disabled={busy} onClick={() => void runNow(s.id)}>Lấy thử</button>
                {chief && <button onClick={() => void remove(s)}>Xóa</button>}
              </td>
            </tr>))}
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa có nguồn tin nào. Bấm "Thêm nguồn tin".</td></tr>}
        </tbody></table>
    </>
  );
}
