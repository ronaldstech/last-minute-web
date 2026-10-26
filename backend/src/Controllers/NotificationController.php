<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\NotificationRepository;

final class NotificationController
{
    public function __construct(private readonly NotificationRepository $notifications, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        return ['data' => ['notifications' => $this->notifications->listForUser((string)$user['id'])]];
    }

    public function markRead(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $ids = $request->json()['ids'] ?? [];
        if (!is_array($ids) || count($ids) > 200) throw new ApiException('Choose up to 200 notifications.', 422);
        $ids = array_values(array_unique(array_filter(array_map(static fn ($id) => is_scalar($id) ? (string)$id : '', $ids), static fn ($id) => preg_match('/^[1-9][0-9]{0,18}$/', $id))));
        $this->notifications->markRead((string)$user['id'], $ids);
        return ['data' => ['marked' => count($ids)]];
    }

    public function create(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (empty($admin['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        $input = $request->json();
        $title = trim(is_string($input['title'] ?? null) ? $input['title'] : '');
        $body = trim(is_string($input['body'] ?? null) ? $input['body'] : '');
        $kind = is_string($input['kind'] ?? null) ? $input['kind'] : 'info';
        if ($title === '' || mb_strlen($title) > 120) throw new ApiException('Notification title is required and must be 120 characters or fewer.', 422);
        if ($body === '' || mb_strlen($body) > 1200) throw new ApiException('Notification message is required and must be 1200 characters or fewer.', 422);
        if (!in_array($kind, ['info', 'success', 'warning'], true)) throw new ApiException('Choose a valid notification type.', 422);
        $audience = $input['audience'] ?? 'all';
        if ($audience === 'all') $recipientId = null;
        elseif ($audience === 'user' && is_scalar($input['userId'] ?? null) && preg_match('/^[1-9][0-9]{0,18}$/', (string)$input['userId'])) {
            $recipientId = (string)$input['userId'];
            if (!$this->notifications->userExists($recipientId)) throw new ApiException('That user could not be found.', 404);
        } else throw new ApiException('Choose all users or a valid individual user.', 422);
        $id = $this->notifications->create($recipientId, $title, $body, $kind, (string)$admin['id']);
        return ['status' => 201, 'data' => ['id' => $id, 'message' => 'Notification sent.']];
    }
}
