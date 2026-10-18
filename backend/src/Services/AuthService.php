<?php
declare(strict_types=1);

namespace LastMinute\Services;

use LastMinute\Http\ApiException;
use LastMinute\Repositories\SessionRepository;
use LastMinute\Repositories\UserRepository;
use LastMinute\Support\UserSerializer;
use PDO;
use PDOException;

/** Implements account registration, sign-in, session issuance, and logout. */
final class AuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
    ) {}

    /** Validate and create a new account, then return its signed-in session. */
    public function register(array $input): array
    {
        $name = trim((string)($input['name'] ?? ''));
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $phone = preg_replace('/[\s()-]/', '', (string)($input['phone'] ?? '')) ?? '';
        $password = (string)($input['password'] ?? '');
        $nameLength = preg_match_all('/./us', $name);
        if ($name === '' || $nameLength === false || $nameLength > 120) throw new ApiException('Enter your name (up to 120 characters).', 422);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) throw new ApiException('Enter a valid email address.', 422);
        if (!preg_match('/^(?:\+?265)?0?(?:99|98|88|89)\d{7}$/', $phone)) throw new ApiException('Enter a valid Malawi mobile number.', 422);
        $phone = $this->normalizeMalawiPhone($phone);
        if (strlen($password) < 8 || strlen($password) > 4096) throw new ApiException('Choose a password with at least 8 characters.', 422);
        if ($this->users->emailOrPhoneExists($email, $phone)) throw new ApiException('An account already exists for that email or phone number.', 409);

        $this->pdo->beginTransaction();
        try {
            $user = $this->users->create($name, $email, $phone, password_hash($password, PASSWORD_DEFAULT));
            $this->pdo->commit();
        } catch (PDOException $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            if ($error->getCode() === '23000') throw new ApiException('An account already exists for that email or phone number.', 409);
            throw $error;
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
        return $this->issueSession($user);
    }

    /** Validate credentials and issue an opaque bearer session. */
    public function login(array $input): array
    {
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        $user = $this->users->findByEmail($email);
        if (!$user || strlen($password) > 4096 || !password_verify($password, $user['password_hash'])) {
            throw new ApiException('The email or password is incorrect.', 401);
        }
        if (!empty($user['is_suspended'])) throw new ApiException('This account is suspended. Contact support for help.', 403);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $this->users->updatePasswordHash((string)$user['id'], $hash);
            $user['password_hash'] = $hash;
        }
        return $this->issueSession($user);
    }

    /** Revoke the supplied bearer session when one is present. */
    public function logout(?string $token): void
    {
        if ($token !== null) $this->sessions->delete(hash('sha256', $token));
    }

    /** Create a random client token while persisting only its digest. */
    private function issueSession(array $user): array
    {
        $token = bin2hex(random_bytes(32));
        $expiresAt = time() + 30 * 24 * 60 * 60;
        $this->sessions->create(hash('sha256', $token), (string)$user['id'], gmdate('Y-m-d H:i:s', $expiresAt));
        return [
            'token' => $token,
            'expiresAt' => $expiresAt * 1000,
            'user' => UserSerializer::public($user),
        ];
    }

    /** Normalize accepted local and international Malawi number formats. */
    private function normalizeMalawiPhone(string $phone): string
    {
        if (str_starts_with($phone, '+265')) return '+265' . ltrim(substr($phone, 4), '0');
        if (str_starts_with($phone, '265')) return '+265' . ltrim(substr($phone, 3), '0');
        return '+265' . ltrim(substr($phone, -9), '0');
    }
}
