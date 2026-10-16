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
  department_id BIGINT UNSIGNED NULL,
  department_name VARCHAR(160) NULL,
  questions JSON NOT NULL,
  programme_assignments JSON NOT NULL,
  question_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY papers_title (title),
  KEY papers_course (course),
  KEY papers_year (year)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_saved_papers (
  user_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, paper_id),
  KEY user_saved_papers_paper (paper_id),
  CONSTRAINT user_saved_papers_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_saved_papers_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_paper_unlocks (
  user_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  free_coins_spent INT UNSIGNED NOT NULL DEFAULT 0,
  purchased_coins_spent INT UNSIGNED NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, paper_id),
  KEY user_paper_unlocks_paper (paper_id),
  CONSTRAINT user_paper_unlocks_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_paper_unlocks_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  charge_id VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  operator_id VARCHAR(100) NOT NULL,
  operator_name VARCHAR(120) NOT NULL,
  mobile VARCHAR(32) NOT NULL,
  coins INT UNSIGNED NOT NULL,
  amount_mwk INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tx_ref VARCHAR(160) NULL,
  failure_reason VARCHAR(500) NULL,
  credited TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (charge_id),
  KEY wallet_transactions_user_created (user_id, created_at),
  CONSTRAINT wallet_transactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(70) NOT NULL,
  course VARCHAR(60) NOT NULL DEFAULT '',
  description VARCHAR(300) NOT NULL DEFAULT '',
  owner_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY study_groups_owner (owner_id, created_at),
  CONSTRAINT study_groups_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_members (
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  KEY study_group_members_user (user_id, joined_at),
  CONSTRAINT study_group_members_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  invitee_id BIGINT UNSIGNED NOT NULL,
  inviter_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY study_group_invitation_unique (group_id, invitee_id),
  KEY study_group_invitee_status (invitee_id, status, created_at),
  CONSTRAINT study_group_invitations_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_invitations_invitee_fk FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT study_group_invitations_inviter_fk FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  paper_title VARCHAR(240) NOT NULL,
  course VARCHAR(160) NOT NULL DEFAULT '',
  year VARCHAR(40) NOT NULL DEFAULT '',
  semester VARCHAR(40) NOT NULL DEFAULT '',
  paper_details JSON NOT NULL,
  questions JSON NOT NULL,
  question_count INT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  announcement_message_id BIGINT UNSIGNED NULL,
  current_question_index INT NOT NULL DEFAULT -1,
  ended_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY study_group_plans_schedule (group_id, scheduled_at),
  CONSTRAINT study_group_plans_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plans_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plans_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_plan_members (
  plan_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, user_id),
  CONSTRAINT study_group_plan_members_plan_fk FOREIGN KEY (plan_id) REFERENCES study_group_plans(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plan_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  sender_name VARCHAR(120) NOT NULL,
  text LONGTEXT NOT NULL,
  message_type VARCHAR(40) NOT NULL DEFAULT '',
  paper_details JSON NULL,
  discussion_at DATETIME NULL,
  plan_id BIGINT UNSIGNED NULL,
  question_index INT NULL,
  question_count INT NULL,
  max_marks INT NULL,
  related_question_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY study_group_answer_once (group_id, related_question_id, sender_id),
  KEY study_group_messages_group (group_id, id),
  CONSTRAINT study_group_messages_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_messages_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT study_group_messages_plan_fk FOREIGN KEY (plan_id) REFERENCES study_group_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS practice_answer_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  question_key VARCHAR(512) NOT NULL,
  question_prompt TEXT NOT NULL,
  answer LONGTEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 1,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY practice_submission_prompt (user_id, paper_id, question_key),
  KEY practice_submission_queue (status, submitted_at),
  CONSTRAINT practice_submission_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT practice_submission_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marking_usage_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  paper_id VARCHAR(160) NULL,
  paper_title VARCHAR(240) NOT NULL DEFAULT '',
  paper_course VARCHAR(160) NOT NULL DEFAULT '',
  paper_year VARCHAR(40) NOT NULL DEFAULT '',
  question_key VARCHAR(512) NOT NULL,
  question_number VARCHAR(100) NOT NULL,
  question_prompt TEXT NOT NULL,
  answer LONGTEXT NOT NULL,
  max_marks DECIMAL(8,2) NOT NULL DEFAULT 0,
  score DECIMAL(8,2) NULL,
  model VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  error_code VARCHAR(80) NULL,
  response_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY marking_events_user_time (user_id, created_at),
  KEY marking_events_paper_question (paper_id, question_key, created_at),
  KEY marking_events_status_time (status, created_at),
  CONSTRAINT marking_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
