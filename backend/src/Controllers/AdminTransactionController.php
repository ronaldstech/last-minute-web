<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AdminTransactionRepository;
use PDOException;

final class AdminTransactionController
{
    public function __construct(private readonly AdminTransactionRepository $transactions, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (empty($admin['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        $limit = max(1, min(100, (int)$request->query('limit', '50')));
        $cursor = $request->query('cursor', '0');
        if (!preg_match('/^(?:0|[1-9][0-9]{0,8})$/', $cursor)) throw new ApiException('The transaction page cursor is invalid.', 400);
        try {
            $page = $this->transactions->page((int)$cursor, $limit);
            $nextOffset = (int)$cursor + count($page['transactions']);
            return ['data' => ['transactions' => $page['transactions'], 'nextCursor' => $nextOffset < $page['totalCount'] ? (string)$nextOffset : null, 'totalCount' => $page['totalCount']]];
        } catch (PDOException $error) {
            if ($error->getCode() === '42S02') throw new ApiException('The wallet transactions table is not available. Apply migration 011_add_wallet_transactions.sql.', 503);
            error_log('[admin-transactions] ' . $error);
            throw new ApiException('Transactions could not be loaded. Check the PHP error log for details.', 500);
        }
    }
}
