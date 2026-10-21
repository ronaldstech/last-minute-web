<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

final class AdminMarkingRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function groupSummary(): array
    {
        $query = $this->pdo->query("SELECT COUNT(*) AS attempts, COUNT(DISTINCT group_id) AS groups_used, COUNT(DISTINCT user_id) AS facilitators, SUM(status = 'marked') AS marked, SUM(status = 'failed') AS failed, SUM(coins_charged) AS coins_spent, AVG(CASE WHEN status = 'marked' THEN score END) AS average_score, MAX(created_at) AS last_used FROM marking_usage_events WHERE source_type = 'group_discussion'");
        $row = $query->fetch() ?: [];
        return [
            'attempts' => (int)($row['attempts'] ?? 0),
            'groupsUsed' => (int)($row['groups_used'] ?? 0),
            'facilitators' => (int)($row['facilitators'] ?? 0),
            'marked' => (int)($row['marked'] ?? 0),
            'failed' => (int)($row['failed'] ?? 0),
            'coinsSpent' => (int)($row['coins_spent'] ?? 0),
            'averageScore' => $row['average_score'] === null ? null : round((float)$row['average_score'], 2),
            'lastUsed' => $row['last_used'],
        ];
    }

    public function practiceSummary(): array
    {
        $query = $this->pdo->query("SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS users, SUM(status = 'marked') AS marked, SUM(status = 'failed') AS failed, SUM(coins_charged) AS coins_spent, AVG(CASE WHEN status = 'marked' AND max_marks > 0 THEN score / max_marks * 100 END) AS average_percentage FROM marking_usage_events WHERE source_type = 'practice'");
        $row = $query->fetch() ?: [];
        return [
            'attempts' => (int)($row['attempts'] ?? 0),
            'users' => (int)($row['users'] ?? 0),
            'marked' => (int)($row['marked'] ?? 0),
            'failed' => (int)($row['failed'] ?? 0),
            'coinsSpent' => (int)($row['coins_spent'] ?? 0),
            'averagePercentage' => $row['average_percentage'] === null ? null : round((float)$row['average_percentage'], 1),
        ];
    }

    public function groups(): array
    {
        $query = $this->pdo->query("SELECT group_id AS groupId, MAX(group_name) AS groupName, COUNT(*) AS attempts, COUNT(DISTINCT discussion_id) AS discussions, COUNT(DISTINCT user_id) AS facilitators, SUM(status = 'marked') AS marked, SUM(status = 'failed') AS failed, MAX(created_at) AS lastUsed FROM marking_usage_events WHERE source_type = 'group_discussion' AND group_id IS NOT NULL GROUP BY group_id ORDER BY lastUsed DESC LIMIT 100");
        return array_map(static function (array $row): array {
            $row['groupId'] = (string)$row['groupId'];
            foreach (['attempts', 'discussions', 'facilitators', 'marked', 'failed'] as $key) $row[$key] = (int)$row[$key];
            return $row;
        }, $query->fetchAll());
    }

    public function recentGroupEvents(int $limit): array
    {
        $query = $this->pdo->query("SELECT e.id, e.user_id AS userId, u.username AS facilitator, e.group_id AS groupId, e.group_name AS groupName, e.discussion_id AS discussionId, e.paper_title AS paperTitle, e.paper_course AS course, e.question_number AS questionNumber, e.max_marks AS maxMarks, e.score, e.status, e.coins_charged AS coinsCharged, e.error_code AS errorCode, e.model, e.created_at AS createdAt FROM marking_usage_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.source_type = 'group_discussion' ORDER BY e.id DESC LIMIT " . (int)$limit);
        $rows = $query->fetchAll();
        foreach ($rows as &$row) {
            foreach (['id', 'userId', 'groupId', 'discussionId'] as $key) $row[$key] = $row[$key] === null ? null : (string)$row[$key];
            $row['maxMarks'] = $row['maxMarks'] === null ? null : (float)$row['maxMarks'];
            $row['score'] = $row['score'] === null ? null : (float)$row['score'];
            $row['createdAt'] = date(DATE_ATOM, strtotime($row['createdAt']));
        }
        unset($row);
        return $rows;
    }

    public function recentPracticeEvents(int $limit): array
    {
        $query = $this->pdo->query("SELECT e.id, e.user_id AS userId, u.username AS username, e.paper_title AS paperTitle, e.paper_course AS course, e.paper_year AS year, e.question_number AS questionNumber, e.max_marks AS maxMarks, e.score, e.status, e.coins_charged AS coinsCharged, e.error_code AS errorCode, e.model, e.created_at AS createdAt FROM marking_usage_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.source_type = 'practice' ORDER BY e.id DESC LIMIT " . (int)$limit);
        $rows = $query->fetchAll();
        foreach ($rows as &$row) {
            foreach (['id', 'userId'] as $key) $row[$key] = (string)$row[$key];
            $row['maxMarks'] = $row['maxMarks'] === null ? null : (float)$row['maxMarks'];
            $row['score'] = $row['score'] === null ? null : (float)$row['score'];
            $row['createdAt'] = date(DATE_ATOM, strtotime($row['createdAt']));
        }
        unset($row);
        return $rows;
    }
}
