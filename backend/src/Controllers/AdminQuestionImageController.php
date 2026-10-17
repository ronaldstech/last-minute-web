<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;

/** Stores images attached to reviewed paper questions. */
final class AdminQuestionImageController
{
    private const MAX_BYTES = 10_485_760;
    private const MIME_EXTENSIONS = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    public function __construct(private readonly Authenticate $authenticate) {}

    public function upload(Request $request): array
    {
        $admin = $this->authenticate->user($request);
        if (!$admin['isAdmin']) throw new ApiException('Administrator access is required.', 403);
        $file = $request->file('image');
        if (!$file || !isset($file['error'], $file['tmp_name'], $file['size'])) throw new ApiException('Choose an image to upload.', 400);
        if ($file['error'] !== UPLOAD_ERR_OK) throw new ApiException('The image upload did not complete.', 400);
        if ((int)$file['size'] < 1 || (int)$file['size'] > self::MAX_BYTES) throw new ApiException('Images must be 10 MB or smaller.', 422);
        if (!is_uploaded_file($file['tmp_name'])) throw new ApiException('The uploaded image is invalid.', 400);
        $imageInfo = @getimagesize($file['tmp_name']);
        $mime = is_array($imageInfo) ? ($imageInfo['mime'] ?? '') : '';
        if (!isset(self::MIME_EXTENSIONS[$mime])) throw new ApiException('Use a JPEG, PNG, WebP, or GIF image.', 422);

        $directory = dirname(__DIR__, 2) . '/public/uploads/question-images';
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new ApiException('Image storage is unavailable.', 500);
        $name = bin2hex(random_bytes(20)) . '.' . self::MIME_EXTENSIONS[$mime];
        if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $name)) throw new ApiException('Could not store this image.', 500);
        return ['data' => ['url' => '/uploads/question-images/' . $name, 'mimeType' => $mime, 'size' => (int)$file['size']]];
    }
}
