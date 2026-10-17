<?php
declare(strict_types=1);

namespace LastMinute\Repositories;

use PDO;

/** Stores the latest submitted answer for each unlocked paper prompt. */
final class PracticeAnswerRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function submit(string $userId, string $paperId, string $questionKey, string $answer): ?array
    {
        $paperQuery = $this->pdo->prepare('SELECT p.questions FROM papers p JOIN user_paper_unlocks u ON u.paper_id = p.id AND u.user_id = ? AND u.unlocked_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR) WHERE p.id = ? LIMIT 1');
        $paperQuery->execute([$userId, $paperId]);
        $encodedQuestions = $paperQuery->fetchColumn();
        if ($encodedQuestions === false) return null;
        $questions = json_decode((string)$encodedQuestions, true);
        $prompt = $this->findPrompt(is_array($questions) ? $questions : [], $questionKey);
        if ($prompt === null) return ['invalidQuestion' => true];

        $insert = $this->pdo->prepare("INSERT INTO practice_answer_submissions (user_id, paper_id, question_key, question_prompt, answer, status, attempt_count) VALUES (?, ?, ?, ?, ?, 'pending', 1) ON DUPLICATE KEY UPDATE question_prompt = VALUES(question_prompt), answer = VALUES(answer), status = 'pending', attempt_count = attempt_count + 1, submitted_at = CURRENT_TIMESTAMP");
        $insert->execute([$userId, $paperId, $questionKey, $prompt, $answer]);
        $query = $this->pdo->prepare('SELECT id, status, attempt_count AS attemptCount, submitted_at AS submittedAt FROM practice_answer_submissions WHERE user_id = ? AND paper_id = ? AND question_key = ? LIMIT 1');
        $query->execute([$userId, $paperId, $questionKey]);
        $row = $query->fetch();
        if (!$row) return null;
        $row['id'] = (string)$row['id'];
        $row['attemptCount'] = (int)$row['attemptCount'];
        return $row;
    }

    private function findPrompt(array $questions, string $key): ?string
    {
        foreach ($questions as $index => $question) {
            if (!is_array($question)) continue;
            $questionKey = (string)(!empty($question['id']) ? $question['id'] : $index);
            if ($questionKey === $key) return $this->promptText($question);
            $nested = $this->findNestedPrompt($question['subquestions'] ?? [], $questionKey, $key);
            if ($nested !== null) return $nested;
        }
        return null;
    }

    private function findNestedPrompt(mixed $items, string $parentKey, string $wantedKey): ?string
    {
        if (!is_array($items)) return null;
        foreach ($items as $index => $item) {
            if (!is_array($item)) continue;
            $key = $parentKey . '.' . (string)(!empty($item['id']) ? $item['id'] : $index);
            if ($key === $wantedKey) return $this->promptText($item);
            $nested = $this->findNestedPrompt($item['subquestions'] ?? [], $key, $wantedKey);
            if ($nested !== null) return $nested;
        }
        return null;
    }

    private function promptText(array $question): string
    {
        $parts = [];
        if (isset($question['number']) && is_scalar($question['number'])) $parts[] = (string)$question['number'];
        if (isset($question['text']) && is_scalar($question['text'])) $parts[] = (string)$question['text'];
        foreach (($question['content'] ?? []) as $block) {
            if (is_array($block) && isset($block['text']) && is_scalar($block['text'])) $parts[] = (string)$block['text'];
        }
        return mb_substr(trim(implode("\n", $parts)), 0, 5000);
    }
}
