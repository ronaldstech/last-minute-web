<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use DateTimeImmutable;
use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\StudyGroupRepository;

/** Authenticated group membership, messaging, and paper discussion endpoints. */
final class StudyGroupController
{
    public function __construct(private readonly StudyGroupRepository $groups, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $user = $this->authenticate->user($request);
        return ['data' => ['groups' => $this->groups->groups((string)$user['id'])]];
    }

    public function adminIndex(Request $request): array
    {
        $user = $this->authenticate->user($request);
        if (empty($user['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        return ['data' => ['groups' => $this->groups->adminGroups()]];
    }

    public function adminDetails(Request $request): array
    {
        $user = $this->authenticate->user($request);
        if (empty($user['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        $groupId = $this->id($request->query('groupId'), 'group');
        return ['data' => ['group' => $this->domain(fn() => $this->groups->adminGroupDetails($groupId))]];
    }

    public function invitations(Request $request): array
    {
        $user = $this->authenticate->user($request);
        return ['data' => ['invitations' => $this->groups->invitations((string)$user['id'])]];
    }

    public function create(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $name = trim((string)($input['name'] ?? ''));
        $course = trim((string)($input['course'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        if ($name === '' || mb_strlen($name) > 70) throw new ApiException('Group name must contain 1 to 70 characters.', 422);
        if (mb_strlen($course) > 60 || mb_strlen($description) > 300) throw new ApiException('Course must be at most 60 characters and description at most 300.', 422);
        return ['status' => 201, 'data' => ['group' => $this->domain(fn() => $this->groups->create((string)$user['id'], $name, $course, $description))]];
    }

    public function invite(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $groupId = $this->id((string)($input['groupId'] ?? ''), 'group');
        $username = trim((string)($input['username'] ?? ''));
        if ($username === '' || mb_strlen($username) > 120) throw new ApiException('Enter a username.', 422);
        $this->domain(fn() => $this->groups->inviteByUsername((string)$user['id'], $groupId, $username));
        return ['data' => ['message' => 'Group invitation sent.']];
    }

    public function searchUsers(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $query = trim((string)$request->query('q'));
        if (mb_strlen($query) < 2) return ['data' => ['users' => []]];
        return ['data' => ['users' => $this->groups->searchUsers((string)$user['id'], $query)]];
    }

    public function createInviteLink(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $groupId = $this->id((string)($input['groupId'] ?? ''), 'group');
        return ['data' => ['token' => $this->domain(fn() => $this->groups->createInviteLink((string)$user['id'], $groupId))]];
    }

    public function joinByLink(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $token = trim((string)($input['token'] ?? ''));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) throw new ApiException('This invitation link is invalid.', 422);
        $group = $this->domain(fn() => $this->groups->joinByLink((string)$user['id'], $token));
        return ['data' => ['group' => $group]];
    }

    public function respond(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $invitationId = $this->id((string)($input['invitationId'] ?? ''), 'invitation');
        if (!is_bool($input['accept'] ?? null)) throw new ApiException('Choose whether to accept this invitation.', 422);
        $this->domain(fn() => $this->groups->respondToInvitation((string)$user['id'], $invitationId, $input['accept']));
        return ['data' => ['accepted' => $input['accept']]];
    }

    public function messages(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        return ['data' => $this->domain(fn() => $this->groups->messages((string)$user['id'], $groupId, $request->query('before')))];
    }

    public function sendMessage(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $text = trim((string)($input['text'] ?? ''));
        if ($text === '' || mb_strlen($text) > 10000) throw new ApiException('Message must contain 1 to 10,000 characters.', 422);
        $this->domain(fn() => $this->groups->createMessage((string)$user['id'], $groupId, (string)($user['username'] ?? 'Student'), $text));
        return ['data' => ['message' => 'Message sent.']];
    }

    public function plans(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        return ['data' => ['plans' => $this->domain(fn() => $this->groups->plans((string)$user['id'], $groupId))]];
    }

    public function schedule(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $paperId = $this->id((string)($input['paperId'] ?? ''), 'paper');
        try { $scheduledAt = new DateTimeImmutable((string)($input['scheduledAt'] ?? '')); }
        catch (\Throwable) { throw new ApiException('Choose a valid discussion start time.', 422); }
        if ($scheduledAt->getTimestamp() <= time()) throw new ApiException('Choose a future discussion time.', 422);
        $this->domain(fn() => $this->groups->createPlan((string)$user['id'], $groupId, $paperId, $scheduledAt));
        return ['data' => ['message' => 'Discussion scheduled.']];
    }

    public function joinPlan(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $planId = $this->id((string)($input['planId'] ?? ''), 'discussion');
        $this->domain(fn() => $this->groups->joinPlan((string)$user['id'], $groupId, $planId));
        return ['data' => ['joined' => true]];
    }

    public function nextQuestion(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $planId = $this->id((string)($input['planId'] ?? ''), 'discussion');
        $published = $this->domain(fn() => $this->groups->nextQuestion((string)$user['id'], $groupId, $planId));
        return ['data' => ['published' => $published]];
    }

    public function endDiscussion(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $planId = $this->id((string)($input['planId'] ?? ''), 'discussion');
        $this->domain(fn() => $this->groups->endDiscussion((string)$user['id'], $groupId, $planId));
        return ['data' => ['ended' => true]];
    }

    public function publishDue(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        return ['data' => ['published' => $this->domain(fn() => $this->groups->publishDue((string)$user['id'], $groupId))]];
    }

    public function answer(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $questionId = $this->id((string)($input['questionId'] ?? ''), 'question');
        $text = trim((string)($input['answer'] ?? ''));
        if (mb_strlen($text) > 10000) throw new ApiException('Answers must be at most 10,000 characters.', 422);
        $this->domain(fn() => $this->groups->answer((string)$user['id'], $groupId, $questionId, $text, (string)($user['username'] ?? 'Student')));
        return ['data' => ['message' => 'Response posted.']];
    }

    public function saveDiscussionMarks(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $groupId = $this->id($request->query('groupId'), 'group');
        $input = $request->json();
        $questionId = $this->id((string)($input['questionId'] ?? ''), 'question');
        $results = $input['results'] ?? null;
        if (!is_array($results) || !$results) throw new ApiException('Provide marking results for the group responses.', 422);
        $this->domain(fn() => $this->groups->saveDiscussionMarks((string)$user['id'], $groupId, $questionId, $results));
        return ['data' => ['saved' => true]];
    }

    private function id(string $value, string $label): string
    {
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $value)) throw new ApiException('A valid ' . $label . ' ID is required.', 422);
        return $value;
    }

    private function domain(callable $action): mixed
    {
        try { return $action(); }
        catch (\DomainException $error) { throw new ApiException($error->getMessage(), 409); }
    }
}
