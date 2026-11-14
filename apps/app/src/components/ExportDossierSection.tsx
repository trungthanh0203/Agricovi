import { useEffect, useMemo, useState } from 'react';
import { CycleSelect } from './CycleSelect';
import { Collapsible } from './Collapsible';
import { fetchAreaGeos, type AreaGeo } from '../lib/areaGeo';
import { useCatalog } from '../lib/catalog';
import { cycleCountUnit } from '../lib/countUnit';
import { areaName, areaPath } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';
import { buildDossier, dossierCsv, type DossierGeo } from '../lib/exportDossier';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { listLicenses, type LicenseRow } from '../lib/licenses';
import { loadLogbookData } from '../lib/logbook/fetch';
import type { LogbookData } from '../lib/logbook/types';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Hồ sơ xuất khẩu (mục 10, tính năng nâng cao, mặc định tắt): gom dữ liệu ĐÃ GHI của một vụ thành bộ hồ sơ nguồn gốc theo mẫu chung —
 * thông tin cơ sở, sản phẩm, thửa và tọa độ, giấy phép, thu hoạch và mã lô, vật tư đã dùng, nhật ký — để in A4/lưu PDF, tải Excel (CSV) và ranh thửa (GeoJSON).
 * Không bắt nhập lại. Đây là bộ dữ liệu tham khảo gửi bên mua; mẫu riêng của bên mua hoặc nước nhập khẩu luôn được ưu tiên.
 */
