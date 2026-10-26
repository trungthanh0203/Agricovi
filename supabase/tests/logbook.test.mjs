import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MELON_BOOKS, PIG_BOOKS, dataForBook, logbookSetFor } from '../../apps/app/src/lib/logbook/index.ts';
import { auditGaps } from '../../apps/app/src/lib/logbook/gaps.ts';
import { toCsv } from '../../apps/app/src/lib/logbook/csv.ts';

// P5 gọn (D100): sổ nhật ký dựng từ dữ liệu đã ghi + kiểm tra thiếu sót. Phần thuần, không cần CSDL.

const wt = (code, name) => ({ id: code, code, name, field_schema: [] });
const mat = (o) => ({ id: o.name, organization_id: 'o', name: o.name, base_unit_id: 'u', is_active: true, category: null, reorder_threshold: null, ...o });
const log = (id, work, at, data = {}, extra = {}) => ({ id, organization_id: 'o', cycle_id: 'c1', area_id: 'a1', work_type_id: work.id, performed_at: at, data, note: null, version: 1, author_name: 'Lê Văn Tám', ...extra });
const entry = (l, w, uses = []) => ({ log: l, wt: w, uses });
const SPRAY = wt('spraying', 'Phun thuốc'), FERT = wt('fertilizing', 'Bón phân'), SOW = wt('x1', 'Gieo hạt vào khay'), FEED = wt('x2', 'Cho ăn'), VAC = wt('x3', 'Tiêm vaccine'), SAT = wt('x4', 'Sát trùng');
const actara = mat({ name: 'Actara 25WG', active_ingredient: 'Thiamethoxam', withdrawal_days: 7, manufacturer: 'Syngenta', registration_no: null });

const base = (over = {}) => ({
  orgName: 'Hộ A', cycle: { id: 'c1', code: 'VD-03', supervisor_name: 'Nam', variety_name: 'TL3', planted_area_m2: 1000, start_date: '2026-11-01', expected_end_date: '2027-01-15', plant_count: 2500, area_id: 'a1' },
  areaName: 'Nhà màng 1', areaLocation: 'Củ Chi', productName: 'Dưa lưới', productKind: 'crop', unit: 'cây', from: '2026-11-01', to: '2027-02-01',
  entries: [], receipts: [], harvests: [], incidents: [], actions: [], countEvents: [], stages: [], milestones: [], areas: [{ id: 'a1', organization_id: 'o', name: 'Nhà màng 1' }], audits: [], usesAvailable: true, ...over,
});

test('bộ sổ theo loại sản phẩm: vật nuôi dùng sổ heo, còn lại sổ dưa lưới', () => {
  assert.equal(logbookSetFor('livestock').id, 'pig');
  assert.equal(logbookSetFor('crop').id, 'melon');
  assert.deepEqual(MELON_BOOKS.books.map((b) => b.id), ['sowing', 'fertilizing', 'spraying', 'irrigation', 'harvest', 'incidents']);
  assert.deepEqual(PIG_BOOKS.books.map((b) => b.id), ['herd', 'feed', 'vet', 'hygiene', 'incidents']);
});

