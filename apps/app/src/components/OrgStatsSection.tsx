import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/errors';
import { fmtDate } from '../lib/dates';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { useConfig } from '../lib/config';
import { supabase } from '../lib/supabase';
import { EXPENSE_CATEGORY_LABEL, EXPENSE_KIND_LABEL } from '../lib/finance';
import { MODE_LABEL } from '../lib/herd';
import { ORDER_PAYMENT_LABEL, ORDER_STATUS_LABEL } from '../lib/webSite';
import { formatMoney } from '../lib/inventory';

/**
 * Thống kê tổng hợp của chính cơ sở (cuối tab Báo cáo): các ô số liệu, bấm vào ô nào thì bảng chi tiết hiện ở dưới. Bảng sắp xếp theo cột
 * (bấm tên cột) và phân trang 30 dòng; sắp xếp và phân trang làm ở máy chủ nên mỗi lần chỉ tải đúng một trang. Mỗi mục kiểm quyền riêng ở máy chủ.
 */
const PAGE = 30;
type Cell = 'text' | 'date' | 'bool' | 'int' | 'num' | 'money' | Record<string, string>;
interface Col { label: string; cell: Cell }
interface Kind { id: string; tile: string; cols: Col[]; note?: string }

const SUB_STATUS: Record<string, string> = { trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa' };
const AREA_KIND: Record<string, string> = { crop: 'Cây trồng', livestock: 'Vật nuôi', aquatic: 'Thủy sản', facility: 'Cơ sở vật chất', other: 'Khác', growing: 'Cây trồng' };
const WORKER_STATUS: Record<string, string> = { active: 'Đang làm', inactive: 'Đã nghỉ' };

const KINDS: Kind[] = [
  { id: 'plans', tile: 'Gói đã mua', cols: [{ label: 'Gói', cell: 'text' }, { label: 'Trạng thái', cell: SUB_STATUS }, { label: 'Từ', cell: 'date' }, { label: 'Đến', cell: 'date' }, { label: 'Số vụ tối đa', cell: 'int' }, { label: 'Giá/quý', cell: 'money' }] },
  { id: 'areas', tile: 'Phân khu', cols: [{ label: 'Tên', cell: 'text' }, { label: 'Loại', cell: AREA_KIND }, { label: 'Diện tích (m²)', cell: 'int' }, { label: 'Đang dùng', cell: 'bool' }, { label: 'Số ô sản xuất', cell: 'int' }, { label: 'Tạo ngày', cell: 'date' }] },
  { id: 'cells', tile: 'Ô sản xuất', cols: [{ label: 'Tên', cell: 'text' }, { label: 'Thuộc phân khu', cell: 'text' }, { label: 'Loại', cell: AREA_KIND }, { label: 'Diện tích (m²)', cell: 'int' }, { label: 'Đang dùng', cell: 'bool' }, { label: 'Số vụ đang dùng', cell: 'int' }] },
  { id: 'warehouses', tile: 'Kho', cols: [{ label: 'Tên kho', cell: 'text' }, { label: 'Đang dùng', cell: 'bool' }, { label: 'Tạo ngày', cell: 'date' }] },
  { id: 'materials', tile: 'Vật tư', cols: [{ label: 'Tên vật tư', cell: 'text' }, { label: 'Nhóm', cell: 'text' }, { label: 'Đơn vị', cell: 'text' }, { label: 'Đang dùng', cell: 'bool' }, { label: 'Tạo ngày', cell: 'date' }] },
  { id: 'suppliers', tile: 'Nhà cung ứng', cols: [{ label: 'Tên', cell: 'text' }, { label: 'Điện thoại', cell: 'text' }, { label: 'Tỉnh/thành phố', cell: 'text' }, { label: 'Xã/phường', cell: 'text' }, { label: 'Loại hàng', cell: 'text' }, { label: 'Đang dùng', cell: 'bool' }] },
  { id: 'staff', tile: 'Nhân sự', cols: [{ label: 'Họ tên', cell: 'text' }, { label: 'Trạng thái', cell: WORKER_STATUS }, { label: 'Có tài khoản app', cell: 'bool' }, { label: 'Thêm ngày', cell: 'date' }] },
  { id: 'templates', tile: 'Quy trình', cols: [{ label: 'Tên quy trình', cell: 'text' }, { label: 'Sản phẩm', cell: 'text' }, { label: 'Phiên bản', cell: 'int' }, { label: 'Đang dùng', cell: 'bool' }, { label: 'Số việc', cell: 'int' }, { label: 'Tạo ngày', cell: 'date' }] },
  ...(['active', 'preparing', 'paused', 'ended'] as const).map((st): Kind => ({
    id: `cycles_${st}`, tile: { active: 'Vụ đang sản xuất', preparing: 'Vụ đang chuẩn bị', paused: 'Vụ tạm dừng', ended: 'Vụ kết thúc' }[st],
    cols: [{ label: 'Vụ', cell: 'text' }, { label: 'Sản phẩm', cell: 'text' }, { label: 'Ô sản xuất', cell: 'text' }, { label: 'Bắt đầu', cell: 'date' }, { label: 'Dự kiến xong', cell: 'date' }, { label: 'Diện tích (m²)', cell: 'int' }, { label: 'Số lượng', cell: 'int' }, { label: 'Kiểu', cell: MODE_LABEL as unknown as Record<string, string> }],
  })),
  { id: 'expenses', tile: 'Lần chi phí', cols: [{ label: 'Ngày', cell: 'date' }, { label: 'Vụ', cell: 'text' }, { label: 'Nhóm chi', cell: EXPENSE_CATEGORY_LABEL }, { label: 'Loại', cell: EXPENSE_KIND_LABEL }, { label: 'Số tiền', cell: 'money' }, { label: 'Đã hủy', cell: 'bool' }] },
  { id: 'harvests', tile: 'Lần thu hoạch', cols: [{ label: 'Ngày', cell: 'date' }, { label: 'Vụ', cell: 'text' }, { label: 'Phân loại', cell: 'text' }, { label: 'Sản lượng', cell: 'num' }, { label: 'Hao hụt', cell: 'num' }, { label: 'Đã hủy', cell: 'bool' }] },
  { id: 'sales', tile: 'Lần doanh thu', cols: [{ label: 'Ngày', cell: 'date' }, { label: 'Vụ', cell: 'text' }, { label: 'Số lượng', cell: 'num' }, { label: 'Số tiền', cell: 'money' }, { label: 'Đã hủy', cell: 'bool' }] },
  { id: 'public_cycles', tile: 'Vụ công khai trên web', cols: [{ label: 'Mã', cell: 'text' }, { label: 'Vụ', cell: 'text' }, { label: 'Đang hiện', cell: 'bool' }, { label: 'Công khai ngày', cell: 'date' }] },
  { id: 'web_orders', tile: 'Đơn từ web', cols: [{ label: 'Mã đơn', cell: 'text' }, { label: 'Trạng thái', cell: ORDER_STATUS_LABEL as unknown as Record<string, string> }, { label: 'Thanh toán', cell: ORDER_PAYMENT_LABEL as unknown as Record<string, string> }, { label: 'Đặt ngày', cell: 'date' }, { label: 'Giá trị', cell: 'money' }] },
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
    if (sort === i + 1) setDesc((d) => !d); else { setSort(i + 1); setDesc(false); }
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
            <span>{t.tile}</span><strong>{tileValue(t.id)}</strong>
            {t.id === 'plans' && sum?.plans?.current && <small>Hiện: {sum.plans.current}{sum.plans.period_end ? ` · hạn ${fmtDate(sum.plans.period_end)}` : ''}</small>}
          </button>
        ))}
      </div>

      <div className="card">
        <h2>{def.tile}{data ? ` (${total.toLocaleString('vi-VN')})` : ''}</h2>
        <div className="tablewrap">
          <table className="grid sortable">
            <thead>
              <tr>
                {def.cols.map((c, i) => (
                  <th key={c.label} aria-sort={sort === i + 1 ? (desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="sorthead" onClick={() => clickCol(i)}>{c.label}<i aria-hidden="true">{sort === i + 1 ? (desc ? ' ▼' : ' ▲') : ''}</i></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={def.cols.length} className="muted">{loading ? 'Đang tải…' : 'Chưa có dữ liệu.'}</td></tr>}
              {data !== null && data.rows.length === 0 && <tr><td colSpan={def.cols.length} className="muted">Chưa có.</td></tr>}
              {(data?.rows ?? []).map((r, ri) => (
                <tr key={ri}>{def.cols.map((c, i) => <td key={c.label}>{cellText(r[i], c.cell, c.label)}</td>)}</tr>
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
