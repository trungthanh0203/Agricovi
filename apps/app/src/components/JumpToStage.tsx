import { useState } from 'react';
import { MidstartPicker, type MidstartValue } from './MidstartPicker';
import { todayLocal } from '../lib/hooks';
import type { StageRow } from '../lib/db';

/**
 * "Vụ đang ở đâu? Chuyển tới…" cho vụ đang sản xuất mà thực tế đang ở giữa quy trình: chọn việc đang làm, các việc trước đó (chưa có nhật ký)
 * được đánh dấu "làm trước khi dùng app". Việc đã bắt đầu hoặc đã có nhật ký thì khóa, không đụng.
 */
export function JumpToStage({ stages, loggedStageIds, busy, onJump }: {
  stages: StageRow[]; loggedStageIds: Set<string>; busy: boolean; onJump: (stageId: string, doneIds: string[], date: string, note: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState<MidstartValue>({ currentId: '', doneIds: [] });
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const items = [...stages].sort((a, b) => a.seq - b.seq).map((s) => ({ id: s.id, name: s.name, phase: s.phase_name ?? null, locked: s.status !== 'pending' || loggedStageIds.has(s.id) }));
  return (
    <div className="inline-form">
      <p className="muted">Dùng khi vụ đã chạy trước khi bạn dùng app, hoặc bạn lỡ tạo vụ từ đầu. Chỉ chuyển được khi chưa có việc nào đang làm.</p>
      <MidstartPicker items={items} value={value} onChange={setValue} />
      <label>Việc đang làm bắt đầu ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Ghi chú (không bắt buộc)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Vụ chạy dở từ trước khi dùng app" /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !value.currentId}
          onClick={() => {
            if (!window.confirm('Các việc đã tích sẽ ghi là "làm trước khi dùng app" (không có nhật ký). Chuyển vụ tới việc đã chọn?')) return;
            setErr(null);
            void onJump(value.currentId, value.doneIds, date, note).then(() => setValue({ currentId: '', doneIds: [] })).catch(() => undefined);
          }}>Chuyển tới việc này</button>
      </div>
    </div>
  );
}