test('sổ dưa lưới: mỗi hàng đủ cột; phun thuốc tính PHI, ngày hết cách ly và cảnh báo khi thu hoạch trong thời gian cách ly', () => {
  const d = base({
    entries: [
      entry(log('l1', SPRAY, '2026-12-05T03:00:00Z', { target: ['Bọ trĩ'], dose: '1g/8 lít', sprayed_m2: 1000 }), SPRAY, [{ material: actara, quantity: 0.2, unit: 'kg', lotNo: 'L1', expiry: null }]),
      entry(log('l2', FERT, '2026-12-08T03:00:00Z', { method: 'Qua nước tưới nhỏ giọt', ec: 1.7, ph: 6.4, stage: 'Ra hoa' }), FERT),
      entry(log('l3', SOW, '2026-11-02T03:00:00Z', { trays: 52, seeds: 2600 }), SOW),
    ],
    harvests: [{ id: 'h1', cycle_id: 'c1', harvested_at: '2026-12-10T03:00:00Z', quantity: 1280, unit_count: 800, grade: 'Loại 1', extra: { brix: 13.5, buyer: 'Co.opmart' }, lot_code: 'VD-03/L01' }],
  });
  for (const b of MELON_BOOKS.books) for (const r of b.build(dataForBook(b, d))) assert.equal(r.length, b.headers.length, `${b.id}: số cột`);
  const spray = MELON_BOOKS.books.find((b) => b.id === 'spraying').build(d)[0];
  assert.deepEqual([spray[2], spray[3], spray[6], spray[7]], ['Actara 25WG', 'Thiamethoxam', '7', '12/12/2026']);
  assert.match(spray[8], /CẢNH BÁO/); // thu hoạch 10/12 khi cách ly đến 12/12
  const hv = MELON_BOOKS.books.find((b) => b.id === 'harvest').build(d)[0];
  assert.deepEqual([hv[1], hv[2], hv[4], hv[5]], ['VD-03/L01', '800', '1,6', '13.5']);
  assert.equal(MELON_BOOKS.books.find((b) => b.id === 'sowing').build(d)[0][3], '2600 hạt, 52 khay');
});

test('sổ heo: đủ cột; vệ sinh lấy cả việc ghi cho khu vực không gắn vụ, còn sổ khác chỉ lấy việc của vụ đang chọn', () => {
  const d = base({
    productKind: 'livestock', productName: 'Heo thịt', unit: 'con',
    entries: [
      entry(log('v1', VAC, '2026-11-10T03:00:00Z', { dose: '2 ml/con', route: 'Tiêm bắp', needle_broken: false }), VAC, [{ material: mat({ name: 'Vaccine FMD', manufacturer: 'Boehringer', withdrawal_days: 0 }), quantity: 50, unit: 'ml', lotNo: 'FMD-882', expiry: null }]),
      entry(log('v2', SAT, '2026-11-11T03:00:00Z', { concentration: '1:200', result: 'Đạt', checker: 'Hùng' }, { cycle_id: null, area_id: 'a1' }), SAT),
      entry(log('v3', FEED, '2026-11-12T03:00:00Z', { feed_kg: 120 }, { cycle_id: 'other' }), FEED), // vụ khác
    ],
    countEvents: [{ id: 'e1', cycle_id: 'c1', event_date: '2026-11-15', kind: 'dead', quantity: 3, author_name: 'Tám', note: 'tiêu chảy' }],
    receipts: [{ date: '2026-11-01', material: mat({ name: 'Cám 551', material_group: 'feed', manufacturer: 'C.P.' }), quantity: 5000, unit: 'kg', lotNo: 'LO-551', expiry: '2027-02-01', note: null }],
  });
  for (const b of PIG_BOOKS.books) for (const r of b.build(dataForBook(b, d))) assert.equal(r.length, b.headers.length, `${b.id}: số cột`);
  const get = (id) => { const b = PIG_BOOKS.books.find((x) => x.id === id); return b.build(dataForBook(b, d)); };
  assert.equal(get('vet').length, 1);
  assert.equal(get('vet')[0][3], 'Boehringer / Lô FMD-882');
  assert.equal(get('hygiene').length, 1);                  // việc khu vực không gắn vụ có mặt
  assert.equal(get('feed').filter((r) => r[1] === 'Xuất cám cho ăn').length, 0); // việc của vụ khác không lẫn vào
  assert.equal(get('feed').filter((r) => r[1] === 'Nhập kho cám').length, 1);
  assert.equal(get('herd')[0][6], 'Chết');
});

