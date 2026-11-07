import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/errors';
import { fmtDate } from '../lib/dates';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { useConfig } from '../lib/config';
import { supabase } from '../lib/supabase';
import { EXPENSE_CATEGORY_LABEL, EXPENSE_KIND_LABEL } from '../lib/finance';
import { ORDER_PAYMENT_LABEL, ORDER_STATUS_LABEL } from '../lib/webSite';
import { formatMoney } from '../lib/inventory';

/**
 * Thống kê tổng hợp của chính cơ sở (cuối tab Báo cáo): các ô số liệu, bấm vào ô nào thì bảng chi tiết hiện ở dưới. Bảng sắp xếp theo cột
 * (bấm tên cột) và phân trang 30 dòng; sắp xếp và phân trang làm ở máy chủ nên mỗi lần chỉ tải đúng một trang. Mỗi mục kiểm quyền riêng ở máy chủ.
 */
const PAGE = 30;
type Cell = 'text' | 'date' | 'bool' | 'int' | 'num' | 'money' | Record<string, string>;
/** Mỗi bảng tối đa 5 cột quan trọng (màn điện thoại nhỏ); `i` là số thứ tự cột ở máy chủ, dùng để sắp xếp */
interface Col { label: string; cell: Cell; i: number }
interface Kind { id: string; tile: string; cols: Col[] }

