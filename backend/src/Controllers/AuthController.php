<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Services\AuthService;

/** HTTP adapter for account routes; business rules live in AuthService. */
final class AuthController
{
    public function __construct(private readonly AuthService $auth, private readonly Authenticate $authenticate) {}

    /** Register an account and return a bearer session. */
    public function register(Request $request): array
    {
        return ['status' => 201, 'data' => $this->auth->register($request->json())];
    }

    /** Sign in with email and password. */
    public function login(Request $request): array
    {
        return ['status' => 200, 'data' => $this->auth->login($request->json())];
    }

    /** Return the account associated with the current session. */
    public function me(Request $request): array
    {
        return ['status' => 200, 'data' => ['user' => $this->authenticate->user($request)]];
    }

    /** Revoke the current bearer session. */
    public function logout(Request $request): array
    {
        $this->auth->logout($request->bearerToken());
        return ['status' => 200, 'data' => ['message' => 'Signed out.']];
    }
}
