import { useMemo, useState } from 'react';
import type { LogRow, NoteRow, StageRow } from '../lib/db';
import { stageColor } from '../lib/cycles';
import { addDays, fmtDate, fmtIso, parseDay } from '../lib/dates';
import { toLocalInput } from '../lib/hooks';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Lịch của vụ theo tháng: mỗi ngày tô màu việc theo KẾ HOẠCH, chấm tròn nếu hôm đó có nhật ký,
 * viền đậm là hôm nay. Bấm một ngày để xem việc và số việc đã ghi. Một màn nhìn là nắm cả quy trình của vụ.
 */
export function CycleCalendar({ stages, logs, today, notes, canAdd, userId, canManage, busy, onAddNote, onToggleNote, onDeleteNote }: {
  stages: StageRow[]; logs: LogRow[]; today: string;
  notes: NoteRow[]; canAdd: boolean; userId?: string; canManage: boolean; busy: boolean;
  onAddNote: (date: string, text: string) => Promise<void>;
  onToggleNote: (n: NoteRow) => void;
  onDeleteNote: (n: NoteRow) => void;
}) {
  const [text, setText] = useState('');
  const sorted = useMemo(() => [...stages].sort((a, b) => a.seq - b.seq), [stages]);
  const first = sorted.find((s) => s.planned_start)?.planned_start ?? today;
  const last = [...sorted].reverse().find((s) => s.planned_end)?.planned_end ?? today;
  const initial = today >= first && today <= last ? today : first;
  const [month, setMonth] = useState(() => initial.slice(0, 7)); // YYYY-MM
  const [picked, setPicked] = useState<string | null>(null);

  const logDays = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      if (l.voided_at) continue;
      const d = toLocalInput(new Date(l.performed_at)).slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  const noteDays = useMemo(() => {
    const m = new Map<string, NoteRow[]>();
    for (const n of notes) m.set(n.note_date, [...(m.get(n.note_date) ?? []), n]);
    return m;
  }, [notes]);

  /** Mọi việc có kế hoạch bao trùm ngày này (việc chạy song song cùng ngày thì nhiều việc) */
  const stagesOn = (day: string) => sorted.map((s, i) => ({ s, i })).filter(({ s }) => s.planned_start && s.planned_end && day >= s.planned_start && day <= s.planned_end);
  /** Nền ô ngày: một việc = một màu; nhiều việc = các dải màu nằm ngang xếp chồng, mỗi việc một dải */
  const bandBackground = (list: { i: number }[]): string => {
    const n = list.length;
    if (n === 1) return `${stageColor(list[0]!.i)}33`;
    return `linear-gradient(to bottom, ${list.map((x, k) => `${stageColor(x.i)}66 ${(k * 100) / n}% ${((k + 1) * 100) / n}%`).join(', ')})`;
  };

  const [y, m] = month.split('-').map(Number) as [number, number];
  const firstOfMonth = fmtIso(new Date(y, m - 1, 1));
  const lead = (parseDay(firstOfMonth).getDay() + 6) % 7; // thứ Hai = 0
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, k) => addDays(firstOfMonth, k)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setPicked(null);
  };
  const info = picked ? stagesOn(picked) : [];

  return (
    <div className="cal">
      <div className="row">
        <button className="icon" aria-label="Tháng trước" onClick={() => shift(-1)}>‹</button>
        <strong className="grow" style={{ textAlign: 'center' }}>Tháng {m}/{y}</strong>
        <button className="icon" aria-label="Tháng sau" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal-grid" role="grid" aria-label={`Lịch tháng ${m}/${y}`}>
        {WEEKDAYS.map((w) => <div key={w} className="cal-h" role="columnheader">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-c empty" />;
          const st = stagesOn(d);
          const n = logDays.get(d) ?? 0;
          return (
            <button
              key={d}
              role="gridcell"
              className={`cal-c${d === today ? ' today' : ''}${picked === d ? ' picked' : ''}${noteDays.has(d) ? ' has-note' : ''}`}
              style={st.length > 0 ? { background: bandBackground(st), borderColor: stageColor(st[0]!.i) } : undefined}
              onClick={() => setPicked(d === picked ? null : d)}
              aria-label={`${fmtDate(d)}${st.length > 0 ? `, việc ${st.map((x) => x.s.name).join(', ')}` : ''}${n ? `, ${n} việc đã ghi` : ''}${noteDays.has(d) ? ', có ghi chú' : ''}`}
            >
              <span>{Number(d.slice(8))}</span>
              {n > 0 && <i className="dot" />}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        {sorted.map((s, i) => (
          <span key={s.id}><i style={{ background: stageColor(i) }} /> {s.name}</span>
        ))}
        <span><i className="dot" /> Có ghi việc</span>
        <span><i className="note-mark" /> Có ghi chú</span>
      </div>
      {picked && (
        <>
        <h3 className="sub">Ngày {fmtDate(picked)}</h3>
        {info.length === 0 && <p className="muted">Ngoài kế hoạch của vụ.</p>}
        {info.map(({ s, i }) => (
          <div className="card slim" key={s.id} style={{ borderLeft: `6px solid ${stageColor(i)}` }}>
            <strong>{s.phase_name ? `${s.phase_name} › ` : ''}{s.name}{s.duration_days ? ` (${s.duration_days} ngày)` : ''}</strong>
            <span className="sub">Kế hoạch {fmtDate(s.planned_start)} – {fmtDate(s.planned_end)}{s.repeat_every_days ? ` · lặp mỗi ${s.repeat_every_days} ngày` : ''}{s.importance === 'high' ? ' · Quan trọng' : ''}</span>
            {s.note && <span className="sub">{s.note}</span>}
          </div>
        ))}
        <p className="muted">{logDays.get(picked) ? `Hôm đó đã ghi ${logDays.get(picked)} việc.` : 'Hôm đó chưa ghi việc.'}</p>
        <h3 className="sub">Ghi chú ngày {fmtDate(picked)}</h3>
        {(noteDays.get(picked) ?? []).length === 0 && <p className="muted">Chưa có ghi chú. Ghi chú sẽ hiện nhắc ở Trang chủ khi gần đến ngày.</p>}
        {(noteDays.get(picked) ?? []).map((n) => (
          <div className="note-row" key={n.id}>
            <label className="check">
              <input type="checkbox" checked={n.done} disabled={busy || (!canManage && n.created_by !== userId)} onChange={() => onToggleNote(n)} />
              <span className={n.done ? 'done' : ''}>{n.content}{n.author_name ? <small className="muted"> — {n.author_name}</small> : null}</span>
            </label>
            {(canManage || n.created_by === userId) && (
              <button className="icon" disabled={busy} aria-label="Xóa ghi chú" onClick={() => onDeleteNote(n)}>🗑</button>
            )}
          </div>
        ))}
        {canAdd && (
          <form className="quickadd" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void onAddNote(picked, text).then(() => setText('')).catch(() => undefined);
          }}>
            <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Thêm ghi chú nhắc việc cho ngày này" aria-label="Nội dung ghi chú" />
            <button type="submit" className="primary" disabled={busy || !text.trim()}>Thêm ghi chú</button>
          </form>
        )}
        </>
      )}
    </div>
  );
}