export function ExportDossierSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes, workTypes } = useCatalog();
  const mine = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id && c.status !== 'cancelled').sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '')), [cycles, active]);
  const [cycleId, setCycleId] = useState('');
  const cycle = mine.find((c) => c.id === cycleId) ?? mine[0] ?? null;
  const crop = cropTypes.find((t) => t.id === cycle?.crop_type_id);
  const today = todayLocal();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const effFrom = from || cycle?.start_date || today.slice(0, 4) + '-01-01';
  const [data, setData] = useState<LogbookData | null>(null);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [geos, setGeos] = useState<AreaGeo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declare, setDeclare] = useState(true);

  useEffect(() => {
    if (!active || !cycle || !online) return;
    let live = true;
    setLoading(true); setError(null);
    Promise.all([
      loadLogbookData({
        orgId: active.id, orgName: active.name, cycle, from: effFrom, to, workTypes, canViewStock: canPerm(active.perms, 'inventory', 'view'),
        productName: crop?.name ?? '', productKind: crop?.kind, unit: cycleCountUnit(cycle, cropTypes),
      }),
      listLicenses(active.id).catch(() => [] as LicenseRow[]),
      fetchAreaGeos(active.id).catch(() => [] as AreaGeo[]), // chưa bật/chưa có bản đồ thửa thì không có ranh
    ]).then(([d, l, g]) => { if (live) { setData(d); setLicenses(l); setGeos(g); } })
      .catch((e) => { if (live) setError(friendlyError(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, cycle?.id, effFrom, to, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const geo: DossierGeo | null = useMemo(() => {
    if (!cycle) return null;
    // ranh của khu chứa vụ; nếu chưa có thì lấy của phân khu cha
    const own = geos.find((g) => g.area_id === cycle.area_id) ?? geos.find((g) => g.area_id === areas.find((a) => a.id === cycle.area_id)?.parent_id);
    return own ? { ring: own.ring, area_m2: own.area_m2, center_lat: own.center_lat, center_lng: own.center_lng, source: own.source, areaName: areaPath(own.area_id, areas) || areaName(own.area_id, areas) } : null;
  }, [geos, cycle, areas]);
  const dossier = useMemo(() => (data ? buildDossier({ data, licenses, geo, today }) : null), [data, licenses, geo, today]);

  if (!active) return null;
  if (mine.length === 0) return <p className="muted">Chưa có vụ nào. Hãy tạo vụ ở màn Sản xuất trước.</p>;
  if (!canPerm(active.perms, 'declare')) return <p className="muted">Bạn chưa có quyền xem mục này.</p>;
  const fileBase = `ho-so-xuat-khau-${(cycle?.code ?? 'vu').replace(/[^\w-]+/g, '_')}-${to}`;
  const warns = dossier?.gaps.filter((g) => g.level === 'warn') ?? [];

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: hồ sơ cần có mạng để dựng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="no-print">
        <p className="muted">Gom dữ liệu đã ghi của một vụ thành bộ hồ sơ nguồn gốc để gửi bên mua. Không phải nhập lại. Nếu bên mua có mẫu riêng, hãy dùng bảng Excel tải về để điền theo mẫu đó.</p>
        <CycleSelect label="Vụ" cycles={mine} value={cycle?.id ?? ''} onChange={(v) => { setCycleId(v); setData(null); }} showStatus={false}
          labelOf={(id) => { const c = mine.find((x) => x.id === id); return c ? `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')}${c.code ? ` (${c.code})` : ''} · ${areaName(c.area_id, areas)}` : ''; }} />
        <div className="pair">
          <label>Từ ngày<input type="date" value={effFrom} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {dossier && (
          <Collapsible title="Còn thiếu gì trước khi gửi" summary={dossier.gaps.length === 0 ? 'đủ' : `${warns.length} cần bổ sung · ${dossier.gaps.length - warns.length} nhắc thêm`} warn={warns.length > 0}>
            {dossier.gaps.length === 0 && <p className="msg ok">Chưa phát hiện thiếu sót nào trong dữ liệu đã ghi.</p>}
            {dossier.gaps.map((g, i) => <p key={i} className={g.level === 'warn' ? 'msg warn' : 'muted'}>{g.level === 'warn' ? '⚠ ' : '• '}{g.text}</p>)}
            <p className="muted">Chỉ là nhắc, không chặn việc in hay tải. Tọa độ theo EUDR: thửa trên 4 ha cần ranh đa giác; thửa nhỏ hơn có thể dùng một điểm tọa độ.</p>
          </Collapsible>
        )}
        <label className="check"><input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} /> In kèm bản cam kết nguồn gốc (để chủ cơ sở tích và ký)</label>
        <div className="btnrow">
          <button className="primary" disabled={!dossier} onClick={() => window.print()}>In / Lưu PDF (A4 dọc)</button>
          <button className="secondary" disabled={!dossier} onClick={() => dossier && save(new Blob([dossierCsv(dossier)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`)}>Tải bảng Excel</button>
          <button className="secondary" disabled={!dossier?.geoJson} title={dossier?.geoJson ? '' : 'Chưa có ranh thửa'} onClick={() => dossier?.geoJson && save(new Blob([JSON.stringify({ type: 'FeatureCollection', features: [dossier.geoJson] }, null, 2)], { type: 'application/geo+json' }), `${fileBase}.geojson`)}>Tải ranh thửa (GeoJSON)</button>
        </div>
        {loading && <p className="muted">Đang dựng hồ sơ…</p>}
      </div>

      {dossier && (
        <div id="print-root" className="dossier">
          <h2>{dossier.title}</h2>
          <p className="muted">Lập ngày {new Date().toLocaleDateString('vi-VN')} từ phần mềm AgriConnect. Số liệu lấy từ nhật ký đã ghi trong hệ thống.</p>
          {dossier.facts.map((f) => (
            <div key={f.title}>
              <h3>{f.title}</h3>
              <table className="grid"><tbody>{f.items.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
            </div>
          ))}
          {dossier.tables.map((t) => (
            <div key={t.id}>
              <h3>{t.title}</h3>
              <div className="logbook-scroll">
                <table className="grid">
                  <thead><tr>{t.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {t.rows.length === 0 && <tr><td colSpan={t.headers.length} className="muted">Chưa có.</td></tr>}
                    {t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {declare && (
            <div className="dossier-declare">
              <h3>9. Cam kết của chủ cơ sở (mẫu tham khảo)</h3>
              <p>☐ Các thông tin trên là đúng sự thật và lấy từ ghi chép sản xuất thực tế của cơ sở.</p>
              <p>☐ Thửa đất nêu trên không có nguồn gốc từ đất rừng bị chuyển đổi sau ngày 31/12/2020.</p>
              <p>☐ Sản phẩm được sản xuất đúng pháp luật về đất đai, lao động và bảo vệ môi trường tại nơi sản xuất.</p>
              <p className="muted">Đây là mẫu tham khảo, không thay thế tờ khai theo yêu cầu của bên mua hoặc nước nhập khẩu.</p>
              <div className="logbook-sign"><span>Ngày … tháng … năm …</span><span>Chủ cơ sở ký, ghi rõ họ tên</span></div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
