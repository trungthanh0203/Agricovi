import { useMemo } from 'react';

export interface MidstartItem { id: string; name: string; phase?: string | null; locked?: boolean }
export interface MidstartValue { currentId: string; doneIds: string[] }

/**
 * Chọn điểm bắt đầu giữa chừng: chạm vào việc ĐANG LÀM thì mọi việc đứng trước tự được tích "đã làm trước đó" (bỏ tích từng việc nếu thực tế chưa làm).
 * Chạm vào tên công đoạn thì chọn việc đầu của công đoạn đó. `locked` = việc đã bắt đầu / đã có nhật ký, không chọn được.
 */
export function MidstartPicker({ items, value, onChange }: { items: MidstartItem[]; value: MidstartValue; onChange: (v: MidstartValue) => void }) {
  const idx = useMemo(() => new Map(items.map((it, i) => [it.id, i])), [items]);
  const done = new Set(value.doneIds);
  function pickCurrent(id: string) {
    const at = idx.get(id) ?? 0;
    onChange({ currentId: id, doneIds: items.filter((it, i) => i < at && !it.locked).map((it) => it.id) });
  }
  function toggleDone(id: string) {
    if (id === value.currentId) return;
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ currentId: value.currentId, doneIds: [...next] });
  }
  return (
    <div className="midstart">
      <p className="muted">Chạm vào <strong>việc đang làm</strong>. Các việc trước đó tự được đánh dấu "đã làm trước khi dùng app"; bỏ tích việc nào thực tế chưa làm.</p>
      <table className="grid">
        <thead><tr><th>Việc</th><th>Đang làm</th><th>Đã làm trước</th></tr></thead>
        <tbody>
          {items.map((it, i) => {
            const newPhase = it.phase && it.phase !== items[i - 1]?.phase;
            const firstOfPhase = newPhase && !it.locked;
            return (
              <tr key={it.id} className={it.id === value.currentId ? 'current' : undefined}>
                <td>
                  {newPhase && (
                    <strong style={{ display: 'block' }}>
                      {firstOfPhase ? <button type="button" className="link" onClick={() => pickCurrent(it.id)}>{it.phase} ▸ bắt đầu từ công đoạn này</button> : it.phase}
                    </strong>
                  )}
                  {it.name}
                </td>
                <td><input type="radio" name="midstart-current" aria-label={`Đang làm: ${it.name}`} disabled={it.locked} checked={it.id === value.currentId} onChange={() => pickCurrent(it.id)} /></td>
                <td><input type="checkbox" aria-label={`Đã làm trước: ${it.name}`} disabled={it.locked || it.id === value.currentId} checked={done.has(it.id)} onChange={() => toggleDone(it.id)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
