import type { AreaRow } from '../lib/db';
import { areaPath, orderedAreas } from '../lib/areas';
import { PREP_LOG_DAYS, prepChoices, type PrepMode } from '../lib/prep';

/**
 * Chọn cách chuẩn bị của vụ (D126): toàn bộ nhà màng / 1 phần nhà màng / nhà chuẩn bị riêng.
 * Chọn "nhà chuẩn bị riêng" thì chọn thêm nơi chuẩn bị (một khu khác của cơ sở, kể cả cơ sở vật chất).
 */
export function PrepPicker({ kind, mode, onMode, areaId, onArea, areas, cycleAreaId, name = 'prep' }: {
  kind?: string | null; mode: PrepMode; onMode: (m: PrepMode) => void; areaId: string; onArea: (id: string) => void;
  areas: AreaRow[]; cycleAreaId: string; name?: string;
}) {
  const choices = prepChoices(kind);
  const candidates = orderedAreas(areas.filter((a) => a.is_active !== false && a.id !== cycleAreaId));
  return (
    <fieldset>
      <legend>Công đoạn chuẩn bị</legend>
      {choices.map((c) => (
        <label key={c.code} className={mode === c.code ? 'choice selected' : 'choice'}>
          <input type="radio" name={name} checked={mode === c.code} onChange={() => onMode(c.code)} />
          <span><strong>{c.label}</strong><small>{c.hint}</small></span>
        </label>
      ))}
      {mode === 'separate' && (
        <label>
          Nơi chuẩn bị
          <select value={areaId} onChange={(e) => onArea(e.target.value)}>
            <option value="">— Chọn nơi chuẩn bị —</option>
            {candidates.map((a) => <option key={a.id} value={a.id}>{areaPath(a.id, areas)}</option>)}
          </select>
        </label>
      )}
      {mode !== 'whole' && <small className="muted">Ghi việc chuẩn bị được tối đa {PREP_LOG_DAYS} ngày kể từ lúc tạo vụ. Vụ chưa tính vào số vụ của gói cho tới khi bấm Bắt đầu sản xuất.</small>}
    </fieldset>
  );
}
