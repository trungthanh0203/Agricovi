import { useState } from 'react';
import { referralLink } from '../lib/shareApp';
import { Collapsible } from './Collapsible';
import type { MyReferral } from '../lib/referral';

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

/** Mã giới thiệu riêng của chủ cơ sở và kết quả giới thiệu (D131) */
export function ReferralCard({ info }: { info: MyReferral }) {
  const [note, setNote] = useState('');
  const link = referralLink(info.code);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNote('Đã chép.'); } catch { setNote('Không chép được, hãy giữ vào mã để sao chép.'); }
  }
  return (
    <>
      <Collapsible title="Mã giới thiệu của bạn" summary={`${info.code} · ${info.referred} người đã giới thiệu`}>
        <p>Người quen nhập mã này khi đăng ký thì được ghi nhận là bạn giới thiệu. Khi họ trả phí, bạn được hưởng <strong>{info.pct}%</strong> số tiền họ thanh toán trong {info.months} tháng đầu (Agricovi sẽ liên hệ để chi).</p>
        <p className="referral-code"><strong>{info.code}</strong></p>
        <div className="btnrow">
          <button type="button" onClick={() => void copy(info.code)}>Chép mã</button>
          <button type="button" onClick={() => void copy(link)}>Chép liên kết</button>
        </div>
        {note && <p className="muted" role="status">{note}</p>}
        <p className="muted">Đã giới thiệu: <strong>{info.referred}</strong> · đã trả phí: <strong>{info.paying}</strong> · hoa hồng chờ chi: <strong>{vnd(info.earned_open)}</strong> · đã nhận: <strong>{vnd(info.earned_paid)}</strong></p>
        {!info.active && <p className="msg error">Mã này đang tạm khóa, liên hệ Agricovi để biết thêm.</p>}
      </Collapsible>
    </>
  );
}
