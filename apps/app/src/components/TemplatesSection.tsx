import { useConfig } from '../lib/config';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TemplateEditor } from './TemplateEditor';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useCatalog } from '../lib/catalog';
import { createTemplate, deleteTemplate, listTemplates, refreshCatalogCache, totalDays, type TemplateRow } from '../lib/templates';

/**
 * Quy trình mùa vụ mẫu của cơ sở: một bảng gọn (quy trình, số công đoạn, số ngày), bấm "Mở" để soạn.
 * Mỗi hộ/HTX có bộ mẫu riêng; vụ thật sẽ được tạo theo mẫu (P2). Cần mạng để soạn.
 */
export function TemplatesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const { cropTypes: crops } = useCatalog();
  const cfg = useConfig();
  const [openId, setOpenId] = useState<string | null>(null);
  const [cropId, setCropId] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try {
      setTemplates(await listTemplates(active.id));
      void refreshCatalogCache().catch(() => undefined);
    } catch (e) { setError(friendlyError(e)); }
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const canManage = canPerm(active.perms, 'declare', 'edit');
  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? '—';
  const activeCrops = crops.filter((c) => c.is_active && cfg.kindOn(c.kind));
  const effCrop = cropId || activeCrops[0]?.id || '';
  const rows = [...templates].sort((a, b) => cropName(a.crop_type_id).localeCompare(cropName(b.crop_type_id), 'vi') || a.name.localeCompare(b.name, 'vi'));

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!effCrop) return setError('Hãy chọn sản phẩm.');
    if (name.trim().length < 2) return setError('Hãy đặt tên cho quy trình (ít nhất 2 ký tự).');
    setBusy(true);
    setError(null);
    createTemplate(active!.id, effCrop, name, desc)
      .then((id) => { setName(''); setDesc(''); setOpenId(id); }) // mở ngay để thêm công đoạn
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setBusy(false));
  }

  function onDelete(t: TemplateRow) {
    if (!window.confirm(`Xóa quy trình "${t.name}" cùng ${t.template_stages.length} việc? Không khôi phục được. Nếu đã có vụ dùng quy trình này thì chỉ có thể ngừng dùng.`)) return;
    setBusy(true);
    setError(null);
    deleteTemplate(t.id)
      .then(() => load())
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setBusy(false));
  }

  if (openId) {
    return <TemplateEditor templateId={openId} canEdit={canManage} onBack={() => { setOpenId(null); void load(); }} onOpenOther={(id) => setOpenId(id)} />;
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Soạn mẫu cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (activeCrops.length === 0 ? (
        <p className="msg warn">Chưa có sản phẩm nào. Hãy thêm ở mục "Sản phẩm" trước.</p>
      ) : (
        <form className="quickadd" onSubmit={onCreate} noValidate>
          <select value={effCrop} onChange={(e) => setCropId(e.target.value)} aria-label="Sản phẩm">
            {activeCrops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên quy trình mới" aria-label="Tên quy trình mới" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (áp dụng khi nào…)" aria-label="Mô tả quy trình mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Tạo</button>
        </form>
      ))}

      <table className="grid">
        <thead><tr><th>Quy trình ({rows.length})</th><th className="num">Việc</th><th className="num">Ngày</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="muted">Chưa có quy trình mẫu. Phải có mẫu cho sản phẩm nào thì mới tạo được vụ của sản phẩm đó.</td></tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className={t.is_active ? '' : 'off'}>
              <td>
                {t.name}
                {t.note && <span className="sub">{t.note}</span>}
                <span className="sub">{cropName(t.crop_type_id)}{t.is_active ? '' : ' · ngừng dùng'}</span>
              </td>
              <td className="num">{t.template_stages.length}</td>
              <td className="num">{totalDays(t.template_stages)}</td>
              <td className="act">
                <button className="secondary" style={{ minHeight: 40, width: 'auto', margin: 0, padding: '0 12px' }} onClick={() => setOpenId(t.id)}>{canManage ? 'Mở' : 'Xem'}</button>
                {canManage && (
                  <>{' '}<button className="icon" disabled={busy || !online} aria-label={`Xóa quy trình ${t.name}`}
                    onClick={() => onDelete(t)}>🗑</button></>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Mỗi hộ/HTX có bộ mẫu riêng. Sửa mẫu không đổi các vụ đã tạo.</p>
    </>
  );
}
