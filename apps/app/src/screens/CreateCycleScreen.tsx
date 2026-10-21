import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createCycle, fetchQuotaContexts, type QuotaContext } from '../lib/production';
import { addDays, fmtDate } from '../lib/dates';
import { listTemplates, loadTemplate, type StageRow, type TemplateRow } from '../lib/templates';

/**
 * Tạo vụ mới (P2): BẮT BUỘC chọn quy trình mẫu của cơ sở sở hữu vụ. Giai đoạn và ngày kế hoạch của vụ
 * được sao từ mẫu lúc tạo; sau này theo dõi vụ đúng theo các giai đoạn đó.
 */
export function CreateCycleScreen({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { active } = useOrgs();
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const { cropTypes } = useCatalog();

  const myAreas = areas.filter((a) => a.organization_id === active?.id && a.is_active !== false); // trang trại đã dừng không tạo vụ mới
  const [areaId, setAreaId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [name, setName] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(todayLocal());
  const [contexts, setContexts] = useState<QuotaContext[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!areaId && myAreas[0]) setAreaId(myAreas[0].id);
  }, [myAreas, areaId]);

  // Hộ: chọn ghi theo hộ riêng hoặc theo HTX đang tham gia (v1.2 mục 4.1). HTX: luôn ghi theo HTX.
  useEffect(() => {
    if (!active) return;
    setOwnerId(active.id);
    if (!navigator.onLine) return setContexts(null);
    if (active.type === 'household') {
      fetchQuotaContexts(active.id).then(setContexts).catch(() => setContexts(null));
    }
  }, [active]);

  // Quy trình mẫu của cơ sở sở hữu vụ (hộ trong HTX đọc được mẫu của HTX)
  useEffect(() => {
    if (!ownerId || !navigator.onLine) return;
    let alive = true;
    setTemplates(null);
    setTemplateId('');
    listTemplates(ownerId)
      .then((rows) => { if (alive) setTemplates(rows.filter((t) => t.is_active && t.template_stages.length > 0)); })
      .catch((e) => { if (alive) { setTemplates([]); setError(friendlyError(e)); } });
    return () => { alive = false; };
  }, [ownerId]);

  useEffect(() => {
    if (!templateId || !navigator.onLine) { setStages([]); return; }
    let alive = true;
    loadTemplate(templateId).then((r) => { if (alive) setStages(r.stages); }).catch(() => { if (alive) setStages([]); });
    return () => { alive = false; };
  }, [templateId]);

  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';
  const plan = useMemo(() => {
    let from = startDate || todayLocal();
    return stages.map((s) => {
      const start = from;
      const end = addDays(start, s.duration_days - 1);
      from = addDays(end, 1);
      return { ...s, start, end };
    });
  }, [stages, startDate]);

  if (!active) return null;
  const choices = contexts && contexts.length > 1 ? contexts : null;
  const chosen = contexts?.find((c) => c.org_id === ownerId) ?? null;
  const ownerLabel = (c: QuotaContext) => (c.kind === 'own' ? `Hộ riêng (${c.org_name})` : `HTX ${c.org_name}`);
  const picked = templates?.find((t) => t.id === templateId) ?? null;
  const total = stages.reduce((s, x) => s + x.duration_days, 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!areaId) return setError('Hãy chọn trang trại. Nếu chưa có, quay lại và thêm trang trại trước.');
    if (!templateId) return setError('Hãy chọn quy trình mùa vụ. Vụ phải được tạo theo một quy trình.');
    // Báo sớm khi biết chắc đã hết hạn mức; máy chủ vẫn là nơi kiểm tra cuối cùng
    if (startNow && chosen && (!chosen.is_current || (chosen.max_cycles !== null && chosen.used_cycles >= chosen.max_cycles))) {
      return setError(
        chosen.is_current
          ? `Đã dùng ${chosen.used_cycles}/${chosen.max_cycles} vụ của gói. Kết thúc một vụ, nâng gói, hoặc chọn "Chưa bắt đầu" để lưu ở trạng thái Chuẩn bị.`
          : 'Gói đã hết hạn nên chưa tạo được vụ đang sản xuất. Hãy gia hạn, hoặc chọn "Chưa bắt đầu".',
      );
    }
    setBusy(true);
    try {
      await createCycle({
        ownerOrgId: ownerId || active!.id,
        areaId,
        templateId,
        status: startNow ? 'active' : 'preparing',
        startDate: startDate || null,
        name,
      });
      onDone();
    } catch (err) {
      setError(friendlyError(err)); // gồm cả lỗi vượt hạn mức từ máy chủ
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>Tạo vụ mới</h1>
      <p className="muted">Cơ sở: {active.name}</p>

      {myAreas.length === 0 ? (
        <>
          <p className="msg warn">Cơ sở chưa có trang trại. Hãy thêm trang trại ở tab Khai báo trước.</p>
          <button className="secondary" onClick={onCancel}>Quay lại</button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <label>
            Trang trại
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {myAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          {choices && (
            <fieldset>
              <legend>Vụ này ghi theo</legend>
              {choices.map((c) => (
                <label key={c.org_id} className={ownerId === c.org_id ? 'choice selected' : 'choice'}>
                  <input type="radio" name="owner" checked={ownerId === c.org_id} onChange={() => setOwnerId(c.org_id)} />
                  <span>
                    <strong>{ownerLabel(c)}</strong>
                    <small>
                      Đã dùng {c.used_cycles}/{c.max_cycles ?? '—'} vụ{c.plan_name ? ` · ${c.plan_name}` : ''}
                      {!c.is_current && ' · Gói đã hết hạn'}
                    </small>
                  </span>
                </label>
              ))}
              <small className="muted">
                Vụ ghi theo HTX thì dùng quy trình của HTX và HTX xem được theo quyền. Vụ ghi theo hộ riêng dùng quy trình của hộ và chỉ mình bạn xem.
              </small>
            </fieldset>
          )}
          {!online && <p className="msg warn">Đang offline. Tạo vụ cần có mạng để máy chủ kiểm hạn mức; hãy kết nối mạng rồi bấm Tạo vụ.</p>}

          <label>
            Quy trình mùa vụ
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!online || templates === null}>
              <option value="">{templates === null ? 'Đang tải…' : '— Chọn quy trình —'}</option>
              {(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · {cropName(t.crop_type_id)}</option>)}
            </select>
          </label>
          {templates !== null && templates.length === 0 && (
            <p className="msg warn">
              Cơ sở này chưa có quy trình nào có giai đoạn. Hãy vào tab Khai báo → Quy trình mẫu để tạo quy trình trước.
            </p>
          )}
          {picked?.note && <p className="muted">{picked.note}</p>}

          <label>
            Tên vụ (không bắt buộc)
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Dưa lưới vụ 1 nhà màng 2" />
          </label>

          <fieldset>
            <legend>Trạng thái</legend>
            <label className={startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={startNow} onChange={() => setStartNow(true)} />
              <span><strong>Bắt đầu sản xuất ngay</strong><small>Tính vào số vụ của gói.</small></span>
            </label>
            <label className={!startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={!startNow} onChange={() => setStartNow(false)} />
              <span><strong>Chưa bắt đầu (Chuẩn bị)</strong><small>Không tính vào số vụ của gói.</small></span>
            </label>
          </fieldset>

          <label>
            Ngày bắt đầu
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          {plan.length > 0 && (
            <div className="card slim">
              <strong>Các giai đoạn của vụ ({plan.length} giai đoạn · {total} ngày)</strong>
              <table className="grid">
                <thead><tr><th>Giai đoạn</th><th>Từ</th><th>Đến</th></tr></thead>
                <tbody>
                  {plan.map((s) => (
                    <tr key={s.id}><td>{s.name}<span className="sub">{s.duration_days} ngày</span></td><td>{fmtDate(s.start)}</td><td>{fmtDate(s.end)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Dự kiến kết thúc {fmtDate(plan[plan.length - 1]!.end)}. Ngày có thể lệch khi làm thực tế; sửa quy trình mẫu về sau không đổi vụ này.</p>
            </div>
          )}

          {error && <p className="msg error" role="alert">{error}</p>}
          <div className="btnrow">
            <button type="submit" className="primary" disabled={!online || busy || !templateId}>{busy ? 'Đang tạo…' : 'Tạo vụ'}</button>
            <button type="button" className="secondary" onClick={onCancel}>Hủy</button>
          </div>
        </form>
      )}
    </main>
  );
}
