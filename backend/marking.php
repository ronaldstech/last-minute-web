<?php

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

function markingRespond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function createMarkingEvent(PDO $pdo, array $event): string
{
    try {
        $query = $pdo->prepare('INSERT INTO marking_usage_events (user_id, paper_id, paper_title, paper_course, paper_year, source_type, group_id, group_name, discussion_id, question_key, question_number, question_prompt, answer, max_marks, model, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'pending\')');
        $query->execute([
            $event['userId'], $event['paperId'], $event['paperTitle'], $event['paperCourse'], $event['paperYear'],
            $event['sourceType'], $event['groupId'], $event['groupName'], $event['discussionId'],
            $event['questionId'], $event['questionNumber'], $event['prompt'], $event['answer'], $event['maxMarks'],
            $event['model'],
        ]);
        return (string)$pdo->lastInsertId();
    } catch (Throwable $error) {
        error_log('[last-minute-marking] Could not create analytics event: ' . $error->getMessage());
        markingRespond(500, ['error' => 'The marking attempt could not be recorded. Check the backend database and run its latest migration.']);
    }
}

function finishMarkingEvent(PDO $pdo, string $eventId, string $status, ?float $score, ?string $errorCode, ?string $responseJson): void
{
    try {
        $query = $pdo->prepare('UPDATE marking_usage_events SET score = ?, status = ?, error_code = ?, response_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?');
        $query->execute([$score, $status, $errorCode, $responseJson, $eventId]);
    } catch (Throwable $error) {
        error_log('[last-minute-marking] Could not finish analytics event: ' . $error->getMessage());
        markingRespond(500, ['error' => 'The marking result could not be recorded. Check the backend database.']);
    }
}

$bootstrapCandidates = [__DIR__ . '/bootstrap.php', __DIR__ . '/../backend/bootstrap.php', __DIR__ . '/../bootstrap.php'];
$bootstrapPath = null;
foreach ($bootstrapCandidates as $candidate) {
    if (is_file($candidate)) { $bootstrapPath = $candidate; break; }
}
if ($bootstrapPath === null) markingRespond(500, ['error' => 'The backend bootstrap could not be found.']);
require_once $bootstrapPath;

try {
    $pdo = \LastMinute\Config\Database::connection();
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($authorization === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        $authorization = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $authorization, $tokenMatch)) {
        markingRespond(401, ['error' => 'A valid bearer session is required.']);
    }
    $sessions = new \LastMinute\Repositories\SessionRepository($pdo);
    $user = $sessions->findActiveUser(hash('sha256', strtolower($tokenMatch[1])));
    if (!$user) markingRespond(401, ['error' => 'Your session has expired. Sign in again.']);
} catch (Throwable $error) {
    error_log('[last-minute-marking] Authentication/database setup failed: ' . $error->getMessage());
    markingRespond(500, ['error' => 'The marking service could not authenticate this request.']);
}

$API_KEY_FILE = __DIR__ . '/config.php';
if (file_exists($API_KEY_FILE)) {
    $markingConfig = require $API_KEY_FILE;
    if (is_array($markingConfig)) $GROQ_API_KEY = $markingConfig['GROQ_API_KEY'] ?? ($GROQ_API_KEY ?? '');
}

$GROQ_API_KEY = getenv('GROQ_API_KEY') ?: (($GROQ_API_KEY ?? '') ?: \LastMinute\Config\Environment::get('GROQ_API_KEY', ''));
$GROQ_MODEL   = getenv('GROQ_MODEL') ?: \LastMinute\Config\Environment::get('GROQ_MODEL', 'openai/gpt-oss-20b');

