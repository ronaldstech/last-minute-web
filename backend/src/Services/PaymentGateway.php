<?php
declare(strict_types=1);

namespace LastMinute\Services;

use LastMinute\Config\Environment;
use LastMinute\Http\ApiException;

/** Server-to-server adapter for the existing PayChangu PHP endpoints. */
final class PaymentGateway
{
    private function baseUrl(): string
    {
        return rtrim(Environment::get('PAYMENT_API_BASE_URL', 'https://apexspacemw.com/rt/last_minute/paychangu') ?? '', '/');
    }

    public function initialize(array $transaction, array $user): array
    {
        $names = preg_split('/\s+/', trim((string)($user['username'] ?? ''))) ?: [];
        $payload = [
            'mobile' => $transaction['mobile'],
            'operator_id' => $transaction['operatorId'],
            'amount' => (string)$transaction['amountMwk'],
            'charge_id' => $transaction['chargeId'],
            'email' => $user['email'] ?? '',
            'first_name' => $names[0] ?? 'Student',
            'last_name' => count($names) > 1 ? implode(' ', array_slice($names, 1)) : 'Account',
        ];
        $body = $this->send('initialize_payment.php', 'POST', $payload);
        if (isset($body['status']) && strtolower((string)$body['status']) !== 'success') {
            throw new ApiException((string)($body['message'] ?? 'The payment could not be started.'), 502);
        }
        $data = is_array($body['data'] ?? null) ? $body['data'] : [];
        $txRef = (string)($data['tx_ref'] ?? $data['txRef'] ?? $data['charge_id'] ?? $data['reference'] ?? $body['tx_ref'] ?? $transaction['chargeId']);
        return ['txRef' => $txRef, 'message' => (string)($body['message'] ?? '')];
    }

    public function operators(): array
    {
        $body = $this->send('get_operators.php', 'GET');
        if (isset($body['status']) && strtolower((string)$body['status']) !== 'success') {
            throw new ApiException((string)($body['message'] ?? 'Could not load mobile money operators.'), 502);
        }
        $operators = [];
        $providerOperators = $body['data'] ?? [];
        if (!is_array($providerOperators)) throw new ApiException('The payment service returned an invalid operator list.', 502);
        foreach ($providerOperators as $operator) {
            if (!is_array($operator)) continue;
            $id = trim((string)($operator['ref_id'] ?? ''));
            $name = trim((string)($operator['name'] ?? ''));
            if ($id === '' || $name === '') continue;
            $operators[] = [
                'id' => $id,
                'name' => $name,
                'logo' => (string)($operator['logo'] ?? ''),
                'currency' => (string)($operator['supported_country']['currency'] ?? 'MWK'),
            ];
        }
        return $operators;
    }

    public function verify(string $txRef): array
    {
        $body = $this->send('verify_payment.php?' . http_build_query(['txRef' => $txRef]), 'GET');
        $data = is_array($body['data'] ?? null) ? $body['data'] : [];
        $status = strtolower((string)($data['status'] ?? $data['payment_status'] ?? $body['status'] ?? 'pending'));
        if (in_array($status, ['paid', 'success', 'successful', 'completed'], true)) return ['status' => 'paid', 'message' => (string)($body['message'] ?? '')];
        if (in_array($status, ['failed', 'failure', 'cancelled', 'canceled', 'error'], true)) return ['status' => 'failed', 'message' => (string)($body['message'] ?? 'The payment was not completed.')];
        return ['status' => 'pending', 'message' => (string)($body['message'] ?? 'Payment is still pending. Try again shortly.')];
    }

    private function send(string $path, string $method, ?array $payload = null): array
    {
        $url = $this->baseUrl() . '/' . $path;
        $headers = ['Accept: application/json'];
        $contextOptions = ['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'timeout' => 20, 'ignore_errors' => true]];
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
            $contextOptions['http']['header'] = implode("\r\n", $headers);
            $contextOptions['http']['content'] = json_encode($payload, JSON_THROW_ON_ERROR);
        }

        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_CONNECTTIMEOUT => 8,
            ]);
            if ($payload !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
            $raw = curl_exec($curl);
            $statusCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
            if ($raw === false) throw new ApiException('Could not reach the payment service. Please try again.', 502);
        } else {
            $raw = @file_get_contents($url, false, stream_context_create($contextOptions));
            $statusCode = 0;
            foreach ($http_response_header ?? [] as $header) if (preg_match('~^HTTP/\S+\s+(\d{3})~', $header, $match)) $statusCode = (int)$match[1];
            if ($raw === false) throw new ApiException('Could not reach the payment service. Please try again.', 502);
        }

        $body = json_decode((string)$raw, true);
        if (!is_array($body)) throw new ApiException('The payment service returned an unreadable response.', 502);
        if ($statusCode < 200 || $statusCode >= 300) throw new ApiException((string)($body['message'] ?? 'The payment service could not complete the request.'), 502);
        return $body;
    }
}
