<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\PracticeAnswerRepository;

/** Protected API for submitting answers from paper practice sessions. */
final class PracticeAnswerController
{
    public function __construct(private readonly PracticeAnswerRepository $answers, private readonly Authenticate $authenticate) {}

    public function submit(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $body = $request->json();
        $paperId = is_scalar($body['paperId'] ?? null) ? (string)$body['paperId'] : '';
        $questionKey = is_scalar($body['questionKey'] ?? null) ? trim((string)$body['questionKey']) : '';
        $answer = is_string($body['answer'] ?? null) ? trim($body['answer']) : '';
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $paperId)) throw new ApiException('A valid paper ID is required.', 422);
        if ($questionKey === '' || mb_strlen($questionKey) > 512) throw new ApiException('A valid question reference is required.', 422);
        if ($answer === '') throw new ApiException('Write an answer before submitting it.', 422);
        if (mb_strlen($answer) > 20000) throw new ApiException('Answers must be 20,000 characters or fewer.', 422);

        $submission = $this->answers->submit($user['id'], $paperId, $questionKey, $answer);
        if ($submission === null) throw new ApiException('Unlock this paper before submitting an answer.', 403);
        if (!empty($submission['invalidQuestion'])) throw new ApiException('That question does not belong to this paper.', 422);
        return ['data' => ['submission' => $submission, 'message' => 'Answer submitted and queued for marking.']];
    }
}
