import { useState } from 'react';
import { WebLeadsTab } from './WebLeadsTab';
import { WebOrdersTab } from './WebOrdersTab';

/**
 * Đơn khách từ website (G2-5): hai tab "Đơn hàng" và "Khách tiềm năng". Cho chủ, quản lý, biên tập hồ sơ (cùng quy tắc của website).
 */
export function WebSiteSection() {
  const [tab, setTab] = useState<'orders' | 'leads'>('orders');
  return (
    <>
      <div className="chips" role="tablist" aria-label="Đơn khách từ website">
        <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'chip active' : 'chip'} onClick={() => setTab('orders')}>Đơn hàng</button>
        <button role="tab" aria-selected={tab === 'leads'} className={tab === 'leads' ? 'chip active' : 'chip'} onClick={() => setTab('leads')}>Khách tiềm năng</button>
      </div>
      {tab === 'orders' ? <WebOrdersTab /> : <WebLeadsTab />}
    </>
  );
}
