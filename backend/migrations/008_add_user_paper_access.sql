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
