CREATE TABLE IF NOT EXISTS user_paper_unlock_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  paper_id BIGINT UNSIGNED NOT NULL,
  free_coins_spent INT UNSIGNED NOT NULL DEFAULT 0,
  purchased_coins_spent INT UNSIGNED NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY user_paper_unlock_events_user_time (user_id, unlocked_at),
  CONSTRAINT user_paper_unlock_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_paper_unlock_events_paper_fk FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO user_paper_unlock_events (user_id, paper_id, free_coins_spent, purchased_coins_spent, unlocked_at)
SELECT u.user_id, u.paper_id, u.free_coins_spent, u.purchased_coins_spent, u.unlocked_at
FROM user_paper_unlocks u;
