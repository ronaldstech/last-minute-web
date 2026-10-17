<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

final class PaperReportRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function create(string $paperId, string $reporterId, string $category, string $details): array
    {
        $statement = $this->pdo->prepare("INSERT INTO paper_reports (paper_id, reporter_id, category, details, status) SELECT p.id, ?, ?, ?, 'open' FROM papers p WHERE p.id = ?");
        $statement->execute([$reporterId, $category, $details, $paperId]);
        if ($statement->rowCount() === 0) return [];
        return $this->find((string)$this->pdo->lastInsertId()) ?? [];
    }

    public function page(int $cursor, int $limit): array
    {
        $sql = 'SELECT r.id, r.paper_id AS paperId, p.title AS paperTitle, p.course, r.reporter_id AS reporterId, u.username AS reporterName, r.category, r.details, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt FROM paper_reports r JOIN papers p ON p.id = r.paper_id JOIN users u ON u.id = r.reporter_id';
        if ($cursor > 0) $sql .= ' WHERE r.id < ?';
        $statement = $this->pdo->prepare($sql . ' ORDER BY r.id DESC LIMIT ?');
        if ($cursor > 0) $statement->bindValue(1, $cursor, PDO::PARAM_INT);
        $statement->bindValue($cursor > 0 ? 2 : 1, $limit + 1, PDO::PARAM_INT);
        $statement->execute();
        return array_map([self::class, 'serialize'], $statement->fetchAll());
    }

    public function forPaper(string $paperId, int $limit = 100): array
    {
        $statement = $this->pdo->prepare('SELECT r.id, r.paper_id AS paperId, p.title AS paperTitle, r.category, r.details, r.status, r.created_at AS createdAt FROM paper_reports r JOIN papers p ON p.id = r.paper_id WHERE r.paper_id = ? ORDER BY r.id DESC LIMIT ?');
        $statement->bindValue(1, $paperId);
        $statement->bindValue(2, $limit, PDO::PARAM_INT);
        $statement->execute();
        return array_map([self::class, 'serialize'], $statement->fetchAll());
    }

    public function updateStatus(string $id, string $status): ?array
    {
        $statement = $this->pdo->prepare('UPDATE paper_reports SET status = ? WHERE id = ?');
        $statement->execute([$status, $id]);
        return $this->find($id);
    }

    private function find(string $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT r.id, r.paper_id AS paperId, p.title AS paperTitle, p.course, r.reporter_id AS reporterId, u.username AS reporterName, r.category, r.details, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt FROM paper_reports r JOIN papers p ON p.id = r.paper_id JOIN users u ON u.id = r.reporter_id WHERE r.id = ? LIMIT 1');
        $statement->execute([$id]);
        $row = $statement->fetch();
        return $row ? self::serialize($row) : null;
    }

    private static function serialize(array $row): array
    {
        foreach (['id', 'paperId', 'reporterId'] as $key) $row[$key] = (string)$row[$key];
        foreach (['createdAt', 'updatedAt'] as $key) $row[$key] = date(DATE_ATOM, strtotime($row[$key]));
        return $row;
    }
}
