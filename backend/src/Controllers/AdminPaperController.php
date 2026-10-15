<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use JsonException;
use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AdminPaperRepository;

/** Admin-only paper library CRUD handlers. */
final class AdminPaperController
{
    public function __construct(private readonly AdminPaperRepository $papers, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $this->requireAdmin($request);
        $id = $request->query('id');
        if ($id !== '') {
            $this->validateId($id);
            $paper = $this->papers->find($id);
            if (!$paper) throw new ApiException('Paper not found.', 404);
            return ['data' => ['paper' => AdminPaperRepository::serialize($paper, true)]];
        }
        $limit = max(1, min(100, (int)$request->query('limit', '40')));
        $cursor = $request->query('cursor', '0');
        if (!preg_match('/^(?:0|[1-9][0-9]{0,18})$/', $cursor)) throw new ApiException('The paper page cursor is invalid.', 400);
        $rows = $this->papers->page((int)$cursor, $limit);
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        $papers = array_map([AdminPaperRepository::class, 'serialize'], $rows);
        return ['data' => ['papers' => $papers, 'nextCursor' => $hasMore ? (string)end($rows)['id'] : null]];
    }

    public function create(Request $request): array
    {
        $this->requireAdmin($request);
        $paper = $this->validatedPaper($request->json());
        return ['status' => 201, 'data' => ['paper' => AdminPaperRepository::serialize($this->papers->create($paper), true)]];
    }

    public function update(Request $request): array
    {
        $this->requireAdmin($request);
        $id = $request->query('id');
        $this->validateId($id);
        $paper = $this->validatedPaper($request->json());
        $updated = $this->papers->update($id, $paper);
        if (!$updated) throw new ApiException('Paper not found.', 404);
        return ['data' => ['paper' => AdminPaperRepository::serialize($updated, true)]];
    }

    public function delete(Request $request): array
    {
        $this->requireAdmin($request);
        $id = $request->query('id');
        $this->validateId($id);
        if (!$this->papers->delete($id)) throw new ApiException('Paper not found.', 404);
        return ['data' => ['deleted' => true, 'id' => $id]];
    }

    private function validatedPaper(array $input): array
    {
        $title = trim(is_string($input['title'] ?? null) ? $input['title'] : '');
        if ($title === '' || mb_strlen($title) > 240) throw new ApiException('Paper title must contain 1 to 240 characters.', 422);
        $questions = $input['questions'] ?? [];
        if (!is_array($questions) || !array_is_list($questions)) throw new ApiException('Paper questions must be a list.', 422);
        if (count($questions) > 1000) throw new ApiException('A paper cannot contain more than 1000 questions.', 422);
        foreach ($questions as $question) {
            if (!is_array($question)) throw new ApiException('Each paper question must be an object.', 422);
        }
        try { $encodedQuestions = json_encode($questions, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); }
        catch (JsonException) { throw new ApiException('Paper questions contain invalid data.', 422); }
        return [
            'title' => $title,
            'course' => $this->text($input['course'] ?? '', 'Course', 160),
            'year' => $this->text($input['year'] ?? '', 'Exam year', 40),
            'semester' => $this->text($input['semester'] ?? '', 'Semester', 40),
            'questions' => $encodedQuestions,
            'questionCount' => count($questions),
        ];
    }

    private function text(mixed $value, string $label, int $maxLength): string
    {
        if (!is_string($value)) throw new ApiException("{$label} must be text.", 422);
        if (mb_strlen($value) > $maxLength) throw new ApiException("{$label} must be {$maxLength} characters or fewer.", 422);
        return trim($value);
    }

    private function validateId(string $id): void
    {
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('A valid paper ID is required.', 422);
    }

    private function requireAdmin(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (!$admin['isAdmin']) throw new ApiException('Administrator access is required.', 403);
        return $admin;
    }
}
