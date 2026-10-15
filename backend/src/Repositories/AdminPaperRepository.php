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
        $query = $this->pdo->prepare('SELECT id, title, course, year, semester, question_count, created_at, updated_at FROM papers WHERE id > ? ORDER BY id ASC LIMIT ' . (int)($limit + 1));
        $query->execute([$afterId]);
        return $query->fetchAll();
    }

    public function find(string $id): ?array
    {
        $query = $this->pdo->prepare('SELECT id, title, course, year, semester, questions, question_count, created_at, updated_at FROM papers WHERE id = ? LIMIT 1');
        $query->execute([$id]);
        return $query->fetch() ?: null;
    }

    public function create(array $paper): array
    {
        $query = $this->pdo->prepare('INSERT INTO papers (title, course, year, semester, questions, question_count) VALUES (?, ?, ?, ?, ?, ?)');
        $query->execute([$paper['title'], $paper['course'], $paper['year'], $paper['semester'], $paper['questions'], $paper['questionCount']]);
        return $this->find((string)$this->pdo->lastInsertId());
    }

    public function update(string $id, array $paper): ?array
    {
        $query = $this->pdo->prepare('UPDATE papers SET title = ?, course = ?, year = ?, semester = ?, questions = ?, question_count = ? WHERE id = ?');
        $query->execute([$paper['title'], $paper['course'], $paper['year'], $paper['semester'], $paper['questions'], $paper['questionCount'], $id]);
        return $this->find($id);
    }

    public function delete(string $id): bool
    {
        $query = $this->pdo->prepare('DELETE FROM papers WHERE id = ?');
        $query->execute([$id]);
        return $query->rowCount() > 0;
    }

    public static function serialize(array $row, bool $includeQuestions = false): array
    {
        $paper = [
            'id' => (string)$row['id'],
            'title' => $row['title'],
            'course' => $row['course'],
            'year' => $row['year'],
            'semester' => $row['semester'],
            'questionCount' => (int)$row['question_count'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
        if ($includeQuestions) {
            $questions = json_decode((string)$row['questions'], true);
            $paper['questions'] = is_array($questions) ? $questions : [];
        }
        return $paper;
    }
}