if ($GROQ_API_KEY === '') {
    http_response_code(500);
    echo json_encode(['error' => 'GROQ_API_KEY is not set.']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$paperTitle = isset($data['paper']['title']) ? (string)$data['paper']['title'] : '';
$paperCourse = isset($data['paper']['course']) ? (string)$data['paper']['course'] : '';
$paperYear = isset($data['paper']['year']) ? (string)$data['paper']['year'] : '';
$sourceType = ($data['sourceType'] ?? '') === 'group_discussion' ? 'group_discussion' : 'practice';
$groupId = $sourceType === 'group_discussion' && isset($data['groupId']) && preg_match('/^[1-9][0-9]{0,18}$/', (string)$data['groupId']) ? (string)$data['groupId'] : null;
$discussionId = $sourceType === 'group_discussion' && isset($data['discussionId']) && preg_match('/^[1-9][0-9]{0,18}$/', (string)$data['discussionId']) ? (string)$data['discussionId'] : null;
$groupName = $sourceType === 'group_discussion' ? mb_substr(trim((string)($data['groupName'] ?? '')), 0, 200) : '';
if ($sourceType === 'group_discussion') {
    if ($groupId === null || $discussionId === null) markingRespond(422, ['error' => 'A valid group and discussion are required for group marking.']);
    $groupQuery = $pdo->prepare('SELECT g.name FROM study_group_plans p JOIN study_groups g ON g.id = p.group_id WHERE p.id = ? AND p.group_id = ? AND p.created_by = ? LIMIT 1');
    $groupQuery->execute([$discussionId, $groupId, (string)$user['id']]);
    $group = $groupQuery->fetch(PDO::FETCH_ASSOC);
    if (!$group) markingRespond(403, ['error' => 'Only the discussion creator can record group marking usage.']);
    $groupName = (string)$group['name'];
}
$paperId = isset($data['paperId']) && is_scalar($data['paperId']) && trim((string)$data['paperId']) !== ''
    ? mb_substr(trim((string)$data['paperId']), 0, 160)
    : null;
$questions = $data['questions'] ?? [];
if (!is_array($questions)) {
    markingRespond(400, ['error' => 'Missing "questions" array.']);
}

$model = is_string($data['model'] ?? null) && trim($data['model']) !== '' ? trim($data['model']) : $GROQ_MODEL;

$results = [];
$totalScore = 0;
$totalPossible = 0;

foreach ($questions as $qIndex => $question) {
    if (!is_array($question)) {
        continue;
    }
    $id = isset($question['id']) ? (string)$question['id'] : ('q-' . $qIndex);
    $number = isset($question['number']) ? (string)$question['number'] : ((string)($qIndex + 1));
    $prompt = isset($question['prompt']) ? (string)$question['prompt'] : '';
    $answer = isset($question['answer']) ? (string)$question['answer'] : '';
    $maxMarks = isset($question['maxMarks']) ? (float)$question['maxMarks'] : 0;
    $questionKey = isset($question['id']) && is_scalar($question['id']) ? (string)$question['id'] : ('q-' . $qIndex);
    $systemPrompt = "You are an expert examiner marking student answers. Return ONLY valid JSON. " .
        "Grade each answer independently against the question and marking criteria. " .
        "Award proportional partial credit for correct reasoning, key ideas, and answers that are close to correct. " .
        "Accept equivalent wording and concepts; do not require an exact phrase match. " .
        "For low-mark questions, use justified fractional scores (for example, 0.25, 0.5, or 0.75 out of 1) when the answer shows partial understanding. " .
        "Award marks for each correctly demonstrated point, and withhold only the portion tied to missing or incorrect points. " .
        "Do not award credit for a guess that does not demonstrate relevant understanding. " .
        "Provide a numeric score from 0 to maxMarks (decimals allowed), clear feedback, " .
        "strengths (array of strings), improvements (an array of 2 to 3 concise, actionable phrases), and a betterAnswer (string) showing a model answer. " .
        "Return this exact schema: {\"score\": number, \"maxMarks\": number, \"feedback\": string, \"strengths\": string[], \"improvements\": string[], \"betterAnswer\": string}";

    $userPrompt = "Paper: {$paperTitle}\nCourse: {$paperCourse}\nYear: {$paperYear}\n" .
        "Question {$number} (Max marks: {$maxMarks})\n\nQuestion/Marking guide:\n{$prompt}\n\n" .
        "Student answer:\n{$answer}\n\nReturn JSON as specified.";

    $payload = [
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => $userPrompt],
        ],
        'temperature' => 0.2,
        'top_p' => 0.9,
        'max_tokens' => 2048,
        'response_format' => ['type' => 'json_object'],
    ];

    $eventId = createMarkingEvent($pdo, [
        'userId' => (string)$user['id'], 'paperId' => $paperId,
        'paperTitle' => mb_substr($paperTitle, 0, 240), 'paperCourse' => mb_substr($paperCourse, 0, 160), 'paperYear' => mb_substr($paperYear, 0, 40),
        'sourceType' => $sourceType, 'groupId' => $groupId, 'groupName' => $groupName, 'discussionId' => $discussionId,
        'questionId' => mb_substr($questionKey, 0, 512), 'questionNumber' => mb_substr($number, 0, 100),
        'prompt' => mb_substr($prompt, 0, 5000), 'answer' => $answer, 'maxMarks' => $maxMarks, 'model' => mb_substr($model, 0, 160),
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $GROQ_API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        finishMarkingEvent($pdo, $eventId, 'failed', null, 'transport_error', null);
        http_response_code(502);
        echo json_encode(['error' => 'Request to Groq failed: ' . curl_error($ch)]);
        curl_close($ch);
        exit;
    }

    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $decoded = json_decode($response, true);
    if ($status < 200 || $status >= 300) {
        finishMarkingEvent($pdo, $eventId, 'failed', null, 'provider_' . (int)$status, null);
        http_response_code($status ?: 502);
        echo json_encode([
            'error' => $decoded['error']['message'] ?? 'Groq returned an error.',
        ]);
        exit;
    }

    $content = $decoded['choices'][0]['message']['content'] ?? null;
    $mark = json_decode($content, true);
    if (!is_array($mark)) {
        $mark = [];
    }

    $score = isset($mark['score']) && is_numeric($mark['score']) ? (float)$mark['score'] : 0;
    if ($score < 0) $score = 0;
    if ($maxMarks > 0 && $score > $maxMarks) $score = $maxMarks;

    $feedback = isset($mark['feedback']) ? (string)$mark['feedback'] : '';
    $strengths = isset($mark['strengths']) && is_array($mark['strengths']) ? array_map('strval', $mark['strengths']) : [];
    $improvements = isset($mark['improvements']) && is_array($mark['improvements']) ? array_map('strval', $mark['improvements']) : [];
    $betterAnswer = isset($mark['betterAnswer']) ? (string)$mark['betterAnswer'] : (isset($mark['answer']) ? (string)$mark['answer'] : '');

    finishMarkingEvent($pdo, $eventId, 'marked', round($score, 2), null, json_encode(['feedback' => $feedback, 'strengths' => $strengths, 'improvements' => $improvements, 'betterAnswer' => $betterAnswer], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    $results[] = [
        'id' => $id,
        'score' => round($score, 2),
        'maxMarks' => round($maxMarks, 2),
        'feedback' => $feedback,
        'strengths' => $strengths,
        'improvements' => $improvements,
        'betterAnswer' => $betterAnswer,
    ];

    $totalScore += $score;
    $totalPossible += $maxMarks;
}

echo json_encode([
    'totalScore' => round($totalScore, 2),
    'totalPossible' => round($totalPossible, 2),
    'summary' => $totalPossible > 0 ? sprintf('Scored %.2f out of %.2f.', $totalScore, $totalPossible) : '',
    'results' => $results,
    'model' => $decoded['model'] ?? $model,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
