<?php
declare(strict_types=1);

namespace LastMinute\Http;

use LastMinute\Config\Environment;

/** Shared CORS policy for every public backend endpoint. */
final class Cors
{
    /** Apply CORS headers and finish preflight requests before application work. */
    public static function handle(): void
    {
        $configured = Environment::get(
            'APP_ORIGINS',
            'https://apexspacemw.com,https://www.apexspacemw.com,https://last.nkk-sec.com,http://localhost:5173,http://127.0.0.1:5173'
        ) ?? '';
        $origins = array_filter(array_map('trim', explode(',', $configured)));

        // Keep the known production frontend origins allowed when an older
        // host config does not yet list them.
        $origins = array_unique(array_merge($origins, [
            'https://apexspacemw.com',
            'https://www.apexspacemw.com',
            'https://last.nkk-sec.com',
        ]));
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' && in_array($origin, $origins, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
            header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 86400');
        }

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
