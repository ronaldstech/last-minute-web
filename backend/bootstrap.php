<?php
declare(strict_types=1);

use LastMinute\Config\Database;
use LastMinute\Controllers\AuthController;
use LastMinute\Controllers\AdminUserController;
use LastMinute\Controllers\AdminAcademicController;
use LastMinute\Controllers\ProfileController;
use LastMinute\Controllers\AdminPaperController;
use LastMinute\Controllers\UserPaperController;
use LastMinute\Controllers\PracticeAnswerController;
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
    $adminAcademics = new AdminAcademicController(new \LastMinute\Repositories\AcademicStructureRepository($pdo), $authenticate);
    $profile = new ProfileController(new \LastMinute\Repositories\ProfileRepository($pdo), $authenticate);
    $adminPapers = new AdminPaperController(new \LastMinute\Repositories\AdminPaperRepository($pdo), $authenticate);
    $userPapers = new UserPaperController(new \LastMinute\Repositories\UserPaperRepository($pdo), $authenticate);
    $practiceAnswers = new PracticeAnswerController(new \LastMinute\Repositories\PracticeAnswerRepository($pdo), $authenticate);
    $router = new Router();
    $router->add('POST', '/auth/register', [$controller, 'register']);
    $router->add('POST', '/auth/login', [$controller, 'login']);
    $router->add('GET', '/auth/me', [$controller, 'me']);
    $router->add('POST', '/auth/logout', [$controller, 'logout']);
    $router->add('GET', '/admin/users', [$adminUsers, 'index']);
    $router->add('PATCH', '/admin/users', [$adminUsers, 'update']);
    $router->add('POST', '/admin/users/gift', [$adminUsers, 'gift']);
    $router->add('GET', '/admin/academics', [$adminAcademics, 'index']);
    $router->add('POST', '/admin/academics', [$adminAcademics, 'create']);
    $router->add('GET', '/admin/papers', [$adminPapers, 'index']);
    $router->add('POST', '/admin/papers', [$adminPapers, 'create']);
    $router->add('PATCH', '/admin/papers', [$adminPapers, 'update']);
    $router->add('DELETE', '/admin/papers', [$adminPapers, 'delete']);
    $router->add('GET', '/papers', [$userPapers, 'index']);
    $router->add('GET', '/papers/detail', [$userPapers, 'show']);
    $router->add('POST', '/papers/saved', [$userPapers, 'save']);
    $router->add('DELETE', '/papers/saved', [$userPapers, 'unsave']);
    $router->add('POST', '/papers/unlock', [$userPapers, 'unlock']);
    $router->add('POST', '/papers/answers', [$practiceAnswers, 'submit']);
    $router->add('PATCH', '/profile', [$profile, 'update']);
    $router->add('GET', '/academics', [$adminAcademics, 'catalog']);
    return $router;
}

/** Dispatch the current HTTP request and convert expected errors to JSON. */
function run_last_minute_api(): never
{
    $request = Request::fromGlobals();
    $origins = array_filter(array_map('trim', explode(',', \LastMinute\Config\Environment::get('APP_ORIGINS', 'http://localhost:5173') ?? '')));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $origins, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    }
    if ($request->method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

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
