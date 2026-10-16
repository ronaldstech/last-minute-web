ALTER TABLE study_group_messages
  ADD COLUMN marking_result JSON NULL AFTER related_question_id;
