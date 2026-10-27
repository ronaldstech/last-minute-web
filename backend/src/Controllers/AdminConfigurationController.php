<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\AppConfigurationRepository;

final class AdminConfigurationController
{
    public function __construct(private readonly AppConfigurationRepository $configuration, private readonly Authenticate $authenticate) {}

    public function show(Request $request): array
    {
        if (!$this->authenticate->user($request)['isAdmin']) throw new ApiException('Administrator access is required.', 403);
        return ['data' => ['configuration' => $this->configuration->get()]];
    }

    public function update(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (!$admin['isAdmin']) throw new ApiException('Administrator access is required.', 403);
        $input = $request->json();
        if (array_key_exists('slideQuestionGenerationCost', $input)
            && (int)$input['slideQuestionGenerationCost'] !== (int)$this->configuration->get()['slideQuestionGenerationCost']
            && empty($admin['isSuperAdmin'])) {
            throw new ApiException('Only a super administrator can change the AI paper generation price.', 403);
        }
        try { return ['data' => ['configuration' => $this->configuration->save($input)]]; }
        catch (\InvalidArgumentException $error) { throw new ApiException($error->getMessage(), 422); }
    }
}
