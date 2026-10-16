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
