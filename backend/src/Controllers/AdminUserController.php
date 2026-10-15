<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AdminUserRepository;
use LastMinute\Support\UserSerializer;

/** Admin-only user listing and account actions. */
final class AdminUserController
{
    public function __construct(private readonly AdminUserRepository $users, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $this->requireAdmin($request);
        $limit = max(1, min(100, (int)$request->query('limit', '40')));
        $cursor = $request->query('cursor', '0');
        if (!preg_match('/^(?:0|[1-9][0-9]{0,18})$/', $cursor)) throw new ApiException('The user page cursor is invalid.', 400);
        $rows = $this->users->page(trim($request->query('search')), (int)$cursor, $limit);
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        return ['data' => ['users' => array_map([UserSerializer::class, 'public'], $rows), 'nextCursor' => $hasMore ? (string)end($rows)['id'] : null]];
    }

    public function update(Request $request): array
    {
        $admin = $this->requireAdmin($request);
        $id = $request->query('id');
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('A valid user ID is required.', 422);
        $input = $request->json();
        if (array_keys($input) === ['isAdmin'] && is_bool($input['isAdmin'])) {
            if ($id === $admin['id']) throw new ApiException('You cannot change your own administrator access.', 409);
            if (!$input['isAdmin'] && $this->users->adminCount() <= 1) throw new ApiException('At least one administrator account must remain.', 409);
            $row = $this->users->updateFlag($id, 'role', $input['isAdmin']);
        } elseif (array_keys($input) === ['isSuspended'] && is_bool($input['isSuspended'])) {
            if ($id === $admin['id'] && $input['isSuspended']) throw new ApiException('You cannot suspend your own account.', 409);
            $row = $this->users->updateFlag($id, 'isSuspended', $input['isSuspended']);
        } else {
            throw new ApiException('Set either isAdmin or isSuspended to a boolean value.', 422);
        }
        if (!$row) throw new ApiException('User not found.', 404);
        return ['data' => ['user' => UserSerializer::public($row)]];
    }

    public function gift(Request $request): array
    {
        $this->requireAdmin($request);
        $id = $request->query('id');
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('A valid user ID is required.', 422);
        $input = $request->json();
        $amount = filter_var($input['amount'] ?? null, FILTER_VALIDATE_INT);
        if ($amount === false || $amount < 1 || $amount > 100000) throw new ApiException('Gift amount must be a whole number from 1 to 100000.', 422);
        $row = $this->users->giftFreeCoins($id, $amount);
        if (!$row) throw new ApiException('User not found.', 404);
        return ['data' => ['user' => UserSerializer::public($row)]];
    }

    private function requireAdmin(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (!$admin['isAdmin']) throw new ApiException('Administrator access is required.', 403);
        return $admin;
    }
}
