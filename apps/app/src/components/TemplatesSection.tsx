import { useConfig } from '../lib/config';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TemplateEditor } from './TemplateEditor';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useCatalog } from '../lib/catalog';
import { Collapsible } from './Collapsible';
import {
  applySystemTemplate, createTemplate, deleteTemplate, IMPORTANCE_LABEL, listSystemTemplates, listTemplates, refreshCatalogCache, totalDays,
  type SystemTemplate, type TemplateRow,
} from '../lib/templates';

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
  const [tab, setTab] = useState<'org' | 'system'>('org');
  const [systems, setSystems] = useState<SystemTemplate[]>([]);

  const load = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try {
      setTemplates(await listTemplates(active.id));
      setSystems(await listSystemTemplates());
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

      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tab === 'org'} className={tab === 'org' ? 'chip active' : 'chip'} onClick={() => setTab('org')}>Quy trình của cơ sở</button>{' '}
        <button role="tab" aria-selected={tab === 'system'} className={tab === 'system' ? 'chip active' : 'chip'} onClick={() => setTab('system')}>Mẫu hệ thống</button>
      </div>

      {tab === 'system' ? (
        <SystemTemplates systems={systems.filter((s) => cfg.kindOn(s.kind))} crops={activeCrops} canManage={canManage} online={online} busy={busy}
          onApply={(sys, cropId, nm) => {
            setBusy(true); setError(null);
            applySystemTemplate(active!.id, sys.id, cropId, nm).then((id) => { setTab('org'); setOpenId(id); }).catch((err) => setError(friendlyError(err))).finally(() => setBusy(false));
          }} />
      ) : (
      <>

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
      <p className="muted">Mỗi hộ/HTX có bộ mẫu riêng. Sửa mẫu không đổi các vụ đã tạo. Chưa có quy trình? Xem tab "Mẫu hệ thống" rồi bấm "Áp dụng cho cơ sở của tôi".</p>
      </>
      )}
    </>
  );
}

/** Tab "Mẫu hệ thống": xem trước dạng công đoạn → việc và áp dụng (sao) thành quy trình riêng của cơ sở, sau đó sửa tùy ý */
function SystemTemplates({ systems, crops, canManage, online, busy, onApply }: {
  systems: SystemTemplate[]; crops: { id: string; name: string; kind?: string | null }[]; canManage: boolean; online: boolean; busy: boolean;
  onApply: (sys: SystemTemplate, cropId: string, name: string) => void;
}) {
  const { workTypes } = useCatalog();
  const wtName = (id: string) => workTypes.find((w) => w.id === id)?.name ?? 'Việc';
  if (systems.length === 0) return <p className="muted">Chưa có mẫu hệ thống nào cho loại đối tượng cơ sở đang sử dụng (xem Cấu hình → Nhóm loại sản phẩm).</p>;
  return (
    <>
      <p className="muted">Mẫu do hệ thống soạn theo đúng đối tượng của cơ sở. Bấm "Áp dụng cho cơ sở của tôi" để tạo một quy trình riêng từ mẫu, rồi sửa lại tùy ý; sửa sau đó không ảnh hưởng mẫu hệ thống.</p>
      {systems.map((s) => <SystemTemplateCard key={s.id} sys={s} crops={crops.filter((c) => c.kind === s.kind)} canManage={canManage} online={online} busy={busy} wtName={wtName} onApply={onApply} />)}
    </>
  );
}

function SystemTemplateCard({ sys, crops, canManage, online, busy, wtName, onApply }: {
  sys: SystemTemplate; crops: { id: string; name: string }[]; canManage: boolean; online: boolean; busy: boolean; wtName: (id: string) => string;
  onApply: (sys: SystemTemplate, cropId: string, name: string) => void;
}) {
  const phases = [...sys.system_template_phases].sort((a, b) => a.seq - b.seq);
  const stages = [...sys.system_template_stages].sort((a, b) => a.seq - b.seq);
  const days = totalDays(stages);
  const [cropId, setCropId] = useState(sys.crop_type_id && crops.some((c) => c.id === sys.crop_type_id) ? sys.crop_type_id : crops[0]?.id ?? '');
  const [name, setName] = useState('');
  return (
    <Collapsible title={sys.name} summary={`${phases.length} công đoạn · ${stages.length} việc · ${days} ngày`}>
      {sys.description && <p>{sys.description}</p>}
      {sys.source && <p className="muted">Nguồn: {sys.source}. Bản tham khảo, hãy đối chiếu với kỹ thuật của cơ sở.</p>}
      {phases.map((p, i) => (
        <div className="card slim" key={p.id}>
          <strong>{p.code?.trim() || i + 1}. {p.name}</strong>
          {p.description && <span className="sub">{p.description}</span>}
          {stages.filter((s) => s.phase_id === p.id).map((s, j) => (
            <p key={s.id} className="muted">
              {p.code?.trim() || i + 1}.{j + 1} {wtName(s.work_type_id)} · {s.duration_days} ngày{s.start_day ? ` từ ngày ${s.start_day}` : ''}{s.repeat_every_days ? ` · lặp mỗi ${s.repeat_every_days} ngày` : ''} · Quan trọng: {IMPORTANCE_LABEL[s.importance]}{s.note ? ` · ${s.note}` : ''}
            </p>
          ))}
        </div>
      ))}
      {canManage && (
        crops.length === 0 ? (
          <p className="msg warn">Cơ sở chưa có sản phẩm cùng loại với mẫu này. Hãy thêm sản phẩm ở mục "Sản phẩm" trước.</p>
        ) : (
          <div className="inline-form">
            <label>Áp dụng cho sản phẩm
              <select value={cropId} onChange={(e) => setCropId(e.target.value)}>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label>Tên quy trình của cơ sở (không bắt buộc)<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={sys.name} /></label>
            <div className="btnrow"><button className="primary" disabled={busy || !online || !cropId} onClick={() => onApply(sys, cropId, name)}>Áp dụng cho cơ sở của tôi</button></div>
          </div>
        )
      )}
    </Collapsible>
  );
}

