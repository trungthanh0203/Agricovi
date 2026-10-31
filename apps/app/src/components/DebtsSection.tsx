import { useEffect, useState } from 'react';
import { ProcurementSection } from './ProcurementSection';
import { myCooperative } from '../lib/members';
import { PayablesSection } from './PayablesSection';
import { ReceivablesSection } from './ReceivablesSection';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

/**
 * Công nợ: hai tab "Phải trả" (nợ nhà cung ứng, quyền Chi phí) và "Phải thu" (khách còn nợ, quyền Doanh thu).
 * Chỉ hiện tab người dùng có quyền xem. Thêm tab "Thu mua từ hộ" (HTX) / "Bán cho HTX" (hộ thuộc HTX) cho phiếu thu mua HTX–hộ (D149).
 */
export function DebtsSection() {
  const { active } = useOrgs();
  const canPay = canPerm(active?.perms, 'expenses');
  const canRecv = canPerm(active?.perms, 'sales');
  const [tab, setTab] = useState<'pay' | 'recv' | 'proc'>(canPay ? 'pay' : 'recv');
  // hộ chỉ thấy tab Bán cho HTX khi đang thuộc một HTX
  const [inCoop, setInCoop] = useState(false);
  useEffect(() => {
    if (!active || active.type !== 'household' || !navigator.onLine) return setInCoop(false);
    let live = true;
    myCooperative(active.id).then((r) => { if (live) setInCoop(r.length > 0); }).catch(() => undefined);
    return () => { live = false; };
  }, [active?.id, active?.type]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  const procAs: 'coop' | 'household' | null = active.type === 'cooperative' ? (canPerm(active.perms, 'coop') ? 'coop' : null) : inCoop && canRecv ? 'household' : null;
  const cur = tab === 'proc' && procAs ? 'proc' : tab === 'pay' && canPay ? 'pay' : canRecv ? 'recv' : 'pay';
  return (
    <>
      {((canPay && canRecv) || procAs) && (
        <div className="chips" role="tablist" aria-label="Loại công nợ">
          {canPay && <button role="tab" aria-selected={cur === 'pay'} className={cur === 'pay' ? 'chip active' : 'chip'} onClick={() => setTab('pay')}>Phải trả (nhà cung ứng)</button>}
          {canRecv && <button role="tab" aria-selected={cur === 'recv'} className={cur === 'recv' ? 'chip active' : 'chip'} onClick={() => setTab('recv')}>Phải thu (khách hàng)</button>}
          {procAs && <button role="tab" aria-selected={cur === 'proc'} className={cur === 'proc' ? 'chip active' : 'chip'} onClick={() => setTab('proc')}>{procAs === 'coop' ? 'Thu mua từ hộ' : 'Bán cho HTX'}</button>}
        </div>
      )}
      {cur === 'proc' && procAs ? <ProcurementSection as={procAs} /> : cur === 'pay' ? <PayablesSection /> : <ReceivablesSection />}
    </>
  );
}
