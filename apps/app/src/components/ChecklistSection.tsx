import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { Collapsible } from './Collapsible';
import { checklistSummary, RESULT_LABEL, VERDICT_LABEL, type ChecklistResult } from '../lib/checklistLogic';
import {
  addItem, adoptTemplate, deleteItem, finalizeAudit, listAnswers, listAudits, listItems, listOrgTemplates, listSharedTemplates, saveAnswer, startAudit,
  updateItem, updateTemplate, voidAudit,
  type ChecklistAnswer, type ChecklistAudit, type ChecklistItem, type ChecklistTemplate, type SharedTemplate,
} from '../lib/checklists';
import { useConfig } from '../lib/config';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { toCsv } from '../lib/logbook/csv';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { downloadCsv } from '../lib/summary';

const verdictClass = (v: string) => (v === 'pass' ? 'pill ok' : v === 'fail' ? 'pill err' : 'pill warn');
const vnDate = (iso: string) => iso.split('-').reverse().join('/');
const AUDITOR_KEY = 'agriconnect.checklistAuditor';

/** Bộ bảng kiểm dùng chung → loại sản phẩm mà bộ đó dành cho (để gợi ý đúng bộ cho cơ sở); mã lạ thì coi là phù hợp mọi cơ sở */
const TEMPLATE_KIND: Record<string, string> = { vietgap_pig: 'livestock', vietgap_melon: 'crop', vietgap_melon_25: 'crop' };

/**
 * BẢNG KIỂM tự đánh giá (VietGAP…) — để cơ sở tự kiểm tra trước khi xin chứng nhận hoặc khi đoàn kiểm tra đến, rồi IN/xuất kết quả đưa cho đoàn.
 * Ba bước rõ ràng: (1) chọn bộ tiêu chí phù hợp, (2) tự đánh giá (có thanh tiến độ), (3) xem kết quả, việc cần khắc phục và in.
 * Bộ tiêu chí của cơ sở sửa được (mức A/B, ngưỡng đạt) nhưng nằm trong mục "Tùy chỉnh" ở cuối để màn chính gọn. Cần mạng.
 */
