<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

final class NotificationRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function listForUser(string $userId): array
    {
        $query = $this->pdo->prepare('SELECT n.id, n.title, n.body, n.kind, n.created_at AS createdAt, r.read_at FROM user_notifications n LEFT JOIN user_notification_reads r ON r.notification_id = n.id AND r.user_id = ? WHERE n.recipient_id IS NULL OR n.recipient_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 200');
        $query->execute([$userId, $userId]);
        return array_map(static fn (array $row): array => [
            'id' => (string)$row['id'], 'title' => $row['title'], 'body' => $row['body'],
            'kind' => $row['kind'], 'createdAt' => $row['createdAt'],
            'read' => $row['read_at'] !== null, 'details' => [], 'actionStatus' => null,
        ], $query->fetchAll());
    }

    public function markRead(string $userId, array $ids): void
    {
        if (!$ids) return;
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $query = $this->pdo->prepare("INSERT IGNORE INTO user_notification_reads (notification_id, user_id) SELECT n.id, ? FROM user_notifications n WHERE (n.recipient_id IS NULL OR n.recipient_id = ?) AND n.id IN ({$placeholders})");
        $query->execute([$userId, $userId, ...$ids]);
    }

    public function userExists(string $userId): bool
    {
        $query = $this->pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $query->execute([$userId]);
        return (bool)$query->fetchColumn();
    }

    public function create(?string $recipientId, string $title, string $body, string $kind, string $createdBy): string
    {
        $query = $this->pdo->prepare('INSERT INTO user_notifications (recipient_id, title, body, kind, created_by) VALUES (?, ?, ?, ?, ?)');
        $query->execute([$recipientId, $title, $body, $kind, $createdBy]);
        return (string)$this->pdo->lastInsertId();
    }
}
