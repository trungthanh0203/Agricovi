import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// HỢP ĐỒNG giữa app và website (G2-5, D78). App gọi thẳng các hàm có sẵn của website để xử lý yêu cầu báo giá và đơn đặt hàng.
// Bài kiểm thử này báo lỗi ngay khi chat Website đổi chữ ký hàm hoặc thêm/bớt trạng thái đơn mà app chưa biết.
// Nếu thay đổi là CÓ CHỦ ĐÍCH: sửa app (apps/app/src/lib/webSite.ts và các màn liên quan) rồi cập nhật bài kiểm thử này cùng lúc.

const CONTRACT = [
  { name: 'my_quote_requests', args: 'p_status text', returns: 'jsonb' },
  { name: 'set_my_quote', args: 'p_id uuid, p_status text, p_note text', returns: 'void' },
  { name: 'list_orders', args: 'p_role text, p_status text', returns: 'jsonb' },
  { name: 'get_order', args: 'p_id uuid', returns: 'jsonb' },
  { name: 'quote_order', args: 'p_id uuid, p_items jsonb, p_shipping numeric, p_note text, p_date date', returns: 'void' },
  { name: 'order_action', args: 'p_id uuid, p_action text, p_note text', returns: 'void' },
  { name: 'set_order_payment', args: 'p_id uuid, p_status text, p_note text', returns: 'void' },
];

test('hợp đồng: các hàm website mà app gọi còn đúng tham số, kiểu trả về, và chỉ người đăng nhập gọi được', async () => {
  const db = await createDb();
  for (const c of CONTRACT) {
    const r = (await db.query(
      `select pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as ret,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_ok, has_function_privilege('anon', p.oid, 'execute') as anon_ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [c.name])).rows;
    assert.equal(r.length, 1, `${c.name}: phải có đúng một bản`);
    const norm = (s) => s.replace(/ DEFAULT [^,]+/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(norm(r[0].args), c.args, `${c.name}: tham số đã đổi`);
    assert.equal(r[0].ret, c.returns, `${c.name}: kiểu trả về đã đổi`);
    assert.equal(r[0].auth_ok, true, `${c.name}: người đăng nhập phải gọi được`);
    assert.equal(r[0].anon_ok, false, `${c.name}: khách chưa đăng nhập không được gọi`);
  }
});

test('hợp đồng: trạng thái đơn và thao tác của website không đổi', async () => {
  const db = await createDb();
  const def = (await db.query(`select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
                                where t.relname = 'web_orders' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%status%placed%'`)).rows[0].d;
  const found = [...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]);
  assert.deepEqual(found.sort(), ['accepted', 'cancelled', 'completed', 'delivered', 'placed', 'preparing', 'quoted', 'rejected', 'shipped']);
  const pay = (await db.query(`select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
                                where t.relname = 'web_orders' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%payment_status%'`)).rows[0].d;
  assert.deepEqual([...pay.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]).sort(), ['paid', 'partial', 'unpaid']);
  const qs = (await db.query(`select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
                               where t.relname = 'quote_requests' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%status%new%'`)).rows[0].d;
  assert.deepEqual([...qs.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]).sort(), ['handled', 'new', 'spam']);
});

test('hợp đồng chạy thật: chủ cơ sở xem được yêu cầu và đơn của cơ sở qua hàm website; người ngoài và khách thì không', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const buyer = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into quote_requests (kind, sender_name, sender_phone, message, organization_id) values ('profile', 'Chị Lan', '0912345678', 'Cần 100kg dưa lưới', $1)`, [org]);
  await db.query(`insert into web_orders (code, buyer_id, organization_id, supplier_name, recipient, recipient_phone, province, address)
                  values ('DH-TEST-1', $1, $2, 'Hộ A', 'Anh Nam', '0987654321', 'Lâm Đồng', '12 Đường A')`, [buyer, org]);

  const quotes = (await asUser(db, owner, `select my_quote_requests(null) j`)).rows[0].j;
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].sender_name, 'Chị Lan');
  const orders = (await asUser(db, owner, `select list_orders('seller', null) j`)).rows[0].j;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].code, 'DH-TEST-1');

  assert.equal((await asUser(db, stranger, `select my_quote_requests(null) j`)).rows[0].j.length, 0);
  assert.equal((await asUser(db, stranger, `select list_orders('seller', null) j`)).rows[0].j.length, 0);
  await expectError(asAnon(db, `select my_quote_requests(null)`), /permission denied/i);
  const id = orders[0].id;
  const detail = (await asUser(db, owner, `select get_order($1) j`, [id])).rows[0].j;
  assert.equal(detail.side, 'seller');
  assert.ok(Array.isArray(detail.actions));
  await asUser(db, owner, `select set_my_quote($1, 'handled', 'Đã gọi lại')`, [quotes[0].id]);
  assert.equal((await asUser(db, owner, `select my_quote_requests('handled') j`)).rows[0].j.length, 1);
});
