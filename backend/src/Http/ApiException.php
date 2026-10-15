<?php
declare(strict_types=1);

namespace LastMinute\Http;

use RuntimeException;

/** An expected API error that can be safely returned to the client. */
final class ApiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}
