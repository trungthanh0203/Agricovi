-- Mọi đối tượng khai báo ngoài tên còn có MÔ TẢ (D33): khu trồng, cây trồng, loại việc, vật tư, kho, đơn vị.
-- (Quy trình mẫu dùng cột note làm mô tả; giai đoạn cũng dùng cột note.) Bản chỉnh của cơ sở lên mục có sẵn cũng có mô tả riêng.
alter table production_areas add column description text check (description is null or length(description) <= 500);
alter table crop_types add column description text check (description is null or length(description) <= 500);
alter table work_types add column description text check (description is null or length(description) <= 500);
alter table materials add column description text check (description is null or length(description) <= 500);
alter table inventory_locations add column description text check (description is null or length(description) <= 500);
alter table units_of_measure add column description text check (description is null or length(description) <= 500);
alter table org_catalog_overrides add column description text check (description is null or length(description) <= 500);
