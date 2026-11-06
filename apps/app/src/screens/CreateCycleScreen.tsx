import { useEffect, useMemo, useRef, useState } from 'react';
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
import { prepLabel, type PrepMode } from '../lib/prep';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import type { TabId } from '../lib/tabs';
import { DEFAULT_HERD_GROUPS, MODE_LABEL, suggestMode, type CycleMode } from '../lib/herd';
import { areaPath, cycleAreas } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';

/**
 * Tạo vụ mới theo 3 màn (docs/PLAN_TAO_VU_2_BUOC.md): Bước 1 "Trồng/nuôi gì, ở đâu?", Bước 2 "Bao nhiêu, từ khi nào?" (cả hai nhập MỌI thông tin),
 * Bước 3 xem lại và tạo vụ. Việc và ngày kế hoạch của vụ được sao từ quy trình mẫu lúc tạo. Trạng thái do ngày bắt đầu quyết định.
 * Lựa chọn đã nhập được lưu nháp trên máy để quay lại là tiếp tục.
 */
type Step = 1 | 2 | 3;
const STEP_TITLE: Record<Step, string> = { 1: 'Trồng / nuôi gì, ở đâu?', 2: 'Bao nhiêu, từ khi nào?', 3: 'Xem lại và tạo vụ' };
const draftKey = (orgId: string) => `agri.createCycleDraft.${orgId}`;
interface Draft {
  savedAt?: number;
  step: Step; productId: string; templateId: string; areaId: string; name: string; nameTouched: boolean; cropInfo: CropInfoForm; startDate: string;
  targetYield: string; budget: string; midOn: boolean; mid: MidstartValue; midNote: string; midCurStart: string; midCost: string; midCostNote: string;
  followsId: string; prepMode: PrepMode; prepArea: string; intercrop: boolean;
  mode: CycleMode; modeTouched: boolean; periodLabel: string; groups: { group: string; count: string }[]; maturity: string; amort: string;
}
function loadDraft(orgId: string | undefined): Draft | null {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(draftKey(orgId));
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && d.savedAt && Date.now() - d.savedAt < 60 * 60 * 1000 ? d : null;   // bản nháp chỉ giữ trong 1 giờ
  } catch { return null; }
}

