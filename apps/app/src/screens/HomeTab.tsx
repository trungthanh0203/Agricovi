import { useEffect, useState } from 'react';
import { plural } from '@lingui/core/macro';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { fmtDay, fmtLongDay, fmtTime } from '../lib/format';
import { addDays, diffDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { setNoteDone } from '../lib/production';
import { useCatalog } from '../lib/catalog';
import { ExpiringLots } from '../components/ExpiringLots';
import { AssetReminders } from '../components/AssetReminders';
import { HrReminders } from '../components/HrReminders';
import { LossAlerts } from '../components/LossAlerts';
import { HomeReminders } from '../components/MilestonePanels';
import { HomeStats } from '../components/HomeStats';
import { CycleProgressList } from '../components/CycleProgressList';
import { TodayPlan } from '../components/TodayPlan';
import { HomeLinks } from '../components/HomeLinks';
import { useMyName } from '../lib/profile';
import { WebInboxCard } from '../components/WebInboxCard';
import { SyncBadge } from '../components/SyncBadge';
import { todayLocal, useOnline, useRecordSync } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import type { TabId } from '../lib/tabs';
import { useAuth } from '../lib/auth';
import { authorLabel, canManageProduction, hasRole } from '../lib/roles';
import { retryFailed } from '../lib/outbox';
import { useTable } from '../lib/tables';
import { setIncidentActionDone } from '../lib/incidents';
import { dueActions } from '../lib/incidentsLogic';
import { areaPath, areaName } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';

export function HomeTab({ onGo, onOpenCycle }: { onGo: (tab: TabId, section?: string) => void; onOpenCycle: (id: string) => void }) {
  const { t } = useLingui();
  const { active, fetchUsage } = useOrgs();
  const sync = useRecordSync();
  const { session } = useAuth();
  const uid = session?.user.id;
  const myName = useMyName(uid, session?.user.email ?? undefined);
  const logs = useTable('logs');
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const notes = useTable('notes');
  const incidents = useTable('incidents');
  const incidentActions = useTable('incidentActions');
  const online = useOnline();
  const [noteError, setNoteError] = useState<string | null>(null);
  const { workTypes, cropTypes } = useCatalog();
  // Hạn dùng gói (chỉ chủ cơ sở xem được), hiện cạnh ngày ở đầu Trang chủ
  const [planEnd, setPlanEnd] = useState<{ text: string; expired: boolean } | null>(null);
  const planOrg = active && hasRole(active.roles, 'owner') ? active.id : null;
  useEffect(() => {
    if (!planOrg || !navigator.onLine) { setPlanEnd(null); return; }
    let live = true;
    fetchUsage(planOrg).then((u) => { if (live && u) setPlanEnd({ text: fmtDay(new Date(u.period_end)), expired: !u.is_current }); }).catch(() => undefined);
    return () => { live = false; };
  }, [planOrg, fetchUsage]);
  if (!active) return null;
  const canManage = canManageProduction(active.roles);

  const mine = cycles.filter(
    (c) => c.owner_org_id === active.id || areas.find((a) => a.id === c.area_id)?.organization_id === active.id,
  );
  // Chỉ vụ ĐANG SẢN XUẤT mới ghi việc được (vụ chuẩn bị hoặc tạm dừng thì chưa)
  const running = mine.filter((c) => c.status === 'active');
  const notStarted = mine.filter((c) => c.status === 'preparing' || c.status === 'paused');
  const mineIds = new Set(mine.map((c) => c.id));
  const today = new Date().toDateString();
  const todayLogs = logs
    .filter((l) => l.cycle_id && mineIds.has(l.cycle_id) && !l.voided_at && new Date(l.performed_at).toDateString() === today)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  // Nhắc việc: ghi chú chưa xong của vụ trong cơ sở, quá hạn hoặc trong 3 ngày tới
  const todayIso = todayLocal();
  const limit = addDays(todayIso, 3);
  const reminders = notes
    .filter((n) => !n.done && mineIds.has(n.cycle_id) && n.note_date <= limit)
    .sort((a, b) => a.note_date.localeCompare(b.note_date));
  // việc khắc phục sự cố (D95): người quản lý thấy mọi việc đến hạn của vụ trong cơ sở, nhân viên chỉ thấy việc được giao cho mình
  const actionReminders = dueActions(incidentActions.filter((a) => mineIds.has(a.cycle_id) && (canManage || a.assignee_id === uid)), incidents, limit);
  const dueText = (d: number) => (d < 0 ? plural(-d, { one: 'Quá hạn # ngày', other: 'Quá hạn # ngày' }) : d === 0 ? t`Hôm nay` : d === 1 ? t`Ngày mai` : plural(d, { one: 'Còn # ngày', other: 'Còn # ngày' }));
  const failed = [...sync.values()].filter((s) => s.state === 'needs_attention').length;

  return (
    <section>
      <div className="hero">
        <h1>{myName ? t`Xin chào, ${myName}` : t`Xin chào`}</h1>
        <div className="hero-top">
          <small>
            {fmtLongDay(new Date())}
            {planEnd && <span className={planEnd.expired ? 'hero-exp warn' : 'hero-exp'}> → <Trans>Hạn:</Trans> {planEnd.text}{planEnd.expired ? ` ${t`(đã hết hạn)`}` : ''}</span>}
          </small>
        </div>
      </div>

      <HomeLinks org={active} onGo={onGo} />

      <TodayPlan cycleIds={mineIds} onOpenCycle={onOpenCycle} />

      {reminders.length + actionReminders.length > 0 && (
        <div className="card">
          <h2><Trans>Ghi chú cần nhớ</Trans> ({reminders.length + actionReminders.length})</h2>
          {noteError && <p className="msg error" role="alert">{noteError}</p>}
          {actionReminders.map((a) => {
            const c = cycles.find((x) => x.id === a.cycle_id);
            const d = diffDays(todayIso, a.due_date!);
            const when = dueText(d);
            return (
              <div className="note-row" key={a.id}>
                <label className="check">
                  <input type="checkbox" checked={false} disabled={!online} aria-label={`${t`Đánh dấu xong`}: ${a.content}`}
                    onChange={() => { setNoteError(null); setIncidentActionDone(a.id, true).catch((e) => setNoteError(friendlyError(e))); }} />
                  <span>
                    <Trans>Khắc phục sự cố:</Trans> {a.content}
                    <small className="muted"> — {c ? cycleTitle(c, cropTypes.find((t) => t.id === c?.crop_type_id)?.name ?? '') : t`Vụ`} · {a.assignee_name ?? t`chưa giao ai`} · {fmtDate(a.due_date!)}</small>
                  </span>
                </label>
                <span className={d < 0 ? 'pill err' : d === 0 ? 'pill warn' : 'pill'}>{when}</span>
              </div>
            );
          })}
          {reminders.map((n) => {
            const c = cycles.find((x) => x.id === n.cycle_id);
            const d = diffDays(todayIso, n.note_date);
            const when = dueText(d);
            return (
              <div className="note-row" key={n.id}>
                <label className="check">
                  <input type="checkbox" checked={false} disabled={!online} aria-label={`${t`Đánh dấu xong`}: ${n.content}`}
                    onChange={() => { setNoteError(null); setNoteDone(n.id, true).catch((e) => setNoteError(friendlyError(e))); }} />
                  <span>
                    {n.content}
                    <small className="muted"> — {c ? cycleTitle(c, cropTypes.find((t) => t.id === c?.crop_type_id)?.name ?? '') : t`Vụ`} · {fmtDate(n.note_date)}</small>
                  </span>
                </label>
                <span className={d < 0 ? 'pill err' : d === 0 ? 'pill warn' : 'pill'}>{when}</span>
              </div>
            );
          })}
        </div>
      )}

      <WebInboxCard onGo={onGo} />

      <h2 className="sect band"><Trans>Việc đã ghi hôm nay</Trans></h2>
      {todayLogs.length === 0 && <p className="muted"><Trans>Hôm nay chưa ghi việc nào.</Trans></p>}
      {todayLogs.map((l) => {
        const c = cycles.find((x) => x.id === l.cycle_id);
        return (
          <div className="card slim" key={l.id}>
            <div className="row">
              <strong>
                {workTypes.find((w) => w.id === l.work_type_id)?.name ?? t`Việc`}
                {(authorLabel(l.author_name, l.author_roles) || (uid && l.created_by === uid)) ? ` - ${authorLabel(l.author_name, l.author_roles) || t`Bạn`}` : ''}
              </strong>
              <span className="muted">{fmtTime(new Date(l.performed_at))}</span>
            </div>
            <p className="muted">
              {c ? `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')} · ${areaName(c.area_id, areas)}` : ''}
              {l.note ? ` — ${l.note}` : ''}
            </p>
            <SyncBadge sync={sync.get(l.id)} />
          </div>
        );
      })}

      {running.length === 0 && (
        <div className="card">
          <p><Trans>Chưa có vụ nào đang sản xuất nên chưa ghi việc được.</Trans></p>
          {notStarted.length > 0 && (
            <p className="muted"><Trans>Vụ đang chuẩn bị hoặc tạm dừng chỉ ghi việc được sau khi bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở màn Sản xuất.</Trans></p>
          )}
          {canManage ? (
            mine.length === 0 && (
              <button className="primary" onClick={() => onGo(areas.every((a) => a.organization_id !== active.id) ? 'declare' : 'production', areas.every((a) => a.organization_id !== active.id) ? 'areas' : 'cycles')}>
                {areas.some((a) => a.organization_id === active.id) ? t`Tạo vụ đầu tiên` : t`Thêm phân khu đầu tiên`}
              </button>
            )
          ) : (
            <p className="muted">{mine.length === 0 ? t`Hãy nhờ chủ cơ sở hoặc quản lý tạo vụ nuôi trồng.` : t`Hãy nhờ chủ cơ sở hoặc quản lý bắt đầu sản xuất.`}</p>
          )}
        </div>
      )}

      {failed > 0 && (
        <div className="card">
          <p className="msg error" role="alert"><Plural value={failed} one="Có # bản ghi cần xử lý (chưa gửi được lên máy chủ)." other="Có # bản ghi cần xử lý (chưa gửi được lên máy chủ)." /></p>
          <button className="secondary" onClick={() => void retryFailed()}><Trans>Thử gửi lại</Trans></button>
        </div>
      )}

      <HomeReminders />
      <ExpiringLots />
      <AssetReminders onGo={onGo} />
      <HrReminders onGo={onGo} />
      <LossAlerts cycleIds={mineIds} onOpenCycle={onOpenCycle} />
      <CycleProgressList cycleIds={mineIds} onOpenCycle={onOpenCycle} />
      <HomeStats cycleIds={mineIds} onGo={onGo} />

    </section>
  );
}
