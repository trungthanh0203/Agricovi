import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleNoun } from '../../apps/app/src/lib/terms.ts';
import { activeKinds, defaultEntries, CONFIG_DEFS, MATERIAL_NEEDS } from '../../apps/app/src/lib/config.ts';

// Cơ sở chọn "Sử dụng" cho loại đối tượng sản xuất: các nơi khác chỉ hiện loại đang sử dụng.

test('loại đang sử dụng lấy theo nhóm gốc của mục đang bật; mặc định là tất cả', () => {
  const def = CONFIG_DEFS.find((d) => d.id === 'product_groups');
  const all = defaultEntries(def);
  assert.deepEqual([...activeKinds(all)].sort(), ['aquatic', 'crop', 'livestock', 'other']);
  const cropOnly = all.map((e) => ({ ...e, active: e.code === 'crop' }));
  assert.deepEqual([...activeKinds(cropOnly)], ['crop']);
  // mục tự thêm "tính như" Vật nuôi bật thì tính là có vật nuôi
  const withPoultry = [...cropOnly, { code: 'c_gia', label: 'Gia cầm', base: 'livestock', active: true }];
  assert.deepEqual([...activeKinds(withPoultry)].sort(), ['crop', 'livestock']);
});

test('từ gọi vụ theo loại đang sử dụng', () => {
  assert.equal(cycleNoun(['crop']), 'vụ trồng');
  assert.equal(cycleNoun(['livestock']), 'vụ nuôi');
  assert.equal(cycleNoun(['aquatic', 'livestock']), 'vụ nuôi');
  assert.equal(cycleNoun(['crop', 'livestock']), 'vụ nuôi trồng');
  assert.equal(cycleNoun([]), 'vụ nuôi trồng');
});

test('nhóm vật tư gắn với loại: thức ăn/thuốc thú y cần nuôi, phân bón/thuốc BVTV cần cây trồng', () => {
  assert.deepEqual(MATERIAL_NEEDS.feed, ['livestock', 'aquatic']);
  assert.deepEqual(MATERIAL_NEEDS.fertilizer, ['crop']);
  assert.equal(MATERIAL_NEEDS.seed, undefined); // Giống, Sát trùng, Khác luôn hiện
});
