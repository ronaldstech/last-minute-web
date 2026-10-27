INSERT INTO app_configuration (config_key, config_value) VALUES
('coinPricing', JSON_OBJECT(
  'paperUnlockDailyCost', 20,
  'paperUnlockWeeklyCost', 100,
  'practiceMarkingCostPerQuestion', 2,
  'groupDiscussionMarkingCostPerResponse', 4,
  'slideQuestionGenerationCost', 5
)) ON DUPLICATE KEY UPDATE config_value = JSON_SET(config_value, '$.slideQuestionGenerationCost', COALESCE(JSON_EXTRACT(config_value, '$.slideQuestionGenerationCost'), 5));

CREATE TABLE IF NOT EXISTS generated_slide_papers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  question_count SMALLINT UNSIGNED NOT NULL,
  questions JSON NOT NULL,
  coins_charged INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_generated_slide_papers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_generated_slide_papers_user_created (user_id, created_at),
  INDEX idx_generated_slide_papers_created (created_at)
);
