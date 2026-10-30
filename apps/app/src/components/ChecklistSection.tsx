import { useCallback, useEffect, useMemo, useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { Collapsible } from './Collapsible';
import { checklistSummary, RESULT_LABEL, VERDICT_LABEL, type ChecklistResult } from '../lib/checklistLogic';
import {
  addItem, adoptTemplate, deleteItem, finalizeAudit, listAnswers, listAudits, listItems, listOrgTemplates, listSharedTemplates, saveAnswer, startAudit,
  updateItem, updateTemplate, voidAudit,
  type ChecklistAnswer, type ChecklistAudit, type ChecklistItem, type ChecklistTemplate, type SharedTemplate,
} from '../lib/checklists';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

const verdictClass = (v: string) => (v === 'pass' ? 'pill ok' : v === 'fail' ? 'pill err' : 'pill warn');
const vnDate = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Bảng kiểm nội bộ VietGAP (P1B): bộ tiêu chí của cơ sở (mức A/B và ngưỡng đạt SỬA ĐƯỢC), các lần đánh giá theo năm,
 * mỗi tiêu chí Đạt / Không đạt / Không áp dụng kèm bằng chứng hoặc biện pháp khắc phục, tự kết luận; tiêu chí xếp theo nhóm. Cần mạng.
 */
export function ChecklistSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [tpls, setTpls] = useState<ChecklistTemplate[] | undefined>(undefined);
  const [shared, setShared] = useState<SharedTemplate[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [audits, setAudits] = useState<ChecklistAudit[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = !!active && canPerm(active.perms, 'declare', 'edit');

  const reload = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try {
      const [t, sh] = await Promise.all([listOrgTemplates(active.id), listSharedTemplates()]);
      setTpls(t); setShared(sh);
      setAudits(t.length > 0 ? await listAudits(active.id) : []);
    } catch (e) { setError(friendlyError(e)); }
  }, [active]);
  useEffect(() => { void reload(); }, [reload]);
  if (!active) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await reload(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (openId) {
    const audit = audits.find((a) => a.id === openId);
    return audit ? <AuditView audit={audit} canEdit={canEdit} online={online} onBack={() => { setOpenId(null); void reload(); }} /> : null;
  }

  const tpl = tpls?.find((t) => t.id === selId) ?? tpls?.[0] ?? null;
  const notAdopted = shared.filter((s) => !(tpls ?? []).some((t) => t.source_code === s.code));
  const years = [...new Set(audits.map((a) => a.audit_date.slice(0, 4)))];
  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: bảng kiểm cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {tpls && tpls.length > 1 && (
        <label>Bộ bảng kiểm
          <select value={tpl?.id ?? ''} onChange={(e) => setSelId(e.target.value)}>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      {tpls && notAdopted.length > 0 && (
        <Collapsible inline title={tpls.length === 0 ? 'Chọn bộ bảng kiểm để bắt đầu' : '＋ Lấy thêm bộ bảng kiểm'} summary={`${notAdopted.length} bộ có sẵn`} defaultOpen={tpls.length === 0}>
          {notAdopted.map((s) => (
            <div className="card slim" key={s.code}>
              <strong>{s.name}</strong>
              <p className="muted">Lấy về, bạn sửa được nội dung, mức A/B và ngưỡng đạt cho khớp bản chính thức của đơn vị chứng nhận.</p>
              {canEdit ? <button className="primary" disabled={busy || !online} onClick={() => void run(async () => { const id = await adoptTemplate(active.id, s.code); setSelId(id); })}>Lấy bộ này về</button>
                : <p className="muted">Chủ cơ sở hoặc người có quyền Khai báo cần lấy bộ về trước.</p>}
            </div>
          ))}
        </Collapsible>
      )}

      {tpl && (
        <>
          {!tpl.verified_at && (
            <p className="msg warn" role="status">
              Bộ tiêu chí này <strong>chưa được đối chiếu</strong> với bản bảng kiểm chính thức của đơn vị chứng nhận. Mức A/B có thể cần sửa. Đối chiếu xong, mở "Bộ tiêu chí" và bấm "Đã đối chiếu".
            </p>
          )}
          {canEdit && (
            <button className="primary" disabled={busy || !online} onClick={() => {
              const id = crypto.randomUUID();
              void run(async () => { await startAudit(id, active.id, tpl.id, todayLocal(), ''); setOpenId(id); });
            }}>+ Bắt đầu lần đánh giá mới</button>
          )}

          {audits.length === 0 && <p className="muted">Chưa có lần đánh giá nào.</p>}
          {years.map((y) => (
            <div key={y}>
              <h2 className="sect">Năm {y}</h2>
              {audits.filter((a) => a.audit_date.startsWith(y)).map((a) => {
                const verdict = a.voided_at ? null : a.conclusion?.verdict ?? 'incomplete';
                return (
                  <div className={a.voided_at ? 'card slim voided' : 'card slim'} key={a.id}>
                    <div className="row">
                      <strong className="grow">{vnDate(a.audit_date)}{a.auditor ? ` · ${a.auditor}` : ''}</strong>{tpls && tpls.length > 1 && <span className="muted">{a.template_name.slice(0, 28)}</span>}
                      {a.voided_at ? <span className="pill err">Đã hủy</span> : a.status === 'draft' ? <span className="pill warn">Bản nháp</span> : verdict && <span className={verdictClass(verdict)}>{VERDICT_LABEL[verdict]}</span>}
                    </div>
                    {a.conclusion && !a.voided_at && <p className="muted">{a.conclusion.b_total === 0 ? 'Đạt' : 'Loại A'}: {a.conclusion.a_pass}/{a.conclusion.a_total} ({a.conclusion.a_pct}%){a.conclusion.b_total > 0 ? ` · Loại B: ${a.conclusion.b_pass}/${a.conclusion.b_total} (${a.conclusion.b_pct}%)` : ''}</p>}
                    {a.voided_at && a.void_reason && <p className="muted">Lý do hủy: {a.void_reason}</p>}
                    <button className="secondary" onClick={() => setOpenId(a.id)}>{a.status === 'draft' && !a.voided_at && canEdit ? 'Tiếp tục điền' : 'Xem'}</button>
                  </div>
                );
              })}
            </div>
          ))}

          <TemplateEditor tpl={tpl} canEdit={canEdit} online={online} busy={busy} run={run} />
        </>
      )}
    </>
  );
}

/** Bộ tiêu chí của cơ sở: ngưỡng đạt, đánh dấu đã đối chiếu, sửa mức A/B, nội dung, thêm/xóa tiêu chí */
function TemplateEditor({ tpl, canEdit, online, busy, run }: {
  tpl: ChecklistTemplate; canEdit: boolean; online: boolean; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [newText, setNewText] = useState('');
  const [newLevel, setNewLevel] = useState<'A' | 'B'>('B');
  const [a, setA] = useState(String(tpl.pass_a_pct));
  const [b, setB] = useState(String(tpl.pass_b_pct));
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setItems(await listItems(tpl.id)); }, [tpl.id]);
  useEffect(() => { if (online) void load().catch(() => undefined); }, [online, load]);
  const nA = items?.filter((i) => i.level === 'A').length ?? 0;
  const edit = (fn: () => Promise<unknown>) => run(async () => { await fn(); await load(); });

  return (
    <Collapsible title="Bộ tiêu chí" summary={`${tpl.pass_a_pct}% loại A · ${tpl.pass_b_pct}% loại B${tpl.verified_at ? ' · đã đối chiếu' : ' · chưa đối chiếu'}`} warn={!tpl.verified_at}>
      <p className="muted">{tpl.source_note}</p>
      {err && <p className="msg error" role="alert">{err}</p>}
      {canEdit && (
        <>
          <div className="pair">
            <label>Ngưỡng đạt loại A (%)<input value={a} inputMode="numeric" onChange={(e) => setA(e.target.value)} /></label>
            <label>Ngưỡng đạt loại B (%)<input value={b} inputMode="numeric" onChange={(e) => setB(e.target.value)} /></label>
          </div>
          <div className="btnrow">
            <button className="secondary" disabled={busy || !online} onClick={() => {
              const na = Number(a), nb = Number(b);
              if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0 || na > 100 || nb > 100) return setErr('Ngưỡng là số nguyên từ 0 đến 100.');
              setErr(null);
              void run(() => updateTemplate(tpl.id, { pass_a_pct: na, pass_b_pct: nb }));
            }}>Lưu ngưỡng</button>
            <button className="secondary" disabled={busy || !online} onClick={() => void run(() => updateTemplate(tpl.id, { verified: !tpl.verified_at }))}>
              {tpl.verified_at ? 'Bỏ đánh dấu đã đối chiếu' : 'Đã đối chiếu với bản chính thức'}
            </button>
          </div>
          <p className="muted">Ngưỡng và mức A/B chỉ áp dụng cho các lần đánh giá BẮT ĐẦU SAU khi sửa; lần đã bắt đầu giữ nguyên.</p>
        </>
      )}
      <Collapsible inline title="＋ Danh sách tiêu chí" summary={items ? `${items.length} tiêu chí: ${nA} loại A, ${items.length - nA} loại B` : 'Đang tải…'}>
        {(items ?? []).map((it, i, all) => (
          <div key={it.id}>
          {it.section && it.section !== all[i - 1]?.section && <h3 className="sect">{it.section}</h3>}
          <ItemRow item={it} showLevel={all.some((x) => x.level === 'B')} canEdit={canEdit && online && !busy}
            onLevel={() => void edit(() => updateItem(it.id, { level: it.level === 'A' ? 'B' : 'A' }))}
            onText={(t) => void edit(() => updateItem(it.id, { item_text: t }))}
            onDelete={() => void edit(() => deleteItem(it.id))} />
          </div>
        ))}
        {canEdit && items && (
          <div className="inline-form">
            <label>Thêm tiêu chí<AutoTextarea value={newText} maxLength={600} onChange={setNewText} placeholder="Nội dung tiêu chí" /></label>
            <label>Mức<select value={newLevel} onChange={(e) => setNewLevel(e.target.value as 'A' | 'B')}><option value="A">A (bắt buộc)</option><option value="B">B</option></select></label>
            <button className="secondary" disabled={busy || !online || newText.trim().length < 3} onClick={() => {
              const seq = Math.max(0, ...items.map((i) => i.seq)) + 1;
              void edit(async () => { await addItem(tpl.id, seq, newText, newLevel); setNewText(''); });
            }}>Thêm</button>
          </div>
        )}
      </Collapsible>
    </Collapsible>
  );
}

