-- P1 (D98): "Mua có hóa đơn" nhận thêm SỐ LÔ và HẠN DÙNG cho từng dòng hàng (không bắt buộc), dùng đúng cơ chế lô của nhập kho (0081).
-- Đổi hai đoạn của hàm cũ: cột nhập thêm lot_no, lot_expiry và giá trị lấy từ dòng hóa đơn (khóa "lot_no", "lot_expiry").
do $$
declare d text;
  k1 text := 'quantity_delta, unit_cost, txn_date, source, bill_id)';
  k2 text := '''online'', p_id);';
begin
  d := pg_get_functiondef('record_purchase(uuid, uuid, uuid, text, date, date, bigint, text, jsonb, bigint, text)'::regprocedure);
  if position(k1 in d) = 0 or position(k2 in d) = 0 then raise exception 'record_purchase: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k1, 'quantity_delta, unit_cost, txn_date, source, bill_id, lot_no, lot_expiry)');
  d := replace(d, k2, '''online'', p_id, nullif(trim(coalesce(ln->>''lot_no'', '''')), ''''), nullif(ln->>''lot_expiry'', '''')::date);');
  execute d;
end $$;
