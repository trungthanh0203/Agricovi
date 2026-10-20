import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TemplateEditor } from './TemplateEditor';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import {
  createTemplate, duplicateTemplate, listCrops, listTemplates, totalDays, updateTemplate, type CropRow, type TemplateRow,
} from '../lib/templates';

/**
 * Quy trình mùa vụ mẫu của cơ sở: mỗi cây một hoặc nhiều mẫu. Vụ thật sẽ được tạo theo mẫu (P2).
 * Mỗi hộ/HTX có bộ mẫu riêng. Cần mạng để soạn.
 */
export function TemplatesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cropId, setCropId] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [copying, setCopying] = useState<string | null>(null);
  const [copyName, setCopyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try {
      const [t, c] = await Promise.all([listTemplates(active.id), listCrops(active.id)]);
      setTemplates(t);
      setCrops(c.filter((x) => x.is_active));
    } catch (e) { setError(friendlyError(e)); }
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const canManage = canManageProduction(active.roles);
  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? '—';
  const effCrop = cropId || crops[0]?.id || '';

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!effCrop) return setError('Hãy chọn cây trồng.');
    if (name.trim().length < 2) return setError('Hãy đặt tên cho quy trình (ít nhất 2 ký tự).');
    void run(async () => {
      const id = await createTemplate(active!.id, effCrop, name, note);
      setName('');
      setNote('');
      setOpenId(id); // mở ngay để thêm giai đoạn
    });
  }

  if (openId) {
    return <TemplateEditor templateId={openId} canEdit={canManage} onBack={() => { setOpenId(null); void load(); }} />;
  }

  const byCrop = new Map<string, TemplateRow[]>();
  for (const t of templates) byCrop.set(t.crop_type_id, [...(byCrop.get(t.crop_type_id) ?? []), t]);

  return (
    <>
      <p className="muted">
        Quy trình mẫu cho biết một vụ gồm những giai đoạn nào, mỗi giai đoạn bao nhiêu ngày và làm việc gì. Khi tạo vụ thật, vụ được lấy theo mẫu này.
        Mỗi hộ/HTX có bộ mẫu riêng của mình.
      </p>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Soạn mẫu cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {templates.length === 0 && (
        <div className="card">
          <p>Chưa có quy trình mẫu nào.</p>
          <p className="muted">Phải có mẫu cho cây nào thì mới tạo được vụ của cây đó. Hãy tạo mẫu đầu tiên bên dưới.</p>
        </div>
      )}

      {[...byCrop.entries()].map(([cid, list]) => (
        <div key={cid}>
          <h2 className="sect">{cropName(cid)}</h2>
          {list.map((t) => {
            const days = totalDays(t.template_stages);
            return (
              <div className="card slim" key={t.id}>
                <div className="row">
                  <strong className="grow">{t.name}</strong>
                  {!t.is_active && <span className="pill warn">Ngừng dùng</span>}
                </div>
                <p className="muted">{t.template_stages.length} giai đoạn · {days} ngày · bản {t.version}</p>
                {t.note && <p>{t.note}</p>}
                <div className="actions">
                  <button className="secondary" onClick={() => setOpenId(t.id)}>{canManage ? 'Mở và sửa' : 'Xem'}</button>
                  {canManage && (
                    <button className="secondary" disabled={!online || busy} onClick={() => { setCopying(copying === t.id ? null : t.id); setCopyName(`${t.name} (bản sao)`); }}>Nhân bản</button>
                  )}
                  {canManage && (
                    <button className="secondary" disabled={!online || busy} onClick={() => void run(() => updateTemplate(t.id, { is_active: !t.is_active }))}>
                      {t.is_active ? 'Ngừng dùng' : 'Dùng lại'}
                    </button>
                  )}
                </div>
                {copying === t.id && (
                  <div className="inline-form">
                    <label>Tên mẫu mới<input value={copyName} onChange={(e) => setCopyName(e.target.value)} /></label>
                    <button className="primary" disabled={busy || !online || copyName.trim().length < 2}
                      onClick={() => void run(async () => { const id = await duplicateTemplate(t.id, copyName); setCopying(null); setOpenId(id); })}>Tạo bản sao</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {canManage && (
        <form className="inline-form" onSubmit={onCreate} noValidate>
          <h2 className="sect">Tạo quy trình mẫu mới</h2>
          {crops.length === 0 ? (
            <p className="msg warn">Chưa có cây trồng nào. Hãy thêm ở mục "Cây trồng" trước (cần mạng để tải danh sách).</p>
          ) : (
            <>
              <label>
                Cây trồng
                <select value={effCrop} onChange={(e) => setCropId(e.target.value)}>
                  {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Tên quy trình<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Dưa lưới mùa khô" /></label>
              <label>Ghi chú (không bắt buộc)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button type="submit" className="primary" disabled={busy || !online}>Tạo và thêm giai đoạn</button>
            </>
          )}
        </form>
      )}
    </>
  );
}
