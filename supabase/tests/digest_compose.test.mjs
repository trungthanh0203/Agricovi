import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeDigest } from '../functions/send-push/digest.ts';

// Nội dung bản tin sáng (H2 lát 2): chỉ số đếm, không có tiền/tên khách; không có gì thì không gửi.

const zero = { tasks: { crop: 0, livestock: 0, aquatic: 0, other: 0 }, vaccine: 0, milestones: 0, assets: 0, payables: 0, receivables: 0, licenses: 0 };

test('không có gì để nhắc thì trả null (không gửi)', () => {
  assert.equal(composeDigest(zero), null);
  assert.equal(composeDigest(null), null);
  assert.equal(composeDigest({}), null);
});

test('gộp theo loại, mỗi loại một cụm kèm biểu tượng; công nợ phải trả và phải thu gộp một cụm', () => {
  const m = composeDigest({ ...zero, tasks: { crop: 3, livestock: 2, aquatic: 0, other: 0 }, vaccine: 1, assets: 1, payables: 1, receivables: 2 });
  assert.ok(m);
  assert.equal(m.title, 'Agricovi · việc hôm nay');
  assert.match(m.body, /🌱 3 việc cây trồng/);
  assert.match(m.body, /🐖 2 việc vật nuôi/);
  assert.match(m.body, /💉 1 mũi tiêm/);
  assert.match(m.body, /🛠️ 1 bảo dưỡng/);
  assert.match(m.body, /💳 3 khoản công nợ/);
  assert.doesNotMatch(m.body, /🐟/);
});

test('số lạ (âm, chữ, thiếu) coi như 0; nội dung không chứa chữ số tiền', () => {
  const m = composeDigest({ ...zero, tasks: { crop: -4, livestock: 'x', aquatic: 1, other: 0 }, licenses: 2 });
  assert.ok(m);
  assert.doesNotMatch(m.body, /cây trồng|vật nuôi/);
  assert.match(m.body, /🐟 1 việc thủy sản/);
  assert.match(m.body, /📜 2 giấy phép/);
  assert.doesNotMatch(m.body, /đ\b|VND|₫/);
});
