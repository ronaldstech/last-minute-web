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
    private const EXAM_TYPES = ['quiz1', 'midsemester', 'quiz2', 'quiz3', 'endsemester', 'project', 'presentation', 'sample'];

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
        if (!in_array($title, self::EXAM_TYPES, true)) throw new ApiException('Choose a valid exam type.', 422);
        $year = $this->text($input['year'] ?? '', 'Exam year', 4);
        $currentYear = (int)date('Y');
        if (!preg_match('/^\d{4}$/', $year) || (int)$year < 2015 || (int)$year > $currentYear) throw new ApiException("Exam year must be from 2015 through {$currentYear}.", 422);
        $semester = $this->text($input['semester'] ?? '', 'Semester', 2);
        if (!in_array($semester, ['1', '2'], true)) throw new ApiException('Semester must be 1 or 2.', 422);
        $departmentId = is_scalar($input['departmentId'] ?? null) ? (string)$input['departmentId'] : '';
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $departmentId)) throw new ApiException('Choose a valid department.', 422);
        $department = $this->papers->department($departmentId);
        if (!$department) throw new ApiException('The selected department no longer exists.', 422);
        $questions = $input['questions'] ?? [];
        if (!is_array($questions) || !array_is_list($questions)) throw new ApiException('Paper questions must be a list.', 422);
        if (count($questions) > 1000) throw new ApiException('A paper cannot contain more than 1000 questions.', 422);
        foreach ($questions as $question) {
            if (!is_array($question)) throw new ApiException('Each paper question must be an object.', 422);
        }
        $assignments = $input['programmeAssignments'] ?? [];
        if (!is_array($assignments) || !array_is_list($assignments)) throw new ApiException('Programme assignments must be a list.', 422);
        if (count($assignments) > 100) throw new ApiException('A paper cannot have more than 100 programme assignments.', 422);
        $canonicalAssignments = [];
        $seenProgrammes = [];
        foreach ($assignments as $assignment) {
            if (!is_array($assignment)) throw new ApiException('Each programme assignment must be an object.', 422);
            $programmeId = is_scalar($assignment['programmeId'] ?? null) ? (string)$assignment['programmeId'] : '';
            if (!preg_match('/^[1-9][0-9]{0,18}$/', $programmeId)) throw new ApiException('Choose a valid programme.', 422);
            $academicRecord = $this->papers->programmeInDepartment($departmentId, $programmeId);
            if (!$academicRecord) throw new ApiException('A selected programme no longer belongs to its department.', 422);
            if (isset($seenProgrammes[$programmeId])) throw new ApiException('A programme can only be added once to a paper.', 422);
            $seenProgrammes[$programmeId] = true;
            $studyYear = $assignment['studyYear'] ?? null;
            if (!is_int($studyYear) || $studyYear < 1 || $studyYear > 6) throw new ApiException('Choose one study year from 1 to 6 for each programme.', 422);
            $canonicalAssignments[] = [
                'programmeId' => (string)$academicRecord['programmeId'],
                'programmeName' => $academicRecord['programmeName'],
                'studyYear' => $studyYear,
            ];
        }
        try { $encodedQuestions = json_encode($questions, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); }
        catch (JsonException) { throw new ApiException('Paper questions contain invalid data.', 422); }
        return [
            'title' => $title,
            'course' => $this->text($input['course'] ?? '', 'Course', 160),
            'year' => $year,
            'semester' => $semester,
            'departmentId' => (string)$department['id'],
            'departmentName' => $department['name'],
            'questions' => $encodedQuestions,
            'programmeAssignments' => json_encode($canonicalAssignments, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
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