export function ChecklistSection() {
  const { active } = useOrgs();
  const cfg = useConfig();
  const online = useOnline();
  const [tpls, setTpls] = useState<ChecklistTemplate[] | undefined>(undefined);
  const [shared, setShared] = useState<SharedTemplate[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [audits, setAudits] = useState<ChecklistAudit[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [auditDate, setAuditDate] = useState(todayLocal());
  const [auditor, setAuditor] = useState(() => { try { return localStorage.getItem(AUDITOR_KEY) ?? ''; } catch { return ''; } });
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
    return audit ? <AuditView audit={audit} orgName={active.name} canEdit={canEdit} online={online} onBack={() => { setOpenId(null); void reload(); }} /> : null;
  }

  const tpl = tpls?.find((t) => t.id === selId) ?? tpls?.[0] ?? null;
  const notAdopted = shared.filter((s) => !(tpls ?? []).some((t) => t.source_code === s.code));
  const fits = (code: string) => { const k = TEMPLATE_KIND[code]; return !k || cfg.kindsOn.has(k); };
  const recommended = notAdopted.filter((s) => fits(s.code));
  const others = notAdopted.filter((s) => !fits(s.code));
  const mine = tpl ? audits.filter((a) => !a.voided_at && a.template_name === tpl.name) : [];
  const lastFinal = mine.find((a) => a.status === 'final'); // listAudits trả mới nhất trước
  const lastDraft = mine.find((a) => a.status === 'draft');
  const daysSince = lastFinal ? Math.floor((Date.now() - new Date(lastFinal.finalized_at ?? lastFinal.audit_date).getTime()) / 86_400_000) : null;
  const years = [...new Set(audits.map((a) => a.audit_date.slice(0, 4)))];

  const card = (s: SharedTemplate) => (
    <div className="card slim" key={s.code}>
      <strong>{s.name}</strong>
      {canEdit ? <button className="primary" disabled={busy || !online} onClick={() => void run(async () => { const id = await adoptTemplate(active.id, s.code); setSelId(id); })}>Dùng bộ này</button>
        : <p className="muted">Chủ cơ sở hoặc người có quyền Khai báo cần chọn bộ trước.</p>}
    </div>
  );

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: bảng kiểm cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p className="muted">Tự kiểm tra cơ sở theo tiêu chí VietGAP <strong>trước khi xin chứng nhận hoặc khi đoàn kiểm tra đến</strong>. Làm xong có thể in kết quả và danh sách việc cần khắc phục. Đây là bản tự đánh giá của cơ sở, không thay cho đánh giá của tổ chức chứng nhận.</p>

      {tpls === undefined && <p className="muted">Đang tải…</p>}

      {tpls && tpls.length === 0 && (
        <div className="card">
          <h2>Bước 1. Chọn bộ tiêu chí</h2>
          {recommended.length === 0 && others.length === 0 && <p className="muted">Hệ thống chưa có bộ bảng kiểm nào.</p>}
          {recommended.length > 0 && <p className="muted">Phù hợp với loại sản phẩm của cơ sở bạn:</p>}
          {recommended.map(card)}
          {others.length > 0 && (
            <Collapsible inline title="Bộ dành cho loại sản phẩm khác" summary={`${others.length} bộ`}>{others.map(card)}</Collapsible>
          )}
        </div>
      )}

      {tpl && (
        <>
          {tpls && tpls.length > 1 && (
            <label>Bộ tiêu chí đang dùng
              <select value={tpl.id} onChange={(e) => setSelId(e.target.value)}>
                {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          {!tpl.verified_at && (
            <p className="msg warn" role="status">
              Bộ tiêu chí này <strong>chưa được đối chiếu</strong> với bản chính thức của tổ chức chứng nhận mà bạn định đăng ký. Hãy so lại trước khi dùng làm hồ sơ; sửa ở mục "Tùy chỉnh bộ tiêu chí" bên dưới.
            </p>
          )}

          <div className="card">
            <h2>Bước 2. Tự đánh giá</h2>
            {lastFinal && lastFinal.conclusion
              ? <p>Lần gần nhất: <strong>{vnDate(lastFinal.audit_date)}</strong> · <span className={verdictClass(lastFinal.conclusion.verdict)}>{VERDICT_LABEL[lastFinal.conclusion.verdict]}</span>{daysSince !== null && daysSince > 365 ? <span className="alert-text"> · đã hơn 1 năm, nên đánh giá lại</span> : null}</p>
              : <p className="muted">Chưa có lần đánh giá nào đã chốt.</p>}
            {lastDraft && <p className="msg warn" role="status">Có lần đánh giá ngày {vnDate(lastDraft.audit_date)} còn dở. <button className="link inline" onClick={() => setOpenId(lastDraft.id)}>Tiếp tục điền</button></p>}
            {canEdit && !starting && <button className="primary" disabled={busy || !online} onClick={() => setStarting(true)}>+ Bắt đầu lần đánh giá mới</button>}
            {!canEdit && <p className="muted">Người có quyền Khai báo mới bắt đầu được lần đánh giá mới; bạn xem được kết quả.</p>}
            {starting && (
              <div className="inline-form">
                <div className="pair">
                  <label>Ngày đánh giá<input type="date" value={auditDate} max={todayLocal()} onChange={(e) => setAuditDate(e.target.value)} /></label>
                  <label>Người đánh giá<input value={auditor} maxLength={120} onChange={(e) => setAuditor(e.target.value)} placeholder="Họ tên" /></label>
                </div>
                <div className="btnrow">
                  <button className="primary" disabled={busy || !online || !auditDate} onClick={() => {
                    try { localStorage.setItem(AUDITOR_KEY, auditor.trim()); } catch { /* bỏ qua */ }
                    const id = crypto.randomUUID();
                    void run(async () => { await startAudit(id, active.id, tpl.id, auditDate, auditor.trim()); setStarting(false); setOpenId(id); });
                  }}>Bắt đầu</button>
                  <button className="secondary" onClick={() => setStarting(false)}>Hủy</button>
                </div>
              </div>
            )}
          </div>

          {audits.length > 0 && (
            <div className="card">
              <h2>Bước 3. Kết quả các lần đánh giá</h2>
              <p className="muted">Bấm "Xem / in" để xem chi tiết, việc cần khắc phục và in kết quả.</p>
              {years.map((y) => (
                <div key={y}>
                  <h3 className="sect">Năm {y}</h3>
                  {audits.filter((a) => a.audit_date.startsWith(y)).map((a) => {
                    const verdict = a.voided_at ? null : a.conclusion?.verdict ?? 'incomplete';
                    return (
                      <div className={a.voided_at ? 'card slim voided' : 'card slim'} key={a.id}>
                        <div className="row">
                          <strong className="grow">{vnDate(a.audit_date)}{a.auditor ? ` · ${a.auditor}` : ''}</strong>
                          {a.voided_at ? <span className="pill err">Đã hủy</span> : a.status === 'draft' ? <span className="pill warn">Còn dở</span> : verdict && <span className={verdictClass(verdict)}>{VERDICT_LABEL[verdict]}</span>}
                        </div>
                        {tpls && tpls.length > 1 && <p className="muted">{a.template_name}</p>}
                        {a.conclusion && !a.voided_at && <p className="muted">{a.conclusion.b_total === 0 ? 'Đạt' : 'Loại A'}: {a.conclusion.a_pass}/{a.conclusion.a_total} ({a.conclusion.a_pct}%){a.conclusion.b_total > 0 ? ` · Loại B: ${a.conclusion.b_pass}/${a.conclusion.b_total} (${a.conclusion.b_pct}%)` : ''}</p>}
                        {a.voided_at && a.void_reason && <p className="muted">Lý do hủy: {a.void_reason}</p>}
                        <button className="secondary" onClick={() => setOpenId(a.id)}>{a.status === 'draft' && !a.voided_at && canEdit ? 'Tiếp tục điền' : 'Xem / in'}</button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <TemplateEditor tpl={tpl} canEdit={canEdit} online={online} busy={busy} run={run} />
          {tpls && notAdopted.length > 0 && (
            <Collapsible inline title="＋ Lấy thêm bộ tiêu chí khác" summary={`${notAdopted.length} bộ có sẵn`}>{[...recommended, ...others].map(card)}</Collapsible>
          )}
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
    <Collapsible title="Tùy chỉnh bộ tiêu chí (chủ cơ sở / người có quyền Khai báo)" summary={`${tpl.pass_a_pct}% loại A · ${tpl.pass_b_pct}% loại B${tpl.verified_at ? ' · đã đối chiếu' : ' · chưa đối chiếu'}`} warn={!tpl.verified_at}>
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

/** Một lần đánh giá: điền từng tiêu chí (có tiến độ), xem kết luận và việc cần khắc phục, chốt, in / tải kết quả */
function AuditView({ audit, orgName, canEdit, online, onBack }: { audit: ChecklistAudit; orgName: string; canEdit: boolean; online: boolean; onBack: () => void }) {
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

  const all = answers ?? [];
  const total = all.length;
  const answered = all.filter((a) => a.result !== null).length;
  const failed = all.filter((a) => a.result === 'fail');
  const hasB = all.some((a) => a.level === 'B'); // bộ chỉ có loại A (ví dụ 25 tiêu chí cốt lõi) thì không hiện loại B
  const shown = all.filter((a) => !onlyOpen || a.result === null);
  const sections = [...new Set(shown.map((a) => a.section ?? ''))];
  const secCount = (name: string) => { const g = all.filter((a) => (a.section ?? '') === name); return `${g.filter((a) => a.result !== null).length}/${g.length}`; };
  const goNext = () => {
    const n = all.find((a) => a.result === null);
    if (n) document.getElementById(`ans-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const verdictText = summary.verdict === 'pass' ? 'ĐẠT' : summary.verdict === 'fail' ? 'KHÔNG ĐẠT' : 'CHƯA XONG';

  function exportCsv() {
    downloadCsv(`bang-kiem-${cur.audit_date}.csv`, toCsv(
      ['STT', 'Nhóm', 'Tiêu chí', ...(hasB ? ['Mức'] : []), 'Kết quả', cur.status === 'final' ? 'Bằng chứng / biện pháp khắc phục' : 'Bằng chứng / biện pháp khắc phục (bản nháp)'],
      all.map((a) => [String(a.seq), a.section ?? '', a.item_text, ...(hasB ? [a.level] : []), a.result ? RESULT_LABEL[a.result] : 'Chưa trả lời', a.evidence ?? '']),
    ));
  }

  return (
    <section>
      <div className="no-print">
        <button className="link" onClick={onBack}>← Về bảng kiểm</button>
        <h1>Đánh giá ngày {vnDate(cur.audit_date)}</h1>
        <p className="muted">{cur.template_name}{cur.auditor ? ` · Người đánh giá: ${cur.auditor}` : ''}</p>
        {cur.voided_at && <p className="msg warn">Đã hủy: {cur.void_reason}</p>}
        {error && <p className="msg error" role="alert">{error}</p>}

        <div className="card slim">
          <div className="row"><span>Kết luận</span><strong><span className={verdictClass(summary.verdict)}>{VERDICT_LABEL[summary.verdict]}</span></strong></div>
          {total > 0 && <>
            <progress value={answered} max={total} style={{ width: '100%' }} aria-label="Tiến độ trả lời" />
            <p className="muted" style={{ margin: 0 }}>Đã trả lời {answered}/{total} tiêu chí{draft && answered < total ? <> · <button className="link inline" onClick={goNext}>đến tiêu chí chưa trả lời</button></> : ''}</p>
          </>}
          <div className="row"><span>{hasB ? 'Loại A (bắt buộc)' : 'Tiêu chí đạt'}</span><strong>{summary.a_pass}/{summary.a_total} · {summary.a_pct}%</strong></div>
          {hasB && <div className="row"><span>Loại B</span><strong>{summary.b_pass}/{summary.b_total} · {summary.b_pct}%</strong></div>}
          <p className="muted">{hasB ? `Đạt khi loại A đạt từ ${cur.pass_a_pct}% và loại B đạt từ ${cur.pass_b_pct}%.` : `Đạt khi ${cur.pass_a_pct}% tiêu chí đạt.`} {summary.na > 0 ? `${summary.na} tiêu chí "không áp dụng" không tính vào tỉ lệ.` : ''}</p>
        </div>

        {failed.length > 0 && (
          <div className="card slim">
            <strong>Việc cần khắc phục ({failed.length})</strong>
            <ul>{failed.map((a) => <li key={a.id}>{a.seq}. {a.item_text.length > 140 ? `${a.item_text.slice(0, 140)}…` : a.item_text}{a.evidence ? <><br /><em>Khắc phục: {a.evidence}</em></> : <><br /><em className="muted">Chưa ghi biện pháp khắc phục</em></>}</li>)}</ul>
          </div>
        )}

        <div className="btnrow">
          {draft && <button className="primary" disabled={busy || !online || summary.unanswered > 0} onClick={() => void act(() => finalizeAudit(cur.id))}>Chốt kết quả</button>}
          {draft && summary.unanswered > 0 && <span className="muted">Cần trả lời hết {summary.unanswered} tiêu chí còn lại mới chốt được.</span>}
          {answers && <button className="secondary" onClick={() => window.print()}>🖨 In / lưu PDF</button>}
          {answers && <button className="secondary" onClick={exportCsv}>Tải Excel (CSV)</button>}
          {draft && <button className="secondary" disabled={busy || !online} onClick={() => setVoiding(!voiding)}>Hủy lần đánh giá</button>}
          {cur.status === 'final' && !cur.voided_at && canEdit && <button className="secondary" onClick={() => setVoiding(!voiding)}>Hủy lần đánh giá</button>}
        </div>
        {cur.status === 'draft' && !cur.voided_at && <p className="muted">Kết quả được lưu ngay khi bạn bấm từng tiêu chí; có thể thoát ra và quay lại điền tiếp.</p>}
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

        {draft && <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Chỉ hiện tiêu chí chưa trả lời</label>}
        {hasB && <p className="muted">Loại A là tiêu chí bắt buộc; loại B là tiêu chí khuyến khích.</p>}
        {answers === null && <p className="muted">Đang tải…</p>}
        {sections.map((sec) => (
          <details key={sec || 'all'} className="fold" open={!sec || sections.length <= 1 || draft}>
            {sec && <summary><strong>{sec}</strong> <span className="muted">({secCount(sec)} đã trả lời)</span></summary>}
            {shown.filter((a) => (a.section ?? '') === sec).map((a) => (
              <div className="card slim" key={a.id} id={`ans-${a.id}`}>
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
                  <label>{a.result === 'fail' ? 'Biện pháp khắc phục' : 'Bằng chứng / ghi chú (hồ sơ, ảnh, sổ sách có sẵn)'}
                    <input defaultValue={a.evidence ?? ''} maxLength={500} disabled={!draft || !online} onBlur={(e) => { if (e.target.value !== (a.evidence ?? '')) void setResult(a, a.result, e.target.value); }} />
                  </label>
                )}
              </div>
            ))}
          </details>
        ))}
      </div>

      {/* Bản in cho đoàn kiểm tra: chỉ hiện khi in (xem styles.css, .checkrep) */}
      {answers && (
        <div id="print-root" className="checkrep print-only">
          <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>BẢNG KIỂM TỰ ĐÁNH GIÁ</h2>
          <p style={{ textAlign: 'center', margin: '0 0 8px' }}>{cur.template_name}</p>
          <p style={{ margin: '2px 0' }}>Cơ sở: <strong>{orgName}</strong> · Ngày đánh giá: <strong>{vnDate(cur.audit_date)}</strong>{cur.auditor ? <> · Người đánh giá: <strong>{cur.auditor}</strong></> : null}</p>
          <p style={{ margin: '2px 0 8px' }}>Kết luận: <strong>{verdictText}</strong> — {hasB ? `loại A ${summary.a_pass}/${summary.a_total} (${summary.a_pct}%), loại B ${summary.b_pass}/${summary.b_total} (${summary.b_pct}%)` : `${summary.a_pass}/${summary.a_total} tiêu chí đạt (${summary.a_pct}%)`}{summary.na > 0 ? `, ${summary.na} không áp dụng` : ''}{cur.status === 'draft' ? ' (bản nháp, chưa chốt)' : ''}</p>
          <table className="grid">
            <thead><tr><th>STT</th><th>Tiêu chí</th>{hasB && <th>Mức</th>}<th>Kết quả</th><th>Bằng chứng / biện pháp khắc phục</th></tr></thead>
            <tbody>
              {all.map((a, i) => (
                <Fragment key={a.id}>
                  {a.section && a.section !== all[i - 1]?.section && <tr key={`s${a.id}`}><td colSpan={hasB ? 5 : 4}><strong>{a.section}</strong></td></tr>}
                  <tr key={a.id}><td>{a.seq}</td><td>{a.item_text}</td>{hasB && <td>{a.level}</td>}<td>{a.result ? RESULT_LABEL[a.result] : '—'}</td><td>{a.evidence ?? ''}</td></tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="logbook-sign"><span>Người đánh giá</span><span>Chủ cơ sở</span></div>
        </div>
      )}
    </section>
  );
}
