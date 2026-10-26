<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Prepared SQL access for administrator paper management. */
final class AdminPaperRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function page(int $afterId, int $limit): array
    {
        $query = $this->pdo->prepare('SELECT id, title, course, year, semester, instructions, department_id, department_name, programme_assignments, question_count, created_at, updated_at FROM papers WHERE id > ? ORDER BY id ASC LIMIT ' . (int)($limit + 1));
        $query->execute([$afterId]);
        return $this->attachProgrammeAliases($query->fetchAll());
    }

    public function find(string $id): ?array
    {
        $query = $this->pdo->prepare('SELECT id, title, course, year, semester, instructions, department_id, department_name, questions, programme_assignments, question_count, created_at, updated_at FROM papers WHERE id = ? LIMIT 1');
        $query->execute([$id]);
        $row = $query->fetch() ?: null;
        return $row ? $this->attachProgrammeAliases([$row])[0] : null;
    }

    public function create(array $paper): array
    {
        $query = $this->pdo->prepare('INSERT INTO papers (title, course, year, semester, instructions, department_id, department_name, questions, programme_assignments, question_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $query->execute([$paper['title'], $paper['course'], $paper['year'], $paper['semester'], $paper['instructions'], $paper['departmentId'], $paper['departmentName'], $paper['questions'], $paper['programmeAssignments'], $paper['questionCount']]);
        return $this->find((string)$this->pdo->lastInsertId());
    }

    public function update(string $id, array $paper): ?array
    {
        $query = $this->pdo->prepare('UPDATE papers SET title = ?, course = ?, year = ?, semester = ?, instructions = ?, department_id = ?, department_name = ?, questions = ?, programme_assignments = ?, question_count = ? WHERE id = ?');
        $query->execute([$paper['title'], $paper['course'], $paper['year'], $paper['semester'], $paper['instructions'], $paper['departmentId'], $paper['departmentName'], $paper['questions'], $paper['programmeAssignments'], $paper['questionCount'], $id]);
        return $this->find($id);
    }

    public function delete(string $id): bool
    {
        $query = $this->pdo->prepare('DELETE FROM papers WHERE id = ?');
        $query->execute([$id]);
        return $query->rowCount() > 0;
    }

    public function programmeInDepartment(string $departmentId, string $programmeId): ?array
    {
        $query = $this->pdo->prepare('SELECT d.id AS departmentId, d.name AS departmentName, p.id AS programmeId, p.name AS programmeName, p.alias AS programmeAlias FROM academic_programmes p JOIN academic_departments d ON d.id = p.parent_id WHERE d.id = ? AND p.id = ? LIMIT 1');
        $query->execute([$departmentId, $programmeId]);
        return $query->fetch() ?: null;
    }

    public function department(string $departmentId): ?array
    {
        $query = $this->pdo->prepare('SELECT id, name FROM academic_departments WHERE id = ? LIMIT 1');
        $query->execute([$departmentId]);
        return $query->fetch() ?: null;
    }

    public static function serialize(array $row, bool $includeQuestions = false): array
    {
        $paper = [
            'id' => (string)$row['id'],
            'title' => $row['title'],
            'course' => $row['course'],
            'year' => $row['year'],
            'semester' => $row['semester'],
            'instructions' => $row['instructions'] ?? '',
            'departmentId' => isset($row['department_id']) ? (string)$row['department_id'] : null,
            'departmentName' => $row['department_name'] ?? null,
            'questionCount' => (int)$row['question_count'],
            'programmeAssignments' => self::decodeAssignments($row['programme_assignments'] ?? null),
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
        if ($includeQuestions) {
            $questions = json_decode((string)$row['questions'], true);
            $paper['questions'] = is_array($questions) ? $questions : [];
        }
        $assignments = $paper['programmeAssignments'];
        if (!$paper['departmentId'] && isset($assignments[0]['departmentId'])) $paper['departmentId'] = (string)$assignments[0]['departmentId'];
        if (!$paper['departmentName'] && isset($assignments[0]['departmentName'])) $paper['departmentName'] = $assignments[0]['departmentName'];
        return $paper;
    }

    private static function decodeAssignments(mixed $encoded): array
    {
        $assignments = json_decode((string)($encoded ?? ''), true);
        return is_array($assignments) ? $assignments : [];
    }

    private function attachProgrammeAliases(array $rows): array
    {
        if (!$rows) return $rows;
        $aliases = $this->pdo->query("SELECT id, alias FROM academic_programmes WHERE alias IS NOT NULL AND alias <> ''")->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach ($rows as &$row) {
            $assignments = self::decodeAssignments($row['programme_assignments'] ?? null);
            foreach ($assignments as &$assignment) {
                if (!isset($assignment['alias']) && !isset($assignment['programmeAlias'])) {
                    $alias = $aliases[$assignment['programmeId'] ?? ''] ?? null;
                    if ($alias) $assignment['alias'] = $alias;
                }
            }
            unset($assignment);
            $row['programme_assignments'] = json_encode($assignments, JSON_UNESCAPED_UNICODE) ?: '[]';
        }
        unset($row);
        return $rows;
    }
}
