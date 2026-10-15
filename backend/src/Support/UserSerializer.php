<?php
declare(strict_types=1);

namespace LastMinute\Support;

/** Converts private SQL user rows into the stable, public API user shape. */
final class UserSerializer
{
    /** Exclude credentials and normalize database values for the frontend. */
    public static function public(array $row): array
    {
        return [
            'id' => (string)$row['id'],
            'username' => $row['username'],
            'email' => $row['email'],
            'phoneNumber' => $row['phone_number'],
            'role' => $row['role'],
            'isAdmin' => $row['role'] === 'admin',
            'coinBalance' => (int)$row['coin_balance'],
            'freeCoinBalance' => (int)$row['free_coin_balance'],
            'phoneVerified' => (bool)$row['phone_verified'],
            'createdAt' => $row['created_at'],
        ];
    }
}
