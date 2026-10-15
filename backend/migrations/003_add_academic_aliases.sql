ALTER TABLE academic_colleges ADD COLUMN alias VARCHAR(80) NULL AFTER name;
ALTER TABLE academic_schools ADD COLUMN alias VARCHAR(80) NULL AFTER name;
ALTER TABLE academic_departments ADD COLUMN alias VARCHAR(80) NULL AFTER name;
ALTER TABLE academic_programmes ADD COLUMN alias VARCHAR(80) NULL AFTER name;

UPDATE academic_colleges SET alias = code WHERE alias IS NULL AND code IS NOT NULL;
UPDATE academic_schools SET alias = code WHERE alias IS NULL AND code IS NOT NULL;
UPDATE academic_departments SET alias = code WHERE alias IS NULL AND code IS NOT NULL;
UPDATE academic_programmes SET alias = code WHERE alias IS NULL AND code IS NOT NULL;
