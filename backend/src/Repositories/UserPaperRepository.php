<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** SQL access to the paper library and a user's saved/unlocked paper state. */
final class UserPaperRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function listForUser(string $userId): array
    {
        $query = $this->pdo->prepare('SELECT p.id, p.title, p.course, p.year, p.semester, p.department_id, p.department_name, p.programme_assignments, p.question_count, p.created_at, p.updated_at, (s.paper_id IS NOT NULL) AS is_saved, (u.paper_id IS NOT NULL) AS is_unlocked, UNIX_TIMESTAMP(DATE_ADD(u.unlocked_at, INTERVAL 24 HOUR)) AS unlock_expires_at FROM papers p LEFT JOIN user_saved_papers s ON s.paper_id = p.id AND s.user_id = ? LEFT JOIN user_paper_unlocks u ON u.paper_id = p.id AND u.user_id = ? AND u.unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR) ORDER BY p.year DESC, p.id DESC LIMIT 1000');
        $query->execute([$userId, $userId]);
        return array_map(static function (array $row): array {
            $paper = AdminPaperRepository::serialize($row);
            $paper['isSaved'] = (bool)$row['is_saved'];
            $paper['isUnlocked'] = (bool)$row['is_unlocked'];
            $paper['unlockExpiresAt'] = $row['unlock_expires_at'] === null ? null : (int)$row['unlock_expires_at'] * 1000;
            return $paper;
        }, $query->fetchAll());
    }

    public function findForUser(string $userId, string $paperId): ?array
    {
        $query = $this->pdo->prepare('SELECT p.id, p.title, p.course, p.year, p.semester, p.department_id, p.department_name, p.questions, p.programme_assignments, p.question_count, p.created_at, p.updated_at, (s.paper_id IS NOT NULL) AS is_saved, (u.paper_id IS NOT NULL) AS is_unlocked, UNIX_TIMESTAMP(DATE_ADD(u.unlocked_at, INTERVAL 24 HOUR)) AS unlock_expires_at FROM papers p LEFT JOIN user_saved_papers s ON s.paper_id = p.id AND s.user_id = ? LEFT JOIN user_paper_unlocks u ON u.paper_id = p.id AND u.user_id = ? AND u.unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR) WHERE p.id = ? LIMIT 1');
        $query->execute([$userId, $userId, $paperId]);
        $row = $query->fetch();
        if (!$row) return null;
        $unlocked = (bool)$row['is_unlocked'];
        $paper = AdminPaperRepository::serialize($row, $unlocked);
        $paper['isSaved'] = (bool)$row['is_saved'];
        $paper['isUnlocked'] = $unlocked;
        $paper['unlockExpiresAt'] = $row['unlock_expires_at'] === null ? null : (int)$row['unlock_expires_at'] * 1000;
        return $paper;
    }

    public function exists(string $paperId): bool
    {
        $query = $this->pdo->prepare('SELECT id FROM papers WHERE id = ? LIMIT 1');
        $query->execute([$paperId]);
        return (bool)$query->fetchColumn();
    }

    public function setSaved(string $userId, string $paperId, bool $saved): void
    {
        if ($saved) {
            $query = $this->pdo->prepare('INSERT IGNORE INTO user_saved_papers (user_id, paper_id) VALUES (?, ?)');
            $query->execute([$userId, $paperId]);
            return;
        }
        $query = $this->pdo->prepare('DELETE FROM user_saved_papers WHERE user_id = ? AND paper_id = ?');
        $query->execute([$userId, $paperId]);
    }

    /** Charge free coins first, then purchased coins for each 24-hour access period. */
    public function unlock(string $userId, string $paperId, int $cost): array
    {
        $this->pdo->beginTransaction();
        try {
            $paper = $this->pdo->prepare('SELECT id FROM papers WHERE id = ? FOR UPDATE');
            $paper->execute([$paperId]);
            if (!$paper->fetchColumn()) {
                $this->pdo->rollBack();
                return ['paperFound' => false, 'alreadyUnlocked' => false, 'affordable' => false];
            }

            $existing = $this->pdo->prepare('SELECT paper_id, (unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)) AS is_active FROM user_paper_unlocks WHERE user_id = ? AND paper_id = ? LIMIT 1');
            $existing->execute([$userId, $paperId]);
            $existingUnlock = $existing->fetch();
            $alreadyUnlocked = $existingUnlock && (bool)$existingUnlock['is_active'];

            $wallet = $this->pdo->prepare('SELECT coin_balance, free_coin_balance FROM users WHERE id = ? FOR UPDATE');
            $wallet->execute([$userId]);
            $balances = $wallet->fetch();
            if (!$balances) {
                $this->pdo->rollBack();
                return ['paperFound' => true, 'alreadyUnlocked' => false, 'affordable' => false];
            }

            if (!$alreadyUnlocked) {
                $freeSpent = min((int)$balances['free_coin_balance'], $cost);
                $purchasedSpent = $cost - $freeSpent;
                if ((int)$balances['coin_balance'] < $purchasedSpent) {
                    $this->pdo->commit();
                    return ['paperFound' => true, 'alreadyUnlocked' => false, 'affordable' => false, 'coinBalance' => (int)$balances['coin_balance'], 'freeCoinBalance' => (int)$balances['free_coin_balance']];
                }
                $charge = $this->pdo->prepare('UPDATE users SET free_coin_balance = free_coin_balance - ?, coin_balance = coin_balance - ? WHERE id = ?');
                $charge->execute([$freeSpent, $purchasedSpent, $userId]);
                if ($existingUnlock) {
                    $record = $this->pdo->prepare('UPDATE user_paper_unlocks SET free_coins_spent = free_coins_spent + ?, purchased_coins_spent = purchased_coins_spent + ?, unlocked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND paper_id = ?');
                    $record->execute([$freeSpent, $purchasedSpent, $userId, $paperId]);
                } else {
                    $record = $this->pdo->prepare('INSERT INTO user_paper_unlocks (user_id, paper_id, free_coins_spent, purchased_coins_spent) VALUES (?, ?, ?, ?)');
                    $record->execute([$userId, $paperId, $freeSpent, $purchasedSpent]);
                }
                $balances['free_coin_balance'] = (int)$balances['free_coin_balance'] - $freeSpent;
                $balances['coin_balance'] = (int)$balances['coin_balance'] - $purchasedSpent;
            }
            $this->pdo->commit();
            return ['paperFound' => true, 'alreadyUnlocked' => $alreadyUnlocked, 'affordable' => true, 'coinBalance' => (int)$balances['coin_balance'], 'freeCoinBalance' => (int)$balances['free_coin_balance']];
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }
}
