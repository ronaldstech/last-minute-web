-- Core account and opaque bearer-session tables for the PHP API.
CREATE DATABASE IF NOT EXISTS last_minute
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE last_minute;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  college VARCHAR(160) NULL,
  school VARCHAR(160) NULL,
  department VARCHAR(160) NULL,
  program VARCHAR(160) NULL,
  year_of_study VARCHAR(40) NULL,
  semester_number VARCHAR(40) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'student',
  coin_balance INT UNSIGNED NOT NULL DEFAULT 0,
  free_coin_balance INT UNSIGNED NOT NULL DEFAULT 50,
  phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_suspended TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  UNIQUE KEY users_phone_unique (phone_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_colleges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, name VARCHAR(160) NOT NULL, alias VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_colleges_name (name)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_schools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, alias VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_schools_parent (parent_id),
  CONSTRAINT academic_schools_college_fk FOREIGN KEY (parent_id) REFERENCES academic_colleges(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, alias VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_departments_parent (parent_id),
  CONSTRAINT academic_departments_school_fk FOREIGN KEY (parent_id) REFERENCES academic_schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS academic_programmes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, parent_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL, alias VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY academic_programmes_parent (parent_id),
  CONSTRAINT academic_programmes_department_fk FOREIGN KEY (parent_id) REFERENCES academic_departments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS papers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(240) NOT NULL,
  course VARCHAR(160) NOT NULL DEFAULT '',
  year VARCHAR(40) NOT NULL DEFAULT '',
  semester VARCHAR(40) NOT NULL DEFAULT '',
  questions JSON NOT NULL,
  question_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY papers_title (title),
  KEY papers_course (course),
  KEY papers_year (year)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY user_sessions_user_id (user_id),
  KEY user_sessions_expires_at (expires_at),
  CONSTRAINT user_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
