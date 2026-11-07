import { useState, type ReactNode } from 'react';
import { groupWorkTypes } from '../lib/logGroups';

export interface PickWork { id: string; code: string; name: string; shared?: boolean }

/**
 * Bước 2 của Ghi việc: "Việc gì?" — thanh "Ghi cho … [Đổi]", rồi Đến hạn hôm nay, Hay làm gần đây, ô tìm việc và danh sách nhóm gập được.
 * `shortcuts` là hàng nút tắt riêng theo loại vụ (ví dụ biến động đàn).
 */
export function LogWorkPicker({ targetLabel, onChangeTarget, workTypes, dueIds, recentIds, shortcuts, onPick, onCancel }: {
  targetLabel: string; onChangeTarget?: () => void;
  workTypes: PickWork[]; dueIds: string[]; recentIds: string[];
  shortcuts?: ReactNode; onPick: (id: string) => void; onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const byId = new Map(workTypes.map((w) => [w.id, w]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((w): w is PickWork => Boolean(w));
  const due = pick([...new Set(dueIds)]);
  const recent = pick(recentIds).filter((w) => !due.some((d) => d.id === w.id));
  const term = q.trim().toLowerCase();
  const filtered = term ? workTypes.filter((w) => w.name.toLowerCase().includes(term)) : workTypes;
  const groups = groupWorkTypes(filtered);
  const showFast = !term;

  return (
    <>
      <div className="row">
        <p className="grow" style={{ margin: 0 }}>Ghi cho: <strong>{targetLabel}</strong></p>
        {onChangeTarget && <button type="button" className="link inline" onClick={onChangeTarget}>Đổi</button>}
      </div>
      {shortcuts}
      <p className="muted">Bạn vừa làm việc gì?</p>
      {showFast && due.length > 0 && (
        <section>
          <h2 className="logsect">⏰ Đến hạn hôm nay</h2>
          <div className="grid2">{due.map((w) => <button key={w.id} type="button" className="bigchoice" onClick={() => onPick(w.id)}>{w.name}</button>)}</div>
        </section>
      )}
      {showFast && recent.length > 0 && (
        <section>
          <h2 className="logsect">⭐ Hay làm gần đây</h2>
          <div className="grid2">{recent.map((w) => <button key={w.id} type="button" className="bigchoice" onClick={() => onPick(w.id)}>{w.name}</button>)}</div>
        </section>
      )}
      <input type="search" placeholder="Tìm việc…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm việc" />
      {groups.map((g) => {
        const isOpen = Boolean(term) || (open[g.id] ?? groups.length <= 2);
        return (
          <section key={g.id}>
            <button type="button" className="logsect-toggle" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>
              <span>{g.label} ({g.items.length})</span><span aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && <div className="grid2">{g.items.map((w) => <button key={w.id} type="button" className="bigchoice" onClick={() => onPick(w.id)}>{w.name}</button>)}</div>}
          </section>
        );
      })}
      {workTypes.length === 0 && <p className="muted">Chưa tải được danh sách loại việc. Hãy kết nối mạng một lần để tải về.</p>}
      {workTypes.length > 0 && groups.length === 0 && <p className="muted">Không có việc nào khớp.</p>}
      <button type="button" className="link" onClick={onCancel}>Hủy</button>
    </>
  );
}
