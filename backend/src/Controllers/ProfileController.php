<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\ProfileRepository;
use LastMinute\Support\UserSerializer;

/** Authenticated profile updates; email and account permissions stay protected. */
final class ProfileController
{
    private const LIMITS = [
        'username' => 120, 'phoneNumber' => 32, 'college' => 160, 'school' => 160,
        'department' => 160, 'program' => 160, 'yearOfStudy' => 40, 'semesterNumber' => 40,
    ];

    public function __construct(private readonly ProfileRepository $profiles, private readonly Authenticate $authenticate) {}

    public function update(Request $request): array
    {
        $current = $this->authenticate->user($request);
        $input = $request->json();
        if ($input === []) throw new ApiException('Provide at least one profile field to update.', 422);
        $profile = [];
        foreach ($input as $field => $value) {
            if (!isset(self::LIMITS[$field])) throw new ApiException('Only name, phone, and study details can be updated here.', 422);
            if (!is_string($value)) throw new ApiException("{$field} must be text.", 422);
            $value = trim($value);
            $maximum = self::LIMITS[$field];
            if (mb_strlen($value) > $maximum) throw new ApiException(ucfirst($field) . " must contain at most {$maximum} characters.", 422);
            if (in_array($field, ['username', 'phoneNumber'], true) && $value === '') throw new ApiException(ucfirst($field) . ' cannot be empty.', 422);
            $profile[$field] = $value === '' ? null : $value;
        }
        if (isset($profile['phoneNumber'])) {
            $phone = preg_replace('/[\s()-]/', '', $profile['phoneNumber']) ?? '';
            if (!preg_match('/^(?:\+?265)?0?9\d{8}$/', $phone)) throw new ApiException('Enter a valid Malawi mobile number.', 422);
            if (str_starts_with($phone, '+265')) $phone = '+265' . ltrim(substr($phone, 4), '0');
            elseif (str_starts_with($phone, '265')) $phone = '+265' . ltrim(substr($phone, 3), '0');
            else $phone = '+265' . ltrim(substr($phone, -9), '0');
            if ($this->profiles->phoneInUse($phone, $current['id'])) throw new ApiException('That phone number is already connected to another account.', 409);
            $profile['phoneNumber'] = $phone;
        }
        $row = $this->profiles->update($current['id'], $profile);
        if (!$row) throw new ApiException('Account not found.', 404);
        return ['data' => ['user' => UserSerializer::public($row)]];
    }
}
