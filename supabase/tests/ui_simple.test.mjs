import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionSections, declareSections, reportSections } from '../../apps/app/src/lib/tabs.ts';
import { cycleNoun, infoLabels } from '../../apps/app/src/lib/terms.ts';

// Chế độ đơn giản (D100) và từ ngữ theo loại sản phẩm: phần thuần, không cần CSDL.

const perms = Object.fromEntries(['inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare', 'payroll', 'website', 'coop'].map((m) => [m, 'edit']));
const org = (simple) => ({ id: 'o', type: 'household', name: 'Hộ', roles: ['owner'], perms, simple });
const ids = (l) => l.map((s) => s.id);

test('chế độ đầy đủ giữ nguyên mọi mục; chế độ đơn giản ẩn mục nâng cao nhưng giữ việc cần để tạo vụ', () => {
  const full = org(false), simple = org(true);
  assert.ok(ids(declareSections(full)).includes('worktypes') && ids(reportSections(full)).includes('logbook') && ids(declareSections(full)).includes('positions') && ids(productionSections(full)).includes('attendance'));
  for (const [list, hidden] of [[declareSections, ['worktypes', 'partners', 'customers', 'positions', 'teams', 'coop']], [reportSections, ['custom', 'paybook', 'website', 'commerce', 'checklist', 'logbook']], [productionSections, ['attendance']]]) {
    const got = ids(list(simple));
    for (const h of hidden) assert.ok(!got.includes(h), `đơn giản phải ẩn ${h}`);
  }
  // việc hằng ngày và việc cần để tạo vụ vẫn còn
  assert.deepEqual(ids(productionSections(simple)), ['cycles', 'harvest', 'stock', 'expense', 'logs']);
  for (const k of ['areas', 'crops', 'templates', 'materials']) assert.ok(ids(declareSections(simple)).includes(k), k);
  for (const k of ['weekly', 'summary', 'sales', 'payables']) assert.ok(ids(reportSections(simple)).includes(k), k);
  assert.ok(ids(declareSections(simple)).includes('members'));
});

test('từ gọi vụ/lứa theo sản phẩm của cơ sở và nhãn thông tin theo loại sản phẩm', () => {
  assert.equal(cycleNoun(['crop', 'crop']), 'vụ trồng');
  assert.equal(cycleNoun(['livestock']), 'lứa nuôi');
  assert.equal(cycleNoun(['crop', 'livestock']), 'vụ');
  assert.equal(cycleNoun([]), 'vụ');
  assert.equal(infoLabels('livestock').sowing, 'Ngày nhập chuồng');
  assert.equal(infoLabels('livestock').area, 'Diện tích chuồng');
  assert.equal(infoLabels('crop').sowing, 'Ngày gieo');
  assert.equal(infoLabels(undefined).count, 'cây');
});
