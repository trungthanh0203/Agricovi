import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { defaultCountUnit } from '../lib/countUnit';
import { restWarning } from '../lib/milestoneLogic';
import { Collapsible } from '../components/Collapsible';
import { CycleInfoFields, cropInfoToForm, formToCropInfo, type CropInfoForm } from '../components/CycleInfoFields';
import { createCycle, createCycleMidstart, fetchAreaFree, fetchQuotaContexts, setCyclePrep, type AreaFree, type QuotaContext } from '../lib/production';
import { fromM2, toM2 } from '../lib/areaUnits';
import { isOwner } from '../lib/roles';
import { MidstartPicker, type MidstartValue } from '../components/MidstartPicker';
import { recordExpense } from '../lib/finance';
import { useAuth } from '../lib/auth';
import { myCoopProcurement, type CoopProcurement } from '../lib/members';
import { addDays, fmtDate } from '../lib/dates';
import { listTemplates, loadTemplate, stageRanges, totalDays, type PhaseRow, type StageRow, type TemplateRow } from '../lib/templates';
import { useTable } from '../lib/tables';
import { useConfig } from '../lib/config';
import { db, type AreaRow } from '../lib/db';
import { HelpButton } from '../components/HelpButton';
import { PrepPicker } from '../components/PrepPicker';
import { type PrepMode } from '../lib/prep';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { areaPath, cycleAreas } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';

/**
 * Tạo vụ mới (P2): BẮT BUỘC chọn quy trình mẫu của cơ sở sở hữu vụ. Việc và ngày kế hoạch của vụ
 * được sao từ mẫu lúc tạo; sau này theo dõi vụ đúng theo các việc đó.
 */
