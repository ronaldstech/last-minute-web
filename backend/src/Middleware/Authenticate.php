<?php
declare(strict_types=1);

namespace LastMinute\Middleware;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Repositories\SessionRepository;
use LastMinute\Support\UserSerializer;

/** Resolves and validates bearer sessions for protected API handlers. */
final class Authenticate
{
    public function __construct(private readonly SessionRepository $sessions) {}

    /** Return a public account object or raise a 401 response error. */
    public function user(Request $request): array
    {
        $token = $request->bearerToken();
        if ($token === null) throw new ApiException('The account service did not receive a valid bearer token.', 401);
        $row = $this->sessions->findActiveUser(hash('sha256', $token));
        if (!$row) throw new ApiException('Your session has expired. Sign in again.', 401);
        return UserSerializer::public($row);
    }
}
