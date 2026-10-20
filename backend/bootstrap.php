<?php
declare(strict_types=1);

use LastMinute\Config\Database;
use LastMinute\Controllers\AuthController;
use LastMinute\Controllers\AdminUserController;
use LastMinute\Controllers\AdminAcademicController;
use LastMinute\Controllers\AdminMarkingController;
use LastMinute\Controllers\AdminAccountHistoryController;
use LastMinute\Controllers\ProfileController;
use LastMinute\Controllers\AdminPaperController;
use LastMinute\Controllers\AdminQuestionImageController;
use LastMinute\Controllers\UserPaperController;
use LastMinute\Controllers\PracticeAnswerController;
use LastMinute\Controllers\PaperReportController;
use LastMinute\Controllers\WalletController;
use LastMinute\Controllers\StudyGroupController;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\SessionRepository;
use LastMinute\Repositories\UserRepository;
use LastMinute\Routing\Router;
use LastMinute\Services\AuthService;

/** Register the small PSR-4-style loader used by this dependency-free API. */
spl_autoload_register(static function (string $class): void {
    $prefix = 'LastMinute\\';
    if (!str_starts_with($class, $prefix)) return;
    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) require $file;
});

/** Create the application router with its database-backed service dependencies. */
function last_minute_router(): Router
{
    $pdo = Database::connection();
    $users = new UserRepository($pdo);
    $sessions = new SessionRepository($pdo);
    $auth = new AuthService($pdo, $users, $sessions);
    $controller = new AuthController($auth, new Authenticate($sessions));
    $authenticate = new Authenticate($sessions);
    $adminUsers = new AdminUserController(new \LastMinute\Repositories\AdminUserRepository($pdo), $authenticate);
    $adminMarking = new AdminMarkingController(new \LastMinute\Repositories\AdminMarkingRepository($pdo), $authenticate);
    $adminAccountHistory = new AdminAccountHistoryController(new \LastMinute\Repositories\AdminAccountHistoryRepository($pdo), $authenticate);
    $adminAcademics = new AdminAcademicController(new \LastMinute\Repositories\AcademicStructureRepository($pdo), $authenticate);
    $profile = new ProfileController(new \LastMinute\Repositories\ProfileRepository($pdo), $authenticate);
    $adminPapers = new AdminPaperController(new \LastMinute\Repositories\AdminPaperRepository($pdo), $authenticate);
    $userPapers = new UserPaperController(new \LastMinute\Repositories\UserPaperRepository($pdo), $authenticate);
    $practiceAnswers = new PracticeAnswerController(new \LastMinute\Repositories\PracticeAnswerRepository($pdo), $authenticate);
    $paperReports = new PaperReportController(new \LastMinute\Repositories\PaperReportRepository($pdo), $authenticate);
    // Load wallet classes only when a wallet route is called, so a partial
    // wallet deployment cannot take unrelated account and paper routes down.
    $walletEndpoint = static function (string $method) use ($pdo, $authenticate): callable {
        return static function (Request $request) use ($method, $pdo, $authenticate): array {
            $wallet = new WalletController(new \LastMinute\Repositories\WalletRepository($pdo), $authenticate, new \LastMinute\Services\PaymentGateway());
            return $wallet->{$method}($request);
        };
    };
    $groupEndpoint = static function (string $method) use ($pdo, $authenticate): callable {
        return static function (Request $request) use ($method, $pdo, $authenticate): array {
            $groups = new StudyGroupController(new \LastMinute\Repositories\StudyGroupRepository($pdo), $authenticate);
            return $groups->{$method}($request);
        };
    };
    $router = new Router();
    $router->add('POST', '/auth/register', [$controller, 'register']);
    $router->add('POST', '/auth/login', [$controller, 'login']);
    $router->add('GET', '/auth/me', [$controller, 'me']);
    $router->add('POST', '/auth/logout', [$controller, 'logout']);
    $router->add('GET', '/admin/users', [$adminUsers, 'index']);
    $router->add('GET', '/admin/marking', [$adminMarking, 'index']);
    $router->add('GET', '/admin/account-history', [$adminAccountHistory, 'index']);
    $router->add('PATCH', '/admin/users', [$adminUsers, 'update']);
    $router->add('POST', '/admin/users/gift', [$adminUsers, 'gift']);
    $router->add('GET', '/admin/academics', [$adminAcademics, 'index']);
    $router->add('POST', '/admin/academics', [$adminAcademics, 'create']);
    $router->add('GET', '/admin/papers', [$adminPapers, 'index']);
    $router->add('POST', '/admin/papers', [$adminPapers, 'create']);
    $router->add('PATCH', '/admin/papers', [$adminPapers, 'update']);
    $router->add('DELETE', '/admin/papers', [$adminPapers, 'delete']);
    $adminQuestionImages = new AdminQuestionImageController($authenticate);
    $router->add('POST', '/admin/paper-question-images', [$adminQuestionImages, 'upload']);
    $router->add('GET', '/admin/paper-reports', [$paperReports, 'index']);
    $router->add('PATCH', '/admin/paper-reports', [$paperReports, 'update']);
    $router->add('GET', '/papers', [$userPapers, 'index']);
    $router->add('GET', '/history', [$userPapers, 'history']);
    $router->add('GET', '/papers/detail', [$userPapers, 'show']);
    $router->add('POST', '/papers/saved', [$userPapers, 'save']);
    $router->add('DELETE', '/papers/saved', [$userPapers, 'unsave']);
    $router->add('POST', '/papers/unlock', [$userPapers, 'unlock']);
    $router->add('POST', '/papers/answers', [$practiceAnswers, 'submit']);
    $router->add('POST', '/papers/reports', [$paperReports, 'create']);
    $router->add('GET', '/papers/reports', [$paperReports, 'forPaper']);
    $router->add('PATCH', '/profile', [$profile, 'update']);
    $router->add('GET', '/academics', [$adminAcademics, 'catalog']);
    $router->add('GET', '/wallet', $walletEndpoint('show'));
    $router->add('GET', '/wallet/operators', $walletEndpoint('operators'));
    $router->add('POST', '/wallet/transactions', $walletEndpoint('createTransaction'));
    $router->add('POST', '/wallet/transactions/verify', $walletEndpoint('verifyTransaction'));
    $router->add('GET', '/groups', $groupEndpoint('index'));
    $router->add('POST', '/groups', $groupEndpoint('create'));
    $router->add('GET', '/groups/invitations', $groupEndpoint('invitations'));
    $router->add('POST', '/groups/invitations', $groupEndpoint('invite'));
    $router->add('POST', '/groups/invitations/respond', $groupEndpoint('respond'));
    $router->add('GET', '/groups/messages', $groupEndpoint('messages'));
    $router->add('POST', '/groups/messages', $groupEndpoint('sendMessage'));
    $router->add('GET', '/groups/plans', $groupEndpoint('plans'));
    $router->add('POST', '/groups/plans', $groupEndpoint('schedule'));
    $router->add('POST', '/groups/plans/join', $groupEndpoint('joinPlan'));
    $router->add('POST', '/groups/plans/next', $groupEndpoint('nextQuestion'));
    $router->add('POST', '/groups/plans/end', $groupEndpoint('endDiscussion'));
    $router->add('POST', '/groups/plans/mark', $groupEndpoint('saveDiscussionMarks'));
    $router->add('POST', '/groups/plans/publish-due', $groupEndpoint('publishDue'));
    $router->add('POST', '/groups/plans/answer', $groupEndpoint('answer'));
    return $router;
}

/** Dispatch the current HTTP request and convert expected errors to JSON. */
function run_last_minute_api(): never
{
    \LastMinute\Http\Cors::handle();
    $request = Request::fromGlobals();

    try {
        $result = last_minute_router()->dispatch($request);
        \LastMinute\Http\Response::json($result['status'] ?? 200, $result['data']);
    } catch (\LastMinute\Http\ApiException $error) {
        \LastMinute\Http\Response::json($error->status, ['message' => $error->getMessage()]);
    } catch (\Throwable $error) {
        error_log(sprintf('[last-minute-api] %s %s: %s', $request->method, $request->path, $error));
        \LastMinute\Http\Response::json(500, ['message' => 'The account service could not complete the request. Check the PHP and MySQL server logs.']);
    }
}