export function CreateCycleScreen({ onDone, onCancel, onGo }: { onDone: (cycleId: string) => void; onCancel: () => void; onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const areas = useTable('areas');
  const allCycles = useTable('cycles');
  const allStages = useTable('stages');
  const { cropTypes } = useCatalog();
  const cfg = useConfig();
  const { session } = useAuth();
  const online = useOnline();

  const draft = useRef<Draft | null>(loadDraft(active?.id));
  const pendingTemplate = useRef<string>(draft.current?.templateId ?? '');
  const pendingMid = useRef<{ mid: MidstartValue; midOn: boolean } | null>(draft.current ? { mid: draft.current.mid, midOn: draft.current.midOn } : null);

  const myAreas = cycleAreas(areas.filter((a) => a.organization_id === active?.id && a.is_active !== false)); // chỉ khu tạo vụ được: ô sản xuất, hoặc phân khu chưa chia nhỏ (D125)
  const [step, setStep] = useState<Step>(draft.current?.step ?? 1);
  const [areaId, setAreaId] = useState(draft.current?.areaId ?? '');
  const [productId, setProductId] = useState(draft.current?.productId ?? '');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [mid, setMid] = useState<MidstartValue>({ currentId: '', doneIds: [] });
  const [midOn, setMidOn] = useState(false);   // false = "Từ đầu" (mặc định); true = vụ đang làm dở
  const [midNote, setMidNote] = useState(draft.current?.midNote ?? '');
  const [midCurStart, setMidCurStart] = useState(draft.current?.midCurStart ?? todayLocal());
  const [midCost, setMidCost] = useState(draft.current?.midCost ?? '');
  const [midCostNote, setMidCostNote] = useState(draft.current?.midCostNote ?? '');
  const [name, setName] = useState(draft.current?.name ?? '');
  const [nameTouched, setNameTouched] = useState(draft.current?.nameTouched ?? false);
  const [startDate, setStartDate] = useState(draft.current?.startDate ?? todayLocal());
  const [targetYield, setTargetYield] = useState(draft.current?.targetYield ?? '');
  const [budget, setBudget] = useState(draft.current?.budget ?? '');
  const [cropInfo, setCropInfo] = useState<CropInfoForm>(() => draft.current?.cropInfo ?? cropInfoToForm(null));
  const [contexts, setContexts] = useState<QuotaContext[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [procure, setProcure] = useState<CoopProcurement[]>([]);   // sản phẩm HTX bao tiêu (D148)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [followsId, setFollowsId] = useState(draft.current?.followsId ?? ''); // chờ vụ nào kết thúc (D124)
  const [prepMode, setPrepMode] = useState<PrepMode>(draft.current?.prepMode ?? 'whole'); // 'whole' hoặc 'separate' (khu riêng)
  const [prepArea, setPrepArea] = useState(draft.current?.prepArea ?? '');
  const [free, setFree] = useState<AreaFree | null>(null);        // chỗ trống của ô đang chọn (migration 0179)
  const [intercrop, setIntercrop] = useState(draft.current?.intercrop ?? false);
  const [confirmOver, setConfirmOver] = useState(false);          // chủ cơ sở xác nhận tạo vụ vượt chỗ trống
  const topRef = useRef<HTMLDivElement>(null);
  // kiểu vụ (migration 0182): theo vụ / vườn cây lâu năm / đàn nuôi liên tục
  const [mode, setMode] = useState<CycleMode>(draft.current?.mode ?? 'batch');
  const [modeTouched, setModeTouched] = useState(draft.current?.modeTouched ?? false);
  const [periodLabel, setPeriodLabel] = useState(draft.current?.periodLabel ?? '');
  const [groups, setGroups] = useState<{ group: string; count: string }[]>(draft.current?.groups ?? DEFAULT_HERD_GROUPS.map((g) => ({ group: g, count: '' })));
  const [maturity, setMaturity] = useState(draft.current?.maturity ?? '3');
  const [amort, setAmort] = useState(draft.current?.amort ?? '15');

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
      .then((rows) => {
        if (!alive) return;
        const ok = rows.filter((t) => t.is_active && t.template_stages.length > 0);
        setTemplates(ok);
        if (pendingTemplate.current && ok.some((t) => t.id === pendingTemplate.current)) { setTemplateId(pendingTemplate.current); }   // khôi phục bản nháp
        pendingTemplate.current = '';
      })
      .catch((e) => { if (alive) { setTemplates([]); setError(friendlyError(e)); } });
    return () => { alive = false; };
  }, [ownerId]);

  useEffect(() => {
    setMid({ currentId: '', doneIds: [] });
    setMidOn(false);
    if (!templateId || !navigator.onLine) { setStages([]); setPhases([]); return; }
    let alive = true;
    loadTemplate(templateId).then((r) => {
      if (!alive) return;
      setStages(r.stages); setPhases(r.phases);
      const pm = pendingMid.current;                                    // khôi phục điểm bắt đầu giữa chừng của bản nháp
      if (pm && pm.midOn && pm.mid.currentId && r.stages.some((s) => s.id === pm.mid.currentId)) { setMid(pm.mid); setMidOn(true); }
      pendingMid.current = null;
    }).catch(() => { if (alive) { setStages([]); setPhases([]); } });
    return () => { alive = false; };
  }, [templateId]);

  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';
  // Sản phẩm chọn được: sản phẩm đang dùng có ít nhất một quy trình có việc; quy trình hiện theo sản phẩm đã chọn
  const productsWithTpl = cropTypes.filter((c) => c.is_active && cfg.kindOn(c.kind) && (templates ?? []).some((t) => t.crop_type_id === c.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const templatesFor = (templates ?? []).filter((t) => t.crop_type_id === productId);
  function pickProduct(id: string) {
    setProductId(id);
    const p = cropTypes.find((c) => c.id === id);
    if (!modeTouched) setMode(p ? suggestMode(p.name, p.kind) : 'batch');
    else if ((mode === 'perennial' && p?.kind !== 'crop') || (mode === 'herd' && p?.kind !== 'livestock')) setMode('batch');
    const list = (templates ?? []).filter((t) => t.crop_type_id === id);
    setTemplateId(list.length === 1 ? list[0]!.id : '');
  }
  useEffect(() => { if (!productId && productsWithTpl.length === 1) pickProduct(productsWithTpl[0]!.id); }, [productsWithTpl.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // chỉ có một quy trình cho sản phẩm đã chọn (ví dụ bản nháp khôi phục xong) thì chọn sẵn
  useEffect(() => { if (productId && !templateId && templatesFor.length === 1) setTemplateId(templatesFor[0]!.id); }, [productId, templates]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const base = (midOn ? midCurStart : startDate) || todayLocal();
    const ranges = stageRanges(stages); // việc song song có ngày bắt đầu riêng
    return [...stages].sort((a, b) => a.seq - b.seq).map((s) => {
      const r = ranges.get(s.id)!;
      return { ...s, start: addDays(base, r.from - 1), end: addDays(base, r.to - 1) };
    });
  }, [stages, startDate, midOn, midCurStart]);

  // lưu nháp mỗi khi người dùng đổi lựa chọn
  useEffect(() => {
    if (!active) return;
    const d: Draft = { savedAt: Date.now(), step, productId, templateId, areaId, name, nameTouched, cropInfo, startDate, targetYield, budget, midOn, mid, midNote, midCurStart, midCost, midCostNote, followsId, prepMode, prepArea, intercrop, mode, modeTouched, periodLabel, groups, maturity, amort };
    try { localStorage.setItem(draftKey(active.id), JSON.stringify(d)); } catch { /* bỏ qua */ }
  }, [active, step, productId, templateId, areaId, name, nameTouched, cropInfo, startDate, targetYield, budget, midOn, mid, midNote, midCurStart, midCost, midCostNote, followsId, prepMode, prepArea, intercrop, mode, modeTouched, periodLabel, groups, maturity, amort]);
  const clearDraft = () => { if (active) try { localStorage.removeItem(draftKey(active.id)); } catch { /* bỏ qua */ } };

  if (!active) return null;
  const choices = contexts && contexts.length > 1 ? contexts : null;
  const chosen = contexts?.find((c) => c.org_id === ownerId) ?? null;
  // trống chuồng tối thiểu 7 ngày trước khi nhập lứa mới (cảnh báo, không chặn)
  const sameArea = allCycles.filter((c) => c.area_id === areaId && (c.status === 'active' || c.status === 'paused' || c.status === 'preparing'));
  const prepEarly = prepMode !== 'whole';
  const cycleLabel = (c: { name?: string | null; crop_type_id: string; start_date?: string | null }) => cycleTitle(c, cropName(c.crop_type_id));
  const areaNum = parseFloat((cropInfo.area || '').replace(',', '.'));
  const areaM2 = areaNum > 0 ? toM2(areaNum, cropInfo.unit) : 0;
  const wholeArea = !!free?.capacity_m2 && areaM2 >= free.capacity_m2 * 0.95;
  const rest = areaId && startDate && wholeArea
    ? restWarning(areaId, startDate, 7, allCycles, (cid) => allStages.filter((s) => s.cycle_id === cid && s.actual_end).map((s) => s.actual_end as string).sort().pop() ?? null)
    : null;
  const over = !intercrop && free?.free_m2 != null && areaM2 > 0 && areaM2 > free.free_m2 + 0.5;
  const ownerLabel = (c: QuotaContext) => (c.kind === 'own' ? `Hộ riêng (${c.org_name})` : `HTX ${c.org_name}`);
  const picked = templates?.find((t) => t.id === templateId) ?? null;
  const defaultUnit = defaultCountUnit(prodKind);
  const total = totalDays(stages);
  const today = todayLocal();
  const nonBatch = mode !== 'batch';
  const herdTotal = groups.reduce((n, g) => n + (Number(g.count.replace(/[.,\s]/g, '')) || 0), 0);
  const periodDefault = mode === 'herd' ? `Quý ${Math.floor((new Date(startDate || today).getMonth()) / 3) + 1}/${(startDate || today).slice(0, 4)}` : `Mùa ${(startDate || today).slice(0, 4)}`;
  const nameWord = mode === 'perennial' ? 'vườn cây' : mode === 'herd' ? 'đàn' : 'vụ';
  const kindAnimal = prodKind === 'livestock';

  // Trạng thái do ngày bắt đầu quyết định (không còn câu hỏi riêng): đang làm dở = đang sản xuất; ngày sau hôm nay, chuẩn bị ở khu riêng hoặc chờ vụ khác = chuẩn bị
  const futureStart = !midOn && startDate > today;
  const status: 'active' | 'preparing' = midOn ? 'active' : (futureStart || prepEarly || Boolean(followsId) ? 'preparing' : 'active');
  const statusWhy = midOn ? 'vì vụ đang làm dở' : futureStart ? 'vì ngày bắt đầu sau hôm nay' : prepEarly ? 'vì chuẩn bị ở khu riêng' : followsId ? 'vì chờ vụ khác kết thúc' : 'vì bắt đầu từ hôm nay hoặc ngày đã qua';

  function checkStep1(): string | null {
    if (!productId) return 'Hãy chọn sản phẩm (cây trồng, vật nuôi…).';
    if (!templateId) return 'Hãy chọn quy trình. Vụ phải được tạo theo một quy trình.';
    if (!areaId) return 'Hãy chọn ô sản xuất.';
    const r = formToCropInfo(cropInfo);
    if ('error' in r) return r.error;
    if (!r.info.areaM2) return 'Hãy nhập diện tích của vụ (lớn hơn 0).';
    if (!cropInfo.variety.trim()) return 'Hãy nhập giống (chưa rõ thì ghi "Chưa rõ giống").';
    if (mode === 'herd') {
      if (groups.some((g) => g.count.trim() && !/^\d+$/.test(g.count.replace(/[.,\s]/g, '')))) return 'Số đầu mỗi nhóm phải là số nguyên.';
      if (herdTotal <= 0) return 'Hãy nhập số đầu tồn của ít nhất một nhóm.';
    } else if (!r.info.plants) return `Hãy nhập số lượng ${cropInfo.countUnit.trim() || defaultUnit} (lớn hơn 0).`;
    return null;
  }
  function checkStep2(): string | null {
    if (name.trim().length < 2) return `Hãy nhập tên ${nameWord} (ít nhất 2 ký tự).`;
    if (prepMode === 'separate' && !prepArea) return 'Hãy chọn khu chuẩn bị riêng (mục Nâng cao), hoặc chọn "Chuẩn bị trong toàn diện tích của vụ".';
    if (mode === 'perennial' && (!cropInfo.planting || cropInfo.planting > today)) return 'Hãy nhập ngày trồng (không ở tương lai).';
    if (nonBatch && !periodLabel.trim() && !periodDefault) return 'Hãy nhập tên kỳ đầu tiên.';
    if (!startDate) return nonBatch ? 'Hãy chọn ngày bắt đầu theo dõi.' : 'Hãy chọn ngày bắt đầu vụ.';
    if (midOn) {
      if (!mid.currentId) return 'Hãy chọn vào cột Đang làm của việc bắt đầu, hoặc chọn "Từ đầu".';
      if (startDate > today || midCurStart > today) return 'Ngày vụ bắt đầu thật và ngày việc hiện tại bắt đầu không được ở tương lai.';
      if (midCurStart < startDate) return 'Ngày việc hiện tại bắt đầu không thể trước ngày vụ bắt đầu.';
      const costN = midCost.trim() ? Number(midCost.replace(/[.,\s]/g, '')) : 0;
      if (costN > 0 && midCostNote.trim().length < 3) return 'Chi phí ước tính phải ghi cách ước tính (ví dụ: tiền giống và công làm đất theo trí nhớ).';
    }
    return null;
  }
  function go(to: Step) {
    setStep(to);
    window.setTimeout(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  }
  function next() {
    const bad = step === 1 ? checkStep1() : checkStep2();
    if (bad) return setError(bad);
    setError(null);
    go((step + 1) as Step);
  }
  function chooseMode(m: CycleMode) {
    setMode(m); setModeTouched(true);
    if (m !== 'batch') { setMidOn(false); setMid({ currentId: '', doneIds: [] }); }
  }
  function chooseMid(on: boolean) {
    setMidOn(on);
    if (!on) { setMid({ currentId: '', doneIds: [] }); return; }
    setPrepMode('whole'); setPrepArea(''); setFollowsId('');
    if (startDate > today) setStartDate(today);
  }

  async function submit() {
    setError(null);
    const bad = checkStep1() ?? checkStep2();
    if (bad) return setError(bad);
    // Báo sớm khi biết chắc đã hết hạn mức; máy chủ vẫn là nơi kiểm tra cuối cùng
    if (status === 'active' && chosen && (!chosen.is_current || (chosen.max_cycles !== null && chosen.used_cycles >= chosen.max_cycles))) {
      return setError(
        chosen.is_current
          ? `Đã dùng ${chosen.used_cycles}/${chosen.max_cycles} vụ của gói (vụ đang sản xuất và vụ đang tạm dừng đều được tính). Hãy kết thúc hoặc hủy một vụ, nâng gói, hoặc quay lại Bước 2 chọn ngày bắt đầu sau hôm nay để lưu ở trạng thái Chuẩn bị.`
          : 'Gói đã hết hạn nên chưa tạo được vụ đang sản xuất. Hãy gia hạn, hoặc quay lại Bước 2 chọn ngày bắt đầu sau hôm nay.',
      );
    }
    if (over && !(confirmOver && isOwner(active!.roles))) return setError(isOwner(active!.roles) ? 'Diện tích vượt chỗ trống của ô: hãy tích xác nhận bên dưới, hoặc quay lại Bước 1 giảm diện tích.' : 'Diện tích vượt chỗ trống của ô: chỉ chủ cơ sở xác nhận được. Hãy quay lại Bước 1 giảm diện tích.');
    const parsed = formToCropInfo(cropInfo);
    if ('error' in parsed) return setError(parsed.error);
    const info = mode === 'herd' ? { ...parsed.info, plants: herdTotal } : parsed.info;
    const costN = midCost.trim() ? Number(midCost.replace(/[.,\s]/g, '')) : 0;
    setBusy(true);
    try {
      const base = {
        ownerOrgId: ownerId || active!.id,
        areaId,
        templateId,
        status,
        startDate: startDate || null,
        name,
        info,
        targetYield: targetYield.trim() ? Number(targetYield.replace(/[.,\s]/g, '')) : null,
        budget: budget.trim() ? Number(budget.replace(/[.,\s]/g, '')) : null,
        intercrop,
        confirmOver: confirmOver && !intercrop,
        mode,
        plantingDate: mode === 'perennial' ? cropInfo.planting : null,
        groups: mode === 'herd' ? groups.filter((g) => Number(g.count.replace(/[.,\s]/g, '')) > 0).map((g) => ({ group: g.group.trim(), count: Number(g.count.replace(/[.,\s]/g, '')) })) : undefined,
        periodLabel: nonBatch ? (periodLabel.trim() || periodDefault) : undefined,
        maturityYears: mode === 'perennial' ? Number(maturity.replace(',', '.')) || 3 : null,
        amortYears: mode === 'perennial' ? Math.round(Number(amort.replace(',', '.')) || 15) : null,
      } as const;
      const newId = midOn
        ? await createCycleMidstart(base, { currentTplStageId: mid.currentId, doneTplStageIds: mid.doneIds, currentStart: midCurStart || null, origin: 'resume', note: midNote })
        : await createCycle(base);
      if (midOn && costN > 0) {
        const row = await db.cycles.get(newId);
        try {
          await recordExpense({ organizationId: ownerId || active!.id, cycle: row ?? null, category: 'other', kind: 'estimated', amount: costN, date: startDate, note: `Trước khi dùng app (ước tính): ${midCostNote.trim()}`, userId: session?.user.id ?? '' });
        } catch (err) { window.alert(`Đã tạo vụ nhưng chưa ghi được chi phí ước tính: ${friendlyError(err)}. Bạn thêm lại ở Chi phí.`); }
      }
      if (followsId || prepMode !== 'whole') {
        try { await setCyclePrep(newId, prepMode, prepMode === 'separate' ? prepArea : null, followsId || null); } catch (err) { window.alert(`Đã tạo vụ nhưng chưa lưu được cách chuẩn bị / chờ vụ khác: ${friendlyError(err)}. Bạn đặt lại ở chi tiết vụ.`); }
      }
      clearDraft();
      onDone(newId); // mở chi tiết vụ kèm mã QR vừa tạo
    } catch (err) {
      setError(friendlyError(err)); // gồm cả lỗi vượt hạn mức từ máy chủ
    } finally {
      setBusy(false);
    }
  }

  const noArea = myAreas.length === 0;
  const noTemplate = templates !== null && templates.length === 0;
  const pct = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <section>
      <div ref={topRef} />
      <button type="button" className="link" onClick={() => { clearDraft(); onCancel(); }}>← Hủy</button>
      <div className="row"><h1 className="grow">Tạo vụ mới</h1><HelpButton topic="create-cycle" /></div>
      <p className="muted">Cơ sở: {active.name} · <strong>Bước {step}/3: {STEP_TITLE[step]}</strong></p>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ các bước"><i style={{ width: `${pct}%` }} /></div>
      {!online && <p className="msg warn">Đang offline. Tạo vụ cần có mạng để máy chủ kiểm hạn mức; hãy kết nối mạng rồi tiếp tục.</p>}

      <div className="card">
        <div className="inline-form">
          {step === 1 && (
            <>
              {noArea && (
                <>
                  <p className="msg warn">Cơ sở chưa có ô sản xuất. Hãy thêm phân khu và ô ở Khai báo trước (lựa chọn của bạn ở đây được giữ lại).</p>
                  {onGo && <button type="button" className="primary" onClick={() => onGo('declare', 'areas')}>Đi tới Khai báo → Phân khu</button>}
                </>
              )}
              {!noArea && noTemplate && (
                <>
                  <p className="msg warn">Cơ sở này chưa có quy trình nào có việc. Hãy vào Khai báo → Quy trình mẫu: xem quy trình mẫu của hệ thống rồi "Áp dụng cho cơ sở của tôi", hoặc tự tạo (lựa chọn của bạn ở đây được giữ lại).</p>
                  {onGo && <button type="button" className="primary" onClick={() => onGo('declare', 'templates')}>Đi tới Khai báo → Quy trình mẫu</button>}
                </>
              )}
              {!noArea && !noTemplate && (
                <>
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
                      <small className="muted">Vụ ghi theo HTX thì dùng quy trình của HTX và HTX xem được theo quyền. Vụ ghi theo hộ riêng dùng quy trình của hộ và chỉ mình bạn xem.</small>
                    </fieldset>
                  )}

                  <label>
                    Sản phẩm (cây trồng, vật nuôi…)
                    <select value={productId} onChange={(e) => pickProduct(e.target.value)} disabled={!online || templates === null}>
                      <option value="">{templates === null ? 'Đang tải…' : '— Chọn sản phẩm —'}</option>
                      {productsWithTpl.map((c) => <option key={c.id} value={c.id}>{c.name} · {cfg.groupLabel(c.kind, c.kind_item)}</option>)}
                    </select>
                  </label>
                  {productId && (prodKind === 'crop' || prodKind === 'livestock') && (
                    <fieldset>
                      <legend>{prodKind === 'crop' ? 'Cách trồng' : 'Cách nuôi'}</legend>
                      <label className={mode === 'batch' ? 'choice selected' : 'choice'}>
                        <input type="radio" name="cmode" checked={mode === 'batch'} onChange={() => chooseMode('batch')} />
                        <span><strong>{prodKind === 'crop' ? 'Theo vụ' : 'Nuôi theo lứa'}</strong><small>{prodKind === 'crop' ? 'Thu hoạch xong thì kết thúc vụ, lần sau tạo vụ mới.' : 'Nhập cả lứa rồi xuất; xong lứa thì kết thúc.'}</small></span>
                      </label>
                      <label className={mode !== 'batch' ? 'choice selected' : 'choice'}>
                        <input type="radio" name="cmode" checked={mode !== 'batch'} onChange={() => chooseMode(prodKind === 'crop' ? 'perennial' : 'herd')} />
                        <span><strong>{prodKind === 'crop' ? 'Vườn cây lâu năm' : 'Đàn nuôi liên tục'}</strong><small>{prodKind === 'crop' ? 'Cây trồng nhiều năm, thu hoạch hằng năm. Theo dõi theo từng mùa hoặc năm, tính tuổi cây và khấu hao vườn.' : 'Có đàn mẹ, con sinh ra, bán dần quanh năm. Theo dõi số đầu từng nhóm, báo cáo theo quý.'}</small></span>
                      </label>
                    </fieldset>
                  )}
                  <label>
                    {mode === 'perennial' ? 'Quy trình chăm sóc theo mùa / năm' : mode === 'herd' ? 'Lịch chăm sóc đàn theo kỳ' : 'Quy trình'}
                    <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!online || templates === null || !productId}>
                      <option value="">{!productId ? 'Chọn sản phẩm trước' : '— Chọn quy trình —'}</option>
                      {templatesFor.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  {picked?.note && <p className="muted">{picked.note}</p>}

                  <label>
                    Ô sản xuất
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
                            <li key={c.id}>{c.name || 'Vụ'}: {c.area_m2 != null ? `${Math.round(c.area_m2).toLocaleString('vi-VN')} m²` : 'chưa khai diện tích'}{c.intercrop ? ' (dùng chung diện tích)' : ''}{c.end ? ` · đến ${fmtDate(c.end)}` : ''} · {CYCLE_STATUS_LABEL_VI[c.status as keyof typeof CYCLE_STATUS_LABEL_VI] ?? c.status}</li>
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

                  <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="area" required />
                  <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="variety" required />
                  {mode === 'herd' ? (
                    <fieldset>
                      <legend>Số đầu tồn theo nhóm</legend>
                      <p className="muted">Nhập số đầu hiện có của từng nhóm (nhóm nào không có thì để trống). Có thể sửa tên nhóm hoặc thêm nhóm.</p>
                      {groups.map((g, i) => (
                        <div className="pair" key={i}>
                          <label>Nhóm<input value={g.group} maxLength={40} onChange={(e) => setGroups((s) => s.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))} /></label>
                          <label>Số {cropInfo.countUnit.trim() || defaultUnit}<input value={g.count} inputMode="numeric" onChange={(e) => setGroups((s) => s.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} /></label>
                        </div>
                      ))}
                      <div className="btnrow"><button type="button" className="secondary mini" onClick={() => setGroups((s) => [...s, { group: '', count: '' }])}>+ Thêm nhóm</button></div>
                      <p><strong>Tổng: {herdTotal.toLocaleString('vi-VN')} {cropInfo.countUnit.trim() || defaultUnit}</strong></p>
                    </fieldset>
                  ) : (
                    <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="count" required />
                  )}
                  {over && (
                    <p className="msg warn" role="status">
                      Vượt chỗ trống của ô khoảng {Math.round(areaM2 - (free?.free_m2 ?? 0)).toLocaleString('vi-VN')} m². Hãy giảm diện tích, hoặc tích "Dùng chung diện tích với vụ khác trong ô" nếu trồng chung diện tích
                      {isOwner(active.roles) ? '; chủ cơ sở có thể xác nhận ở Bước 3 nếu diện tích ô khai chưa chính xác.' : '. Chỉ chủ cơ sở xác nhận được việc tạo vượt.'}
                    </p>
                  )}
                  {free && free.capacity_m2 != null && free.cycles.length > 0 && (
                    <label className="check"><input type="checkbox" checked={intercrop} onChange={(e) => setIntercrop(e.target.checked)} /> <span>Dùng chung diện tích với vụ khác trong ô</span></label>
                  )}

                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label>
                Tên {nameWord}
                <input value={name} maxLength={120} onChange={(e) => { setNameTouched(true); setName(e.target.value); }} placeholder={mode === 'perennial' ? 'Ví dụ: Vườn na lô A' : mode === 'herd' ? 'Ví dụ: Đàn dê chuồng 2' : 'Ví dụ: Dưa lưới vụ 1 nhà màng 2'} />
              </label>
              {mode === 'perennial' && (
                <label>
                  Ngày trồng
                  <input type="date" value={cropInfo.planting} max={today} onChange={(e) => setCropInfo((v) => ({ ...v, planting: e.target.value }))} />
                  <small>Vườn đã trồng từ trước thì nhập ngày (hoặc gần đúng) lúc trồng; app tính tuổi cây từ ngày này.</small>
                </label>
              )}

              {templateId && stages.length > 0 && !nonBatch && (
                <fieldset>
                  <legend>Bắt đầu thế nào?</legend>
                  <label className={!midOn ? 'choice selected' : 'choice'}>
                    <input type="radio" name="midon" checked={!midOn} onChange={() => chooseMid(false)} />
                    <span><strong>Từ đầu</strong><small>Làm từ việc đầu tiên của quy trình.</small></span>
                  </label>
                  <label className={midOn ? 'choice selected' : 'choice'}>
                    <input type="radio" name="midon" checked={midOn} disabled={prepEarly || Boolean(followsId)} onChange={() => chooseMid(true)} />
                    <span><strong>Đang làm dở</strong><small>{prepEarly || followsId ? 'Không dùng được khi chuẩn bị ở khu riêng hoặc chờ vụ khác (đổi ở mục Nâng cao bên dưới).' : 'Vụ đã chạy trước khi dùng app: chọn việc đang làm, các việc trước đó ghi là "làm trước khi dùng app".'}</small></span>
                  </label>
                  {midOn && (
                    <>
                      <MidstartPicker
                        items={[...stages].sort((a, b) => a.seq - b.seq).map((s) => ({ id: s.id, name: s.name, phase: phases.find((p) => p.id === s.phase_id)?.name ?? null }))}
                        value={mid} onChange={setMid} />
                      {!mid.currentId && <p className="msg warn" role="status">Hãy chọn vào cột Đang làm của việc bắt đầu (hoặc bấm tên một công đoạn) ở bảng trên.</p>}
                      <div className="pair">
                        <label>Ngày vụ bắt đầu thật<input type="date" value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} /></label>
                        <label>Việc đang làm bắt đầu ngày<input type="date" value={midCurStart} min={startDate || undefined} max={today} onChange={(e) => setMidCurStart(e.target.value)} /></label>
                      </div>
                      <small className="muted">Ngày vụ bắt đầu thật có thể ở quá khứ, dùng để tính tuổi và ngày thu hoạch dự kiến. Lịch các việc sau tính từ ngày việc đang làm bắt đầu.</small>
                      <label>Ghi chú (không bắt buộc)<input value={midNote} maxLength={300} onChange={(e) => setMidNote(e.target.value)} placeholder="Ví dụ: vụ chạy dở từ trước khi dùng app" /></label>
                      <div className="pair">
                        <label>Chi phí đã bỏ ra trước đó (ước tính, đồng)<input value={midCost} inputMode="numeric" onChange={(e) => setMidCost(e.target.value)} placeholder="Không bắt buộc" /></label>
                        <label>Cách ước tính<input value={midCostNote} maxLength={200} onChange={(e) => setMidCostNote(e.target.value)} placeholder="Ví dụ: giống + công làm đất" /></label>
                      </div>
                    </>
                  )}
                </fieldset>
              )}

              {!midOn && (
                <label>
                  {nonBatch ? 'Ngày bắt đầu theo dõi' : 'Ngày bắt đầu vụ'}
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <small>{nonBatch ? 'Từ ngày này app tính chi phí, thu hoạch, doanh thu. ' : ''}Sẽ ở trạng thái <strong>{status === 'active' ? 'Đang sản xuất' : 'Chuẩn bị'}</strong> ({statusWhy}).{status === 'active' ? ' Tính vào số vụ của gói.' : ' Chưa tính vào số vụ của gói.'}</small>
                </label>
              )}
              {nonBatch && (
                <label>
                  Kỳ đầu tiên
                  <input value={periodLabel} maxLength={60} onChange={(e) => setPeriodLabel(e.target.value)} placeholder={periodDefault} />
                  <small>{mode === 'herd' ? 'Đàn theo dõi theo kỳ (thường là quý). ' : 'Vườn cây theo dõi theo mùa hoặc năm. '}Kỳ đầu chạy theo quy trình đã chọn, hết kỳ bạn đóng kỳ và mở kỳ mới trong Chi tiết.</small>
                </label>
              )}

              <Collapsible inline title="＋ Nâng cao: chuẩn bị ở khu riêng, chờ vụ khác"
                summary={[prepMode === 'separate' ? prepLabel('separate', prodKind) : '', followsId ? 'chờ vụ khác' : ''].filter(Boolean).join(' · ') || 'không dùng'}>
                <PrepPicker kind={prodKind} mode={prepMode} areaId={prepArea} areas={areas.filter((a) => a.organization_id === active.id)} cycleAreaId={areaId}
                  onArea={setPrepArea} onMode={(m) => { setPrepMode(m); if (m !== 'whole') { setMidOn(false); setMid({ currentId: '', doneIds: [] }); } }} />
                {sameArea.length > 0 && (
                  <label>
                    Chờ vụ khác kết thúc mới bắt đầu (không bắt buộc)
                    <select value={followsId} onChange={(e) => { setFollowsId(e.target.value); if (e.target.value) { setMidOn(false); setMid({ currentId: '', doneIds: [] }); } }}>
                      <option value="">Không chờ vụ nào</option>
                      {sameArea.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
                    </select>
                    <small>Vụ này lưu ở trạng thái Chuẩn bị; khi vụ đó kết thúc, app nhắc bạn chuyển sang sản xuất.</small>
                  </label>
                )}
              </Collapsible>

              <Collapsible inline title="＋ Thông tin thêm (làm sau cũng được)"
                summary={[cropInfo.source, cropInfo.lot, cropInfo.sowing, cropInfo.code, targetYield && `${targetYield} kg`, budget && `${budget} đ`].filter(Boolean).join(' · ') || undefined}>
                <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="seedextra" hidePlanting={mode === 'perennial'} />
                {mode === 'perennial' && (
                  <div className="pair">
                    <label>Số năm kiến thiết (chưa kinh doanh)<input value={maturity} inputMode="decimal" onChange={(e) => setMaturity(e.target.value)} /></label>
                    <label>Số năm khấu hao chi phí đầu tư<input value={amort} inputMode="numeric" onChange={(e) => setAmort(e.target.value)} /></label>
                  </div>
                )}
                <div className="pair">
                  <label>Sản lượng dự kiến (kg)<input value={targetYield} inputMode="numeric" onChange={(e) => setTargetYield(e.target.value)} /></label>
                  <label>Ngân sách dự kiến (đồng)<input value={budget} inputMode="numeric" onChange={(e) => setBudget(e.target.value)} /></label>
                </div>
                <CycleInfoFields value={cropInfo} onChange={setCropInfo} defaultUnit={defaultUnit} kind={prodKind} parts="manageflat" />
              </Collapsible>
            </>
          )}

          {step === 3 && (
            <>
              <div className="card slim">
                <SummaryRow label="Sản phẩm" value={`${cropName(productId)}${picked ? ` · ${picked.name}` : ''}`} onEdit={() => go(1)} />
                <SummaryRow label="Ô sản xuất" value={`${areaPath(areaId, areas)} · ${Math.round(areaM2).toLocaleString('vi-VN')} m²${intercrop ? ' (dùng chung diện tích)' : ''}`} onEdit={() => go(1)} />
                {(prepMode === 'separate' || followsId) && (
                  <SummaryRow label="Nâng cao" value={[prepMode === 'separate' ? `${prepLabel('separate', prodKind)}: ${areaPath(prepArea, areas)}` : '', followsId ? `Chờ vụ ${cycleLabel(allCycles.find((c) => c.id === followsId) ?? { crop_type_id: productId })}` : ''].filter(Boolean).join(' · ')} onEdit={() => go(2)} />
                )}
                {nonBatch && <SummaryRow label="Kiểu" value={MODE_LABEL[mode]} onEdit={() => go(1)} />}
                <SummaryRow label={`Tên ${nameWord}`} value={name} onEdit={() => go(2)} />
                <SummaryRow label="Giống · số lượng" value={`${cropInfo.variety} · ${mode === 'herd' ? herdTotal : cropInfo.plants} ${cropInfo.countUnit.trim() || defaultUnit}`} onEdit={() => go(1)} />
                {mode === 'herd' && <SummaryRow label="Theo nhóm" value={groups.filter((g) => Number(g.count.replace(/[.,\s]/g, '')) > 0).map((g) => `${g.group}: ${g.count}`).join(' · ')} onEdit={() => go(1)} />}
                {mode === 'perennial' && <SummaryRow label="Ngày trồng" value={`${fmtDate(cropInfo.planting)} (khấu hao ${amort} năm, kiến thiết ${maturity} năm)`} onEdit={() => go(2)} />}
                {nonBatch && <SummaryRow label="Kỳ đầu tiên" value={`${periodLabel.trim() || periodDefault}, từ ${fmtDate(startDate)}`} onEdit={() => go(2)} />}
                {!nonBatch && <SummaryRow label="Bắt đầu" value={midOn ? `Đang làm dở: ${stages.find((s) => s.id === mid.currentId)?.name ?? ''} (vụ bắt đầu thật ${fmtDate(startDate)}, việc này từ ${fmtDate(midCurStart)})` : `Từ đầu, ngày ${fmtDate(startDate)}`} onEdit={() => go(2)} />}
                <SummaryRow label="Trạng thái" value={`${status === 'active' ? 'Đang sản xuất' : 'Chuẩn bị'} (${statusWhy})`} />
              </div>

              {rest && <p className="msg warn" role="status">{rest}</p>}
              {over && (
                <>
                  <p className="msg warn" role="status">Diện tích vụ vượt chỗ trống của ô khoảng {Math.round(areaM2 - (free?.free_m2 ?? 0)).toLocaleString('vi-VN')} m².</p>
                  {isOwner(active.roles)
                    ? <label className="check"><input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} /> <span>Tôi xác nhận tạo vụ dù vượt diện tích còn trống</span></label>
                    : <p className="msg warn">Chỉ chủ cơ sở xác nhận được. Hãy quay lại Bước 1 giảm diện tích.</p>}
                </>
              )}
              {free?.capacity_m2 == null && areaId && <p className="muted">Ô này chưa khai diện tích nên app chưa kiểm được chỗ trống.</p>}

              {plan.length > 0 && (
                <div className="card slim">
                  <strong>Các việc của vụ ({plan.length} việc · {total} ngày)</strong>
                  <table className="grid">
                    <thead><tr><th>Việc</th><th>Từ</th><th>Đến</th></tr></thead>
                    <tbody>
                      {plan.map((s) => (
                        <tr key={s.id}><td>{s.name}<span className="sub">{s.duration_days} ngày{midOn && mid.doneIds.includes(s.id) ? ' · làm trước khi dùng app' : ''}</span></td><td>{fmtDate(s.start)}</td><td>{fmtDate(s.end)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted">Dự kiến kết thúc {fmtDate(plan[plan.length - 1]!.end)}. Ngày có thể lệch khi làm thực tế; sửa quy trình mẫu về sau không đổi vụ này.</p>
                </div>
              )}
            </>
          )}

          {error && <p className="msg error" role="alert">{error}</p>}
          <div className="btnrow">
            {step > 1 && <button type="button" className="secondary" onClick={() => { setError(null); go((step - 1) as Step); }}>← Quay lại</button>}
            {step < 3
              ? <button type="button" className="primary" disabled={!online || noArea || noTemplate} onClick={next}>Tiếp →</button>
              : <button type="button" className="primary" disabled={!online || busy} onClick={() => void submit()}>{busy ? 'Đang tạo…' : 'Tạo vụ'}</button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="row">
      <span className="muted" style={{ minWidth: 96 }}>{label}</span>
      <strong className="grow">{value}</strong>
      {onEdit && <button type="button" className="link inline" onClick={onEdit}>Sửa</button>}
    </div>
  );
}
