<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Encapsulates prepared SQL queries for account records. */
final class UserRepository
{
    public function __construct(private readonly PDO $pdo) {}

    /** Find an account by its normalized email address. */
    public function findByEmail(string $email): ?array
    {
        $query = $this->pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $query->execute([$email]);
        return $query->fetch() ?: null;
    }

    /** Return whether either unique signup identifier is already in use. */
    public function emailOrPhoneExists(string $email, string $phone): bool
    {
        $query = $this->pdo->prepare('SELECT id FROM users WHERE email = ? OR phone_number = ? LIMIT 1');
        $query->execute([$email, $phone]);
        return (bool)$query->fetch();
    }

    /** Insert a student account and return the complete database record. */
    public function create(string $name, string $email, string $phone, string $passwordHash): array
    {
        $insert = $this->pdo->prepare("INSERT INTO users (username, email, phone_number, password_hash, role, coin_balance, free_coin_balance) VALUES (?, ?, ?, ?, 'student', 0, 50)");
        $insert->execute([$name, $email, $phone, $passwordHash]);
        return $this->findById((string)$this->pdo->lastInsertId()) ?? throw new \RuntimeException('Created account could not be reloaded.');
    }

    /** Find an account by its database ID. */
    public function findById(string $id): ?array
    {
        $query = $this->pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $query->execute([$id]);
        return $query->fetch() ?: null;
    }

    /** Persist a replacement password hash after an algorithm upgrade. */
    public function updatePasswordHash(string $id, string $passwordHash): void
    {
        $query = $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $query->execute([$passwordHash, $id]);
    }
}
