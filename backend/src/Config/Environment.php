<?php
declare(strict_types=1);

namespace LastMinute\Config;

/** Reads server variables, then backend/config.php, then the optional local .env file. */
final class Environment
{
    /** @var array<string, string>|null */
    private static ?array $localValues = null;

    /** Return a process variable or its optional local-development fallback. */
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        if ($value !== false) return $value;
        self::$localValues ??= self::loadLocalValues();
        return self::$localValues[$key] ?? $default;
    }

    /** Read PHP-host configuration first, with .env retained for local development. */
    private static function loadLocalValues(): array
    {
        $root = dirname(__DIR__, 2);
        $phpValues = self::loadPhpConfig($root . '/config.php');
        $path = $root . '/.env';
        if (!is_file($path)) return $phpValues;
        $envValues = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$key, $value] = explode('=', $line, 2);
            $envValues[trim($key)] = trim(trim($value), "\"'");
        }
        return array_replace($envValues, $phpValues);
    }

    private static function loadPhpConfig(string $path): array
    {
        if (!is_file($path)) return [];
        $config = require $path;
        if (!is_array($config)) return [];
        $values = [];
        foreach ($config as $key => $value) {
            if (is_string($key) && (is_string($value) || is_numeric($value))) $values[$key] = (string)$value;
        }
        return $values;
    }
}
