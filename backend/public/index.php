<?php
declare(strict_types=1);

function env_value(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    if ($value !== false) return $value;
    static $fileEnv = null;
    if ($fileEnv === null) {
        $file = dirname(__DIR__) . '/.env';
        $fileEnv = is_file($file) ? parse_ini_file($file, false, INI_SCANNER_RAW) : [];
    }
    return $fileEnv[$key] ?? $default;
}

function respond(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function database(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) return $connection;
    $host = env_value('DB_HOST', '127.0.0.1');
    $port = env_value('DB_PORT', '3306');
    $name = env_value('DB_NAME', 'last_minute');
    $charset = env_value('DB_CHARSET', 'utf8mb4');
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
    $connection = new PDO($dsn, env_value('DB_USER', 'root'), env_value('DB_PASSWORD', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $connection;
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    $value = json_decode($raw ?: '', true);
    if (!is_array($value)) respond(400, ['message' => 'Send a valid JSON request.']);
    return $value;
}

function public_user(array $row): array
{
    return [
        'id' => (string)$row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'phoneNumber' => $row['phone_number'],
        'role' => $row['role'],
        'isAdmin' => $row['role'] === 'admin',
        'coinBalance' => (int)$row['coin_balance'],
        'freeCoinBalance' => (int)$row['free_coin_balance'],
        'phoneVerified' => (bool)$row['phone_verified'],
        'createdAt' => $row['created_at'],
    ];
}

function issue_session(PDO $pdo, array $user): never
{
    $token = bin2hex(random_bytes(32));
    $expires = new DateTimeImmutable('+30 days', new DateTimeZone('UTC'));
    $save = $pdo->prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
    $save->execute([hash('sha256', $token), $user['id'], $expires->format('Y-m-d H:i:s')]);
    respond(200, [
        'token' => $token,
        'expiresAt' => $expires->getTimestamp() * 1000,
        'user' => public_user($user),
    ]);
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $header, $match)) return null;
    return strtolower($match[1]);
}

function authenticated_user(PDO $pdo): array
{
    $token = bearer_token();
    if ($token === null) respond(401, ['message' => 'Your session has expired. Sign in again.']);
    $query = $pdo->prepare('SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() LIMIT 1');
    $query->execute([hash('sha256', $token)]);
    $user = $query->fetch();
    if (!$user) respond(401, ['message' => 'Your session has expired. Sign in again.']);
    return $user;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', env_value('APP_ORIGINS', 'http://localhost:5173') ?? '')));
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $pdo = database();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/');
    $path = preg_replace('~^/api(?=/|$)~', '', $path) ?: '/';
    if ($path === '') $path = '/';

    if ($method === 'POST' && $path === '/auth/register') {
        $input = request_json();
        $name = trim((string)($input['name'] ?? ''));
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $phone = preg_replace('/[\s()-]/', '', (string)($input['phone'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $nameCharacterCount = preg_match_all('/./us', $name, $nameCharacters);
        if ($name === '' || $nameCharacterCount === false || $nameCharacterCount > 120) respond(422, ['message' => 'Enter your name (up to 120 characters).']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) respond(422, ['message' => 'Enter a valid email address.']);
        if (!preg_match('/^(?:\+?265)?0?9\d{8}$/', $phone)) respond(422, ['message' => 'Enter a valid Malawi mobile number.']);
        if (str_starts_with($phone, '+265')) $phone = '+265' . ltrim(substr($phone, 4), '0');
        elseif (str_starts_with($phone, '265')) $phone = '+265' . ltrim(substr($phone, 3), '0');
        else $phone = '+265' . ltrim(substr($phone, -9), '0');
        if (strlen($password) < 8) respond(422, ['message' => 'Choose a password with at least 8 characters.']);

        $exists = $pdo->prepare('SELECT id FROM users WHERE email = ? OR phone_number = ? LIMIT 1');
        $exists->execute([$email, $phone]);
        if ($exists->fetch()) respond(409, ['message' => 'An account already exists for that email or phone number.']);

        $pdo->beginTransaction();
        try {
            $insert = $pdo->prepare("INSERT INTO users (username, email, phone_number, password_hash, role, coin_balance, free_coin_balance) VALUES (?, ?, ?, ?, 'student', 0, 50)");
            $insert->execute([$name, $email, $phone, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int)$pdo->lastInsertId();
            $getUser = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $getUser->execute([$userId]);
            $user = $getUser->fetch();
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        issue_session($pdo, $user);
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $input = request_json();
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        $query = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $query->execute([$email]);
        $user = $query->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) respond(401, ['message' => 'The email or password is incorrect.']);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
            $update->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        }
        issue_session($pdo, $user);
    }

    if ($method === 'GET' && $path === '/auth/me') {
        respond(200, ['user' => public_user(authenticated_user($pdo))]);
    }

    if ($method === 'POST' && $path === '/auth/logout') {
        $token = bearer_token();
        if ($token !== null) {
            $delete = $pdo->prepare('DELETE FROM user_sessions WHERE token_hash = ?');
            $delete->execute([hash('sha256', $token)]);
        }
        respond(200, ['message' => 'Signed out.']);
    }

    respond(404, ['message' => 'API route not found.']);
} catch (Throwable $error) {
    error_log($error->__toString());
    respond(500, ['message' => 'The account service could not complete the request. Check the PHP and MySQL server logs.']);
}
