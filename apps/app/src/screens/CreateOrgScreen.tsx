import { useState, type FormEvent } from 'react';
import type { OrgType } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import { useOrgs } from '../lib/orgs';

const TYPES: { value: OrgType; label: string; hint: string }[] = [
  { value: 'household', label: 'Hộ nông dân / trang trại', hint: 'Bạn tự trồng và quản lý sản xuất của mình.' },
  { value: 'cooperative', label: 'Hợp tác xã (HTX)', hint: 'Bạn quản lý nhiều hộ thành viên.' },
];

interface Props {
  /** Màn hình đầu tiên (chưa có cơ sở nào) hay thêm cơ sở mới */
  first?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}

export function CreateOrgScreen({ first, onDone, onCancel }: Props) {
  const { createOrg } = useOrgs();
  const [type, setType] = useState<OrgType>('household');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Tên cơ sở cần ít nhất 2 ký tự.');
    if (!navigator.onLine) return setError('Tạo cơ sở cần có mạng. Hãy kết nối Internet rồi thử lại.');
    setBusy(true);
    setError(null);
    try {
      await createOrg(type, name);
      onDone?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>{first ? 'Chào mừng!' : 'Thêm cơ sở'}</h1>
      <p className="muted">
        {first ? 'Hãy tạo cơ sở đầu tiên của bạn.' : 'Một tài khoản có thể quản lý nhiều cơ sở.'} Bạn được dùng thử miễn phí.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>Loại cơ sở</legend>
          {TYPES.map((t) => (
            <label key={t.value} className={type === t.value ? 'choice selected' : 'choice'}>
              <input type="radio" name="orgtype" value={t.value} checked={type === t.value}
                onChange={() => setType(t.value)} />
              <span><strong>{t.label}</strong><small>{t.hint}</small></span>
            </label>
          ))}
        </fieldset>

        <label>
          Tên cơ sở
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Vườn dưa lưới Hai Lúa" />
        </label>

        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo cơ sở'}</button>
          {onCancel && <button type="button" className="secondary" onClick={onCancel}>Hủy</button>}
        </div>
      </form>
    </main>
  );
}
