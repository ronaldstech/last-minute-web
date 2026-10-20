<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** System wide coin and paper unlock analytics for administrators. */
final class AdminAccountHistoryRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function analytics(): array
    {
        $summary = $this->pdo->query("SELECT COUNT(*) AS unlocks, COUNT(DISTINCT user_id) AS usersUnlocking, COALESCE(SUM(free_coins_spent), 0) AS freeCoinsSpent, COALESCE(SUM(purchased_coins_spent), 0) AS purchasedCoinsSpent FROM user_paper_unlock_events")->fetch() ?: [];
        $topUps = $this->pdo->query("SELECT COUNT(*) AS successfulTopUps, COALESCE(SUM(amount_mwk), 0) AS topUpAmountMwk, COALESCE(SUM(coins), 0) AS coinsAdded FROM wallet_transactions WHERE status = 'paid' AND credited = 1")->fetch() ?: [];
        $active = (int)$this->pdo->query('SELECT COUNT(*) FROM user_paper_unlocks WHERE unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)')->fetchColumn();

        $users = $this->pdo->query("SELECT u.id AS userId, u.username, u.email, u.coin_balance AS coinBalance, u.free_coin_balance AS freeCoinBalance, COALESCE(unlocks.unlockCount, 0) AS unlockCount, COALESCE(unlocks.freeCoinsSpent, 0) AS freeCoinsSpent, COALESCE(unlocks.purchasedCoinsSpent, 0) AS purchasedCoinsSpent, unlocks.lastUnlockedAt AS lastUnlockedAt, COALESCE(topups.topUpCount, 0) AS topUpCount, COALESCE(topups.topUpAmountMwk, 0) AS topUpAmountMwk FROM users u LEFT JOIN (SELECT user_id, COUNT(*) AS unlockCount, SUM(free_coins_spent) AS freeCoinsSpent, SUM(purchased_coins_spent) AS purchasedCoinsSpent, MAX(unlocked_at) AS lastUnlockedAt FROM user_paper_unlock_events GROUP BY user_id) unlocks ON unlocks.user_id = u.id LEFT JOIN (SELECT user_id, COUNT(*) AS topUpCount, SUM(amount_mwk) AS topUpAmountMwk FROM wallet_transactions WHERE status = 'paid' AND credited = 1 GROUP BY user_id) topups ON topups.user_id = u.id ORDER BY (COALESCE(unlocks.freeCoinsSpent, 0) + COALESCE(unlocks.purchasedCoinsSpent, 0)) DESC, u.id DESC")->fetchAll();
        foreach ($users as &$user) {
            foreach (['coinBalance', 'freeCoinBalance', 'unlockCount', 'freeCoinsSpent', 'purchasedCoinsSpent', 'topUpCount', 'topUpAmountMwk'] as $field) $user[$field] = (int)$user[$field];
            $user['userId'] = (string)$user['userId'];
        }
        unset($user);

        $unlockEvents = $this->pdo->query("SELECT CONCAT('unlock-', e.id) AS id, 'paper_unlock' AS action, u.id AS userId, u.username, u.email, p.id AS paperId, p.title AS paperTitle, p.course, e.free_coins_spent AS freeCoinsSpent, e.purchased_coins_spent AS purchasedCoinsSpent, NULL AS amountMwk, e.unlocked_at AS createdAt FROM user_paper_unlock_events e JOIN users u ON u.id = e.user_id JOIN papers p ON p.id = e.paper_id ORDER BY e.unlocked_at DESC, e.id DESC LIMIT 100")->fetchAll();
        $topUpEvents = $this->pdo->query("SELECT CONCAT('topup-', t.charge_id) AS id, 'coin_top_up' AS action, u.id AS userId, u.username, u.email, NULL AS paperId, t.operator_name AS paperTitle, 0 AS freeCoinsSpent, 0 AS purchasedCoinsSpent, t.amount_mwk AS amountMwk, t.created_at AS createdAt FROM wallet_transactions t JOIN users u ON u.id = t.user_id WHERE t.status = 'paid' AND t.credited = 1 ORDER BY t.created_at DESC LIMIT 100")->fetchAll();
        $events = array_merge($unlockEvents, $topUpEvents);
        usort($events, static fn(array $left, array $right): int => strcmp((string)$right['createdAt'], (string)$left['createdAt']));
        $events = array_slice($events, 0, 100);
        foreach ($events as &$event) {
            $event['userId'] = (string)$event['userId'];
            foreach (['freeCoinsSpent', 'purchasedCoinsSpent', 'amountMwk'] as $field) $event[$field] = $event[$field] === null ? null : (int)$event[$field];
        }
        unset($event);

        $freeCoins = (int)($summary['freeCoinsSpent'] ?? 0);
        $purchasedCoins = (int)($summary['purchasedCoinsSpent'] ?? 0);
        return [
            'summary' => [
                'users' => count($users),
                'usersUnlocking' => (int)($summary['usersUnlocking'] ?? 0),
                'unlocks' => (int)($summary['unlocks'] ?? 0),
                'activeUnlocks' => $active,
                'freeCoinsSpent' => $freeCoins,
                'purchasedCoinsSpent' => $purchasedCoins,
                'totalCoinsSpent' => $freeCoins + $purchasedCoins,
                'successfulTopUps' => (int)($topUps['successfulTopUps'] ?? 0),
                'topUpAmountMwk' => (int)($topUps['topUpAmountMwk'] ?? 0),
                'coinsAdded' => (int)($topUps['coinsAdded'] ?? 0),
            ],
            'users' => $users,
            'events' => $events,
        ];
    }
}
