import { useState } from 'react';
import { Plural } from '@lingui/react/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { KIND_GROUP_LABEL } from '../lib/labels';
import { KIND_GROUP } from '../lib/logGroups';

export interface LogTarget { id: string; title: string; place: string; kind: string; status: string; lastAt: string | null; topId: string; topName: string }

/**
 * Bước 1 của Ghi việc: "Ghi cho đối tượng nào?" — thẻ chọn nhóm theo loại (trồng trọt, vật nuôi, thủy sản) và một thẻ cho khu vực / cơ sở vật chất.
 * Vụ ghi lần trước nằm trên cùng. Từ 8 vụ trở lên chỉ hiện các vụ gần đây, có ô tìm kiếm và nút "Xem tất cả".
 */
export function LogTargetPicker({ targets, rememberedId, hasAreas, onPickCycle, onPickArea, onCancel }: {
  targets: LogTarget[]; rememberedId: string | null; hasAreas: boolean;
  onPickCycle: (id: string) => void; onPickArea: () => void; onCancel: () => void;
}) {
  // Chọn phân khu trước (D216): từ 2 phân khu trở lên thì chưa liệt kê vụ cho tới khi chọn; "Tất cả phân khu" là một mục
  const { t: tx, i18n } = useLingui();
  const [areaSel, setAreaSel] = useState('');
  const tops = [...new Map(targets.map((t) => [t.topId, t.topName])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'vi'));
  const gate = tops.length >= 2;
  const pending = gate && areaSel === '';
  const inArea = pending ? [] : areaSel && areaSel !== 'all' ? targets.filter((t) => t.topId === areaSel) : targets;
  const many = inArea.length >= 8;
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const norm = (s: string) => s.toLowerCase();
  const byRecent = [...inArea].sort((a, b) => (b.id === rememberedId ? 1 : 0) - (a.id === rememberedId ? 1 : 0) || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  const shown = !many || all || q.trim()
    ? byRecent.filter((t) => !q.trim() || norm(`${t.title} ${t.place}`).includes(norm(q.trim())))
    : byRecent.slice(0, 6);
  const remembered = shown.find((t) => t.id === rememberedId) ?? (pending ? targets.find((t) => t.id === rememberedId) : undefined);   // nút "Tiếp tục" luôn hiện để ghi nhanh

  return (
    <>
      <p className="muted"><Trans>Bạn ghi việc cho đối tượng nào?</Trans></p>
      {gate && (
        <label><Trans>Phân khu</Trans>
          <select value={areaSel} onChange={(e) => { setAreaSel(e.target.value); setAll(false); setQ(''); }}>
            <option value="" disabled>{tx`Chọn phân khu`}</option>
            <option value="all">{tx`Tất cả phân khu`}</option>
            {tops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )}
      {pending && <p className="muted"><Trans>Chọn phân khu để xem các vụ.</Trans></p>}
      {many && <input type="search" placeholder={tx`Tìm vụ theo tên hoặc nơi…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx`Tìm vụ`} />}
      {remembered && !q.trim() && (
        <button type="button" className="bigchoice" onClick={() => onPickCycle(remembered.id)}>
          <strong><Trans>Tiếp tục: {remembered.title}</Trans></strong><br /><small>{remembered.place} · <Trans>lần ghi trước</Trans></small>
        </button>
      )}
      {KIND_GROUP.map((g) => {
        const list = shown.filter((t) => (g.kind === 'other' ? !['crop', 'livestock', 'aquatic'].includes(t.kind) : t.kind === g.kind) && !(t.id === remembered?.id && !q.trim()));
        if (list.length === 0) return null;
        return (
          <section key={g.kind}>
            <h2 className="logsect">{KIND_GROUP_LABEL[g.kind] ? i18n._(KIND_GROUP_LABEL[g.kind]!) : g.label}</h2>
            <div className="grid2">
              {list.map((t) => (
                <button key={t.id} type="button" className="bigchoice" onClick={() => onPickCycle(t.id)}>
                  {t.title}<br /><small>{t.place} · {t.status}</small>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {many && !all && !q.trim() && targets.length > shown.length && <button type="button" className="link" onClick={() => setAll(true)}><Plural value={targets.length} one="Xem tất cả # vụ" other="Xem tất cả # vụ" /></button>}
      {shown.length === 0 && targets.length > 0 && <p className="muted"><Trans>Không có vụ nào khớp.</Trans></p>}
      {hasAreas && (
        <section>
          <h2 className="logsect"><Trans>🏠 Khu vực / cơ sở vật chất</Trans></h2>
          <button type="button" className="bigchoice" onClick={onPickArea}><Trans>Khu vực, cổng, kho, biogas… (không gắn vụ)</Trans></button>
        </section>
      )}
      <button type="button" className="link" onClick={onCancel}><Trans>Hủy</Trans></button>
    </>
  );
}