export function CreateCycleScreen({ onDone, onCancel }: { onDone: (cycleId: string) => void; onCancel: () => void }) {
  const { active } = useOrgs();
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  const cfg = useConfig();

  const myAreas = cycleAreas(areas.filter((a) => a.organization_id === active?.id && a.is_active !== false)); // chỉ khu tạo vụ được: ô sản xuất, hoặc phân khu chưa chia nhỏ (D125); khu đã dừng hoặc là cơ sở vật chất thì không tạo vụ
  const [areaId, setAreaId] = useState('');
  const [productId, setProductId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const { session } = useAuth();
  // bắt đầu giữa chừng (migration 0178)
  const [mid, setMid] = useState<MidstartValue>({ currentId: '', doneIds: [] });
  const [midOrigin, setMidOrigin] = useState<'resume' | 'transfer'>('resume');
  const [midNote, setMidNote] = useState('');
  const [midCurStart, setMidCurStart] = useState(todayLocal());
  const [midCost, setMidCost] = useState('');
  const [midCostNote, setMidCostNote] = useState('');
  const [name, setName] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(todayLocal());
  const [targetYield, setTargetYield] = useState('');
  const [cropInfo, setCropInfo] = useState<CropInfoForm>(() => cropInfoToForm(null));
  const [budget, setBudget] = useState('');
  const [contexts, setContexts] = useState<QuotaContext[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [procure, setProcure] = useState<CoopProcurement[]>([]);   // sản phẩm HTX bao tiêu (D148)
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [followsId, setFollowsId] = useState(''); // nối tiếp sau vụ nào (D124)
  const [prepMode, setPrepMode] = useState<PrepMode>('whole'); // cách chuẩn bị theo ô sản xuất của vụ (D126)
  const [prepArea, setPrepArea] = useState('');
  const [free, setFree] = useState<AreaFree | null>(null);        // chỗ trống của ô đang chọn (migration 0179)
  const [intercrop, setIntercrop] = useState(false);              // trồng xen: dùng chung diện tích với vụ khác
  const [confirmOver, setConfirmOver] = useState(false);          // chủ cơ sở xác nhận tạo vụ vượt chỗ trống
  const [nameTouched, setNameTouched] = useState(false);

  // Phân khu hợp loại với sản phẩm: cùng loại, hoặc phân khu/sản phẩm loại "Khác". Phân khu khác loại vẫn chọn được nhưng có cảnh báo.
  const baseKind = (k?: string | null) => (k === 'growing' || !k ? 'crop' : k);
  const prodKind = cropTypes.find((c) => c.id === productId)?.kind;
  const fits = (a: AreaRow) => !prodKind || prodKind === 'other' || baseKind(a.kind) === 'other' || baseKind(a.kind) === prodKind;
  const fitAreas = myAreas.filter(fits);
  const otherAreas = myAreas.filter((a) => !fits(a));
  const pickedArea = myAreas.find((a) => a.id === areaId) ?? null;
  const areaMismatch = pickedArea && !fits(pickedArea);
  // danh sách chọn: ô sản xuất gom theo phân khu cha; phân khu chưa chia nhỏ đứng riêng
  const areaOptions = (list: AreaRow[]) => {
    const groups = new Map<string, AreaRow[]>();
    const solo: AreaRow[] = [];
    for (const a of list) {
      if (a.parent_id) groups.set(a.parent_id, [...(groups.get(a.parent_id) ?? []), a]);
      else solo.push(a);
    }
    const nameOf = (id: string) => areas.find((x) => x.id === id)?.name ?? '';
    return (
      <>
        {solo.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        {[...groups.entries()].sort((x, y) => nameOf(x[0]).localeCompare(nameOf(y[0]), 'vi')).map(([pid, cells]) => (
          <optgroup key={pid} label={nameOf(pid)}>
            {cells.sort((x, y) => x.name.localeCompare(y.name, 'vi', { numeric: true })).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>
        ))}
      </>
    );
  };
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
      fetchQuotaContexts(active.id).then((cs) => {
        setContexts(cs);
        const d = cs.find((c) => c.is_default && c.allowed) ?? cs.find((c) => c.allowed);
        if (d) setOwnerId(d.org_id);   // hộ chưa có gói trả phí: mặc định theo HTX
      }).catch(() => setContexts(null));
      myCoopProcurement(active.id).then(setProcure).catch(() => setProcure([]));
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
    setMid({ currentId: '', doneIds: [] });
    if (!templateId || !navigator.onLine) { setStages([]); setPhases([]); return; }
    let alive = true;
    loadTemplate(templateId).then((r) => { if (alive) { setStages(r.stages); setPhases(r.phases); } }).catch(() => { if (alive) { setStages([]); setPhases([]); } });
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
  useEffect(() => {
    setFree(null);
    if (!areaId || !online) return;
    let alive = true;
    const from = startDate || todayLocal();
    fetchAreaFree(areaId, from, addDays(from, Math.max(totalDays(stages), 1))).then((r) => { if (alive) setFree(r); }).catch(() => { if (alive) setFree(null); });
    return () => { alive = false; };
  }, [areaId, startDate, stages, online]); // eslint-disable-line react-hooks/exhaustive-deps
  // tên vụ gợi ý sẵn (người dùng sửa được): "<Sản phẩm> · <Ô>"
  useEffect(() => {
    if (nameTouched || !productId || !areaId) return;
    const nm = cropTypes.find((c) => c.id === productId)?.name ?? '';
    setName(`${nm} · ${areaPath(areaId, areas)}`);
  }, [productId, areaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => {
    const base = startDate || todayLocal();
    const ranges = stageRanges(stages); // việc song song có ngày bắt đầu riêng
    return [...stages].sort((a, b) => a.seq - b.seq).map((s) => {
      const r = ranges.get(s.id)!;
      return { ...s, start: addDays(base, r.from - 1), end: addDays(base, r.to - 1) };
    });
  }, [stages, startDate]);

  if (!active) return null;
  const choices = contexts && contexts.length > 1 ? contexts : null;
  const chosen = contexts?.find((c) => c.org_id === ownerId) ?? null;
  const chosenTemplate = (templates ?? []).find((t) => t.id === templateId);
  const allCycles = useTable('cycles');
  const allStages = useTable('stages');
  // trống chuồng tối thiểu 7 ngày trước khi nhập lứa mới (cảnh báo, không chặn)
  const sameArea = allCycles.filter((c) => c.area_id === areaId && (c.status === 'active' || c.status === 'paused' || c.status === 'preparing'));
  const running = sameArea.filter((c) => c.status === 'active' || c.status === 'paused');
  const prepEarly = prepMode !== 'whole'; // chuẩn bị 1 phần hoặc ở nhà riêng: vụ ở trạng thái Chuẩn bị nhưng ghi việc được
  const cycleLabel = (c: { name?: string | null; crop_type_id: string; start_date?: string | null }) => cycleTitle(c, cropName(c.crop_type_id));
  const wholeArea = (() => { const a = parseFloat((cropInfo.area || '').replace(',', '.')); const cap = free?.capacity_m2; return !!cap && a > 0 && toM2(a, cropInfo.unit) >= cap * 0.95; })();
  const restBase = areaId && startDate && wholeArea
    ? restWarning(areaId, startDate, 7, allCycles, (cid) => allStages.filter((s) => s.cycle_id === cid && s.actual_end).map((s) => s.actual_end as string).sort().pop() ?? null)
    : null;
  // Đang có vụ chạy ở khu này: chuẩn bị trước thì không phải lỗi, chỉ nhắc cách làm (D126)
  const rest = restBase; // nhiều vụ chạy song song trong một ô là bình thường: chỉ nhắc nghỉ ô khi vụ dùng cả ô
  const ownerLabel = (c: QuotaContext) => (c.kind === 'own' ? `Hộ riêng (${c.org_name})` : `HTX ${c.org_name}`);
  const picked = templates?.find((t) => t.id === templateId) ?? null;
  const defaultUnit = defaultCountUnit(prodKind);
  const total = totalDays(stages);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!areaId) return setError('Hãy chọn phân khu. Nếu chưa có, quay lại và thêm phân khu trước.');
    if (!productId) return setError('Hãy chọn sản phẩm (cây trồng, vật nuôi…) của vụ.');
    if (!templateId) return setError('Hãy chọn quy trình mùa vụ. Vụ phải được tạo theo một quy trình.');
    // Báo sớm khi biết chắc đã hết hạn mức; máy chủ vẫn là nơi kiểm tra cuối cùng
    if (startNow && !prepEarly && chosen && (!chosen.is_current || (chosen.max_cycles !== null && chosen.used_cycles >= chosen.max_cycles))) {
      return setError(
        chosen.is_current
          ? `Đã dùng ${chosen.used_cycles}/${chosen.max_cycles} vụ của gói (vụ đang sản xuất và vụ đang tạm dừng đều được tính). Hãy kết thúc hoặc hủy một vụ, nâng gói, hoặc chọn "Chưa bắt đầu" để lưu ở trạng thái Chuẩn bị.`
          : 'Gói đã hết hạn nên chưa tạo được vụ đang sản xuất. Hãy gia hạn, hoặc chọn "Chưa bắt đầu".',
      );
    }
    if (prepMode === 'separate' && !prepArea) return setError('Hãy chọn nơi chuẩn bị riêng, hoặc chọn cách chuẩn bị khác.');
    const cropInfoResult = formToCropInfo(cropInfo);
    if ('error' in cropInfoResult) return setError(cropInfoResult.error);
    if (name.trim().length < 2) return setError('Hãy nhập tên vụ (ít nhất 2 ký tự).');
    if (!cropInfo.variety.trim()) return setError('Hãy nhập giống (chưa rõ thì ghi "Chưa rõ giống").');
    if (!cropInfoResult.info.areaM2) return setError('Hãy nhập diện tích của vụ (lớn hơn 0).');
    if (!cropInfoResult.info.plants) return setError(`Hãy nhập số lượng ${cropInfo.countUnit.trim() || defaultUnit} (lớn hơn 0).`);
    const midstart = Boolean(mid.currentId);
    const costN = midCost.trim() ? Number(midCost.replace(/[.,\s]/g, '')) : 0;
    if (midstart) {
      if (!startNow || prepEarly) return setError('Vụ bắt đầu từ giữa chừng là vụ đang sản xuất: hãy chọn "Bắt đầu sản xuất ngay" và cách chuẩn bị "cả ô", hoặc bỏ chọn điểm bắt đầu giữa chừng.');
      if (startDate > todayLocal() || midCurStart > todayLocal()) return setError('Ngày vụ bắt đầu thật và ngày việc hiện tại bắt đầu không được ở tương lai.');
      if (midCurStart < startDate) return setError('Ngày việc hiện tại bắt đầu không thể trước ngày vụ bắt đầu.');
      if (costN > 0 && midCostNote.trim().length < 3) return setError('Chi phí ước tính phải ghi cách ước tính (ví dụ: tiền giống và công làm đất theo trí nhớ).');
    }
    setBusy(true);
    try {
      const base = {
        ownerOrgId: ownerId || active!.id,
        areaId,
        templateId,
        status: startNow && !prepEarly ? 'active' : 'preparing',
        startDate: startDate || null,
        name,
        info: cropInfoResult.info,
        targetYield: targetYield.trim() ? Number(targetYield.replace(/[.,\s]/g, '')) : null,
        budget: budget.trim() ? Number(budget.replace(/[.,\s]/g, '')) : null,
        intercrop,
        confirmOver: confirmOver && !intercrop,
      } as const;
      const newId = midstart
        ? await createCycleMidstart(base, { currentTplStageId: mid.currentId, doneTplStageIds: mid.doneIds, currentStart: midCurStart || null, origin: midOrigin, note: midNote })
        : await createCycle(base);
      if (midstart && costN > 0) {
        const row = await db.cycles.get(newId);
        try {
          await recordExpense({ organizationId: ownerId || active!.id, cycle: row ?? null, category: 'other', kind: 'estimated', amount: costN, date: startDate, note: `Trước khi dùng app (ước tính): ${midCostNote.trim()}`, userId: session?.user.id ?? '' });
        } catch (err) { window.alert(`Đã tạo vụ nhưng chưa ghi được chi phí ước tính: ${friendlyError(err)}. Bạn thêm lại ở Chi phí.`); }
      }
      if (followsId || prepMode !== 'whole') {
        try { await setCyclePrep(newId, prepMode, prepMode === 'separate' ? prepArea : null, followsId || null); } catch (err) { window.alert(`Đã tạo vụ nhưng chưa lưu được cách chuẩn bị / nối tiếp: ${friendlyError(err)}. Bạn đặt lại ở chi tiết vụ (mục Công đoạn chuẩn bị).`); }
      }
      onDone(newId); // mở chi tiết vụ kèm mã QR vừa tạo
    } catch (err) {
      setError(friendlyError(err)); // gồm cả lỗi vượt hạn mức từ máy chủ
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button type="button" className="link" onClick={onCancel}>← Quay lại</button>
      <div className="row"><h1 className="grow">Tạo vụ mới</h1><HelpButton topic="create-cycle" /></div>
      <p className="muted">Cơ sở: {active.name}</p>

      {myAreas.length === 0 ? (
        <>
          <p className="msg warn">Cơ sở chưa có phân khu. Hãy thêm phân khu ở tab Khai báo trước.</p>
          <button className="secondary" onClick={onCancel}>Quay lại</button>
        </>
      ) : (
        <div className="card">
        <form className="inline-form" onSubmit={onSubmit} noValidate>
          {choices && (
            <fieldset>
              <legend>Vụ này ghi theo</legend>
              {choices.map((c) => (
                <label key={c.org_id} className={ownerId === c.org_id ? 'choice selected' : 'choice'}>
                  <input type="radio" name="owner" checked={ownerId === c.org_id} disabled={!c.allowed} onChange={() => setOwnerId(c.org_id)} />
                  <span>
                    <strong>{ownerLabel(c)}</strong>
                    <small>
                      Đã dùng {c.used_cycles}/{c.max_cycles ?? '—'} vụ (tính cả vụ tạm dừng){c.plan_name ? ` · ${c.plan_name}` : ''}
                      {!c.is_current && ' · Gói đã hết hạn'}
                      {!c.allowed && ' · Hộ chưa có gói trả phí riêng nên chỉ tạo vụ theo HTX'}
                    </small>
                  </span>
                </label>
              ))}
              {(() => {
                const pc = procure.find((p) => p.crop_type_id === productId);
                const own = contexts?.find((c) => c.kind === 'own');
                return pc && own && ownerId === own.org_id
                  ? <p className="msg warn" role="status">{pc.coop_name} bao tiêu {pc.crop_name}{pc.ref_price_per_kg != null ? " (giá tham chiếu " + pc.ref_price_per_kg.toLocaleString("vi-VN") + "đ/kg)" : ""}. Nên chọn ghi theo HTX để HTX theo dõi và thu mua.</p>
                  : null;
              })()}
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
              Cơ sở này chưa có quy trình nào có việc. Hãy vào tab Khai báo → Quy trình mẫu để tạo quy trình trước.
            </p>
          )}
          {picked?.note && <p className="muted">{picked.note}</p>}

          <label>
            Phân khu / ô sản xuất
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {areaOptions(fitAreas)}
              {otherAreas.length > 0 && (
                <optgroup label="Phân khu khác loại (nên tránh)">
                  {otherAreas.map((a) => <option key={a.id} value={a.id}>{areaPath(a.id, areas)} · {cfg.groupLabel(a.kind, a.kind_item)}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          {areaMismatch && <p className="msg warn" role="status">Phân khu này thuộc loại "{cfg.groupLabel(pickedArea?.kind, pickedArea?.kind_item)}", còn sản phẩm thuộc loại "{cfg.groupLabel(prodKind, null)}". Vẫn tạo được, nhưng nên chọn phân khu đúng loại để báo cáo và nhãn hiển thị đúng.</p>}

          {areaId && free && (
            <div className="card slim" role="status">
              <strong>
                {free.capacity_m2 == null
                  ? 'Ô này chưa khai diện tích nên chưa kiểm được chỗ trống (khai ở Khai báo → Phân khu).'
                  : `Ô rộng ${Math.round(free.capacity_m2).toLocaleString('vi-VN')} m², còn trống ${Math.round(free.free_m2 ?? 0).toLocaleString('vi-VN')} m² trong thời gian của vụ.`}
              </strong>
              {free.cycles.length > 0 && (
                <ul className="muted" style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {free.cycles.map((c) => (
                    <li key={c.id}>{c.name || 'Vụ'}: {c.area_m2 != null ? `${Math.round(c.area_m2).toLocaleString('vi-VN')} m²` : 'chưa khai diện tích'}{c.intercrop ? ' (trồng xen)' : ''}{c.end ? ` · đến ${fmtDate(c.end)}` : ''}</li>
                  ))}
                </ul>
              )}
              {free.capacity_m2 != null && (
                <div className="btnrow">
                  <button type="button" className="secondary mini" onClick={() => setCropInfo((v) => ({ ...v, area: String(Math.round(fromM2(free.free_m2 ?? 0, v.unit) * 100) / 100) }))}>Dùng phần trống</button>
                  <button type="button" className="secondary mini" onClick={() => setCropInfo((v) => ({ ...v, area: String(Math.round(fromM2(free.capacity_m2 ?? 0, v.unit) * 100) / 100) }))}>Cả ô</button>
                </div>
              )}
            </div>
          )}

          <label>
            Tên vụ
            <input value={name} maxLength={120} onChange={(e) => { setNameTouched(true); setName(e.target.value); }} placeholder="Ví dụ: Dưa lưới vụ 1 nhà màng 2" />
          </label>

          <fieldset>
            <legend>Giống, diện tích, số lượng</legend>
            <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="variety" required />
            <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="scale" required />
            {(() => {
              const a = parseFloat((cropInfo.area || '').replace(',', '.'));
              const fm = free?.free_m2;
              const over = !intercrop && fm != null && a > 0 && toM2(a, cropInfo.unit) > fm + 0.5;
              return (
                <>
                  {over && (
                    <p className="msg warn" role="status">
                      Vượt chỗ trống của ô khoảng {Math.round(toM2(a, cropInfo.unit) - fm!).toLocaleString('vi-VN')} m². Hãy giảm diện tích, hoặc tích "Trồng xen" nếu trồng chung diện tích với vụ khác
                      {active && isOwner(active.roles) ? ', hoặc xác nhận bên dưới nếu diện tích ô khai chưa chính xác.' : '. Chỉ chủ cơ sở xác nhận được việc tạo vượt.'}
                    </p>
                  )}
                  {over && active && isOwner(active.roles) && (
                    <label className="check"><input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} /> <span>Tôi xác nhận tạo vụ dù vượt diện tích còn trống</span></label>
                  )}
                  {free && free.capacity_m2 != null && (
                    <label className="check"><input type="checkbox" checked={intercrop} onChange={(e) => setIntercrop(e.target.checked)} /> <span>Trồng xen (dùng chung diện tích với vụ khác trong ô)</span></label>
                  )}
                </>
              );
            })()}
            <Collapsible inline title="＋ Nguồn giống, số lô, ngày gieo, ngày trồng (tùy chọn)"
              summary={[cropInfo.source, cropInfo.lot, cropInfo.sowing, cropInfo.planting].filter(Boolean).join(' · ') || undefined}>
              <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="seedextra" />
            </Collapsible>
          </fieldset>

          <PrepPicker kind={prodKind} mode={prepMode} areaId={prepArea} areas={areas.filter((a) => a.organization_id === active.id)} cycleAreaId={areaId}
            onArea={setPrepArea} onMode={(m) => {
              setPrepMode(m);
              if (m !== 'whole' && !followsId && running.length > 0) setFollowsId(running[0]!.id); // gợi ý sẵn: nối tiếp sau vụ đang chạy ở khu này
            }} />

          {!prepEarly && <fieldset>
            <legend>Trạng thái</legend>
            <label className={startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={startNow} onChange={() => setStartNow(true)} />
              <span><strong>Bắt đầu sản xuất ngay</strong><small>Tính vào số vụ của gói.</small></span>
            </label>
            <label className={!startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={!startNow} onChange={() => setStartNow(false)} />
              <span><strong>Chưa bắt đầu (Chuẩn bị)</strong><small>Không tính vào số vụ của gói.</small></span>
            </label>
          </fieldset>}

          <label>
            Ngày bắt đầu
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            {mid.currentId && <small>Với vụ đang chạy dở: ngày vụ bắt đầu THẬT (có thể trong quá khứ), dùng để tính tuổi và ngày thu hoạch dự kiến.</small>}
          </label>

          {templateId && startNow && !prepEarly && stages.length > 1 && (
            <Collapsible inline title="＋ Vụ đang chạy dở hoặc nhận từ nơi khác (bắt đầu từ giữa chừng)"
              summary={mid.currentId ? `Đang ở: ${stages.find((s) => s.id === mid.currentId)?.name ?? ''}` : 'không bắt buộc'}>
              <MidstartPicker
                items={[...stages].sort((a, b) => a.seq - b.seq).map((s) => ({ id: s.id, name: s.name, phase: phases.find((p) => p.id === s.phase_id)?.name ?? null }))}
                value={mid} onChange={setMid} />
              {mid.currentId && (
                <>
                  <label>Cách bắt đầu
                    <select value={midOrigin} onChange={(e) => setMidOrigin(e.target.value as 'resume' | 'transfer')}>
                      <option value="resume">Vụ của tôi đã chạy trước khi dùng app</option>
                      <option value="transfer">Nhận về từ nơi khác (đã làm xong vài công đoạn đầu)</option>
                    </select>
                  </label>
                  <label>Ghi chú nguồn (không bắt buộc)<input value={midNote} maxLength={300} onChange={(e) => setMidNote(e.target.value)} placeholder="Ví dụ: Nhận cây con 25 ngày tuổi từ vườn ươm ông Ba" /></label>
                  <label>Việc đang làm bắt đầu ngày<input type="date" value={midCurStart} max={todayLocal()} onChange={(e) => setMidCurStart(e.target.value)} /></label>
                  <div className="pair">
                    <label>Chi phí đã bỏ ra trước đó (ước tính, đồng)<input value={midCost} inputMode="numeric" onChange={(e) => setMidCost(e.target.value)} placeholder="Không bắt buộc" /></label>
                    <label>Cách ước tính<input value={midCostNote} maxLength={200} onChange={(e) => setMidCostNote(e.target.value)} placeholder="Ví dụ: giống + công làm đất" /></label>
                  </div>
                  <p className="muted">Các việc đã làm trước đó được ghi là "làm trước khi dùng app", không cần nhật ký. Chi phí ước tính giúp giá thành không bị thấp giả; số lượng đã nhập (con, cây) nhập ở mục Giống, diện tích, số lượng.</p>
                </>
              )}
            </Collapsible>
          )}

          {sameArea.length > 0 && (
            <label>
              Nối tiếp sau vụ (không bắt buộc)
              <select value={followsId} onChange={(e) => setFollowsId(e.target.value)}>
                <option value="">Không nối tiếp vụ nào</option>
                {sameArea.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
              </select>
              <small>Khi vụ đó kết thúc, app nhắc bạn chuyển vụ này sang sản xuất.</small>
            </label>
          )}

          {rest && <p className="msg warn" role="status">{rest}</p>}

          {/* Các nhóm không bắt buộc, gom theo nội dung và thu gọn */}
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
        </div>
      )}
    </section>
  );
}
