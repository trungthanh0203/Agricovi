import { db } from './lib/db';
import { useAutoScrollToForm } from './lib/autoScrollToForm';
import { Fragment, Suspense, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyRetry } from './lib/lazyRetry';
import { SYNC_STATE_LABEL_VI, type SyncState } from '@agriconnect/shared';
import { AuthProvider, useAuth } from './lib/auth';
import { useMyName } from './lib/profile';
import { useIsPlatformAdmin } from './lib/platformAdmin';
import { purgeCachesIfUserChanged } from './lib/localData';
import { countByState, flushOutbox } from './lib/outbox';
import { OrgProvider, useOrgs } from './lib/orgs';
import { supabase } from './lib/supabase';
import { TAB_LABEL, visibleTabs, type TabId } from './lib/tabs';
import { Drawer } from './components/Drawer';
import { useTable } from './lib/tables';
import { AuthScreen } from './screens/AuthScreen';
import { CreateOrgScreen } from './screens/CreateOrgScreen';
import { ModelPicker } from './components/ModelPicker';
import type { LogPreset } from './screens/CycleDetailScreen';
import { HomeTab } from './screens/HomeTab';
import { syncDown } from './lib/production';
import { SetupNotice } from './screens/SetupNotice';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ForcePasswordScreen } from './screens/ForcePasswordScreen';
import { fetchStaffStatus, readCachedStaffStatus, type StaffStatus } from './lib/staff';
import { fetchKioskInfo, readCachedKiosk, type KioskInfo } from './lib/kiosk';
import { fetchOwnerSignup, type OwnerSignup } from './lib/phoneSignup';
import { OwnerPendingScreen } from './screens/OwnerPendingScreen';
import { KioskScreen } from './screens/KioskScreen';

// Các màn ngoài Trang chủ tải khi mở lần đầu (giảm dung lượng phải tải lúc vào app); bản dựng vẫn được lưu sẵn để dùng offline
const CreateCycleScreen = lazyRetry(() => import('./screens/CreateCycleScreen').then((m) => ({ default: m.CreateCycleScreen })));
const CycleDetailScreen = lazyRetry(() => import('./screens/CycleDetailScreen').then((m) => ({ default: m.CycleDetailScreen })));
const DeclareTab = lazyRetry(() => import('./screens/DeclareTab').then((m) => ({ default: m.DeclareTab })));
const LogActivityScreen = lazyRetry(() => import('./screens/LogActivityScreen').then((m) => ({ default: m.LogActivityScreen })));
const ConfigTab = lazyRetry(() => import('./screens/ConfigTab').then((m) => ({ default: m.ConfigTab })));
const ProductionTab = lazyRetry(() => import('./screens/ProductionTab').then((m) => ({ default: m.ProductionTab })));
const ProfileTab = lazyRetry(() => import('./screens/ProfileTab').then((m) => ({ default: m.ProfileTab })));
const GuideTab = lazyRetry(() => import('./screens/GuideTab').then((m) => ({ default: m.GuideTab })));
const ReportsTab = lazyRetry(() => import('./screens/ReportsTab').then((m) => ({ default: m.ReportsTab })));
const Loading = () => <p className="center muted">Đang tải…</p>;

const TAB_ICON: Record<TabId, string> = { home: '🏠', production: '🌱', reports: '📊', declare: '🧰', config: '⚙️', guide: '📖', profile: '👤' };

