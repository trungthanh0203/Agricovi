import { useCallback, useEffect, useState } from 'react';
import { SYNC_STATE_LABEL_VI, type SyncState } from '@agriconnect/shared';
import { AuthProvider, useAuth } from './lib/auth';
import { useMyName } from './lib/profile';
import { ADMIN_URL, useIsPlatformAdmin } from './lib/platformAdmin';
import { purgeCachesIfUserChanged } from './lib/localData';
import { countByState, flushOutbox } from './lib/outbox';
import { OrgProvider, useOrgs } from './lib/orgs';
import { supabase } from './lib/supabase';
import { TAB_LABEL, visibleTabs, type TabId } from './lib/tabs';
import { AuthScreen } from './screens/AuthScreen';
import { CreateOrgScreen } from './screens/CreateOrgScreen';
import { CreateCycleScreen } from './screens/CreateCycleScreen';
import { CycleDetailScreen, type LogPreset } from './screens/CycleDetailScreen';
import { DeclareTab } from './screens/DeclareTab';
import { HomeTab } from './screens/HomeTab';
import { LogActivityScreen } from './screens/LogActivityScreen';
import { OrgTab } from './screens/OrgTab';
import { ProductionTab } from './screens/ProductionTab';
import { ProfileTab } from './screens/ProfileTab';
import { ReportsTab } from './screens/ReportsTab';
import { syncDown } from './lib/production';
import { SetupNotice } from './screens/SetupNotice';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ForcePasswordScreen } from './screens/ForcePasswordScreen';
import { fetchStaffStatus, type StaffStatus } from './lib/staff';

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

  // Tài khoản khác đăng nhập trên thiết bị này: bỏ bản lưu offline của người trước
  useEffect(() => { if (uid) void purgeCachesIfUserChanged(uid); }, [uid]);

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
  const { session: me, signOut } = useAuth();
  const myName = useMyName(me?.user.id, me?.user.email ?? undefined);
  const isPlatformAdmin = useIsPlatformAdmin(me?.user.id);
  const [tabState, setTab] = useState<TabId>('home');
  // mục con đang chọn của từng tab (nhớ khi chuyển qua lại)
  const [subs, setSubs] = useState<Partial<Record<TabId, string>>>({});
  const [adding, setAdding] = useState(false);
  const [overlay, setOverlay] = useState<null | 'log' | 'cycle' | 'logs' | 'detail'>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [qrFirst, setQrFirst] = useState(false); // vừa tạo vụ: mở sẵn mã QR
  const [logPreset, setLogPreset] = useState<LogPreset | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [counts, setCounts] = useState<Record<SyncState, number> | null>(null);

  const refresh = useCallback(async () => setCounts(await countByState()), []);

  // Tab Khai báo, Tổ chức, Báo cáo chỉ hiện với người có quyền (xem lib/tabs.ts)
  const tabs = visibleTabs(active);
  const tab: TabId = tabs.includes(tabState) ? tabState : 'home';
  const setSub = (t: TabId) => (s: string) => setSubs((cur) => ({ ...cur, [t]: s }));
  const goTo = useCallback((t: TabId, section?: string) => {
    setTab(t);
    if (section) setSubs((cur) => ({ ...cur, [t]: section }));
  }, []);

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

  if (overlay === 'detail' && detailId) {
    return <CycleDetailScreen cycleId={detailId} openQr={qrFirst} onClose={() => { setQrFirst(false); setOverlay(null); }} onLog={(p) => { setLogPreset(p); setOverlay('log'); }} />;
  }
  if (overlay === 'log') {
    return <LogActivityScreen preset={logPreset} onClose={() => { setOverlay(logPreset && detailId ? 'detail' : null); setLogPreset(null); }} />;
  }
  if (overlay === 'cycle') return <CreateCycleScreen onDone={(id) => { setDetailId(id); setQrFirst(true); setOverlay('detail'); setTab('production'); }} onCancel={() => setOverlay(null)} />;
  if (adding) {
    return <CreateOrgScreen onDone={() => { setAdding(false); setTab('home'); }} onCancel={() => setAdding(false)} />;
  }

  const waiting = counts ? counts.local_only + counts.syncing : 0;
  const attention = counts?.needs_attention ?? 0;

  return (
    <div className="shell">
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
        <div className="who">
          <span className="who-name" title={myName}>{myName}</span>
          <button className="who-out" onClick={() => void signOut()} aria-label="Đăng xuất">Đăng xuất</button>
          <span className={online ? 'net ok' : 'net off'} role="img" aria-label={online ? 'Có mạng' : 'Đang offline (mất mạng)'} title={online ? 'Có mạng' : 'Đang offline (mất mạng)'}>{online ? '🟢' : '🔴'}</span>
        </div>
      </header>

      {(waiting > 0 || attention > 0) && (
        <div className="notice" role="status">
          {waiting > 0 && <div>{SYNC_STATE_LABEL_VI.local_only}: {waiting} bản ghi</div>}
          {attention > 0 && <div>{SYNC_STATE_LABEL_VI.needs_attention}: {attention} bản ghi</div>}
        </div>
      )}

      <main className="content">
        {tab === 'home' ? (
          <HomeTab onLog={() => { setLogPreset(null); setOverlay('log'); }} onHistory={() => goTo('production', 'logs')} onGo={goTo} />
        ) : tab === 'production' ? (
          <ProductionTab
            section={subs.production}
            onSection={setSub('production')}
            onLog={() => { setLogPreset(null); setOverlay('log'); }}
            onHistory={() => goTo('production', 'logs')}
            onCreateCycle={() => setOverlay('cycle')}
            onOpenCycle={(id) => { setDetailId(id); setQrFirst(false); setOverlay('detail'); }}
            onGo={goTo}
          />
        ) : tab === 'declare' ? (
          <DeclareTab section={subs.declare} onSection={setSub('declare')} />
        ) : tab === 'org' ? (
          <OrgTab section={subs.org} onSection={setSub('org')} />
        ) : tab === 'reports' ? (
          <ReportsTab section={subs.reports} onSection={setSub('reports')} />
        ) : (
          <ProfileTab onAddOrg={() => setAdding(true)} />
        )}
        {isPlatformAdmin && (
          <a className="adminlock" href={ADMIN_URL} aria-label="Quản trị nền tảng" title="Quản trị nền tảng">🔒</a>
        )}
      </main>

      <nav className={tabs.length >= 6 ? 'tabs dense' : 'tabs'} aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (
          <button
            key={t}
            className={t === tab ? 'tab active' : 'tab'}
            aria-current={t === tab ? 'page' : undefined}
            onClick={() => { setTab(t); setSubs((cur) => ({ ...cur, [t]: '' })); }} // chạm tab = về menu của tab
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}
