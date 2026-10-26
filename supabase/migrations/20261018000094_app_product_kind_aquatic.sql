-- Nhóm loại sản phẩm (tab Cấu hình): Cây trồng, Vật nuôi, Thủy sản, Khác. Thêm 'aquatic' (Thủy sản).
alter table crop_types drop constraint crop_types_kind_check;
alter table crop_types add constraint crop_types_kind_check check (kind in ('crop', 'livestock', 'aquatic', 'other'));
