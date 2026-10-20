<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Prepared queries used by administrator account management. */
final class AdminUserRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function page(string $search, int $afterId, int $limit): array
    {
        $sql = 'SELECT id, username, email, phone_number, role, coin_balance, free_coin_balance, phone_verified, is_suspended, created_at FROM users WHERE id > ?';
        $params = [$afterId];
        if ($search !== '') {
            $sql .= ' AND (username LIKE ? OR email LIKE ? OR phone_number LIKE ?)';
            $like = '%' . $search . '%';
            array_push($params, $like, $like, $like);
        }
        $sql .= ' ORDER BY id ASC LIMIT ' . (int)($limit + 1);
        $query = $this->pdo->prepare($sql);
        $query->execute($params);
        return $query->fetchAll();
    }

    public function updateFlag(string $id, string $field, bool $value): ?array
    {
        $column = $field === 'role' ? 'role' : 'is_suspended';
        $stored = $field === 'role' ? ($value ? 'admin' : 'student') : (int)$value;
        $query = $this->pdo->prepare("UPDATE users SET {$column} = ? WHERE id = ?");
        $query->execute([$stored, $id]);
        return $this->find($id);
    }

    public function giftFreeCoins(string $id, int $amount): ?array
    {
        $query = $this->pdo->prepare('UPDATE users SET free_coin_balance = free_coin_balance + ? WHERE id = ?');
        $query->execute([$amount, $id]);
        return $this->find($id);
    }

    public function find(string $id): ?array
    {
        $query = $this->pdo->prepare('SELECT id, username, email, phone_number, role, coin_balance, free_coin_balance, phone_verified, is_suspended, created_at FROM users WHERE id = ? LIMIT 1');
        $query->execute([$id]);
        return $query->fetch() ?: null;
    }

    public function adminCount(): int
    {
        return (int)$this->pdo->query("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'super_admin')")->fetchColumn();
    }
}
