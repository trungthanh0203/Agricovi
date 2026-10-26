import { useEffect, useState } from 'react';
import { Collapsible } from '../components/Collapsible';
import { CONFIG_DEFS, joinItems, parseItems, saveConfig, useConfig, validateItems, type ConfigDef } from '../lib/config';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';

/**
 * Tab Cấu hình: mỗi cấu hình là một dòng "Tên phần" + ô nhập danh sách các mục nhỏ cách nhau bằng dấu phẩy.
 * Chỗ nào cần danh sách (chọn nhóm loại sản phẩm, loại khu, kiểu nhà/chuồng…) sẽ lấy từ đây. Thêm cấu hình mới ở lib/config.ts.
 */
export function ConfigTab() {
  const cfg = useConfig();
  return (
    <section>
      <h1>Cấu hình</h1>
      <p className="muted">Nhập các mục cách nhau bằng dấu phẩy rồi bấm Lưu. Những chỗ cần chọn sẽ lấy danh sách từ đây.</p>
      {CONFIG_DEFS.map((d) => <ConfigRow key={d.id} def={d} orgId={cfg.org} items={cfg.items(d.id)} />)}
    </section>
  );
}

function ConfigRow({ def, orgId, items }: { def: ConfigDef; orgId: string | undefined; items: string[] }) {
  const online = useOnline();
  const saved = joinItems(items);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setText(saved); }, [saved]);

  async function save() {
    if (!orgId) return;
    const list = parseItems(text);
    const bad = validateItems(def, list);
    if (bad) return setMsg({ ok: false, text: bad });
    setBusy(true); setMsg(null);
    try { await saveConfig(orgId, def.id, list); setMsg({ ok: true, text: 'Đã lưu.' }); } catch (e) { setMsg({ ok: false, text: friendlyError(e) }); }
    setBusy(false);
  }

  return (
    <Collapsible title={def.title} summary={saved} defaultOpen>
      <div className="inline-form">
        <label>
          {def.title}
          <input value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={def.defaults.join(', ')} />
          <small>{def.hint}</small>
        </label>
        {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        {!online && <p className="msg warn" role="status">Cần có mạng để lưu.</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy || !online || text === saved} onClick={() => void save()}>Lưu</button>
          <button type="button" className="secondary" disabled={busy || text === saved} onClick={() => { setText(saved); setMsg(null); }}>Hủy</button>
        </div>
      </div>
    </Collapsible>
  );
}
