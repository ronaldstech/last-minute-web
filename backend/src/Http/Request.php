<?php
declare(strict_types=1);

namespace LastMinute\Http;

use LastMinute\Config\Environment;

/** Immutable view of method, normalized route, JSON body, and bearer token. */
final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        private readonly string $rawBody,
        private readonly array $headers,
        private readonly array $query = [],
        private readonly array $files = [],
    ) {}

    /** Build a request from PHP's current HTTP globals. */
    public static function fromGlobals(): self
    {
        $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $prefix = rtrim(Environment::get('API_PATH_PREFIX', '/backend/public') ?? '', '/');
        if ($prefix !== '' && ($uriPath === $prefix || str_starts_with($uriPath, $prefix . '/'))) {
            $uriPath = substr($uriPath, strlen($prefix));
        } else {
            // The backend may be hosted below a project subdirectory, such as
            // /rt/last_minute/backend/public. Strip its public API segment too.
            $deployedPrefix = '/backend/public';
            $prefixPosition = strrpos($uriPath, $deployedPrefix);
            if ($prefixPosition !== false) {
                $suffix = substr($uriPath, $prefixPosition + strlen($deployedPrefix));
                if ($suffix === '' || str_starts_with($suffix, '/')) {
                    $uriPath = $suffix;
                }
            } else {
                // Keep compatibility with deployments that expose the API as /api.
                $uriPath = preg_replace('~^/api(?=/|$)~', '', $uriPath) ?: '/';
            }
        }
        $path = $uriPath ?: '/';
        if ($path === '') $path = '/';
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        if (!isset($headers['Authorization']) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
        }
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), $path, file_get_contents('php://input') ?: '', $headers, $_GET, $_FILES);
    }

    public function query(string $key, string $default = ''): string
    {
        return is_scalar($this->query[$key] ?? null) ? (string)$this->query[$key] : $default;
    }

    public function file(string $key): ?array
    {
        $file = $this->files[$key] ?? null;
        return is_array($file) ? $file : null;
    }

    /** Decode a JSON request body or fail with a client-safe validation error. */
    public function json(): array
    {
        try {
            $data = json_decode($this->rawBody ?: '', true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException('Send a valid JSON request.', 400);
        }
        if (!is_array($data)) throw new ApiException('Send a valid JSON request.', 400);
        return $data;
    }

    /** Return a syntactically valid opaque bearer token, if supplied. */
    public function bearerToken(): ?string
    {
        $authorization = $this->headers['Authorization'] ?? $this->headers['authorization'] ?? '';
        if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', (string)$authorization, $match)) return null;
        return strtolower($match[1]);
    }

}
