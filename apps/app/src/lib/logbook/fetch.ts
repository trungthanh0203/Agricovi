import { db, type CycleRow, type LogRow, type MaterialRow, type WorkTypeRow } from '../db';
import { supabase } from '../supabase';
import type { LogEntry, LogbookData, ReceiptEntry, Use } from './types';

/**
 * Nạp dữ liệu để dựng sổ (cần mạng): nhật ký đầy đủ trong khoảng ngày và vật tư đã dùng/đã nhập lấy từ máy chủ,
 * phần còn lại (thu hoạch, sự cố, số lượng, mốc, giai đoạn) lấy từ bản đã tải về máy.
 */
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export interface LoadArgs {
  orgId: string; orgName: string; cycle: CycleRow | null; from: string; to: string;
  workTypes: WorkTypeRow[]; canViewStock: boolean; productName: string; productKind: LogbookData['productKind']; unit: string;
}

export async function loadLogbookData(a: LoadArgs): Promise<LogbookData> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const toExclusive = new Date(Date.parse(`${a.to}T00:00:00Z`) + 2 * 86400000).toISOString(); // dư một ngày để khỏi sót múi giờ
  const fromIso = new Date(Date.parse(`${a.from}T00:00:00Z`) - 86400000).toISOString();
  const logsRes = await supabase.from('activity_logs')
    .select('id, organization_id, cycle_id, area_id, work_type_id, stage_id, performed_at, data, note, voided_at, version, created_by, author_name, author_roles')
    .eq('organization_id', a.orgId).is('voided_at', null).gte('performed_at', fromIso).lt('performed_at', toExclusive)
    .order('performed_at').limit(5000);
  if (logsRes.error) throw new Error(logsRes.error.message);
  const inRange = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10); return d >= a.from && d <= a.to; };
  const logs = ((logsRes.data ?? []) as unknown as LogRow[]).filter((l) => inRange(l.performed_at));

  const materials = new Map<string, MaterialRow>((await db.materials.where('organization_id').equals(a.orgId).toArray()).map((m) => [m.id, m]));
  const units = new Map((await db.units.toArray()).map((u) => [u.id, u.name.toLowerCase()]));
  const unitOf = (m: MaterialRow | undefined) => (m ? units.get(m.base_unit_id) ?? '' : '');

  // vật tư đã xuất cho từng nhật ký (cần quyền xem Kho; không có thì để trống và báo ở phần kiểm tra)
  const usesByLog = new Map<string, Use[]>();
  const usesAvailable = a.canViewStock;
  if (usesAvailable) {
    for (const ids of chunk(logs.map((l) => l.id), 150)) {
      const r = await supabase.from('inventory_transactions').select('activity_log_id, material_id, quantity_delta, material_lots(lot_no, expiry_date)')
        .eq('txn_type', 'issue').in('activity_log_id', ids);
      if (r.error) throw new Error(r.error.message);
      for (const t of (r.data ?? []) as unknown as { activity_log_id: string; material_id: string; quantity_delta: number; material_lots: { lot_no: string; expiry_date: string | null } | null }[]) {
        const m = materials.get(t.material_id);
        const list = usesByLog.get(t.activity_log_id) ?? [];
        list.push({ material: m, quantity: Math.abs(Number(t.quantity_delta)), unit: unitOf(m), lotNo: t.material_lots?.lot_no ?? null, expiry: t.material_lots?.expiry_date ?? null });
        usesByLog.set(t.activity_log_id, list);
      }
    }
  }

  // nhập kho trong khoảng ngày (cho sổ thức ăn)
  const receipts: ReceiptEntry[] = [];
  const rec = !usesAvailable ? { error: true, data: null } : await supabase.from('inventory_transactions').select('txn_date, material_id, quantity_delta, reason, material_lots(lot_no, expiry_date)')
    .eq('organization_id', a.orgId).eq('txn_type', 'receipt').gte('txn_date', a.from).lte('txn_date', a.to).order('txn_date').limit(2000);
  if (!('error' in rec && rec.error)) {
    for (const t of (rec.data ?? []) as unknown as { txn_date: string; material_id: string; quantity_delta: number; reason: string | null; material_lots: { lot_no: string; expiry_date: string | null } | null }[]) {
      const m = materials.get(t.material_id);
      receipts.push({ date: t.txn_date, material: m, quantity: Number(t.quantity_delta), unit: unitOf(m), lotNo: t.material_lots?.lot_no ?? null, expiry: t.material_lots?.expiry_date ?? null, note: t.reason });
    }
  }

  const wtById = new Map(a.workTypes.map((w) => [w.id, w]));
  const entries: LogEntry[] = logs.map((l) => ({ log: l, wt: wtById.get(l.work_type_id), uses: usesByLog.get(l.id) ?? [] }));

  const cid = a.cycle?.id;
  const [harvests, incidents, actions, countEvents, stages, milestones, areas, auditsRes] = await Promise.all([
    cid ? db.harvests.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    cid ? db.incidents.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    cid ? db.incidentActions.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    cid ? db.countEvents.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    cid ? db.stages.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    cid ? db.milestones.where('cycle_id').equals(cid).toArray() : Promise.resolve([]),
    db.areas.where('organization_id').equals(a.orgId).toArray(),
    supabase.from('checklist_audits').select('audit_date, status, voided_at').eq('organization_id', a.orgId).limit(50),
  ]);
  const area = areas.find((x) => x.id === a.cycle?.area_id);
  const inR = (iso: string) => iso.slice(0, 10) >= a.from && iso.slice(0, 10) <= a.to;
  return {
    orgName: a.orgName, cycle: a.cycle, areaName: area?.parent_id ? `${areas.find((x) => x.id === area.parent_id)?.name ?? ''} › ${area.name}` : area?.name ?? '', areaLocation: area?.location ?? null,
    productName: a.productName, productKind: a.productKind, unit: a.unit, from: a.from, to: a.to,
    entries, receipts, areas, stages, milestones, countEvents: countEvents.filter((c) => inR(c.event_date)),
    harvests: harvests.filter((h) => inR(h.harvested_at)), incidents: incidents.filter((i) => inR(i.incident_date)), actions,
    audits: auditsRes.error ? [] : ((auditsRes.data ?? []) as LogbookData['audits']), usesAvailable,
  };
}
