import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { defaultCountUnit } from '../lib/countUnit';
import { restWarning } from '../lib/milestoneLogic';
import { Collapsible } from '../components/Collapsible';
import { CycleInfoFields, cropInfoToForm, formToCropInfo, type CropInfoForm } from '../components/CycleInfoFields';
import { createCycle, fetchQuotaContexts, type QuotaContext } from '../lib/production';
import { addDays, fmtDate } from '../lib/dates';
import { listTemplates, loadTemplate, type StageRow, type TemplateRow } from '../lib/templates';
import { useTable } from '../lib/tables';
import { useConfig } from '../lib/config';
import type { AreaRow } from '../lib/db';

/**
 * Tạo vụ mới (P2): BẮT BUỘC chọn quy trình mẫu của cơ sở sở hữu vụ. Việc và ngày kế hoạch của vụ
 * được sao từ mẫu lúc tạo; sau này theo dõi vụ đúng theo các việc đó.
 */
export function CreateCycleScreen({ onDone, onCancel }: { onDone: (cycleId: string) => void; onCancel: () => void }) {
  const { active } = useOrgs();
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  const cfg = useConfig();

  const myAreas = areas.filter((a) => a.organization_id === active?.id && a.is_active !== false && a.kind !== 'facility'); // khu đã dừng hoặc là cơ sở vật chất thì không tạo vụ
  const [areaId, setAreaId] = useState('');
  const [productId, setProductId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [name, setName] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(todayLocal());
  const [targetYield, setTargetYield] = useState('');
  const [cropInfo, setCropInfo] = useState<CropInfoForm>(() => cropInfoToForm(null));
  const [budget, setBudget] = useState('');
  const [contexts, setContexts] = useState<QuotaContext[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  // Phân khu hợp loại với sản phẩm: cùng loại, hoặc phân khu/sản phẩm loại "Khác". Phân khu khác loại vẫn chọn được nhưng có cảnh báo.
  const baseKind = (k?: string | null) => (k === 'growing' || !k ? 'crop' : k);
  const prodKind = cropTypes.find((c) => c.id === productId)?.kind;
  const fits = (a: AreaRow) => !prodKind || prodKind === 'other' || baseKind(a.kind) === 'other' || baseKind(a.kind) === prodKind;
  const fitAreas = myAreas.filter(fits);
  const otherAreas = myAreas.filter((a) => !fits(a));
  const pickedArea = myAreas.find((a) => a.id === areaId) ?? null;
  const areaMismatch = pickedArea && !fits(pickedArea);
  const isAnimal = prodKind === 'livestock' || prodKind === 'aquatic';

  useEffect(() => {
    // chọn sẵn phân khu đầu tiên hợp loại; đổi sản phẩm sang loại khác thì chọn lại nếu phân khu đang chọn không hợp
    const cur = myAreas.find((a) => a.id === areaId);
    if (!cur || !fits(cur)) { const next = fitAreas[0] ?? myAreas[0]; if (next && next.id !== areaId) setAreaId(next.id); }
  }, [myAreas, areaId, productId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Sản phẩm chọn được: sản phẩm đang dùng có ít nhất một quy trình có việc; quy trình hiện theo sản phẩm đã chọn
  const productsWithTpl = cropTypes.filter((c) => c.is_active && cfg.kindOn(c.kind) && (templates ?? []).some((t) => t.crop_type_id === c.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const templatesFor = (templates ?? []).filter((t) => t.crop_type_id === productId);
  function pickProduct(id: string) {
    setProductId(id);
    const list = (templates ?? []).filter((t) => t.crop_type_id === id);
    setTemplateId(list.length === 1 ? list[0]!.id : '');
  }
  useEffect(() => { if (!productId && productsWithTpl.length === 1) pickProduct(productsWithTpl[0]!.id); }, [productsWithTpl.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const chosenTemplate = (templates ?? []).find((t) => t.id === templateId);
  const allCycles = useTable('cycles');
  const allStages = useTable('stages');
  // trống chuồng tối thiểu 7 ngày trước khi nhập lứa mới (cảnh báo, không chặn)
  const rest = areaId && startDate
    ? restWarning(areaId, startDate, 7, allCycles, (cid) => allStages.filter((s) => s.cycle_id === cid && s.actual_end).map((s) => s.actual_end as string).sort().pop() ?? null)
    : null;
  const ownerLabel = (c: QuotaContext) => (c.kind === 'own' ? `Hộ riêng (${c.org_name})` : `HTX ${c.org_name}`);
  const picked = templates?.find((t) => t.id === templateId) ?? null;
  const defaultUnit = defaultCountUnit(prodKind);
  const total = stages.reduce((s, x) => s + x.duration_days, 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!areaId) return setError('Hãy chọn phân khu. Nếu chưa có, quay lại và thêm phân khu trước.');
    if (!productId) return setError('Hãy chọn sản phẩm (cây trồng, vật nuôi…) của vụ.');
    if (!templateId) return setError('Hãy chọn quy trình mùa vụ. Vụ phải được tạo theo một quy trình.');
    // Báo sớm khi biết chắc đã hết hạn mức; máy chủ vẫn là nơi kiểm tra cuối cùng
    if (startNow && chosen && (!chosen.is_current || (chosen.max_cycles !== null && chosen.used_cycles >= chosen.max_cycles))) {
      return setError(
        chosen.is_current
          ? `Đã dùng ${chosen.used_cycles}/${chosen.max_cycles} vụ của gói. Kết thúc một vụ, nâng gói, hoặc chọn "Chưa bắt đầu" để lưu ở trạng thái Chuẩn bị.`
          : 'Gói đã hết hạn nên chưa tạo được vụ đang sản xuất. Hãy gia hạn, hoặc chọn "Chưa bắt đầu".',
      );
    }
    const cropInfoResult = formToCropInfo(cropInfo);
    if ('error' in cropInfoResult) return setError(cropInfoResult.error);
    // chỉ nhắc, không bắt buộc: số con là gốc để tính hao hụt, mật độ và FCR
    if (isAnimal && !cropInfo.plants.trim() && !window.confirm('Chưa nhập số con nhập. Không có số này app chưa tính được hao hụt, mật độ và FCR (bổ sung sau ở Sửa vụ vẫn được). Vẫn tạo vụ?')) return;
    setBusy(true);
    try {
      const newId = await createCycle({
        ownerOrgId: ownerId || active!.id,
        areaId,
        templateId,
        status: startNow ? 'active' : 'preparing',
        startDate: startDate || null,
        name,
        info: cropInfoResult.info,
        targetYield: targetYield.trim() ? Number(targetYield.replace(/[.,\s]/g, '')) : null,
        budget: budget.trim() ? Number(budget.replace(/[.,\s]/g, '')) : null,
      });
      onDone(newId); // mở chi tiết vụ kèm mã QR vừa tạo
    } catch (err) {
      setError(friendlyError(err)); // gồm cả lỗi vượt hạn mức từ máy chủ
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>Tạo vụ mới</h1>
      <p className="muted">Cơ sở: {active.name}</p>

      {myAreas.length === 0 ? (
        <>
          <p className="msg warn">Cơ sở chưa có phân khu. Hãy thêm phân khu ở tab Khai báo trước.</p>
          <button className="secondary" onClick={onCancel}>Quay lại</button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
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
            Sản phẩm (cây trồng, vật nuôi…)
            <select value={productId} onChange={(e) => pickProduct(e.target.value)} disabled={!online || templates === null}>
              <option value="">{templates === null ? 'Đang tải…' : '— Chọn sản phẩm —'}</option>
              {productsWithTpl.map((c) => <option key={c.id} value={c.id}>{c.name} · {cfg.groupLabel(c.kind, c.kind_item)}</option>)}
            </select>
          </label>
          <label>
            Quy trình mùa vụ
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!online || templates === null || !productId}>
              <option value="">{!productId ? 'Chọn sản phẩm trước' : '— Chọn quy trình —'}</option>
              {templatesFor.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {templates !== null && templates.length === 0 && (
            <p className="msg warn">
              Cơ sở này chưa có quy trình nào có việc. Hãy vào tab Khai báo → Tạo quy trình để tạo quy trình trước.
            </p>
          )}
          {picked?.note && <p className="muted">{picked.note}</p>}

          <label>
            Phân khu
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {fitAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              {otherAreas.length > 0 && (
                <optgroup label="Phân khu khác loại (nên tránh)">
                  {otherAreas.map((a) => <option key={a.id} value={a.id}>{a.name} · {cfg.groupLabel(a.kind, a.kind_item)}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          {areaMismatch && <p className="msg warn" role="status">Phân khu này thuộc loại "{cfg.groupLabel(pickedArea?.kind, pickedArea?.kind_item)}", còn sản phẩm thuộc loại "{cfg.groupLabel(prodKind, null)}". Vẫn tạo được, nhưng nên chọn phân khu đúng loại để báo cáo và nhãn hiển thị đúng.</p>}

          {isAnimal && (
            <>
              <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="count" />
              {!cropInfo.plants.trim() && <p className="msg warn" role="status">Nên nhập số con nhập chuồng/thả giống: có số này app mới tính được hao hụt, mật độ và FCR. Không bắt buộc, bổ sung sau cũng được.</p>}
            </>
          )}

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

          {rest && <p className="msg warn" role="status">{rest}</p>}

          {/* Các nhóm không bắt buộc, gom theo nội dung và thu gọn */}
          <Collapsible inline title="＋ Giống, diện tích, số lượng (không bắt buộc)"
            summary={[cropInfo.variety, cropInfo.area && `${cropInfo.area} ${cropInfo.unit}`, cropInfo.plants && `${cropInfo.plants} ${cropInfo.countUnit || defaultUnit}`].filter(Boolean).join(' · ') || undefined}>
            <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts={isAnimal ? 'area' : 'scale'} />
            <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="seed" />
          </Collapsible>

          <Collapsible inline title="＋ Kế hoạch: sản lượng, ngân sách (không bắt buộc)"
            summary={[targetYield && `${targetYield} kg`, budget && `${budget} đ`].filter(Boolean).join(' · ') || undefined}>
            <div className="pair">
              <label>Sản lượng dự kiến (kg)<input value={targetYield} inputMode="numeric" onChange={(e) => setTargetYield(e.target.value)} /></label>
              <label>Ngân sách dự kiến (đồng)<input value={budget} inputMode="numeric" onChange={(e) => setBudget(e.target.value)} /></label>
            </div>
          </Collapsible>

          <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="manage" />

          {plan.length > 0 && (
            <div className="card slim">
              <strong>Các việc của vụ ({plan.length} việc · {total} ngày)</strong>
              <table className="grid">
                <thead><tr><th>Việc</th><th>Từ</th><th>Đến</th></tr></thead>
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
    </div>
  );
}
