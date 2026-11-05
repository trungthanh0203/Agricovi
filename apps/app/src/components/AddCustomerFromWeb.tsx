import { useEffect, useState } from 'react';
import { CustomerForm } from './CustomersSection';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { createCustomer, listAllPartners, listCustomers, type Customer, type CustomerInput } from '../lib/partners';
import { PROVINCES } from '../lib/vnAddress';

/** Số điện thoại chỉ giữ chữ số, 84 đầu đổi thành 0, để so khớp khách trùng */
const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '').replace(/^84/, '0');

export interface WebCustomerPrefill { name: string; phone?: string | null; province?: string | null; ward?: string | null; address?: string | null; note?: string }

/**
 * Nút "Thêm vào khách hàng" cho đơn / yêu cầu từ website: mở đúng form Thêm khách hàng đã điền sẵn thông tin của người mua,
 * người dùng bổ sung rồi Lưu. Đã có khách cùng số điện thoại thì hiện "Đã là khách hàng" (không tạo trùng).
 */
export function AddCustomerFromWeb({ orgId, prefill, canEdit, onDone }: { orgId: string; prefill: WebCustomerPrefill; canEdit: boolean; onDone?: (msg: string) => void }) {
  const online = useOnline();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [names, setNames] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!navigator.onLine) return;
    try {
      const [c, a] = await Promise.all([listCustomers(orgId), listAllPartners(orgId).catch(() => [])]);
      setCustomers(c); setNames(new Set(a.map((p) => p.name.trim().toLowerCase())));
    } catch (e) { setError(friendlyError(e)); }
  }
  useEffect(() => { void load(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ph = digits(prefill.phone);
  const existing = ph ? customers?.find((c) => digits(c.phone) === ph) : undefined;
  if (existing) return <span className="pill ok">✔ Đã là khách hàng: {existing.name}</span>;
  if (!canEdit || customers === null) return error ? <p className="msg error" role="alert">{error}</p> : null;

  // tên đã có trong danh bạ (nhà cung ứng hoặc khách khác) thì thêm hậu tố để không trùng
  const name = names.has(prefill.name.trim().toLowerCase()) ? `${prefill.name.trim()} (từ website)` : prefill.name.trim();
  const initial = {
    name, phone: prefill.phone ?? '', address: prefill.address ?? '', ward: prefill.ward ?? '', province: prefill.province ?? '',
    note: prefill.note ?? '',
  } as unknown as Customer;

  if (!open) return <><button className="secondary" disabled={!online} onClick={() => setOpen(true)}>Thêm vào khách hàng</button>{error && <p className="msg error" role="alert">{error}</p>}</>;
  return (
    <CustomerForm title="Thêm vào khách hàng" initial={initial} busy={busy || !online} onClose={() => setOpen(false)}
      onSave={async (f: CustomerInput) => {
        setBusy(true); setError(null);
        try { await createCustomer(orgId, f); setOpen(false); await load(); onDone?.('Đã thêm vào khách hàng (Khai báo → Khách hàng).'); }
        catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
      }} />
  );
}

/** Tỉnh trên website có thể viết khác danh sách chuẩn: nếu khớp thì dùng đúng chữ chuẩn, không thì giữ nguyên */
export const matchProvince = (p?: string | null): string => {
  const t = (p ?? '').trim();
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/^(tp\.?|thanh pho|tinh)\s*/, '').trim();
  return PROVINCES.find((x) => fold(x) === fold(t)) ?? t;
};
