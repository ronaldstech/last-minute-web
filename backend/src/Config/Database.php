<?php
declare(strict_types=1);

namespace LastMinute\Config;

use PDO;

/** Provides one configured PDO connection for the current request. */
final class Database
{
    private static ?PDO $connection = null;

    /** Create the MySQL connection lazily using backend environment settings. */
    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) return self::$connection;
        $host = Environment::get('DB_HOST', '127.0.0.1');
        $port = Environment::get('DB_PORT', '3306');
        $name = Environment::get('DB_NAME', 'last_minute');
        $charset = Environment::get('DB_CHARSET', 'utf8mb4');
        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
        self::$connection = new PDO($dsn, Environment::get('DB_USER', 'root'), Environment::get('DB_PASSWORD', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return self::$connection;
    }
}
