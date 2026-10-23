import { useState } from 'react';
import { PayablesSection } from './PayablesSection';
import { ReceivablesSection } from './ReceivablesSection';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

/**
 * Công nợ: hai tab "Phải trả" (nợ nhà cung ứng, quyền Chi phí) và "Phải thu" (khách còn nợ, quyền Doanh thu).
 * Chỉ hiện tab người dùng có quyền xem.
 */
export function DebtsSection() {
  const { active } = useOrgs();
  const canPay = canPerm(active?.perms, 'expenses');
  const canRecv = canPerm(active?.perms, 'sales');
  const [tab, setTab] = useState<'pay' | 'recv'>(canPay ? 'pay' : 'recv');
  if (!active) return null;
  const cur = tab === 'pay' && canPay ? 'pay' : canRecv ? 'recv' : 'pay';
  return (
    <>
      {canPay && canRecv && (
        <div className="chips" role="tablist" aria-label="Loại công nợ">
          <button role="tab" aria-selected={cur === 'pay'} className={cur === 'pay' ? 'chip active' : 'chip'} onClick={() => setTab('pay')}>Phải trả (nhà cung ứng)</button>
          <button role="tab" aria-selected={cur === 'recv'} className={cur === 'recv' ? 'chip active' : 'chip'} onClick={() => setTab('recv')}>Phải thu (khách hàng)</button>
        </div>
      )}
      {cur === 'pay' ? <PayablesSection /> : <ReceivablesSection />}
    </>
  );
}
