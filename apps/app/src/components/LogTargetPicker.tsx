import { useState } from 'react';
import { KIND_GROUP } from '../lib/logGroups';

export interface LogTarget { id: string; title: string; place: string; kind: string; status: string; lastAt: string | null }

/**
 * Bước 1 của Ghi việc: "Ghi cho đối tượng nào?" — thẻ chọn nhóm theo loại (trồng trọt, vật nuôi, thủy sản) và một thẻ cho khu vực / cơ sở vật chất.
 * Vụ ghi lần trước nằm trên cùng. Từ 8 vụ trở lên chỉ hiện các vụ gần đây, có ô tìm kiếm và nút "Xem tất cả".
 */
export function LogTargetPicker({ targets, rememberedId, hasAreas, onPickCycle, onPickArea, onCancel }: {
  targets: LogTarget[]; rememberedId: string | null; hasAreas: boolean;
  onPickCycle: (id: string) => void; onPickArea: () => void; onCancel: () => void;
}) {
  const many = targets.length >= 8;
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const norm = (s: string) => s.toLowerCase();
  const byRecent = [...targets].sort((a, b) => (b.id === rememberedId ? 1 : 0) - (a.id === rememberedId ? 1 : 0) || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  const shown = !many || all || q.trim()
    ? byRecent.filter((t) => !q.trim() || norm(`${t.title} ${t.place}`).includes(norm(q.trim())))
    : byRecent.slice(0, 6);
  const remembered = shown.find((t) => t.id === rememberedId);

  return (
    <>
      <p className="muted">Bạn ghi việc cho đối tượng nào?</p>
      {many && <input type="search" placeholder="Tìm vụ theo tên hoặc nơi…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm vụ" />}
      {remembered && !q.trim() && (
        <button type="button" className="bigchoice" onClick={() => onPickCycle(remembered.id)}>
          <strong>Tiếp tục: {remembered.title}</strong><br /><small>{remembered.place} · lần ghi trước</small>
        </button>
      )}
      {KIND_GROUP.map((g) => {
        const list = shown.filter((t) => (g.kind === 'other' ? !['crop', 'livestock', 'aquatic'].includes(t.kind) : t.kind === g.kind) && !(t.id === remembered?.id && !q.trim()));
        if (list.length === 0) return null;
        return (
          <section key={g.kind}>
            <h2 className="logsect">{g.label}</h2>
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
      {many && !all && !q.trim() && targets.length > shown.length && <button type="button" className="link" onClick={() => setAll(true)}>Xem tất cả {targets.length} vụ</button>}
      {shown.length === 0 && targets.length > 0 && <p className="muted">Không có vụ nào khớp.</p>}
      {hasAreas && (
        <section>
          <h2 className="logsect">🏠 Khu vực / cơ sở vật chất</h2>
          <button type="button" className="bigchoice" onClick={onPickArea}>Khu vực, cổng, kho, biogas… (không gắn vụ)</button>
        </section>
      )}
      <button type="button" className="link" onClick={onCancel}>Hủy</button>
    </>
  );
}