const SUB_STATUS: Record<string, string> = { trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa' };
const AREA_KIND: Record<string, string> = { crop: 'Cây trồng', livestock: 'Vật nuôi', aquatic: 'Thủy sản', facility: 'Cơ sở vật chất', other: 'Khác', growing: 'Cây trồng' };
const WORKER_STATUS: Record<string, string> = { active: 'Đang làm', inactive: 'Đã nghỉ' };
const k = (label: string, cell: Cell, i: number): Col => ({ label, cell, i });

const KINDS: Kind[] = [
  { id: 'plans', tile: 'Gói đã mua', cols: [k('Gói', 'text', 1), k('Trạng thái', SUB_STATUS, 2), k('Đến', 'date', 4), k('Số vụ tối đa', 'int', 5), k('Giá/quý', 'money', 6)] },
  { id: 'areas', tile: 'Phân khu', cols: [k('Tên', 'text', 1), k('Loại', AREA_KIND, 2), k('Diện tích (m²)', 'int', 3), k('Số ô sản xuất', 'int', 5), k('Đang dùng', 'bool', 4)] },
  { id: 'cells', tile: 'Ô sản xuất', cols: [k('Tên', 'text', 1), k('Thuộc phân khu', 'text', 2), k('Diện tích (m²)', 'int', 4), k('Số vụ đang dùng', 'int', 6), k('Đang dùng', 'bool', 5)] },
  { id: 'warehouses', tile: 'Kho', cols: [k('Tên kho', 'text', 1), k('Đang dùng', 'bool', 2), k('Tạo ngày', 'date', 3)] },
  { id: 'materials', tile: 'Vật tư', cols: [k('Tên vật tư', 'text', 1), k('Nhóm', 'text', 2), k('Đơn vị', 'text', 3), k('Đang dùng', 'bool', 4), k('Tạo ngày', 'date', 5)] },
  { id: 'suppliers', tile: 'Nhà cung ứng', cols: [k('Tên', 'text', 1), k('Điện thoại', 'text', 2), k('Tỉnh/thành phố', 'text', 3), k('Loại hàng', 'text', 5), k('Đang dùng', 'bool', 6)] },
  { id: 'staff', tile: 'Nhân sự', cols: [k('Họ tên', 'text', 1), k('Trạng thái', WORKER_STATUS, 2), k('Có tài khoản app', 'bool', 3), k('Thêm ngày', 'date', 4)] },
  { id: 'templates', tile: 'Quy trình', cols: [k('Tên quy trình', 'text', 1), k('Sản phẩm', 'text', 2), k('Số việc', 'int', 5), k('Đang dùng', 'bool', 4), k('Tạo ngày', 'date', 6)] },
  ...(['active', 'preparing', 'paused', 'ended'] as const).map((st): Kind => ({
    id: `cycles_${st}`, tile: { active: 'Vụ đang sản xuất', preparing: 'Vụ đang chuẩn bị', paused: 'Vụ tạm dừng', ended: 'Vụ kết thúc' }[st],
    cols: [k('Vụ', 'text', 1), k('Ô sản xuất', 'text', 3), k('Bắt đầu', 'date', 4), k('Diện tích (m²)', 'int', 6), k('Số lượng', 'int', 7)],
  })),
  { id: 'expenses', tile: 'Lần chi phí', cols: [k('Ngày', 'date', 1), k('Vụ', 'text', 2), k('Nhóm chi', EXPENSE_CATEGORY_LABEL, 3), k('Loại', EXPENSE_KIND_LABEL, 4), k('Số tiền', 'money', 5)] },
  { id: 'harvests', tile: 'Lần thu hoạch', cols: [k('Ngày', 'date', 1), k('Vụ', 'text', 2), k('Phân loại', 'text', 3), k('Sản lượng', 'num', 4), k('Hao hụt', 'num', 5)] },
  { id: 'sales', tile: 'Lần doanh thu', cols: [k('Ngày', 'date', 1), k('Vụ', 'text', 2), k('Số lượng', 'num', 3), k('Số tiền', 'money', 4)] },
  { id: 'public_cycles', tile: 'Vụ trên website', cols: [k('Mã', 'text', 1), k('Vụ', 'text', 2), k('Đang hiện', 'bool', 3), k('Công khai ngày', 'date', 4)] },
  { id: 'web_orders', tile: 'Đơn từ web', cols: [k('Mã đơn', 'text', 1), k('Trạng thái', ORDER_STATUS_LABEL as unknown as Record<string, string>, 2), k('Thanh toán', ORDER_PAYMENT_LABEL as unknown as Record<string, string>, 3), k('Đặt ngày', 'date', 4), k('Giá trị', 'money', 5)] },
];

type Summary = Record<string, unknown> & { plans?: { count: number; current: string | null; status: string; period_end: string | null } | null };
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function show(v: unknown, cell: Cell): ReactNode {
  if (v === null || v === undefined || v === '') return '—';
  if (cell === 'date') return fmtDate(String(v));
  if (cell === 'bool') return v ? 'Có' : 'Không';
  if (cell === 'money') return formatMoney(Number(v));
  if (cell === 'int') return Math.round(Number(v)).toLocaleString('vi-VN');
  if (cell === 'num') return Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  if (typeof cell === 'object') return cell[String(v)] ?? String(v);
  return String(v);
}

export function OrgStatsSection() {
  const { active } = useOrgs();
  const cfg = useConfig();
  const online = useOnline();
  const orgId = active?.id;
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('plans');
  const [sort, setSort] = useState(1);
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: unknown[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !online || !supabase) return;
    let alive = true;
    supabase.rpc('org_stats_summary', { p_org: orgId }).then(({ data: d, error: e }) => {
      if (!alive) return;
      if (e) return setError(friendlyError(e));
      setSum(d as Summary); setError(null);
    });
    return () => { alive = false; };
  }, [orgId, online]);

  const tiles = KINDS.filter((k) => (k.id === 'plans' ? Boolean(sum?.plans) : num(sum?.[k.id]) !== null));
  useEffect(() => { if (sum && tiles.length > 0 && !tiles.some((t) => t.id === kind)) setKind(tiles[0]!.id); }, [sum]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = KINDS.find((k) => k.id === kind)!;
  const load = useCallback(async () => {
    if (!orgId || !online || !supabase || !sum) return;
    setLoading(true);
    const { data: d, error: e } = await supabase.rpc('org_stats_items', { p_org: orgId, p_kind: kind, p_sort: sort, p_desc: desc, p_limit: PAGE, p_offset: page * PAGE });
    setLoading(false);
    if (e) { setError(friendlyError(e)); setData(null); return; }
    setError(null); setData(d as { total: number; rows: unknown[][] });
  }, [orgId, online, sum, kind, sort, desc, page]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const tileValue = (id: string): ReactNode => (id === 'plans' ? (sum?.plans ? sum.plans.count : '…') : sum ? (num(sum[id]) ?? '…') : '…');
  const cellText = (v: unknown, c: Cell, colLabel: string): ReactNode => (kind === 'materials' && colLabel === 'Nhóm' ? (v ? cfg.materialGroupLabel(String(v)) || String(v) : '—') : show(v, c));

  function clickCol(i: number) {
    if (sort === i) setDesc((d) => !d); else { setSort(i); setDesc(false); }
    setPage(0);
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Cần có mạng để xem thống kê.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p className="muted">{active.name}: bấm vào một ô để xem chi tiết ở bảng bên dưới; bấm tên cột để sắp xếp.</p>
      <div className="statgrid">
        {tiles.map((t) => (
          <button key={t.id} type="button" className={kind === t.id ? 'stattile on' : 'stattile'} aria-pressed={kind === t.id}
            onClick={() => { setKind(t.id); setSort(1); setDesc(false); setPage(0); setData(null); }}>
            <span>{t.tile}:</span> <strong>{tileValue(t.id)}</strong>
          </button>
        ))}
      </div>

      <div className="card">
        <h2>{def.tile}{data ? ` (${total.toLocaleString('vi-VN')})` : ''}</h2>
        <div className="tablewrap">
          <table className="grid sortable">
            <thead>
              <tr>
                {def.cols.map((c) => (
                  <th key={c.label} aria-sort={sort === c.i ? (desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="sorthead" onClick={() => clickCol(c.i)}>{c.label}<i aria-hidden="true">{sort === c.i ? (desc ? ' ▼' : ' ▲') : ''}</i></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={def.cols.length} className="muted">{loading ? 'Đang tải…' : 'Chưa có dữ liệu.'}</td></tr>}
              {data !== null && data.rows.length === 0 && <tr><td colSpan={def.cols.length} className="muted">Chưa có.</td></tr>}
              {(data?.rows ?? []).map((r, ri) => (
                <tr key={ri}>{def.cols.map((c) => <td key={c.label}>{cellText(r[c.i - 1], c.cell, c.label)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && total > PAGE && (
          <div className="btnrow pager">
            <button type="button" className="secondary" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>‹ Trước</button>
            <span className="muted">Trang {page + 1}/{pages} · {total.toLocaleString('vi-VN')} dòng</span>
            <button type="button" className="secondary" disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}>Sau ›</button>
          </div>
        )}
      </div>
    </>
  );
}
