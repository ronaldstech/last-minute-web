<?php
declare(strict_types=1);

namespace LastMinute\Http;

/** Immutable view of method, normalized route, JSON body, and bearer token. */
final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        private readonly string $rawBody,
        private readonly array $headers,
    ) {}

    /** Build a request from PHP's current HTTP globals. */
    public static function fromGlobals(): self
    {
        $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = preg_replace('~^/api(?=/|$)~', '', $uriPath) ?: '/';
        if ($path === '') $path = '/';
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        if (!isset($headers['Authorization']) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
        }
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), $path, file_get_contents('php://input') ?: '', $headers);
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
