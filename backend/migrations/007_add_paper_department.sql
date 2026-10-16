ALTER TABLE papers
  ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER semester,
  ADD COLUMN department_name VARCHAR(160) NULL AFTER department_id;
