<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Read-only wallet transaction records for the admin workspace. */
final class AdminTransactionRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function page(int $offset, int $limit): array
    {
        $count = (int)$this->pdo->query('SELECT COUNT(*) FROM wallet_transactions')->fetchColumn();
        $query = $this->pdo->query('SELECT t.charge_id AS chargeId, t.user_id AS userId, u.username, u.email, t.operator_name AS operatorName, t.operator_id AS operatorId, t.mobile, t.coins, t.amount_mwk AS amountMwk, t.status, t.tx_ref AS txRef, t.failure_reason AS failureReason, t.credited, t.created_at AS createdAt, t.updated_at AS updatedAt FROM wallet_transactions t JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC, t.charge_id DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset);
        $transactions = $query->fetchAll();
        foreach ($transactions as &$transaction) {
            $transaction['userId'] = (string)$transaction['userId'];
            $transaction['coins'] = (int)$transaction['coins'];
            $transaction['amountMwk'] = (int)$transaction['amountMwk'];
            $transaction['credited'] = (bool)$transaction['credited'];
        }
        unset($transaction);
        return ['transactions' => $transactions, 'totalCount' => $count];
    }
}
