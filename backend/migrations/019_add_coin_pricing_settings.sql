CREATE TABLE IF NOT EXISTS app_configuration (
  config_key VARCHAR(80) NOT NULL PRIMARY KEY,
  config_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE user_paper_unlocks
  ADD COLUMN unlock_duration_days TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER purchased_coins_spent;

ALTER TABLE user_paper_unlock_events
  ADD COLUMN unlock_duration_days TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER purchased_coins_spent;

ALTER TABLE marking_usage_events
  ADD COLUMN coins_charged INT UNSIGNED NOT NULL DEFAULT 0 AFTER status;

INSERT INTO app_configuration (config_key, config_value) VALUES
('coinPricing', JSON_OBJECT(
  'paperUnlockDailyCost', 20,
  'paperUnlockWeeklyCost', 100,
  'practiceMarkingCostPerQuestion', 2,
  'groupDiscussionMarkingCostPerResponse', 4
)) ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);
