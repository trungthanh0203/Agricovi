import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, similarity, matchSupplier, matchMaterial, unitsDiffer } from '../../apps/app/src/lib/invoiceMatch.ts';

// Ghép nhà cung cấp / vật tư từ chữ đọc trên phiếu (phần thuần của app).
test('norm: bỏ dấu, giữ số và gạch', () => {
  assert.equal(norm('  Phân NPK 16-16-8 Đầu Trâu '), 'phan npk 16-16-8 dau trau');
  assert.equal(norm(null), '');
});

test('similarity: giống khi cùng hàng khác cách viết, thấp khi khác hàng', () => {
  assert.ok(similarity('NPK 16-16-8 Đầu Trâu bao 50kg', 'NPK 16-16-8') >= 0.6);
  assert.ok(similarity('Thuốc trừ sâu Radiant 60SC', 'Radiant 60SC') >= 0.6);
  assert.ok(similarity('Phân NPK 16-16-8', 'Phân NPK 20-20-15') < 0.6);
  assert.ok(similarity('Urê', 'Thuốc trừ cỏ') < 0.3);
  assert.equal(similarity('', 'abc'), 0);
});

test('matchSupplier: mã số thuế > điện thoại > tên', () => {
  const ps = [{ id: 'a', name: 'Đại lý vật tư An Phát', phone: '0901 234 567', tax_code: '0312345678' }, { id: 'b', name: 'Cửa hàng Bình Minh', phone: null, tax_code: null }];
  assert.equal(matchSupplier({ ten: 'Công ty khác tên', ma_so_thue: '0312345678', dien_thoai: null }, ps).via, 'tax');
  assert.equal(matchSupplier({ ten: 'Tên khác', ma_so_thue: null, dien_thoai: '090-1234567' }, ps).id, 'a');
  assert.equal(matchSupplier({ ten: 'DAI LY AN PHAT', ma_so_thue: null, dien_thoai: null }, ps).id, 'a');
  assert.equal(matchSupplier({ ten: 'Hoàn toàn mới', ma_so_thue: null, dien_thoai: null }, ps), null);
});

test('matchMaterial: bí danh được ưu tiên, nhà cung cấp riêng thắng bí danh chung', () => {
  const mats = [{ id: 'm1', name: 'NPK 16-16-8' }, { id: 'm2', name: 'Urê' }, { id: 'm3', name: 'NPK 20-20-15' }];
  const aliases = [
    { alias: 'npk dau trau 16-16-8 bao 50kg', material_id: 'm3', partner_id: null },
    { alias: 'npk dau trau 16-16-8 bao 50kg', material_id: 'm1', partner_id: 'p1' },
  ];
  assert.deepEqual(matchMaterial('NPK Đầu Trâu 16-16-8 bao 50kg', mats, aliases, 'p1'), { id: 'm1', score: 1, via: 'alias' });
  assert.equal(matchMaterial('NPK Đầu Trâu 16-16-8 bao 50kg', mats, aliases, 'p2').id, 'm3');   // chỉ có bí danh chung
  assert.equal(matchMaterial('NPK 16-16-8 Đầu Trâu', mats, [], null).id, 'm1');                  // theo tên
  assert.equal(matchMaterial('Thuốc lạ chưa có', mats, [], null), null);
});

test('unitsDiffer', () => {
  assert.equal(unitsDiffer('Bao', 'kg'), true);
  assert.equal(unitsDiffer('KG', 'kg'), false);
  assert.equal(unitsDiffer(null, 'kg'), false);
});
