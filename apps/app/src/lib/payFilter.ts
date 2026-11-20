/**
 * Bộ lọc Bảng lương (D208): Phân khu, Nhân viên, Từ ngày, Đến ngày; kết quả chỉ hiện sau khi bấm "Tính lương". Phần thuần, có test.
 * Phân khu của một người = nơi người đó được PHÂN CÔNG (Nhân sự → phân khu làm việc của tài khoản; phân khu của tổ họ thuộc), không phải nơi họ đã chấm công.
 */
export interface AreaLite { id: string; name: string; parent_id?: string | null }
export interface WorkerInfo { id: string; name: string; userId: string | null; teamId: string | null; status?: string }
export interface TeamLite { id: string; area_id?: string | null }

/** Các phân khu của một người: 'all' = làm ở mọi phân khu (tài khoản không giới hạn), Set = các phân khu được gán (rỗng = chưa gán nơi nào) */
export function workerAreas(w: WorkerInfo, memberAreas: Record<string, string[] | null>, teamArea: Map<string, string | null>): 'all' | Set<string> {
  const set = new Set<string>();
  if (w.userId && w.userId in memberAreas) {
    const ids = memberAreas[w.userId];
    if (ids === null || ids === undefined) return 'all';
    for (const id of ids) set.add(id);
  }
  const ta = w.teamId ? teamArea.get(w.teamId) : null;
  if (ta) set.add(ta);
  return set;
}

/** Mã phân khu cùng các khu con cháu và tổ tiên của nó (chọn khu cha thì tính cả người được gán ô con, và ngược lại) */
export function areaFamily(areaId: string, areas: AreaLite[]): Set<string> {
  const fam = new Set<string>([areaId]);
  let grew = true;
  while (grew) {                                   // con cháu
    grew = false;
    for (const a of areas) if (a.parent_id && fam.has(a.parent_id) && !fam.has(a.id)) { fam.add(a.id); grew = true; }
  }
  let cur = areas.find((a) => a.id === areaId);    // tổ tiên
  for (let i = 0; i < 10 && cur?.parent_id; i++) { fam.add(cur.parent_id); cur = areas.find((a) => a.id === cur!.parent_id); }
  return fam;
}

/** Người có thuộc phân khu đã chọn không ('all' = không lọc) */
export function workerInArea(w: WorkerInfo, areaSel: string, areas: AreaLite[], memberAreas: Record<string, string[] | null>, teamArea: Map<string, string | null>): boolean {
  if (areaSel === 'all') return true;
  const mine = workerAreas(w, memberAreas, teamArea);
  if (mine === 'all') return true;
  const fam = areaFamily(areaSel, areas);
  for (const id of mine) if (fam.has(id)) return true;
  return false;
}

/** Danh sách nhân viên đang làm theo phân khu đã chọn, sắp theo tên */
export function workersForArea(workers: WorkerInfo[], areaSel: string, areas: AreaLite[], memberAreas: Record<string, string[] | null>, teamArea: Map<string, string | null>): WorkerInfo[] {
  return workers
    .filter((w) => (w.status ?? 'active') === 'active' && workerInArea(w, areaSel, areas, memberAreas, teamArea))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(utc(s).getTime() + n * 86400000));
export const spanDays = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000) + 1;
const lastOfMonth = (s: string) => iso(new Date(Date.UTC(utc(s).getUTCFullYear(), utc(s).getUTCMonth() + 1, 0)));

/** Khoảng đúng một tháng dương lịch (từ mùng 1 đến ngày cuối tháng): chỉ khi đó mới tính và chốt lương theo tháng được */
export function isFullMonth(from: string, to: string): boolean {
  return from.slice(8) === '01' && to === lastOfMonth(from);
}

/** Kỳ trước để so sánh: nếu bắt đầu từ mùng 1 thì lấy đoạn đầu tháng trước có cùng số ngày (tối đa hết tháng đó); không thì đoạn liền trước có cùng số ngày */
export function prevRangeOf(from: string, to: string): { from: string; to: string } {
  const n = spanDays(from, to);
  if (from.slice(8) === '01') {
    const d = utc(from);
    const pf = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    const pt = addDays(pf, n - 1);
    const end = lastOfMonth(pf);
    return { from: pf, to: pt > end ? end : pt };
  }
  const pt = addDays(from, -1);
  return { from: addDays(pt, -(n - 1)), to: pt };
}

export const MAX_RANGE_DAYS = 366;
/** Kiểm tra khoảng ngày người dùng chọn; trả câu báo lỗi tiếng Việt hoặc null nếu hợp lệ */
export function checkRange(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'Hãy chọn từ ngày và đến ngày.';
  if (to < from) return 'Đến ngày không được trước từ ngày.';
  if (to > today) return 'Đến ngày không được ở tương lai.';
  if (spanDays(from, to) > MAX_RANGE_DAYS) return 'Khoảng ngày tối đa 1 năm. Hãy chọn ngắn hơn.';
  return null;
}
