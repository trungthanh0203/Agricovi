import { useEffect, useState } from 'react';
import { useTable } from '../lib/tables';
import { Collapsible } from '../components/Collapsible';
import { UnitsConfig } from '../components/UnitsConfig';
import {
  CONFIG_DEFS, defaultEntries, entriesOf, joinItems, parseItems, saveConfig, saveEntries, useConfig, validateEntries, validateItems,
  type ConfigDef, type ConfigEntry,
} from '../lib/config';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';

/**
 * Tab Cấu hình. Hai kiểu cấu hình (xem lib/config.ts):
 * - danh sách tự do: một ô nhập các mục cách nhau bằng dấu phẩy;
 * - nhóm có mã (Nhóm loại sản phẩm, Nhóm vật tư): từng dòng gồm tên, "tính như" nhóm gốc, dừng/dùng, xóa (chỉ mục tự thêm chưa ai dùng).
 */
export function ConfigTab() {
  const cfg = useConfig();
  return (
    <section>
      <h1>Cấu hình</h1>
      <p className="muted">Các danh sách mặc định của hệ thống. Những chỗ cần chọn sẽ lấy danh sách từ đây.</p>
      {CONFIG_DEFS.map((d) => (d.mode === 'entries'
        ? <EntriesRow key={d.id} def={d} orgId={cfg.org} />
        : <FreeRow key={d.id} def={d} orgId={cfg.org} items={cfg.items(d.id)} />))}
      <PhasesOption orgId={cfg.org} on={cfg.usePhases()} />
      <UnitsConfig />
    </section>
  );
}

/** Chọn có dùng Công đoạn trong Quy trình mẫu: tắt thì quy trình chỉ là danh sách việc, bật thì gom việc theo công đoạn */
function PhasesOption({ orgId, on }: { orgId: string | undefined; on: boolean }) {
  const online = useOnline();
  const [val, setVal] = useState(on);
  const { busy, msg, run } = useSaver();
  useEffect(() => { setVal(on); }, [on]);
  return (
    <Collapsible title="Tạo quy trình" summary={on ? 'Dùng công đoạn' : 'Chỉ danh sách việc'}>
      <div className="inline-form">
        <label className="check"><input type="checkbox" checked={val} onChange={(e) => setVal(e.target.checked)} /> <span>Dùng Công đoạn khi tạo quy trình</span></label>
        <p className="muted">Bật: mỗi quy trình gồm các công đoạn (Chuẩn bị, Ươm, Trồng…) và mỗi công đoạn có các việc. Tắt: quy trình chỉ là một danh sách việc, gọn hơn cho cơ sở nhỏ. Đổi lúc nào cũng được, không mất dữ liệu.</p>
        {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        {!online && <p className="msg warn" role="status">Cần có mạng để lưu.</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy || !online || val === on} onClick={() => { if (orgId) void run(() => saveConfig(orgId, 'use_phases', [val ? 'yes' : 'no'])); }}>Lưu</button>
        </div>
      </div>
    </Collapsible>
  );
}

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: 'Đã lưu.' }); } catch (e) { setMsg({ ok: false, text: friendlyError(e) }); }
    setBusy(false);
  }
  return { busy, msg, setMsg, run };
}

