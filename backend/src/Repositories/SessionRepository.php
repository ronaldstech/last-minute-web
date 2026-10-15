<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Stores only SHA-256 token digests and manages expiring login sessions. */
final class SessionRepository
{
    public function __construct(private readonly PDO $pdo) {}

    /** Remove expired tokens and persist a new token digest. */
    public function create(string $tokenHash, string $userId, string $expiresAt): void
    {
        $this->pdo->exec('DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP()');
        $insert = $this->pdo->prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
        $insert->execute([$tokenHash, $userId, $expiresAt]);
    }

    /** Load an active account from the supplied token digest. */
    public function findActiveUser(string $tokenHash): ?array
    {
        $query = $this->pdo->prepare('SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.is_suspended = 0 LIMIT 1');
        $query->execute([$tokenHash]);
        return $query->fetch() ?: null;
    }

    /** Revoke one login token. */
    public function delete(string $tokenHash): void
    {
        $query = $this->pdo->prepare('DELETE FROM user_sessions WHERE token_hash = ?');
        $query->execute([$tokenHash]);
    }
}
