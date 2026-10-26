<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** SQL access to the paper library and a user's saved/unlocked paper state. */
final class UserPaperRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function listForUser(string $userId, bool $unlockedForSuperAdmin = false): array
    {
        $query = $this->pdo->prepare('SELECT p.id, p.title, p.course, p.year, p.semester, p.instructions, p.department_id, p.department_name, p.programme_assignments, p.question_count, p.created_at, p.updated_at, (s.paper_id IS NOT NULL) AS is_saved, (u.paper_id IS NOT NULL) AS is_unlocked, UNIX_TIMESTAMP(DATE_ADD(u.unlocked_at, INTERVAL u.unlock_duration_days DAY)) AS unlock_expires_at FROM papers p LEFT JOIN user_saved_papers s ON s.paper_id = p.id AND s.user_id = ? LEFT JOIN user_paper_unlocks u ON u.paper_id = p.id AND u.user_id = ? AND u.unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL u.unlock_duration_days DAY) ORDER BY p.year DESC, p.id DESC LIMIT 1000');
        $query->execute([$userId, $userId]);
        $papers = array_map(static function (array $row) use ($unlockedForSuperAdmin): array {
            $paper = AdminPaperRepository::serialize($row);
            $paper['isSaved'] = (bool)$row['is_saved'];
            $paper['isUnlocked'] = $unlockedForSuperAdmin || (bool)$row['is_unlocked'];
            $paper['unlockExpiresAt'] = $unlockedForSuperAdmin || $row['unlock_expires_at'] === null ? null : (int)$row['unlock_expires_at'] * 1000;
            return $paper;
        }, $query->fetchAll());
        return $this->attachProgrammeAliases($papers);
    }

    public function findForUser(string $userId, string $paperId, bool $unlockedForSuperAdmin = false): ?array
    {
        $query = $this->pdo->prepare('SELECT p.id, p.title, p.course, p.year, p.semester, p.instructions, p.department_id, p.department_name, p.questions, p.programme_assignments, p.question_count, p.created_at, p.updated_at, (s.paper_id IS NOT NULL) AS is_saved, (u.paper_id IS NOT NULL) AS is_unlocked, UNIX_TIMESTAMP(DATE_ADD(u.unlocked_at, INTERVAL u.unlock_duration_days DAY)) AS unlock_expires_at FROM papers p LEFT JOIN user_saved_papers s ON s.paper_id = p.id AND s.user_id = ? LEFT JOIN user_paper_unlocks u ON u.paper_id = p.id AND u.user_id = ? AND u.unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL u.unlock_duration_days DAY) WHERE p.id = ? LIMIT 1');
        $query->execute([$userId, $userId, $paperId]);
        $row = $query->fetch();
        if (!$row) return null;
        $unlocked = $unlockedForSuperAdmin || (bool)$row['is_unlocked'];
        $paper = AdminPaperRepository::serialize($row, $unlocked);
        $paper['isSaved'] = (bool)$row['is_saved'];
        $paper['isUnlocked'] = $unlocked;
        $paper['unlockExpiresAt'] = $unlockedForSuperAdmin || $row['unlock_expires_at'] === null ? null : (int)$row['unlock_expires_at'] * 1000;
        return $paper;
    }

    public function exists(string $paperId): bool
    {
        $query = $this->pdo->prepare('SELECT id FROM papers WHERE id = ? LIMIT 1');
        $query->execute([$paperId]);
        return (bool)$query->fetchColumn();
    }

    public function history(string $userId): array
    {
        $query = $this->pdo->prepare('SELECT e.id, e.paper_id AS paperId, p.title AS paperTitle, p.course, p.year, e.free_coins_spent AS freeCoinsSpent, e.purchased_coins_spent AS purchasedCoinsSpent, e.unlocked_at AS createdAt, DATE_ADD(e.unlocked_at, INTERVAL e.unlock_duration_days DAY) AS expiresAt FROM user_paper_unlock_events e JOIN papers p ON p.id = e.paper_id WHERE e.user_id = ? ORDER BY e.unlocked_at DESC, e.id DESC LIMIT 500');
        $query->execute([$userId]);
        return $query->fetchAll();
    }

    public function markingHistory(string $userId): array
    {
        $query = $this->pdo->prepare("SELECT id, paper_id AS paperId, paper_title AS paperTitle, paper_course AS course, paper_year AS year, question_number AS questionNumber, max_marks AS maxMarks, score, status, coins_charged AS coinsCharged, error_code AS errorCode, created_at AS createdAt FROM marking_usage_events WHERE user_id = ? AND source_type = 'practice' ORDER BY created_at DESC, id DESC LIMIT 500");
        $query->execute([$userId]);
        return $query->fetchAll();
    }

    private function attachProgrammeAliases(array $papers): array
    {
        if (!$papers) return $papers;
        $aliases = $this->pdo->query("SELECT id, alias FROM academic_programmes WHERE alias IS NOT NULL AND alias <> ''")->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach ($papers as &$paper) {
            foreach ($paper['programmeAssignments'] as &$assignment) {
                if (!isset($assignment['alias']) && !isset($assignment['programmeAlias'])) {
                    $alias = $aliases[$assignment['programmeId'] ?? ''] ?? null;
                    if ($alias) $assignment['alias'] = $alias;
                }
            }
            unset($assignment);
        }
        unset($paper);
        return $papers;
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

    /** Charge free coins first, then purchased coins for the selected access period. */
    public function unlock(string $userId, string $paperId, int $cost, int $durationDays): array
    {
        $this->pdo->beginTransaction();
        try {
            $paper = $this->pdo->prepare('SELECT id FROM papers WHERE id = ? FOR UPDATE');
            $paper->execute([$paperId]);
            if (!$paper->fetchColumn()) {
                $this->pdo->rollBack();
                return ['paperFound' => false, 'alreadyUnlocked' => false, 'affordable' => false];
            }

            $existing = $this->pdo->prepare('SELECT paper_id, (unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL unlock_duration_days DAY)) AS is_active FROM user_paper_unlocks WHERE user_id = ? AND paper_id = ? LIMIT 1');
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
                    $record = $this->pdo->prepare('UPDATE user_paper_unlocks SET free_coins_spent = free_coins_spent + ?, purchased_coins_spent = purchased_coins_spent + ?, unlock_duration_days = ?, unlocked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND paper_id = ?');
                    $record->execute([$freeSpent, $purchasedSpent, $durationDays, $userId, $paperId]);
                } else {
                    $record = $this->pdo->prepare('INSERT INTO user_paper_unlocks (user_id, paper_id, free_coins_spent, purchased_coins_spent, unlock_duration_days) VALUES (?, ?, ?, ?, ?)');
                    $record->execute([$userId, $paperId, $freeSpent, $purchasedSpent, $durationDays]);
                }
                $event = $this->pdo->prepare('INSERT INTO user_paper_unlock_events (user_id, paper_id, free_coins_spent, purchased_coins_spent, unlock_duration_days) VALUES (?, ?, ?, ?, ?)');
                $event->execute([$userId, $paperId, $freeSpent, $purchasedSpent, $durationDays]);
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
