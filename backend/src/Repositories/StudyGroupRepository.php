<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use DateTimeImmutable;
use DateTimeZone;
use PDO;

/** SQL persistence and membership rules for study groups and discussions. */
final class StudyGroupRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function groups(string $userId): array
    {
        $statement = $this->pdo->prepare('SELECT g.id, g.name, g.course, g.description, g.owner_id AS ownerId, u.username AS ownerName, g.created_at AS createdAt FROM study_groups g JOIN study_group_members mine ON mine.group_id = g.id AND mine.user_id = ? JOIN users u ON u.id = g.owner_id ORDER BY g.created_at DESC');
        $statement->execute([$userId]);
        $groups = $statement->fetchAll();
        foreach ($groups as &$group) {
            $group['id'] = (string)$group['id'];
            $group['ownerId'] = (string)$group['ownerId'];
            $members = $this->pdo->prepare('SELECT user_id FROM study_group_members WHERE group_id = ? ORDER BY joined_at, user_id');
            $members->execute([$group['id']]);
            $group['memberIds'] = array_map('strval', $members->fetchAll(PDO::FETCH_COLUMN));
        }
        unset($group);
        return $groups;
    }

    public function adminGroups(): array
    {
        $statement = $this->pdo->query('SELECT g.id, g.name, g.course, g.description, g.owner_id AS ownerId, u.username AS ownerName, g.created_at AS createdAt, COUNT(m.user_id) AS memberCount FROM study_groups g JOIN users u ON u.id = g.owner_id LEFT JOIN study_group_members m ON m.group_id = g.id GROUP BY g.id, g.name, g.course, g.description, g.owner_id, u.username, g.created_at ORDER BY g.created_at DESC');
        $rows = $statement->fetchAll();
        foreach ($rows as &$row) {
            $row['id'] = (string)$row['id'];
            $row['ownerId'] = (string)$row['ownerId'];
            $row['memberCount'] = (int)$row['memberCount'];
        }
        unset($row);
        return $rows;
    }

    public function adminGroupDetails(string $groupId): array
    {
        $groupQuery = $this->pdo->prepare('SELECT g.id, g.name, g.course, g.description, g.owner_id AS ownerId, u.username AS ownerName, u.email AS ownerEmail, g.created_at AS createdAt FROM study_groups g JOIN users u ON u.id = g.owner_id WHERE g.id = ? LIMIT 1');
        $groupQuery->execute([$groupId]);
        $group = $groupQuery->fetch();
        if (!$group) throw new \\DomainException('This study group could not be found.');
        $memberQuery = $this->pdo->prepare('SELECT u.id, u.username, u.email, m.joined_at AS joinedAt FROM study_group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at, u.username');
        $memberQuery->execute([$groupId]);
        $group['id'] = (string)$group['id'];
        $group['ownerId'] = (string)$group['ownerId'];
        $group['createdAt'] = date(DATE_ATOM, strtotime($group['createdAt']));
        $group['members'] = array_map(static function (array $member): array {
            $member['id'] = (string)$member['id'];
            $member['joinedAt'] = date(DATE_ATOM, strtotime($member['joinedAt']));
            return $member;
        }, $memberQuery->fetchAll());
        $group['memberCount'] = count($group['members']);
        return $group;
    }

    public function create(string $userId, string $name, string $course, string $description): array
    {
        $this->pdo->beginTransaction();
        try {
            $insert = $this->pdo->prepare('INSERT INTO study_groups (name, course, description, owner_id) VALUES (?, ?, ?, ?)');
            $insert->execute([$name, $course, $description, $userId]);
            $groupId = (string)$this->pdo->lastInsertId();
            $member = $this->pdo->prepare('INSERT INTO study_group_members (group_id, user_id) VALUES (?, ?)');
            $member->execute([$groupId, $userId]);
            $this->pdo->commit();
            foreach ($this->groups($userId) as $group) if ($group['id'] === $groupId) return $group;
            throw new \RuntimeException('Created study group could not be reloaded.');
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function invitations(string $userId): array
    {
        $statement = $this->pdo->prepare("SELECT i.id, i.group_id AS groupId, i.invitee_id AS inviteeId, i.status, i.created_at AS createdAt, g.name AS groupName, u.username AS inviterName FROM study_group_invitations i JOIN study_groups g ON g.id = i.group_id JOIN users u ON u.id = i.inviter_id WHERE i.invitee_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC");
        $statement->execute([$userId]);
        $rows = $statement->fetchAll();
        foreach ($rows as &$row) {
            $row['id'] = (string)$row['id'];
            $row['groupId'] = (string)$row['groupId'];
            $row['inviteeId'] = (string)$row['inviteeId'];
        }
        unset($row);
        return $rows;
    }

    public function respondToInvitation(string $userId, string $invitationId, bool $accept): void
    {
        $this->pdo->beginTransaction();
        try {
            $query = $this->pdo->prepare("SELECT group_id FROM study_group_invitations WHERE id = ? AND invitee_id = ? AND status = 'pending' FOR UPDATE");
            $query->execute([$invitationId, $userId]);
            $groupId = $query->fetchColumn();
            if ($groupId === false) throw new \DomainException('This group invitation is no longer available.');
            $update = $this->pdo->prepare('UPDATE study_group_invitations SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?');
            $update->execute([$accept ? 'accepted' : 'declined', $invitationId]);
            if ($accept) {
                $join = $this->pdo->prepare('INSERT IGNORE INTO study_group_members (group_id, user_id) VALUES (?, ?)');
                $join->execute([$groupId, $userId]);
            }
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function searchUsers(string $userId, string $query): array
    {
        $statement = $this->pdo->prepare('SELECT id, username FROM users WHERE id <> ? AND username LIKE ? ORDER BY username LIMIT 8');
        $statement->execute([$userId, '%' . $query . '%']);
        return array_map(static fn(array $row): array => ['id' => (string)$row['id'], 'username' => $row['username']], $statement->fetchAll());
    }

    public function inviteByUsername(string $userId, string $groupId, string $username): void
    {
        $this->requireOwner($groupId, $userId);
        $lookup = $this->pdo->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1');
        $lookup->execute([$username]);
        $inviteeId = $lookup->fetchColumn();
        if ($inviteeId === false) throw new \DomainException('No account was found for that username.');
        $this->createInvitation($userId, $groupId, (string)$inviteeId);
    }

    private function createInvitation(string $userId, string $groupId, string $inviteeId): void
    {
        if ((string)$inviteeId === $userId) throw new \DomainException('You are already the owner of this group.');
        $member = $this->pdo->prepare('SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?');
        $member->execute([$groupId, $inviteeId]);
        if ($member->fetchColumn()) throw new \DomainException('That student is already a member of this group.');
        $statement = $this->pdo->prepare("INSERT INTO study_group_invitations (group_id, invitee_id, inviter_id, status) VALUES (?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE inviter_id = VALUES(inviter_id), status = 'pending', responded_at = NULL, created_at = CURRENT_TIMESTAMP");
        $statement->execute([$groupId, $inviteeId, $userId]);
    }

    public function createInviteLink(string $userId, string $groupId): string
    {
        $this->requireOwner($groupId, $userId);
        $token = bin2hex(random_bytes(32));
        $statement = $this->pdo->prepare('INSERT INTO study_group_invite_links (group_id, token_hash, created_by) VALUES (?, ?, ?)');
        $statement->execute([$groupId, hash('sha256', $token), $userId]);
        return $token;
    }

    public function joinByLink(string $userId, string $token): array
    {
        $statement = $this->pdo->prepare('SELECT l.group_id, g.name, g.course, g.description, g.owner_id AS ownerId, u.username AS ownerName FROM study_group_invite_links l JOIN study_groups g ON g.id = l.group_id JOIN users u ON u.id = g.owner_id WHERE l.token_hash = ? LIMIT 1');
        $statement->execute([hash('sha256', $token)]);
        $group = $statement->fetch();
        if (!$group) throw new \DomainException('This invitation link is invalid or has expired.');
        $join = $this->pdo->prepare('INSERT IGNORE INTO study_group_members (group_id, user_id) VALUES (?, ?)');
        $join->execute([$group['group_id'], $userId]);
        $group['id'] = (string)$group['group_id'];
        $group['ownerId'] = (string)$group['ownerId'];
        unset($group['group_id']);
        return $group;
    }

    public function messages(string $userId, string $groupId, string $beforeId = ''): array
    {
        $this->requireMember($groupId, $userId);
        $before = $beforeId !== '' ? (int)$beforeId : 0;
        $statement = $this->pdo->prepare('SELECT id, sender_id AS senderId, sender_name AS senderName, text, message_type AS messageType, paper_details AS paperDetails, discussion_at AS discussionAt, plan_id AS planId, question_index AS questionIndex, question_count AS questionCount, max_marks AS maxMarks, related_question_id AS relatedQuestionId, marking_result AS markingResult, created_at AS createdAt FROM study_group_messages WHERE group_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT 31');
        $statement->execute([$groupId, $before, $before]);
        $rows = $statement->fetchAll();
        $hasMore = count($rows) > 30;
        if ($hasMore) array_pop($rows);
        foreach ($rows as &$row) {
            $row['id'] = (string)$row['id'];
            $row['senderId'] = (string)$row['senderId'];
            $row['planId'] = $row['planId'] === null ? null : (string)$row['planId'];
            $row['relatedQuestionId'] = $row['relatedQuestionId'] === null ? null : (string)$row['relatedQuestionId'];
            $row['questionIndex'] = $row['questionIndex'] === null ? null : (int)$row['questionIndex'];
            $row['questionCount'] = $row['questionCount'] === null ? null : (int)$row['questionCount'];
            $row['maxMarks'] = $row['maxMarks'] === null ? null : (int)$row['maxMarks'];
            $row['paperDetails'] = $row['paperDetails'] === null ? null : json_decode($row['paperDetails'], true);
            $row['markingResult'] = $row['markingResult'] === null ? null : json_decode($row['markingResult'], true);
            $row['createdAt'] = date(DATE_ATOM, strtotime($row['createdAt']));
            if ($row['discussionAt'] !== null) $row['discussionAt'] = date(DATE_ATOM, strtotime($row['discussionAt']));
            if ($row['messageType'] === '') $row['messageType'] = null;
            if ($row['paperDetails'] !== null) {
                $row['discussionPlanId'] = $row['planId'];
                $row['joinedMemberIds'] = $row['planId'] ? $this->planMemberIds($row['planId']) : [];
            }
        }
        unset($row);
        $rows = array_reverse($rows);
        return ['messages' => $rows, 'nextPageToken' => $hasMore && $rows ? $rows[0]['id'] : ''];
    }

    public function createMessage(string $userId, string $groupId, string $senderName, string $text): void
    {
        $this->requireMember($groupId, $userId);
        $statement = $this->pdo->prepare("INSERT INTO study_group_messages (group_id, sender_id, sender_name, text) VALUES (?, ?, ?, ?)");
        $statement->execute([$groupId, $userId, $senderName, $text]);
    }

    private function questionBlocks(array $question): array
    {
        $content = is_array($question['content'] ?? null) ? $question['content'] : [];
        if (!$content && trim((string)($question['text'] ?? '')) !== '') {
            $content = [['type' => 'paragraph', 'text' => (string)$question['text']]];
        }
        return $content;
    }

    private function questionText(array $question, array $content): string
    {
        $parts = [];
        foreach ($content as $block) {
            if (is_array($block)) $parts[] = (string)($block['text'] ?? $block['title'] ?? '');
        }
        return trim((string)($question['text'] ?? '') ?: implode("\n", array_filter($parts)));
    }

    private function flattenDiscussionQuestion(array $question, string $number, array $context, array &$prompts): void
    {
        $children = is_array($question['subquestions'] ?? null) ? $question['subquestions'] : [];
        $content = $this->questionBlocks($question);
        if (!$children) {
            $text = $this->questionText($question, $content);
            $images = is_array($question['images'] ?? null) ? $question['images'] : [];
            if ($text !== '' || $images) {
                $prompts[] = [
                    'number' => $number, 'text' => $text, 'content' => $content,
                    'images' => $images,
                    'assets' => is_array($question['assets'] ?? null) ? $question['assets'] : [],
                    'marks' => $question['marks'] ?? null, 'context' => $context,
                ];
            }
            return;
        }

        $nextContext = $context;
        $nextContext[] = [
            'number' => $number, 'text' => $this->questionText($question, $content),
            'content' => $content, 'images' => is_array($question['images'] ?? null) ? $question['images'] : [],
            'assets' => is_array($question['assets'] ?? null) ? $question['assets'] : [],
            'marks' => $question['marks'] ?? null,
        ];
        foreach ($children as $index => $part) {
            if (!is_array($part)) continue;
            $partNumber = (string)($part['number'] ?? chr(97 + $index));
            $this->flattenDiscussionQuestion($part, $number . '(' . $partNumber . ')', $nextContext, $prompts);
        }
    }

    public function plans(string $userId, string $groupId): array
    {
        $this->requireMember($groupId, $userId);
        $statement = $this->pdo->prepare('SELECT id, paper_id AS paperId, paper_title AS paperTitle, course, year, semester, paper_details AS paperDetails, questions, question_count AS questionCount, scheduled_at AS scheduledAt, ended_at AS endedAt, created_by AS createdBy, announcement_message_id AS announcementMessageId, current_question_index AS currentQuestionIndex, created_at AS createdAt FROM study_group_plans WHERE group_id = ? ORDER BY scheduled_at');
        $statement->execute([$groupId]);
        $rows = $statement->fetchAll();
        foreach ($rows as &$row) {
            $row['id'] = (string)$row['id'];
            $row['paperId'] = (string)$row['paperId'];
            $row['createdBy'] = (string)$row['createdBy'];
            $row['announcementMessageId'] = $row['announcementMessageId'] === null ? null : (string)$row['announcementMessageId'];
            $row['questionCount'] = (int)$row['questionCount'];
            $row['currentQuestionIndex'] = (int)$row['currentQuestionIndex'];
            $row['paperDetails'] = json_decode($row['paperDetails'], true) ?: [];
            $row['questions'] = json_decode($row['questions'], true) ?: [];
            $row['scheduledAt'] = gmdate(DATE_ATOM, strtotime($row['scheduledAt'] . ' UTC'));
            $row['endedAt'] = $row['endedAt'] === null ? null : gmdate(DATE_ATOM, strtotime($row['endedAt'] . ' UTC'));
            $row['createdAt'] = date(DATE_ATOM, strtotime($row['createdAt']));
            $row['joinedMemberIds'] = $this->planMemberIds($row['id']);
        }
        unset($row);
        return $rows;
    }

    public function createPlan(string $userId, string $groupId, string $paperId, DateTimeImmutable $scheduledAt): void
    {
        $this->requireOwner($groupId, $userId);
        $paperQuery = $this->pdo->prepare('SELECT id, title, course, year, semester, questions FROM papers WHERE id = ? LIMIT 1');
        $paperQuery->execute([$paperId]);
        $paper = $paperQuery->fetch();
        if (!$paper) throw new \DomainException('The selected paper was not found.');
        $rawQuestions = json_decode((string)$paper['questions'], true);
        $questions = [];
        foreach (is_array($rawQuestions) ? $rawQuestions : [] as $index => $question) {
            if (!is_array($question)) continue;
            $this->flattenDiscussionQuestion($question, (string)($question['number'] ?? ($index + 1)), [], $questions);
        }
        if (!$questions) throw new \DomainException('This paper does not have discussion questions yet.');

        $details = [
            'examType' => $paper['title'] ?: 'Paper discussion', 'course' => $paper['course'],
            'year' => $paper['year'], 'semester' => $paper['semester'],
        ];
        $this->pdo->beginTransaction();
        try {
            $insert = $this->pdo->prepare('INSERT INTO study_group_plans (group_id, paper_id, paper_title, course, year, semester, paper_details, questions, question_count, scheduled_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $insert->execute([$groupId, $paperId, $details['examType'], $paper['course'], $paper['year'], $paper['semester'], json_encode($details, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), json_encode($questions, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), count($questions), $scheduledAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'), $userId]);
            $planId = (string)$this->pdo->lastInsertId();
            $message = $this->pdo->prepare('INSERT INTO study_group_messages (group_id, sender_id, sender_name, text, paper_details, discussion_at, plan_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $message->execute([$groupId, $userId, 'Last Minute', 'A group discussion has been scheduled.', json_encode($details, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $scheduledAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'), $planId]);
            $messageId = (string)$this->pdo->lastInsertId();
            $update = $this->pdo->prepare('UPDATE study_group_plans SET announcement_message_id = ? WHERE id = ?');
            $update->execute([$messageId, $planId]);
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function joinPlan(string $userId, string $groupId, string $planId): void
    {
        $this->requireMember($groupId, $userId);
        $statement = $this->pdo->prepare('SELECT scheduled_at, ended_at FROM study_group_plans WHERE id = ? AND group_id = ? LIMIT 1');
        $statement->execute([$planId, $groupId]);
        $discussion = $statement->fetch();
        if (!$discussion) throw new \DomainException('Discussion not found.');
        if ($discussion['ended_at'] !== null) throw new \DomainException('This discussion has ended.');
        if (strtotime($discussion['scheduled_at'] . ' UTC') > time()) throw new \DomainException('You can join when the discussion starts.');
        $join = $this->pdo->prepare('INSERT IGNORE INTO study_group_plan_members (plan_id, user_id) VALUES (?, ?)');
        $join->execute([$planId, $userId]);
    }

    public function nextQuestion(string $userId, string $groupId, string $planId): bool
    {
        $this->pdo->beginTransaction();
        try {
            $statement = $this->pdo->prepare('SELECT p.questions, p.question_count, p.current_question_index, p.scheduled_at, p.ended_at, p.created_by FROM study_group_plans p JOIN study_groups g ON g.id = p.group_id WHERE p.id = ? AND p.group_id = ? FOR UPDATE');
            $statement->execute([$planId, $groupId]);
            $plan = $statement->fetch();
            if (!$plan) throw new \DomainException('Discussion not found.');
            if ((string)$plan['created_by'] !== $userId) throw new \DomainException('Only the group creator can advance discussion questions.');
            if ($plan['ended_at'] !== null) throw new \DomainException('This discussion has ended.');
            if (strtotime($plan['scheduled_at'] . ' UTC') > time()) throw new \DomainException('The discussion has not started yet.');
            $index = (int)$plan['current_question_index'] + 1;
            $questions = json_decode($plan['questions'], true) ?: [];
            if (!isset($questions[$index])) { $this->pdo->commit(); return false; }
            $question = $questions[$index];
            $marks = (int)($question['marks'] ?? 0);
            $text = 'Question ' . (($question['number'] ?? '') ?: ($index + 1)) . ($marks ? " ({$marks} marks)" : '') . "\n" . $question['text'];
            $message = $this->pdo->prepare("INSERT INTO study_group_messages (group_id, sender_id, sender_name, text, message_type, plan_id, question_index, question_count, max_marks) VALUES (?, ?, 'Last Minute', ?, 'discussion_question', ?, ?, ?, ?)");
            $message->execute([$groupId, $userId, $text, $planId, $index, count($questions), $marks ?: null]);
            $update = $this->pdo->prepare('UPDATE study_group_plans SET current_question_index = ? WHERE id = ?');
            $update->execute([$index, $planId]);
            $this->pdo->commit();
            return true;
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function publishDue(string $userId, string $groupId): bool
    {
        $this->requireOwner($groupId, $userId);
        $query = $this->pdo->prepare("SELECT id FROM study_group_plans WHERE group_id = ? AND scheduled_at <= UTC_TIMESTAMP() AND ended_at IS NULL AND current_question_index < 0 ORDER BY scheduled_at");
        $query->execute([$groupId]);
        $published = false;
        foreach ($query->fetchAll(PDO::FETCH_COLUMN) as $planId) $published = $this->nextQuestion($userId, $groupId, (string)$planId) || $published;
        return $published;
    }

    public function endDiscussion(string $userId, string $groupId, string $planId): void
    {
        $this->requireOwner($groupId, $userId);
        $statement = $this->pdo->prepare('UPDATE study_group_plans SET ended_at = UTC_TIMESTAMP() WHERE id = ? AND group_id = ? AND created_by = ? AND current_question_index >= 0 AND ended_at IS NULL');
        $statement->execute([$planId, $groupId, $userId]);
        if ($statement->rowCount() > 0) return;
        $check = $this->pdo->prepare('SELECT ended_at, current_question_index FROM study_group_plans WHERE id = ? AND group_id = ? AND created_by = ? LIMIT 1');
        $check->execute([$planId, $groupId, $userId]);
        $plan = $check->fetch();
        if (!$plan) throw new \DomainException('Discussion not found.');
        if ($plan['ended_at'] !== null) return;
        throw new \DomainException('Start the discussion before ending it.');
    }

    public function answer(string $userId, string $groupId, string $questionId, string $text, string $senderName): void
    {
        $this->requireMember($groupId, $userId);
        $questionQuery = $this->pdo->prepare("SELECT m.id, m.plan_id, m.question_index, p.current_question_index, p.ended_at FROM study_group_messages m JOIN study_group_plans p ON p.id = m.plan_id WHERE m.id = ? AND m.group_id = ? AND m.message_type = 'discussion_question' LIMIT 1");
        $questionQuery->execute([$questionId, $groupId]);
        $question = $questionQuery->fetch();
        if (!$question) throw new \DomainException('This discussion question is no longer available.');
        if ($question['ended_at'] !== null) throw new \DomainException('This discussion has ended.');
        $joined = $this->pdo->prepare('SELECT 1 FROM study_group_plan_members WHERE plan_id = ? AND user_id = ?');
        $joined->execute([$question['plan_id'], $userId]);
        if (!$joined->fetchColumn()) throw new \DomainException('Join this discussion before answering.');
        if ((int)$question['current_question_index'] !== (int)$question['question_index']) throw new \DomainException('This is no longer the current question.');
        try {
            $insert = $this->pdo->prepare('INSERT INTO study_group_messages (group_id, sender_id, sender_name, text, message_type, plan_id, question_index, related_question_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $insert->execute([$groupId, $userId, $senderName, trim($text) ?: 'Pass', trim($text) ? 'discussion_answer' : 'discussion_pass', $question['plan_id'], $question['question_index'], $questionId]);
        } catch (\PDOException $error) {
            if ($error->getCode() === '23000') throw new \DomainException('You have already responded to this question.');
            throw $error;
        }
    }

    public function saveDiscussionMarks(string $userId, string $groupId, string $questionId, array $results): void
    {
        $this->requireOwner($groupId, $userId);
        $this->pdo->beginTransaction();
        try {
            $questionQuery = $this->pdo->prepare("SELECT m.plan_id, m.question_index, p.current_question_index FROM study_group_messages m JOIN study_group_plans p ON p.id = m.plan_id WHERE m.id = ? AND m.group_id = ? AND m.message_type = 'discussion_question' AND p.created_by = ? FOR UPDATE");
            $questionQuery->execute([$questionId, $groupId, $userId]);
            $question = $questionQuery->fetch();
            if (!$question) throw new \DomainException('Discussion question not found.');
            if ((int)$question['current_question_index'] !== (int)$question['question_index']) throw new \DomainException('Only the current question can be marked.');

            $membersQuery = $this->pdo->prepare('SELECT user_id FROM study_group_plan_members WHERE plan_id = ? ORDER BY user_id');
            $membersQuery->execute([$question['plan_id']]);
            $joinedIds = array_map('strval', $membersQuery->fetchAll(PDO::FETCH_COLUMN));
            $answersQuery = $this->pdo->prepare("SELECT id, sender_id, marking_result FROM study_group_messages WHERE group_id = ? AND plan_id = ? AND related_question_id = ? AND message_type IN ('discussion_answer', 'discussion_pass') ORDER BY id");
            $answersQuery->execute([$groupId, $question['plan_id'], $questionId]);
            $answers = $answersQuery->fetchAll();
            $answeredIds = array_map(static fn(array $answer): string => (string)$answer['sender_id'], $answers);
            if (!$joinedIds || array_diff($joinedIds, $answeredIds)) throw new \DomainException('Wait until every joined member answers or passes before marking.');
            if (count($answers) !== count($results)) throw new \DomainException('The marking results do not match the group responses.');

            $answersById = [];
            foreach ($answers as $answer) {
                if ($answer['marking_result'] !== null) throw new \DomainException('This discussion question has already been marked.');
                $answersById[(string)$answer['id']] = $answer;
            }
            $update = $this->pdo->prepare('UPDATE study_group_messages SET marking_result = ? WHERE id = ? AND group_id = ? AND related_question_id = ? AND marking_result IS NULL');
            $savedIds = [];
            foreach ($results as $result) {
                if (!is_array($result) || !isset($result['id']) || !isset($answersById[(string)$result['id']])) throw new \DomainException('A marking result did not match a group response.');
                $id = (string)$result['id'];
                if (isset($savedIds[$id])) throw new \DomainException('A duplicate marking result was provided.');
                $savedIds[$id] = true;
                $maxMarks = isset($result['maxMarks']) && is_numeric($result['maxMarks']) ? max(0, (float)$result['maxMarks']) : 0;
                $score = isset($result['score']) && is_numeric($result['score']) ? min($maxMarks, max(0, (float)$result['score'])) : 0;
                $marking = [
                    'score' => round($score, 2), 'maxMarks' => round($maxMarks, 2),
                    'feedback' => mb_substr((string)($result['feedback'] ?? ''), 0, 5000),
                    'strengths' => array_slice(array_map(static fn($value): string => mb_substr((string)$value, 0, 500), is_array($result['strengths'] ?? null) ? $result['strengths'] : []), 0, 20),
                    'improvements' => array_slice(array_map(static fn($value): string => mb_substr((string)$value, 0, 500), is_array($result['improvements'] ?? null) ? $result['improvements'] : []), 0, 20),
                    'betterAnswer' => mb_substr((string)($result['betterAnswer'] ?? ''), 0, 5000),
                ];
                $update->execute([json_encode($marking, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $id, $groupId, $questionId]);
                if ($update->rowCount() !== 1) throw new \DomainException('A response could not be updated with its mark.');
            }
            if (count($savedIds) !== count($answersById)) throw new \DomainException('A marking result is missing for a group response.');
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private function requireMember(string $groupId, string $userId): void
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ? LIMIT 1');
        $statement->execute([$groupId, $userId]);
        if (!$statement->fetchColumn()) throw new \DomainException('Only group members can participate in this discussion.');
    }

    private function requireOwner(string $groupId, string $userId): void
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM study_groups WHERE id = ? AND owner_id = ? LIMIT 1');
        $statement->execute([$groupId, $userId]);
        if (!$statement->fetchColumn()) throw new \DomainException('Only the group creator can perform this action.');
    }

    private function planMemberIds(string $planId): array
    {
        $statement = $this->pdo->prepare('SELECT user_id FROM study_group_plan_members WHERE plan_id = ? ORDER BY joined_at, user_id');
        $statement->execute([$planId]);
        return array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }
}