test('kiểm tra thiếu: mã vụ, người phụ trách, thuốc thiếu hoạt chất/cách ly, thu trong cách ly, chưa Brix, sự cố mở, mốc quá hạn, chưa tự đánh giá', () => {
  const noInfo = mat({ name: 'Thuốc lạ' });
  const d = base({
    cycle: { id: 'c1', start_date: '2026-11-01', expected_end_date: '2027-01-15' },
    entries: [entry(log('l1', SPRAY, '2026-12-05T03:00:00Z'), SPRAY, [{ material: noInfo, quantity: 1, unit: 'kg', lotNo: null, expiry: null }]), entry(log('l2', SPRAY, '2026-12-06T03:00:00Z'), SPRAY, [])],
    harvests: [{ id: 'h1', cycle_id: 'c1', harvested_at: '2026-12-07T03:00:00Z', quantity: 10, extra: {} }],
    incidents: [{ id: 'i1', cycle_id: 'c1', kind: 'broken_needle', status: 'open', voided_at: null }],
    actions: [{ id: 'a1', incident_id: 'i1', done: false, due_date: '2026-12-01' }],
    milestones: [{ id: 'm1', anchor: 'end', offset_days: 7, done_at: null }],
  });
  const text = auditGaps(d, '2027-02-01').map((g) => g.text).join('\n');
  for (const re of [/chưa có mã vụ/, /cán bộ kỹ thuật/, /chưa ghi giống/, /chưa ghi tên thuốc/, /chưa ghi hoạt chất: Thuốc lạ/, /thời gian cách ly \/ ngưng thuốc: Thuốc lạ/, /chưa ghi độ ngọt Brix/, /1 sự cố đang mở/, /kim tiêm gãy/, /quá hạn/, /tự đánh giá/]) assert.match(text, re);
  // hồ sơ đầy đủ thì sạch cảnh báo
  const ok = base({ audits: [{ audit_date: '2026-12-01', status: 'final', voided_at: null }], harvests: [{ id: 'h', cycle_id: 'c1', harvested_at: '2026-12-07T03:00:00Z', quantity: 10, unit_count: 5, extra: { brix: 13 } }] });
  assert.deepEqual(auditGaps(ok, '2027-02-01').filter((g) => g.level === 'warn'), []);
  // không có quyền xem kho thì không kết luận sai về tên thuốc
  assert.ok(auditGaps(base({ usesAvailable: false, entries: [entry(log('l1', SPRAY, '2026-12-05T03:00:00Z'), SPRAY, [])] }), '2027-02-01').every((g) => !/chưa ghi tên thuốc/.test(g.text)));
});

test('xuất CSV: có BOM, bao dấu ngoặc kép khi có dấu chấm phẩy / ngoặc kép / xuống dòng', () => {
  const csv = toCsv(['A', 'B'], [['x;y', 'nói "ok"'], ['1', 'dòng\nhai']]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"x;y";"nói ""ok"""/);
  assert.match(csv, /"dòng\nhai"/);
});

test('bộ sổ theo loại: vật nuôi dùng bộ heo, trồng trọt bộ dưa lưới, thủy sản và loại khác dùng bộ chung; bộ chung dựng được từ dữ liệu rỗng', async () => {
  const { GENERAL_BOOKS } = await import('../../apps/app/src/lib/logbook/index.ts');
  assert.equal(logbookSetFor('livestock'), PIG_BOOKS);
  assert.equal(logbookSetFor('crop'), MELON_BOOKS);
  assert.equal(logbookSetFor(undefined), MELON_BOOKS);
  assert.equal(logbookSetFor('aquatic'), GENERAL_BOOKS);
  assert.equal(logbookSetFor('other'), GENERAL_BOOKS);
  const empty = { orgName: 'o', cycle: null, areaName: '', areaLocation: null, productName: '', productKind: 'aquatic', unit: 'con', from: '2026-01-01', to: '2026-12-31', entries: [], receipts: [], harvests: [], incidents: [], actions: [], countEvents: [{ id: 'e', event_date: '2026-10-01', kind: 'dead', quantity: 3, note: null }], stages: [], milestones: [], areas: [], audits: [], usesAvailable: true };
  for (const b of GENERAL_BOOKS.books) assert.ok(Array.isArray(b.build(empty)), b.id);
  assert.deepEqual(GENERAL_BOOKS.books.find((b) => b.id === 'counts').build(empty)[0].slice(0, 3), ['01/10/2026', 'Chết', '3']);
});
