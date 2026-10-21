<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

final class AppConfigurationRepository
{
    public const DEFAULTS = [
        'maintenanceEnabled' => false, 'maintenanceMessage' => '',
        'updateEnabled' => false, 'updateMessage' => '', 'updateUrgent' => false,
        'paperUnlockDailyCost' => 20, 'paperUnlockWeeklyCost' => 100,
        'practiceMarkingCostPerQuestion' => 2, 'groupDiscussionMarkingCostPerResponse' => 4,
    ];

    public function __construct(private readonly PDO $pdo) {}

    public function get(): array
    {
        $query = $this->pdo->prepare('SELECT config_value FROM app_configuration WHERE config_key = ? LIMIT 1');
        $query->execute(['coinPricing']);
        $stored = json_decode((string)$query->fetchColumn(), true);
        return array_merge(self::DEFAULTS, is_array($stored) ? $stored : []);
    }

    public function save(array $configuration): array
    {
        $values = array_intersect_key($configuration, self::DEFAULTS);
        foreach (['paperUnlockDailyCost', 'paperUnlockWeeklyCost', 'practiceMarkingCostPerQuestion', 'groupDiscussionMarkingCostPerResponse'] as $key) {
            $number = filter_var($values[$key] ?? null, FILTER_VALIDATE_INT);
            if ($number === false || $number < 0 || $number > 100000) throw new \InvalidArgumentException('Coin costs must be whole numbers from 0 to 100000.');
            $values[$key] = $number;
        }
        foreach (['maintenanceEnabled', 'updateEnabled', 'updateUrgent'] as $key) $values[$key] = (bool)($values[$key] ?? false);
        foreach (['maintenanceMessage', 'updateMessage'] as $key) $values[$key] = mb_substr(trim((string)($values[$key] ?? '')), 0, 240);
        if ($values['maintenanceEnabled'] && $values['maintenanceMessage'] === '') throw new \InvalidArgumentException('A maintenance message is required when maintenance mode is enabled.');
        if ($values['updateEnabled'] && $values['updateMessage'] === '') throw new \InvalidArgumentException('An update message is required when the update notice is enabled.');
        $statement = $this->pdo->prepare('INSERT INTO app_configuration (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)');
        $statement->execute(['coinPricing', json_encode($values, JSON_THROW_ON_ERROR)]);
        return $this->get();
    }
}
