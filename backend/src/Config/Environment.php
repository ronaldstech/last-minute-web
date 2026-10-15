<?php
declare(strict_types=1);

namespace LastMinute\Config;

/** Reads server environment variables, with backend/.env as a local fallback. */
final class Environment
{
    /** @var array<string, string>|null */
    private static ?array $localValues = null;

    /** Return a process variable or its optional local-development fallback. */
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        if ($value !== false) return $value;
        self::$localValues ??= self::loadLocalFile();
        return self::$localValues[$key] ?? $default;
    }

    /** Parse simple KEY=value lines without requiring a dotenv dependency. */
    private static function loadLocalFile(): array
    {
        $path = dirname(__DIR__, 2) . '/.env';
        if (!is_file($path)) return [];
        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim(trim($value), "\"'");
        }
        return $values;
    }
}
