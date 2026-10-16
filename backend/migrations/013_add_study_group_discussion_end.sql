ALTER TABLE study_group_plans
  ADD COLUMN ended_at DATETIME NULL DEFAULT NULL AFTER current_question_index;
