<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\UserPaperRepository;

/** Student-facing paper browsing, saved papers, and paid access. */
final class UserPaperController
{
    private const UNLOCK_COST = 20;

    public function __construct(private readonly UserPaperRepository $papers, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        return ['data' => ['papers' => $this->papers->listForUser($user['id'])]];
    }

    public function show(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $id = $this->paperId($request->query('id'));
        $paper = $this->papers->findForUser($user['id'], $id);
        if (!$paper) throw new ApiException('Paper not found.', 404);
        return ['data' => ['paper' => $paper, 'unlockCost' => self::UNLOCK_COST]];
    }

    public function save(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $id = $this->paperId($request->query('id'));
        if (!$this->papers->exists($id)) throw new ApiException('Paper not found.', 404);
        $this->papers->setSaved($user['id'], $id, true);
        return ['data' => ['paperId' => $id, 'isSaved' => true]];
    }

    public function unsave(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $id = $this->paperId($request->query('id'));
        $this->papers->setSaved($user['id'], $id, false);
        return ['data' => ['paperId' => $id, 'isSaved' => false]];
    }

    public function unlock(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $id = $this->paperId($request->query('id'));
        $result = $this->papers->unlock($user['id'], $id, self::UNLOCK_COST);
        if (!$result['paperFound']) throw new ApiException('Paper not found.', 404);
        if (!$result['affordable']) throw new ApiException('You need 20 coins to unlock this paper. Add coins and try again.', 409);
        $paper = $this->papers->findForUser($user['id'], $id);
        if (!$paper || !$paper['isUnlocked']) throw new ApiException('The paper was unlocked but could not be loaded. Please reopen it.', 500);
        $profile = $this->authenticate->user($request);
        return ['data' => ['paper' => $paper, 'user' => array_merge($profile, ['coinBalance' => $result['coinBalance'], 'freeCoinBalance' => $result['freeCoinBalance']]), 'alreadyUnlocked' => $result['alreadyUnlocked'], 'unlockCost' => self::UNLOCK_COST]];
    }

    private function paperId(string $id): string
    {
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('A valid paper ID is required.', 422);
        return $id;
    }
}
