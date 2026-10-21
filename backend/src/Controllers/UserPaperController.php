<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\UserPaperRepository;
use LastMinute\Repositories\AppConfigurationRepository;
use PDOException;

/** Student-facing paper browsing, saved papers, and paid access. */
final class UserPaperController
{
    public function __construct(private readonly UserPaperRepository $papers, private readonly Authenticate $authenticate, private readonly AppConfigurationRepository $configuration) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $pricing = $this->configuration->get();
        return ['data' => [
            'papers' => $this->papers->listForUser($user['id']),
            'unlockPricing' => [
                'daily' => $pricing['paperUnlockDailyCost'],
                'weekly' => $pricing['paperUnlockWeeklyCost'],
                'practiceMarkingPerQuestion' => $pricing['practiceMarkingCostPerQuestion'],
            ],
        ]];
    }

    public function history(Request $request): array
    {
        $user = $this->authenticate->user($request);
        try {
            return ['data' => ['unlocks' => $this->papers->history($user['id']), 'marking' => $this->papers->markingHistory($user['id'])]];
        } catch (PDOException $error) {
            if ($error->getCode() === '42S02') throw new ApiException('Account history needs migrations 010_add_marking_usage_events.sql and 018_add_paper_unlock_history.sql.', 503);
            if ($error->getCode() === '42S22') throw new ApiException('Account marking history needs migration 019_add_coin_pricing_settings.sql.', 503);
            throw $error;
        }
    }

    public function show(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $id = $this->paperId($request->query('id'));
        $paper = $this->papers->findForUser($user['id'], $id);
        if (!$paper) throw new ApiException('Paper not found.', 404);
        $pricing = $this->configuration->get();
        return ['data' => ['paper' => $paper, 'unlockPricing' => ['daily' => $pricing['paperUnlockDailyCost'], 'weekly' => $pricing['paperUnlockWeeklyCost'], 'practiceMarkingPerQuestion' => $pricing['practiceMarkingCostPerQuestion']]]];
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
        $input = $request->json();
        $durationDays = (int)($input['durationDays'] ?? 1);
        if (!in_array($durationDays, [1, 7], true)) throw new ApiException('Choose a one-day or seven-day paper unlock.', 422);
        $pricing = $this->configuration->get();
        $cost = $durationDays === 7 ? $pricing['paperUnlockWeeklyCost'] : $pricing['paperUnlockDailyCost'];
        try {
            $result = $this->papers->unlock($user['id'], $id, $cost, $durationDays);
        } catch (PDOException $error) {
            if ($error->getCode() === '42S02') throw new ApiException('Paper unlock history needs database migration 018_add_paper_unlock_history.sql.', 503);
            throw $error;
        }
        if (!$result['paperFound']) throw new ApiException('Paper not found.', 404);
        if (!$result['affordable']) throw new ApiException('You need ' . $cost . ' coins to unlock this paper. Add coins and try again.', 409);
        $paper = $this->papers->findForUser($user['id'], $id);
        if (!$paper || !$paper['isUnlocked']) throw new ApiException('The paper was unlocked but could not be loaded. Please reopen it.', 500);
        $profile = $this->authenticate->user($request);
        return ['data' => ['paper' => $paper, 'unlockPricing' => ['daily' => $pricing['paperUnlockDailyCost'], 'weekly' => $pricing['paperUnlockWeeklyCost'], 'practiceMarkingPerQuestion' => $pricing['practiceMarkingCostPerQuestion']], 'user' => array_merge($profile, ['coinBalance' => $result['coinBalance'], 'freeCoinBalance' => $result['freeCoinBalance']]), 'alreadyUnlocked' => $result['alreadyUnlocked'], 'unlockCost' => $cost, 'unlockDurationDays' => $durationDays]];
    }

    private function paperId(string $id): string
    {
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('A valid paper ID is required.', 422);
        return $id;
    }
}
