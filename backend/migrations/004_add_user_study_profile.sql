ALTER TABLE users
  ADD COLUMN college VARCHAR(160) NULL AFTER phone_number,
  ADD COLUMN school VARCHAR(160) NULL AFTER college,
  ADD COLUMN department VARCHAR(160) NULL AFTER school,
  ADD COLUMN program VARCHAR(160) NULL AFTER department,
  ADD COLUMN year_of_study VARCHAR(40) NULL AFTER program,
  ADD COLUMN semester_number VARCHAR(40) NULL AFTER year_of_study;
