<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Stores editable account and academic profile fields. */
final class ProfileRepository
{
    private const COLUMNS = [
        'username' => 'username', 'phoneNumber' => 'phone_number',
        'college' => 'college', 'school' => 'school', 'department' => 'department',
        'program' => 'program', 'yearOfStudy' => 'year_of_study', 'semesterNumber' => 'semester_number',
    ];

    public function __construct(private readonly PDO $pdo) {}

    public function update(string $userId, array $profile): ?array
    {
        $sets = [];
        $values = [];
        foreach (self::COLUMNS as $field => $column) {
            if (!array_key_exists($field, $profile)) continue;
            $sets[] = "{$column} = ?";
            $values[] = $profile[$field];
        }
        if ($sets !== []) {
            $values[] = $userId;
            $statement = $this->pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?');
            $statement->execute($values);
        }
        $statement = $this->pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$userId]);
        return $statement->fetch() ?: null;
    }

    public function phoneInUse(string $phoneNumber, string $exceptUserId): bool
    {
        $statement = $this->pdo->prepare('SELECT id FROM users WHERE phone_number = ? AND id <> ? LIMIT 1');
        $statement->execute([$phoneNumber, $exceptUserId]);
        return (bool)$statement->fetch();
    }
}