export function App() {
  useAutoScrollToForm(); // bấm Sửa/Thêm mới thì cuộn tới form
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
    // Có trạng thái đã lưu thì vào ngay, bản mới từ máy chủ cập nhật sau (máy chủ vẫn chặn dữ liệu nếu chưa đổi mật khẩu tạm)
    const cached = readCachedStaffStatus(uid);
    if (cached !== undefined) setStaff((cur) => (cur === undefined ? cached : cur));
    setStaff(await fetchStaffStatus(uid));
  }, [uid]);
  useEffect(() => { void loadStaff(); }, [loadStaff]);

  // Chủ đăng ký bằng số điện thoại đang chờ duyệt (undefined = đang tải; null = không phải kiểu đăng ký này)
  const [signup, setSignup] = useState<OwnerSignup | null | undefined>(undefined);
  const checkSignup = useCallback(() => {
    if (!uid) return;
    void fetchOwnerSignup().then((s) => { setSignup(s); if (s?.status === 'approved') void refresh(); }).catch(() => setSignup((cur) => cur ?? null));
  }, [uid, refresh]);
  useEffect(() => { if (!uid) setSignup(undefined); else checkSignup(); }, [uid, checkSignup]);

  // Điện thoại làm MÁY CHẤM CÔNG (tài khoản thiết bị) chỉ thấy màn chấm công, không có đường vào app quản lý. undefined = đang tải.
  const [kiosk, setKiosk] = useState<KioskInfo | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return setKiosk(undefined);
    setKiosk(readCachedKiosk(uid)); // tài khoản mới đăng nhập (chủ vào app quản lý từ máy chấm công): chưa biết thì chờ, không hiện lại màn máy chấm công
    let live = true;
    void fetchKioskInfo(uid).then((k) => { if (live) setKiosk(k); });
    return () => { live = false; };
  }, [uid]);

  // Tài khoản khác đăng nhập trên thiết bị này: bỏ bản lưu offline của người trước
  useEffect(() => { if (uid) void purgeCachesIfUserChanged(uid); }, [uid]);

  if (loading) return <p className="center muted">Đang tải…</p>;
  if (!session || recovering) return <AuthScreen />;
  if (staff === undefined || kiosk === undefined) return <p className="center muted">Đang tải…</p>;
  if (kiosk) return <KioskScreen info={kiosk} />;
  // Nhân viên chưa đổi mật khẩu tạm: bắt buộc đổi trước khi vào (máy chủ cũng chặn dữ liệu tới lúc đó)
  if (staff?.must_change) {
    return <ForcePasswordScreen status={staff} onDone={() => { void loadStaff(); void refresh(); }} />;
  }
  if (orgsLoading && orgs.length === 0) return <p className="center muted">Đang tải cơ sở…</p>;
  if (orgs.length === 0) {
    if (signup === undefined) return <p className="center muted">Đang tải…</p>;
    if (signup && signup.status !== 'approved') return <OwnerPendingScreen signup={signup} onCheck={checkSignup} />;
    return <WelcomeScreen isStaff={Boolean(staff?.is_staff)} />;
  }
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
  const [menuOpen, setMenuOpen] = useState(false);
  const cyclesAll = useTable('cycles');
  const [overlay, setOverlay] = useState<null | 'log' | 'cycle' | 'logs' | 'detail' | 'model'>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [qrFirst, setQrFirst] = useState(false); // vừa tạo vụ: mở sẵn mã QR
  const [detailOpts, setDetailOpts] = useState<{ calendar?: boolean; notice?: string }>({}); // vừa vào ca: mở thẳng Lịch kèm thông báo công đoạn hôm nay
  const [logPreset, setLogPreset] = useState<LogPreset | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [counts, setCounts] = useState<Record<SyncState, number> | null>(null);

  // Chỉ cập nhật khi số đếm đổi thật, tránh vẽ lại cả app mỗi 3 giây
  const refresh = useCallback(async () => {
    const next = await countByState();
    setCounts((cur) => (cur && (Object.keys(next) as SyncState[]).every((k) => cur[k] === next[k]) ? cur : next));
  }, []);

  // Tab Khai báo, Cấu hình, Báo cáo chỉ hiện với người có quyền (xem lib/tabs.ts)
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

  // Các màn Chi tiết vụ, Ghi việc, Tạo vụ hiện BÊN TRONG khung (thanh trên + thanh dưới), chạm tab nào là rời màn đó ngay
  const overlayEl =
    overlay === 'detail' && detailId ? (
      <CycleDetailScreen cycleId={detailId} openQr={qrFirst} openCalendar={detailOpts.calendar} notice={detailOpts.notice} onClose={() => { setQrFirst(false); setDetailOpts({}); setOverlay(null); }} onLog={(p) => { setLogPreset(p); setOverlay('log'); }} onGo={(t, s) => { closeOverlay(); goTo(t, s); }} />
    ) : overlay === 'log' ? (
      <LogActivityScreen preset={logPreset} onClose={() => { setOverlay(logPreset && detailId ? 'detail' : null); setLogPreset(null); }} />
    ) : overlay === 'model' && detailId ? (
      <div className="auth">
        <h1>Chọn cách quản lý vụ</h1>
        <ModelPicker cycleId={detailId} onDone={() => setOverlay('detail')} onSkip={() => setOverlay('detail')} />
      </div>
    ) : overlay === 'cycle' ? (
      <CreateCycleScreen onDone={(id) => { setDetailId(id); setQrFirst(true); setOverlay('model'); setTab('production'); }} onCancel={() => setOverlay(null)} />
    ) : null;
  const closeOverlay = () => { setOverlay(null); setLogPreset(null); setQrFirst(false); setDetailOpts({}); };

  if (adding) {
    return <CreateOrgScreen onDone={() => { setAdding(false); setTab('home'); }} onCancel={() => setAdding(false)} />;
  }

  const waiting = counts ? counts.local_only + counts.syncing : 0;
  const attention = counts?.needs_attention ?? 0;
  // Thanh dưới: Trang chủ · Khai báo · (Ghi việc) · Sản xuất · Báo cáo; Cấu hình, Tài khoản, Hướng dẫn nằm ở menu ☰ (D74)
  const mainTabs = (['home', 'declare', 'production', 'reports'] as TabId[]).filter((t) => tabs.includes(t));
  const menuTabs = (['profile', 'config', 'guide'] as TabId[]).filter((t) => tabs.includes(t)); // Tài khoản lên đầu menu ☰
  const fabAt = mainTabs.length >= 3 ? 2 : 1; // nút Ghi việc nằm giữa
  // nút Ghi việc ẩn khi mô hình của các vụ đang chạy không dùng ghi việc (mô hình 1 chưa bật tùy chọn Ghi việc)
  const canLog = cyclesAll.some((c) => c.status === 'active' && c.owner_org_id === active?.id) && (active?.features?.logs ?? 'on') !== 'off';

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Mở menu" aria-haspopup="dialog">
          <span aria-hidden>☰</span>
          {attention > 0 && <i className="menu-dot" aria-hidden />}
        </button>
        <div className="top-title">
          <strong className="orgname">{active?.name}</strong>
          <small>{tab === 'home' ? 'Trang chủ' : TAB_LABEL[tab]}</small>
        </div>
        <span className={online ? 'net ok' : 'net off'} role="img" aria-label={online ? 'Có mạng' : 'Đang offline (mất mạng)'} title={online ? 'Có mạng' : 'Đang offline (mất mạng)'}>{online ? '🟢' : '🔴'}</span>
      </header>

      {(waiting > 0 || attention > 0) && (
        <div className="notice" role="status">
          {waiting > 0 && <div>{SYNC_STATE_LABEL_VI.local_only}: {waiting} bản ghi</div>}
          {attention > 0 && <div>{SYNC_STATE_LABEL_VI.needs_attention}: {attention} bản ghi</div>}
        </div>
      )}

      <main className="content">
        <ErrorBoundary resetKey={`${tab}|${overlay ?? ''}|${subs[tab as keyof typeof subs] ?? ''}`}>
        <Suspense fallback={<Loading />}>
        {overlayEl ? overlayEl : tab === 'home' ? (
          <HomeTab onGo={goTo} onOpenCycle={(id) => { setDetailId(id); setQrFirst(false); setDetailOpts({}); setOverlay('detail'); }} />
        ) : tab === 'production' ? (
          <ProductionTab
            section={subs.production}
            onSection={setSub('production')}
            onLog={() => { setLogPreset(null); setOverlay('log'); }}
            onHistory={() => goTo('production', 'logs')}
            onClone={(logId) => { void db.logs.get(logId).then((l) => { if (!l) return; setDetailId(null); setLogPreset({ cycleId: l.cycle_id ?? '', areaId: l.cycle_id ? undefined : l.area_id ?? undefined, workTypeId: l.work_type_id, stageId: l.stage_id, copyFromLogId: l.id }); setOverlay('log'); }); }}
            onCreateCycle={() => setOverlay('cycle')}
            onOpenCycle={(id, opts) => { setDetailId(id); setQrFirst(false); setDetailOpts(opts ?? {}); setOverlay('detail'); }}
            onLogFor={(cycleId) => { if (cycleId) setDetailId(cycleId); setLogPreset(cycleId ? { cycleId } : null); setOverlay('log'); }}
            onGo={goTo}
          />
        ) : tab === 'declare' ? (
          <DeclareTab section={subs.declare} onSection={setSub('declare')} />
        ) : tab === 'config' ? (
          <ConfigTab />
        ) : tab === 'guide' ? (
          <GuideTab section={subs.guide} onSection={setSub('guide')} onGo={(t, s) => { closeOverlay(); goTo(t, s); }} />
        ) : tab === 'reports' ? (
          <ReportsTab section={subs.reports} onSection={setSub('reports')} onGo={goTo} />
        ) : (
          <ProfileTab onAddOrg={() => setAdding(true)} isPlatformAdmin={isPlatformAdmin} />
        )}
        </Suspense>
        </ErrorBoundary>
      </main>

      <nav className="bnav" aria-label="Điều hướng chính">
        {mainTabs.map((t, i) => (
          <Fragment key={t}>
            {i === fabAt && (
              <button className="fab" onClick={() => { setLogPreset(null); setOverlay('log'); }} disabled={!canLog} aria-label="Ghi việc vừa làm" title={canLog ? 'Ghi việc vừa làm' : 'Chưa có vụ đang sản xuất để ghi việc'}>
                <span aria-hidden>＋</span><small>Ghi việc</small>
              </button>
            )}
            <button
              className={t === tab ? 'btab active' : 'btab'}
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => { closeOverlay(); setTab(t); setSubs((cur) => ({ ...cur, [t]: '' })); }} // chạm tab = về menu của tab
            >
              <span className="btab-ico" aria-hidden>{TAB_ICON[t]}</span>
              {TAB_LABEL[t]}
            </button>
          </Fragment>
        ))}
        {fabAt >= mainTabs.length && (
          <button className="fab" onClick={() => { setLogPreset(null); setOverlay('log'); }} disabled={!canLog} aria-label="Ghi việc vừa làm">
            <span aria-hidden>＋</span><small>Ghi việc</small>
          </button>
        )}
      </nav>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        name={myName}
        email={me?.user.email ?? ''}
        orgs={orgs}
        active={active}
        onSwitchOrg={setActive}
        tabs={menuTabs}
        current={tab}
        onGo={(t) => { closeOverlay(); setTab(t); setSubs((cur) => ({ ...cur, [t]: '' })); }}
        isPlatformAdmin={isPlatformAdmin}
        waiting={waiting}
        onSignOut={() => void signOut()}
      />
    </div>
  );
}
