<?php
declare(strict_types=1);

/** Public Apache entry point; application code and database config stay outside this folder. */
require dirname(__DIR__) . '/bootstrap.php';
run_last_minute_api();
