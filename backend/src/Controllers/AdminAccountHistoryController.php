<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AdminAccountHistoryRepository;
use PDOException;

final class AdminAccountHistoryController
{
    public function __construct(private readonly AdminAccountHistoryRepository $history, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        if (empty($user['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        try {
            return ['data' => $this->history->analytics()];
        } catch (PDOException $error) {
            if ($error->getCode() === '42S02') throw new ApiException('Account history analytics needs database migrations 011_add_wallet_transactions.sql and 018_add_paper_unlock_history.sql.', 503);
            error_log('[admin-account-history] ' . $error);
            throw new ApiException('Account history analytics failed with database error ' . $error->getCode() . '. Check the PHP error log for details.', 500);
        }
    }
}
