import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { listMembers } from '../lib/members';
import { setCycleModel, setOrgModel } from '../lib/mgmtModel';
import { effectiveModel, MODELS, OPTIONAL_FEATURES, optionalOf, suggestModel, type ModelId } from '../lib/models';
import { useOrgs } from '../lib/orgs';
import { isOwner } from '../lib/roles';
import { loadTeams } from '../lib/teams';
import { useTable } from '../lib/tables';

/**
 * Chọn cách quản lý MỘT vụ (5 mô hình): app chỉ hiện các mục và việc nhập liệu của mô hình đó. Chỉ là cách hiển thị và gợi ý, không đổi quyền hay dữ liệu;
 * đổi sang mô hình khác lúc nào cũng được. Dùng ngay sau khi tạo vụ và trong Chi tiết vụ.
 */
export function ModelPicker({ cycleId, onDone, onSkip }: { cycleId: string; onDone: () => void; onSkip?: () => void }) {
  const { active, refresh } = useOrgs();
  const cycles = useTable('cycles');
  const cycle = cycles.find((c) => c.id === cycleId) ?? null;
  const own = effectiveModel(cycle?.mgmt_model, active?.mgmtModel);
  const [sel, setSel] = useState<ModelId | null>(own);
  const [suggested, setSuggested] = useState<ModelId | null>(null);
  const [asDefault, setAsDefault] = useState(false);
  const [opts, setOpts] = useState<string[]>(cycle?.mgmt_options ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gợi ý theo tình hình cơ sở: số người có tài khoản, có quản lý hay không, có người làm không tài khoản
  useEffect(() => {
    if (!active || !navigator.onLine) return;
    let alive = true;
    (async () => {
      try {
        const [m, t] = await Promise.all([listMembers(active.id), loadTeams(active.id)]);
        const others = m.filter((x) => !x.roles.includes('owner'));
        const s = suggestModel({ accounts: others.length, hasManager: others.some((x) => x.roles.includes('manager')), offlineWorkers: t.workers.filter((w) => !w.user_id).length });
        if (alive) { setSuggested(s); setSel((cur) => cur ?? s); }
      } catch { if (alive) setSel((cur) => cur ?? 'family'); }
    })();
    return () => { alive = false; };
  }, [active]);

  if (!active) return null;
  const chosen = sel ?? 'family';

  async function apply() {
    setBusy(true); setError(null);
    try {
      await setCycleModel(cycleId, chosen, opts.filter((o) => (optionalOf(chosen) as string[]).includes(o)));
      if (asDefault && isOwner(active!.roles)) { await setOrgModel(active!.id, chosen); await refresh(); }
      onDone();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const def = MODELS.find((m) => m.id === chosen)!;
  return (
    <div className="inline-form">
      <p className="muted">Chọn cách gần với thực tế của bạn nhất. App chỉ hiện các mục cần dùng cho vụ này; đổi lúc nào cũng được và không mất dữ liệu.</p>
      <fieldset>
        <legend>Cách quản lý vụ này</legend>
        {MODELS.map((m) => (
          <label key={m.id} className={chosen === m.id ? 'choice selected' : 'choice'}>
            <input type="radio" name="mgmt-model" checked={chosen === m.id} onChange={() => setSel(m.id)} />
            <span>
              <strong>{m.name}{suggested === m.id ? ' · gợi ý cho bạn' : ''}</strong>
              <small>{m.who}</small>
              <small>Bạn sẽ dùng: {m.uses}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="muted">Với lựa chọn này, bạn sẽ không thấy: {def.hidden}.</p>
      {optionalOf(chosen).length > 0 && (
        <fieldset>
          <legend>Mục tùy chọn (bật thêm nếu cần)</legend>
          {OPTIONAL_FEATURES.filter((o) => optionalOf(chosen).includes(o.id)).map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={opts.includes(o.id)} onChange={(e) => setOpts((cur) => (e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)))} />
              <span><strong>{o.label}</strong><small className="muted" style={{ display: 'block' }}>{o.hint}</small></span>
            </label>
          ))}
        </fieldset>
      )}
      {isOwner(active.roles) && (
        <label className="check"><input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> Dùng làm cách quản lý mặc định cho các vụ sau</label>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
      {!navigator.onLine && <p className="msg warn" role="status">Cần có mạng để lưu.</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy || !navigator.onLine} onClick={() => void apply()}>Áp dụng cho vụ này</button>
        {onSkip && <button type="button" className="secondary" disabled={busy} onClick={onSkip}>Để sau</button>}
      </div>
    </div>
  );
}
