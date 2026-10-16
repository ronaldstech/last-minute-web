CREATE TABLE IF NOT EXISTS study_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(70) NOT NULL,
  course VARCHAR(60) NOT NULL DEFAULT '',
  description VARCHAR(300) NOT NULL DEFAULT '',
  owner_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY study_groups_owner (owner_id, created_at),
  CONSTRAINT study_groups_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_members (
  group_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id), KEY study_group_members_user (user_id, joined_at),
  CONSTRAINT study_group_members_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, group_id BIGINT UNSIGNED NOT NULL,
  invitee_id BIGINT UNSIGNED NOT NULL, inviter_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL, PRIMARY KEY (id), UNIQUE KEY study_group_invitation_unique (group_id, invitee_id),
  KEY study_group_invitee_status (invitee_id, status, created_at),
  CONSTRAINT study_group_invitations_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_invitations_invitee_fk FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT study_group_invitations_inviter_fk FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, group_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL, paper_title VARCHAR(240) NOT NULL,
  course VARCHAR(160) NOT NULL DEFAULT '', year VARCHAR(40) NOT NULL DEFAULT '', semester VARCHAR(40) NOT NULL DEFAULT '',
  paper_details JSON NOT NULL, questions JSON NOT NULL, question_count INT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NOT NULL,
  announcement_message_id BIGINT UNSIGNED NULL, current_question_index INT NOT NULL DEFAULT -1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
  KEY study_group_plans_schedule (group_id, scheduled_at),
  CONSTRAINT study_group_plans_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plans_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plans_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_plan_members (
  plan_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (plan_id, user_id),
  CONSTRAINT study_group_plan_members_plan_fk FOREIGN KEY (plan_id) REFERENCES study_group_plans(id) ON DELETE CASCADE,
  CONSTRAINT study_group_plan_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_group_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, group_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL, sender_name VARCHAR(120) NOT NULL, text LONGTEXT NOT NULL,
  message_type VARCHAR(40) NOT NULL DEFAULT '', paper_details JSON NULL, discussion_at DATETIME NULL,
  plan_id BIGINT UNSIGNED NULL, question_index INT NULL, question_count INT NULL,
  max_marks INT NULL, related_question_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
  UNIQUE KEY study_group_answer_once (group_id, related_question_id, sender_id), KEY study_group_messages_group (group_id, id),
  CONSTRAINT study_group_messages_group_fk FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT study_group_messages_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT study_group_messages_plan_fk FOREIGN KEY (plan_id) REFERENCES study_group_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB;
