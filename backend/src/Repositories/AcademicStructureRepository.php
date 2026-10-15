<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** SQL access for the college > school > department > programme tree. */
final class AcademicStructureRepository
{
    private const TABLES = [
        'colleges' => ['table' => 'academic_colleges', 'parent' => null],
        'schools' => ['table' => 'academic_schools', 'parent' => 'collegeId'],
        'departments' => ['table' => 'academic_departments', 'parent' => 'schoolId'],
        'programmes' => ['table' => 'academic_programmes', 'parent' => 'departmentId'],
    ];

    public function __construct(private readonly PDO $pdo) {}

    public function page(string $type, ?string $parentId): array
    {
        $config = self::TABLES[$type];
        if ($config['parent'] === null) {
            return $this->pdo->query("SELECT id, name, code FROM {$config['table']} ORDER BY name, id")->fetchAll();
        }
        $statement = $this->pdo->prepare("SELECT id, name, code FROM {$config['table']} WHERE parent_id = ? ORDER BY name, id");
        $statement->execute([$parentId]);
        return $statement->fetchAll();
    }

    public function create(string $type, string $name, string $code, ?string $parentId): array
    {
        $config = self::TABLES[$type];
        if ($config['parent'] === null) {
            $statement = $this->pdo->prepare("INSERT INTO {$config['table']} (name, code) VALUES (?, ?)");
            $statement->execute([$name, $code !== '' ? $code : null]);
        } else {
            $statement = $this->pdo->prepare("INSERT INTO {$config['table']} (parent_id, name, code) VALUES (?, ?, ?)");
            $statement->execute([$parentId, $name, $code !== '' ? $code : null]);
        }
        return ['id' => (string)$this->pdo->lastInsertId(), 'name' => $name, 'code' => $code];
    }

    public static function validType(string $type): bool { return isset(self::TABLES[$type]); }
    public static function requiresParent(string $type): bool { return self::TABLES[$type]['parent'] !== null; }
}
