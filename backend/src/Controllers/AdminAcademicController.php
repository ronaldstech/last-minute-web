<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AcademicStructureRepository;

/** Admin-only academic directory endpoints. */
final class AdminAcademicController
{
    public function __construct(private readonly AcademicStructureRepository $academics, private readonly Authenticate $authenticate) {}

    public function index(Request $request): array
    {
        $this->requireAdmin($request);
        return $this->records($request);
    }

    /** Signed-in users can read the directory to select their study details. */
    public function catalog(Request $request): array
    {
        $this->authenticate->user($request);
        return $this->records($request);
    }

    private function records(Request $request): array
    {
        $type = $request->query('type');
        if (!AcademicStructureRepository::validType($type)) throw new ApiException('Choose colleges, schools, departments, or programmes.', 422);
        $parentId = $request->query('parentId');
        if (AcademicStructureRepository::requiresParent($type) && $parentId === '' && $type !== 'departments') throw new ApiException('A valid parent ID is required.', 422);
        if ($parentId !== '' && !preg_match('/^[1-9][0-9]{0,18}$/', $parentId)) throw new ApiException('A valid parent ID is required.', 422);
        return ['data' => ['records' => $this->academics->page($type, $parentId ?: null)]];
    }

    public function create(Request $request): array
    {
        $this->requireAdmin($request);
        $body = $request->json();
        $type = is_string($body['type'] ?? null) ? $body['type'] : '';
        $name = trim(is_string($body['name'] ?? null) ? $body['name'] : '');
        $alias = trim(is_string($body['alias'] ?? null) ? $body['alias'] : '');
        $parentId = is_scalar($body['parentId'] ?? null) ? (string)$body['parentId'] : '';
        if (!AcademicStructureRepository::validType($type)) throw new ApiException('Choose colleges, schools, departments, or programmes.', 422);
        if ($name === '' || mb_strlen($name) > 160) throw new ApiException('Name must contain 1 to 160 characters.', 422);
        if (mb_strlen($alias) > 80) throw new ApiException('Alias must contain at most 80 characters.', 422);
        if (AcademicStructureRepository::requiresParent($type) && !preg_match('/^[1-9][0-9]{0,18}$/', $parentId)) throw new ApiException('A valid parent ID is required.', 422);
        return ['status' => 201, 'data' => ['record' => $this->academics->create($type, $name, $alias, $parentId ?: null)]];
    }

    private function requireAdmin(Request $request): void
    {
        if (!$this->authenticate->user($request)['isAdmin']) throw new ApiException('Administrator access is required.', 403);
    }
}
