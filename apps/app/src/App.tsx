import { useCallback, useEffect, useState } from 'react';
import { SYNC_STATE_LABEL_VI, type SyncState } from '@agriconnect/shared';
import { AuthProvider, useAuth } from './lib/auth';
import { countByState, flushOutbox } from './lib/outbox';
import { OrgProvider, useOrgs } from './lib/orgs';
import { supabase } from './lib/supabase';
import { AuthScreen } from './screens/AuthScreen';
import { CreateOrgScreen } from './screens/CreateOrgScreen';
import { OrgTab } from './screens/OrgTab';
import { CreateCycleScreen } from './screens/CreateCycleScreen';
import { HomeTab } from './screens/HomeTab';
import { LogActivityScreen } from './screens/LogActivityScreen';
import { LogsScreen } from './screens/LogsScreen';
import { InventoryTab } from './screens/InventoryTab';
import { ProductionTab } from './screens/ProductionTab';
import { syncDown } from './lib/production';
import { UpdateBanner } from './components/UpdateBanner';
import { SetupNotice } from './screens/SetupNotice';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ForcePasswordScreen } from './screens/ForcePasswordScreen';
import { fetchStaffStatus, type StaffStatus } from './lib/staff';

type Tab = 'home' | 'production' | 'inventory' | 'org';

// Bốn mục điều hướng chính theo v1.1 mục 3.2. Không thêm mục mới nếu chưa được duyệt.
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'home', label: 'Trang chủ', title: 'Việc hôm nay' },
  { id: 'production', label: 'Sản xuất', title: 'Khu trồng, vụ, nhật ký, chấm công' },
  { id: 'inventory', label: 'Vật tư & chi phí', title: 'Kho, chi phí, thu hoạch' },
  { id: 'org', label: 'Cơ sở của tôi', title: 'Thành viên, hồ sơ, gói dịch vụ' },
];

export function App() {
  if (!supabase) return <SetupNotice />;
  return (
    <AuthProvider>
      <OrgProvider>
        <Gate />
      </OrgProvider>
    </AuthProvider>
  );
}

/** Cổng vào: chưa đăng nhập -> đăng nhập; chưa có cơ sở -> tạo cơ sở; còn lại -> app. */
function Gate() {
  const { session, loading, recovering } = useAuth();
  const { orgs, loading: orgsLoading, refresh } = useOrgs();
  const uid = session?.user.id ?? null;
  // undefined = đang tải; null = không phải tài khoản nhân viên
  const [staff, setStaff] = useState<StaffStatus | null | undefined>(undefined);

  const loadStaff = useCallback(async () => {
    if (!uid) return setStaff(undefined);
    setStaff(await fetchStaffStatus(uid));
  }, [uid]);
  useEffect(() => { void loadStaff(); }, [loadStaff]);

  if (loading) return <p className="center muted">Đang tải…</p>;
  if (!session || recovering) return <AuthScreen />;
  if (staff === undefined) return <p className="center muted">Đang tải…</p>;
  // Nhân viên chưa đổi mật khẩu tạm: bắt buộc đổi trước khi vào (máy chủ cũng chặn dữ liệu tới lúc đó)
  if (staff?.must_change) {
    return <ForcePasswordScreen status={staff} onDone={() => { void loadStaff(); void refresh(); }} />;
  }
  if (orgsLoading && orgs.length === 0) return <p className="center muted">Đang tải cơ sở…</p>;
  if (orgs.length === 0) return <WelcomeScreen isStaff={Boolean(staff?.is_staff)} />;
  return <Shell />;
}
function Shell() {
  const { orgs, active, setActive } = useOrgs();
  const [tab, setTab] = useState<Tab>('home');
  const [adding, setAdding] = useState(false);
  const [overlay, setOverlay] = useState<null | 'log' | 'cycle' | 'logs'>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [counts, setCounts] = useState<Record<SyncState, number> | null>(null);

  const refresh = useCallback(async () => setCounts(await countByState()), []);

  useEffect(() => {
    const sync = () => void syncDown().catch(() => undefined).finally(() => void refresh());
    const on = () => {
      setOnline(true);
      sync();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    sync(); // gửi phần còn chờ rồi tải dữ liệu mới mỗi khi mở app (iOS không có đồng bộ nền)
    const timer = window.setInterval(() => void refresh(), 3000); // cập nhật số bản ghi chờ gửi
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  if (overlay === 'logs') return <LogsScreen onClose={() => setOverlay(null)} />;
  if (overlay === 'log') return <LogActivityScreen onClose={() => setOverlay(null)} />;
  if (overlay === 'cycle') return <CreateCycleScreen onDone={() => { setOverlay(null); setTab('production'); }} onCancel={() => setOverlay(null)} />;
  if (adding) {
    return <CreateOrgScreen onDone={() => { setAdding(false); setTab('home'); }} onCancel={() => setAdding(false)} />;
  }

  const waiting = counts ? counts.local_only + counts.syncing : 0;
  const attention = counts?.needs_attention ?? 0;

  return (
    <div className="shell">
      <UpdateBanner />
      <header className="topbar">
        {orgs.length > 1 ? (
          <label className="switcher">
            <span className="sr-only">Chuyển cơ sở</span>
            <select value={active?.id ?? ''} onChange={(e) => setActive(e.target.value)} aria-label="Chuyển cơ sở">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <strong className="orgname">{active?.name}</strong>
        )}
        <span className={online ? 'pill ok' : 'pill warn'}>{online ? 'Có mạng' : 'Đang offline'}</span>
      </header>

      {(waiting > 0 || attention > 0) && (
        <div className="notice" role="status">
          {waiting > 0 && <div>{SYNC_STATE_LABEL_VI.local_only}: {waiting} bản ghi</div>}
          {attention > 0 && <div>{SYNC_STATE_LABEL_VI.needs_attention}: {attention} bản ghi</div>}
        </div>
      )}

      <main className="content">
        {tab === 'home' ? (
          <HomeTab onLog={() => setOverlay('log')} onHistory={() => setOverlay('logs')} goProduction={() => setTab('production')} />
        ) : tab === 'production' ? (
          <ProductionTab onLog={() => setOverlay('log')} onHistory={() => setOverlay('logs')} onCreateCycle={() => setOverlay('cycle')} />
        ) : tab === 'org' ? (
          <OrgTab onAddOrg={() => setAdding(true)} />
        ) : (
          <InventoryTab />
        )}
      </main>

      <nav className="tabs" aria-label="Điều hướng chính">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