function ItemRow({ item, canEdit, showLevel, onLevel, onText, onDelete }: { item: ChecklistItem; canEdit: boolean; showLevel: boolean; onLevel: () => void; onText: (t: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.item_text);
  return (
    <div className="card slim">
      <div className="row">
        <strong>{item.seq}.</strong>
        {showLevel && <span className={item.level === 'A' ? 'pill err' : 'pill'}>Loại {item.level}</span>}
        {canEdit && <button className="link inline" onClick={onLevel}>Đổi sang {item.level === 'A' ? 'B' : 'A'}</button>}
        {canEdit && <button className="link inline" onClick={() => setEditing(!editing)}>Sửa chữ</button>}
        {canEdit && <button className="link inline" onClick={() => { if (window.confirm('Xóa tiêu chí này khỏi bộ? Các lần đánh giá cũ không bị ảnh hưởng.')) onDelete(); }}>Xóa</button>}
      </div>
      {editing ? (
        <div className="inline-form">
          <AutoTextarea value={text} maxLength={600} onChange={setText} />
          <div className="btnrow">
            <button className="primary" disabled={text.trim().length < 3} onClick={() => { onText(text); setEditing(false); }}>Lưu</button>
            <button className="secondary" onClick={() => { setText(item.item_text); setEditing(false); }}>Hủy</button>
          </div>
        </div>
      ) : <p>{item.item_text}</p>}
      {item.method && <p className="muted">Cách đánh giá: {item.method}</p>}
    </div>
  );
}

/** Một lần đánh giá: điền từng tiêu chí, xem kết luận tạm, chốt hoặc hủy */
function AuditView({ audit, canEdit, online, onBack }: { audit: ChecklistAudit; canEdit: boolean; online: boolean; onBack: () => void }) {
  const [answers, setAnswers] = useState<ChecklistAnswer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [cur, setCur] = useState(audit);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const draft = cur.status === 'draft' && !cur.voided_at && canEdit;

  useEffect(() => { void listAnswers(audit.id).then(setAnswers).catch((e) => setError(friendlyError(e))); }, [audit.id]);
  const summary = useMemo(() => cur.conclusion ?? checklistSummary(answers ?? [], cur.pass_a_pct, cur.pass_b_pct), [cur, answers]);

  async function setResult(a: ChecklistAnswer, result: ChecklistResult | null, evidence = a.evidence ?? '') {
    setError(null);
    const prev = answers;
    setAnswers((s) => (s ?? []).map((x) => (x.id === a.id ? { ...x, result, evidence: evidence || null } : x)));
    try { await saveAnswer(a.id, result, evidence); } catch (e) { setAnswers(prev); setError(friendlyError(e)); }
  }
  async function act(fn: () => Promise<ChecklistAudit>) {
    setBusy(true); setError(null);
    try { setCur(await fn()); setVoiding(false); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const shown = (answers ?? []).filter((a) => !onlyOpen || a.result === null);
  const hasB = (answers ?? []).some((a) => a.level === 'B'); // bộ chỉ có loại A (ví dụ 25 tiêu chí cốt lõi) thì không hiện loại B
  return (
    <section>
      <button className="link" onClick={onBack}>← Về danh sách</button>
      <h1>Đánh giá ngày {vnDate(cur.audit_date)}</h1>
      <p className="muted">{cur.template_name}{cur.auditor ? ` · ${cur.auditor}` : ''} · {hasB ? `ngưỡng đạt: loại A ${cur.pass_a_pct}%, loại B ${cur.pass_b_pct}%` : `đạt khi ${cur.pass_a_pct}% tiêu chí đạt`}</p>
      {cur.voided_at && <p className="msg warn">Đã hủy: {cur.void_reason}</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <div className="card slim">
        <div className="row"><span>Kết luận</span><strong><span className={verdictClass(summary.verdict)}>{VERDICT_LABEL[summary.verdict]}</span></strong></div>
        <div className="row"><span>{hasB ? 'Loại A (bắt buộc)' : `Tiêu chí đạt (cần ${cur.pass_a_pct}%)`}</span><strong>{summary.a_pass}/{summary.a_total} · {summary.a_pct}%</strong></div>
        {hasB && <div className="row"><span>Loại B</span><strong>{summary.b_pass}/{summary.b_total} · {summary.b_pct}%</strong></div>}
        <p className="muted">{summary.unanswered > 0 ? `Còn ${summary.unanswered} tiêu chí chưa trả lời. ` : ''}{summary.na > 0 ? `${summary.na} tiêu chí không áp dụng (không tính vào tỉ lệ).` : ''}</p>
      </div>

      {draft && (
        <div className="btnrow">
          <button className="primary" disabled={busy || !online || summary.unanswered > 0} onClick={() => void act(() => finalizeAudit(cur.id))}>Chốt kết quả</button>
          <button className="secondary" disabled={busy || !online} onClick={() => setVoiding(!voiding)}>Hủy lần đánh giá</button>
        </div>
      )}
      {cur.status === 'final' && !cur.voided_at && canEdit && <button className="secondary" onClick={() => setVoiding(!voiding)}>Hủy lần đánh giá</button>}
      {voiding && (
        <div className="inline-form">
          <label>Lý do hủy<input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: nhập nhầm ngày" /></label>
          <p className="muted">Lần đánh giá không bị xóa, chỉ được đánh dấu đã hủy.</p>
          <div className="btnrow">
            <button className="primary" disabled={busy || reason.trim().length < 3} onClick={() => void act(() => voidAudit(cur.id, reason))}>Xác nhận hủy</button>
            <button className="secondary" onClick={() => setVoiding(false)}>Không hủy</button>
          </div>
        </div>
      )}

      <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Chỉ hiện tiêu chí chưa trả lời</label>
      {answers === null && <p className="muted">Đang tải…</p>}
      {shown.map((a, i) => (
        <div key={a.id}>
        {a.section && a.section !== shown[i - 1]?.section && <h2 className="sect">{a.section}</h2>}
        <div className="card slim">
          <div className="row"><strong>{a.seq}.</strong>{hasB && <span className={a.level === 'A' ? 'pill err' : 'pill'}>Loại {a.level}</span>}</div>
          <p>{a.item_text}</p>
          {a.method && <p className="muted">Cách đánh giá: {a.method}</p>}
          <div className="btnrow">
            {(['pass', 'fail', 'na'] as ChecklistResult[]).map((r) => (
              <button key={r} type="button" className={a.result === r ? 'primary' : 'secondary'} disabled={!draft || !online}
                onClick={() => void setResult(a, a.result === r ? null : r)}>{RESULT_LABEL[r]}</button>
            ))}
          </div>
          {(draft || a.evidence) && (
            <label>{a.result === 'fail' ? 'Biện pháp khắc phục' : 'Bằng chứng / ghi chú'}
              <input defaultValue={a.evidence ?? ''} maxLength={500} disabled={!draft || !online} onBlur={(e) => { if (e.target.value !== (a.evidence ?? '')) void setResult(a, a.result, e.target.value); }} />
            </label>
          )}
        </div>
        </div>
      ))}
    </section>
  );
}