function FreeRow({ def, orgId, items }: { def: ConfigDef; orgId: string | undefined; items: string[] }) {
  const online = useOnline();
  const saved = joinItems(items);
  const [text, setText] = useState(saved);
  const { busy, msg, setMsg, run } = useSaver();
  useEffect(() => { setText(saved); }, [saved]);

  return (
    <Collapsible title={def.title} summary={saved}>
      <div className="inline-form">
        <label>
          {def.title}
          <input value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={def.defaults.join(', ')} />
          <small>{def.hint} Nhập các mục cách nhau bằng dấu phẩy.</small>
        </label>
        {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        {!online && <p className="msg warn" role="status">Cần có mạng để lưu.</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy || !online || text === saved} onClick={() => {
            if (!orgId) return;
            const list = parseItems(text);
            const bad = validateItems(def, list);
            if (bad) return setMsg({ ok: false, text: bad });
            void run(() => saveConfig(orgId, def.id, list));
          }}>Lưu</button>
          <button type="button" className="secondary" disabled={busy || text === saved} onClick={() => { setText(saved); setMsg(null); }}>Hủy</button>
        </div>
      </div>
    </Collapsible>
  );
}

const newCode = () => `c_${Math.random().toString(36).slice(2, 10)}`;

function EntriesRow({ def, orgId }: { def: ConfigDef; orgId: string | undefined }) {
  const online = useOnline();
  const cfg = useConfig();
  const saved = cfg.entries(def.id);
  const savedKey = JSON.stringify(saved);
  const [rows, setRows] = useState<ConfigEntry[]>(saved);
  const { busy, msg, setMsg, run } = useSaver();
  useEffect(() => { setRows(entriesOf(orgId, def)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const isBuiltin = (code: string) => (def.builtins ?? []).some((b) => b.code === code);
  const dirty = JSON.stringify(rows) !== savedKey;
  const patch = (i: number, p: Partial<ConfigEntry>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  // tên nhóm gốc để chọn "tính như": lấy theo tên đang đặt của mục có sẵn
  // không cho bỏ sử dụng loại đang có sản phẩm của cơ sở
  const crops = useTable('cropTypes');
  const inUse = (list: ConfigEntry[]): string | null => {
    for (const r of list) {
      if (r.active) continue;
      const was = saved.find((s) => s.code === r.code);
      if (!was?.active) continue;
      const used = crops.filter((c) => c.organization_id === orgId && c.is_active !== false && (c.kind_item ? c.kind_item === r.code : c.kind === r.code));
      if (used.length > 0) return `Không bỏ "${r.label}" được vì cơ sở đang có sản phẩm thuộc loại này (${used.slice(0, 3).map((c) => c.name).join(', ')}). Hãy dừng các sản phẩm đó trước.`;
    }
    return null;
  };
  const baseOptions = (def.builtins ?? []).map((b) => ({ code: b.code, label: rows.find((r) => r.code === b.code)?.label || b.label }));

  return (
    <Collapsible title={def.title} summary={rows.filter((r) => r.active).map((r) => r.label).join(' · ')}>
      <div className="inline-form">
        <p className="muted">{def.hint}</p>
        <div className="tablewrap">
          <table className="grid">
            <thead><tr><th>Tên mục</th><th>Tính như</th><th>Sử dụng</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code} className={r.active ? '' : 'off'}>
                  <td><input aria-label="Tên mục" value={r.label} maxLength={40} onChange={(e) => patch(i, { label: e.target.value })} /></td>
                  <td>
                    {isBuiltin(r.code)
                      ? <span className="muted">Mục có sẵn</span>
                      : (
                        <select aria-label="Tính như" value={r.base} onChange={(e) => patch(i, { base: e.target.value })}>
                          {baseOptions.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
                        </select>
                      )}
                  </td>
                  <td className="act">
                    <input type="checkbox" aria-label={`Sử dụng ${r.label}`} checked={r.active} onChange={(e) => patch(i, { active: e.target.checked })} />
                  </td>
                  <td className="act">
                    {!isBuiltin(r.code) && (
                      <button className="icon" type="button" aria-label={`Xóa ${r.label}`} title="Xóa (chỉ được khi chưa ai dùng)"
                        onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}>🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="secondary" onClick={() => setRows((cur) => [...cur, { code: newCode(), label: '', base: def.builtins?.[0]?.code ?? '', active: true }])}>+ Thêm mục</button>
        <p className="muted">Bỏ tích "Sử dụng" thì mục ẩn khỏi các danh sách chọn mới (dữ liệu cũ vẫn giữ tên); tích lại khi cần dùng. 🗑 xóa mục tự thêm chưa ai dùng. Mục có sẵn không xóa được.</p>
        {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        {!online && <p className="msg warn" role="status">Cần có mạng để lưu.</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy || !online || !dirty} onClick={() => {
            if (!orgId) return;
            const bad = validateEntries(rows) ?? (def.id === 'product_groups' ? inUse(rows) : null);
            if (bad) return setMsg({ ok: false, text: bad });
            void run(() => saveEntries(orgId, def.id, rows));
          }}>Lưu</button>
          <button type="button" className="secondary" disabled={busy || !dirty} onClick={() => { setRows(saved); setMsg(null); }}>Hủy</button>
          <button type="button" className="link" disabled={busy} onClick={() => { setRows(defaultEntries(def)); setMsg(null); }}>Về mặc định</button>
        </div>
      </div>
    </Collapsible>
  );
}
