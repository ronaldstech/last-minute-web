<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** MySQL wallet balances and user-owned top-up history. */
final class WalletRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function show(string $userId): array
    {
        $user = $this->pdo->prepare('SELECT id, username, email, phone_number AS phoneNumber, coin_balance AS coinBalance, free_coin_balance AS freeCoinBalance FROM users WHERE id = ? LIMIT 1');
        $user->execute([$userId]);
        $profile = $user->fetch();
        if (!$profile) return ['user' => null, 'transactions' => []];
        $profile['id'] = (string)$profile['id'];
        $profile['coinBalance'] = (int)$profile['coinBalance'];
        $profile['freeCoinBalance'] = (int)$profile['freeCoinBalance'];

        $statement = $this->pdo->prepare('SELECT charge_id AS chargeId, operator_id AS operatorId, operator_name AS operatorName, mobile, coins, amount_mwk AS amountMwk, status, tx_ref AS txRef, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
        $statement->execute([$userId]);
        $transactions = $statement->fetchAll();
        foreach ($transactions as &$transaction) {
            $transaction['coins'] = (int)$transaction['coins'];
            $transaction['amountMwk'] = (int)$transaction['amountMwk'];
        }
        unset($transaction);
        return ['user' => $profile, 'transactions' => $transactions];
    }

    public function create(string $userId, array $input): array
    {
        $id = 'LM' . strtoupper(bin2hex(random_bytes(14)));
        $statement = $this->pdo->prepare("INSERT INTO wallet_transactions (charge_id, user_id, operator_id, operator_name, mobile, coins, amount_mwk, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')");
        $statement->execute([$id, $userId, $input['operatorId'], $input['operatorName'], $input['mobile'], $input['coins'], $input['amountMwk']]);
        return $this->find($userId, $id) ?? throw new \RuntimeException('The wallet transaction could not be loaded.');
    }

    public function find(string $userId, string $chargeId, bool $lock = false): ?array
    {
        $statement = $this->pdo->prepare('SELECT charge_id AS chargeId, user_id AS userId, operator_id AS operatorId, operator_name AS operatorName, mobile, coins, amount_mwk AS amountMwk, status, tx_ref AS txRef, failure_reason AS failureReason, credited, created_at AS createdAt, updated_at AS updatedAt FROM wallet_transactions WHERE user_id = ? AND charge_id = ? LIMIT 1' . ($lock ? ' FOR UPDATE' : ''));
        $statement->execute([$userId, $chargeId]);
        $row = $statement->fetch();
        if (!$row) return null;
        $row['coins'] = (int)$row['coins'];
        $row['amountMwk'] = (int)$row['amountMwk'];
        $row['credited'] = (bool)$row['credited'];
        return $row;
    }

    public function setReference(string $userId, string $chargeId, string $txRef): void
    {
        $statement = $this->pdo->prepare("UPDATE wallet_transactions SET tx_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND charge_id = ? AND status = 'pending'");
        $statement->execute([$txRef, $userId, $chargeId]);
    }

    /** Persist a provider result and grant the balance once, under row locks. */
    public function applyVerification(string $userId, string $chargeId, string $status, string $reason = ''): array
    {
        $this->pdo->beginTransaction();
        try {
            $transaction = $this->find($userId, $chargeId, true);
            if (!$transaction) throw new \RuntimeException('Wallet transaction disappeared during verification.');
            if ($transaction['status'] === 'paid' && $transaction['credited']) {
                $this->pdo->commit();
                return $this->show($userId);
            }

            if ($status === 'paid' && !$transaction['credited']) {
                $credit = $this->pdo->prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?');
                $credit->execute([$transaction['coins'], $userId]);
                $update = $this->pdo->prepare("UPDATE wallet_transactions SET status = 'paid', credited = 1, failure_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND charge_id = ?");
                $update->execute([$userId, $chargeId]);
            } elseif ($status === 'failed' && $transaction['status'] !== 'paid') {
                $update = $this->pdo->prepare("UPDATE wallet_transactions SET status = 'failed', failure_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND charge_id = ?");
                $update->execute([mb_substr($reason, 0, 500), $userId, $chargeId]);
            } elseif ($transaction['status'] !== 'paid') {
                $update = $this->pdo->prepare("UPDATE wallet_transactions SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND charge_id = ?");
                $update->execute([$userId, $chargeId]);
            }
            $this->pdo->commit();
            return $this->show($userId);
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }
}
