<?php
declare(strict_types=1);

namespace LastMinute\Http;

/** Writes consistent JSON responses and terminates the current request. */
final class Response
{
    /** Send a no-cache JSON response and exit. */
    public static function json(int $status, array $data): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}
