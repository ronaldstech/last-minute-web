<?php
declare(strict_types=1);

namespace LastMinute\Routing;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;

/** Small explicit router for the JSON API; route handlers return response data. */
final class Router
{
    /** @var array<string, callable(Request): array{status?: int, data: array}> */
    private array $routes = [];

    /** Register one HTTP method and exact path pair. */
    public function add(string $method, string $path, callable $handler): void
    {
        $this->routes[strtoupper($method) . ' ' . $path] = $handler;
    }

    /** Dispatch a request or raise a standard not-found response error. */
    public function dispatch(Request $request): array
    {
        $handler = $this->routes[$request->method . ' ' . $request->path] ?? null;
        if (!$handler) throw new ApiException('API route not found.', 404);
        return $handler($request);
    }
}
