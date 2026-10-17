ALTER TABLE marking_usage_events
  ADD COLUMN source_type VARCHAR(32) NOT NULL DEFAULT 'practice' AFTER paper_year,
  ADD COLUMN group_id BIGINT UNSIGNED NULL AFTER source_type,
  ADD COLUMN group_name VARCHAR(200) NOT NULL DEFAULT '' AFTER group_id,
  ADD COLUMN discussion_id BIGINT UNSIGNED NULL AFTER group_name,
  ADD KEY marking_events_source_group_time (source_type, group_id, created_at);

UPDATE marking_usage_events e
JOIN study_group_messages m
  ON e.question_key REGEXP '^[1-9][0-9]*$'
  AND m.id = CAST(e.question_key AS UNSIGNED)
JOIN study_group_plans p ON p.id = m.plan_id AND p.paper_id = e.paper_id
JOIN study_groups g ON g.id = m.group_id
SET e.source_type = 'group_discussion',
    e.group_id = g.id,
    e.group_name = g.name,
    e.discussion_id = p.id
WHERE e.source_type = 'practice'
  AND m.message_type IN ('discussion_answer', 'discussion_pass')
  AND m.related_question_id IS NOT NULL
  AND (e.answer = m.text OR (m.message_type = 'discussion_pass' AND e.answer = ''));
