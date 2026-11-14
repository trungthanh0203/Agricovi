import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDossier, dossierCsv, dossierGaps } from '../../apps/app/src/lib/exportDossier.ts';

// Mục 10 báo cáo đối thủ: gói hồ sơ xuất khẩu dựng từ dữ liệu đã ghi. Phần thuần, không cần CSDL.

const mat = (o) => ({ id: o.name, organization_id: 'o', name: o.name, base_unit_id: 'u', is_active: true, category: null, reorder_threshold: null, ...o });
const wt = (code, name) => ({ id: code, code, name, field_schema: [] });
const SPRAY = wt('spraying', 'Phun thuốc');
const actara = mat({ name: 'Actara 25WG', material_group: 'pesticide', active_ingredient: 'Thiamethoxam', registration_no: '123/GCN', manufacturer: 'Syngenta', withdrawal_days: 7 });
const mystery = mat({ name: 'Thuốc lạ', material_group: 'pesticide', withdrawal_days: 5 });
const log = (id, at) => ({ id, organization_id: 'o', cycle_id: 'c1', area_id: 'a1', work_type_id: 'spraying', performed_at: at, data: {}, note: null, version: 1, author_name: 'Tám' });

const base = (over = {}) => ({
  orgName: 'Hộ A', cycle: { id: 'c1', code: 'CF-01', variety_name: 'Robusta', planted_area_m2: 10000, start_date: '2026-03-01', area_id: 'a1' },
  areaName: 'Vườn 1', areaLocation: 'Đắk Lắk', productName: 'Cà phê', productKind: 'crop', unit: 'cây', from: '2026-03-01', to: '2026-12-01',
  entries: [{ log: log('l1', '2026-06-01T01:00:00Z'), wt: SPRAY, uses: [{ material: actara, quantity: 2, unit: 'lít', lotNo: 'L1', expiry: '2027-01-01' }, { material: mystery, quantity: 1, unit: 'lít', lotNo: null, expiry: null }] }],
  receipts: [], harvests: [{ id: 'h1', organization_id: 'o', cycle_id: 'c1', harvested_at: '2026-11-20', grade: 'A', quantity: 1000, unit: 'kg', loss_quantity: 50, note: null, version: 1, lot_code: 'LOT-1' }],
  incidents: [], actions: [], countEvents: [], stages: [], milestones: [], areas: [{ id: 'a1', organization_id: 'o', name: 'Vườn 1' }], audits: [], usesAvailable: true, ...over,
});
const ring = [[12.6, 108.0], [12.6, 108.001], [12.601, 108.001], [12.601, 108.0]];
const geo = { ring, area_m2: 9800, center_lat: 12.6005, center_lng: 108.0005, source: 'mixed', areaName: 'Vườn 1' };
const lic = [{ name: 'VietGAP', issuer: 'Cục Trồng trọt', number: 'VG-1', issued_date: '2026-01-01', expires_date: '2028-01-01' }];

test('hồ sơ đủ: có thửa, tọa độ, giấy phép, thu hoạch, vật tư; sản lượng trừ hao hụt; GeoJSON khép kín', () => {
  const d = buildDossier({ data: base(), licenses: lic, geo, today: '2026-12-02' });
  const f = Object.fromEntries(d.facts.flatMap((x) => x.items));
  assert.equal(f['Sản lượng thu hoạch (sau hao hụt)'], '950 kg');
  assert.equal(f['Mã vụ / lô'], 'CF-01');
  assert.match(f['Tọa độ tâm thửa (vĩ độ, kinh độ)'], /12\.600500, 108\.000500/);
  assert.equal(f['Nguồn tọa độ'], 'GPS và chấm trên ảnh vệ tinh');
  const t = Object.fromEntries(d.tables.map((x) => [x.id, x]));
  assert.equal(t.licenses.rows.length, 1);
  assert.equal(t.coords.rows.length, 4);
  assert.equal(t.harvest.rows[0][1], 'LOT-1');
  assert.equal(t.inputs.rows.length, 2);
  assert.equal(t.inputs.rows[0][3], 'Thiamethoxam');
  assert.equal(d.geoJson.geometry.coordinates[0].length, 5);
  assert.equal(d.gaps.some((g) => g.level === 'warn' && /tọa độ/i.test(g.text)), false);
});

test('thiếu gì thì báo: chưa có tọa độ thửa, chưa có thu hoạch, chưa có giấy phép, vật tư thiếu hoạt chất; không bịa số liệu', () => {
  const d = buildDossier({ data: base({ harvests: [] }), licenses: [], geo: null, today: '2026-12-02' });
  const warns = d.gaps.filter((g) => g.level === 'warn').map((g) => g.text);
  assert.ok(warns.some((w) => /Chưa có tọa độ thửa/.test(w)));
  assert.ok(warns.some((w) => /Chưa có phiếu thu hoạch/.test(w)));
  const infos = d.gaps.filter((g) => g.level === 'info').map((g) => g.text);
  assert.ok(infos.some((w) => /giấy phép/i.test(w)));
  assert.ok(infos.some((w) => /Thuốc lạ/.test(w)) && !infos.some((w) => /hoạt chất.*Actara/.test(w)));
  assert.equal(d.geoJson, null);
  const f = Object.fromEntries(d.facts.flatMap((x) => x.items));
  assert.equal(f['Sản lượng thu hoạch (sau hao hụt)'], 'chưa ghi');
  assert.equal(f['Tọa độ thửa'], 'chưa có');
});

test('diện tích khai lệch hơn 20% so với ranh thì nhắc; khớp thì không', () => {
  const lệch = dossierGaps({ data: base({ cycle: { ...base().cycle, planted_area_m2: 5000 } }), licenses: lic, geo, today: '2026-12-02' });
  assert.ok(lệch.some((g) => /lệch hơn 20%/.test(g.text)));
  const khớp = dossierGaps({ data: base(), licenses: lic, geo, today: '2026-12-02' });
  assert.equal(khớp.some((g) => /lệch hơn 20%/.test(g.text)), false);
});

test('không có quyền xem kho: bỏ bảng vật tư và báo rõ; CSV nhiều khối có BOM, dấu chấm phẩy', () => {
  const d = buildDossier({ data: base({ usesAvailable: false }), licenses: lic, geo, today: '2026-12-02' });
  assert.equal(d.tables.some((x) => x.id === 'inputs'), false);
  assert.ok(d.gaps.some((g) => /quyền xem kho/.test(g.text)));
  const csv = dossierCsv(buildDossier({ data: base(), licenses: lic, geo, today: '2026-12-02' }));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('HỒ SƠ NGUỒN GỐC SẢN XUẤT\r\nMục;Thông tin;Giá trị'));
  assert.ok(csv.includes('6. Thu hoạch và mã lô\r\nNgày thu hoạch;Mã lô;'));
  assert.ok(csv.includes('Thiamethoxam'));
});
