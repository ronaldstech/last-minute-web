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
        if ($type === 'departments' && $parentId === null) {
            return $this->pdo->query('SELECT d.id, d.name, d.alias, s.name AS schoolName, c.name AS collegeName FROM academic_departments d JOIN academic_schools s ON s.id = d.parent_id JOIN academic_colleges c ON c.id = s.parent_id ORDER BY c.name, s.name, d.name, d.id')->fetchAll();
        }
        if ($config['parent'] === null) {
            return $this->pdo->query("SELECT id, name, alias FROM {$config['table']} ORDER BY name, id")->fetchAll();
        }
        $statement = $this->pdo->prepare("SELECT id, name, alias FROM {$config['table']} WHERE parent_id = ? ORDER BY name, id");
        $statement->execute([$parentId]);
        return $statement->fetchAll();
    }

    public function create(string $type, string $name, string $alias, ?string $parentId): array
    {
        $config = self::TABLES[$type];
        if ($config['parent'] === null) {
            $statement = $this->pdo->prepare("INSERT INTO {$config['table']} (name, alias) VALUES (?, ?)");
            $statement->execute([$name, $alias !== '' ? $alias : null]);
        } else {
            $statement = $this->pdo->prepare("INSERT INTO {$config['table']} (parent_id, name, alias) VALUES (?, ?, ?)");
            $statement->execute([$parentId, $name, $alias !== '' ? $alias : null]);
        }
        return ['id' => (string)$this->pdo->lastInsertId(), 'name' => $name, 'alias' => $alias];
    }

    public static function validType(string $type): bool { return isset(self::TABLES[$type]); }
    public static function requiresParent(string $type): bool { return self::TABLES[$type]['parent'] !== null; }
}
