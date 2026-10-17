<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AdminMarkingRepository;

final class AdminMarkingController
{
    public function __construct(private readonly AdminMarkingRepository $marking, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        if (empty($user['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        $limit = max(1, min(100, (int)$request->query('limit', '50')));
        return ['data' => [
            'groupMarking' => ['summary' => $this->marking->groupSummary(), 'groups' => $this->marking->groups(), 'events' => $this->marking->recentGroupEvents($limit)],
            'practiceMarking' => ['summary' => $this->marking->practiceSummary(), 'events' => $this->marking->recentPracticeEvents($limit)],
        ]];
    }
}
