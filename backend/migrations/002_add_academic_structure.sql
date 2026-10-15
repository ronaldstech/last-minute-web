CREATE TABLE IF NOT EXISTS academic_colleges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, name VARCHAR(160) NOT NULL, code VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_colleges_name (name)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_schools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, code VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_schools_parent (parent_id),
  CONSTRAINT academic_schools_college_fk FOREIGN KEY (parent_id) REFERENCES academic_colleges(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, code VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_departments_parent (parent_id),
  CONSTRAINT academic_departments_school_fk FOREIGN KEY (parent_id) REFERENCES academic_schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_programmes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, code VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_programmes_parent (parent_id),
  CONSTRAINT academic_programmes_department_fk FOREIGN KEY (parent_id) REFERENCES academic_departments(id) ON DELETE CASCADE
) ENGINE=InnoDB;
