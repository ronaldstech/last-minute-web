<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\PaperReportRepository;

final class PaperReportController
{
    private const CATEGORIES = ['Incorrect content', 'Missing content', 'Wrong paper details', 'Formatting issue', 'Other'];
    private const STATUSES = ['open', 'reviewing', 'resolved'];

    public function __construct(private readonly PaperReportRepository $reports, private readonly Authenticate $authenticate) {}

    public function create(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $paperId = is_scalar($input['paperId'] ?? null) ? (string)$input['paperId'] : '';
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $paperId)) throw new ApiException('Choose a valid paper to report.', 422);
        $category = trim(is_string($input['category'] ?? null) ? $input['category'] : '');
        if (!in_array($category, self::CATEGORIES, true)) throw new ApiException('Choose a valid report category.', 422);
        $details = trim(is_string($input['details'] ?? null) ? $input['details'] : '');
        if ($details === '' || mb_strlen($details) > 2000) throw new ApiException('Describe the issue in 1 to 2000 characters.', 422);
        $report = $this->reports->create($paperId, (string)$user['id'], $category, $details);
        if (!$report) throw new ApiException('The paper could not be found.', 404);
        return ['status' => 201, 'data' => ['report' => $report]];
    }

    public function forPaper(Request $request): array
    {
        $this->authenticate->user($request);
        $paperId = $request->query('paperId');
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $paperId)) throw new ApiException('Choose a valid paper to view reports.', 400);
        return ['data' => ['reports' => $this->reports->forPaper($paperId)]];
    }

    public function index(Request $request): array
    {
        $this->requireAdmin($request);
        $limit = max(1, min(100, (int)$request->query('limit', '25')));
        $cursor = $request->query('cursor', '0');
        if (!preg_match('/^(?:0|[1-9][0-9]{0,18})$/', $cursor)) throw new ApiException('The report page cursor is invalid.', 400);
        $rows = $this->reports->page((int)$cursor, $limit);
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        return ['data' => ['reports' => $rows, 'nextCursor' => $hasMore && $rows ? end($rows)['id'] : null]];
    }

    public function update(Request $request): array
    {
        $this->requireAdmin($request);
        $id = $request->query('id');
        if (!preg_match('/^[1-9][0-9]{0,18}$/', $id)) throw new ApiException('The report ID is invalid.', 400);
        $status = $request->json()['status'] ?? '';
        if (!is_string($status) || !in_array($status, self::STATUSES, true)) throw new ApiException('Choose a valid report status.', 422);
        $report = $this->reports->updateStatus($id, $status);
        if (!$report) throw new ApiException('Report not found.', 404);
        return ['data' => ['report' => $report]];
    }

    private function requireAdmin(Request $request): array
    {
        $user = $this->authenticate->user($request);
        if (empty($user['isAdmin'])) throw new ApiException('Administrator access is required.', 403);
        return $user;
    }
}
