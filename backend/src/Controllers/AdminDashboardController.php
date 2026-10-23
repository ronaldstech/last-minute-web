<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use PDO;

/** MySQL-backed overview counts for the administrator dashboard. */
final class AdminDashboardController
{
    public function __construct(private readonly PDO $pdo, private readonly Authenticate $authenticate) {}

    public function show(Request $request): array
    {
        if (!$this->authenticate->user($request)['isAdmin']) {
            throw new ApiException('Administrator access is required.', 403);
        }

        return ['data' => ['summary' => [
            'users' => (int)$this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
            'papers' => (int)$this->pdo->query('SELECT COUNT(*) FROM papers')->fetchColumn(),
            'groups' => (int)$this->pdo->query('SELECT COUNT(*) FROM study_groups')->fetchColumn(),
        ]]];
    }
}
