<?php
declare(strict_types=1);

namespace LastMinute\Controllers;

use LastMinute\Http\ApiException;
use LastMinute\Http\Request;
use LastMinute\Middleware\Authenticate;
use LastMinute\Repositories\WalletRepository;
use LastMinute\Services\PaymentGateway;

/** Authenticated MySQL wallet and coin purchase endpoints. */
final class WalletController
{
    private const PACKS = [
        'starter' => ['coins' => 100, 'bonus' => 0],
        'focus' => ['coins' => 250, 'bonus' => 0],
        'builder' => ['coins' => 500, 'bonus' => 0],
        'scholar' => ['coins' => 1000, 'bonus' => 100],
        'achiever' => ['coins' => 2500, 'bonus' => 400],
        'champion' => ['coins' => 5000, 'bonus' => 1200],
    ];

    public function __construct(
        private readonly WalletRepository $wallet,
        private readonly Authenticate $authenticate,
        private readonly PaymentGateway $payments,
    ) {}

    public function show(Request $request): array
    {
        $user = $this->authenticate->user($request);
        return ['data' => $this->wallet->show((string)$user['id'])];
    }

    public function operators(Request $request): array
    {
        $this->authenticate->user($request);
        return ['data' => ['operators' => $this->payments->operators()]];
    }

    public function createTransaction(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $input = $request->json();
        $packId = (string)($input['packId'] ?? '');
        if (!isset(self::PACKS[$packId])) throw new ApiException('Choose a valid coin pack.', 422);
        $operatorId = trim((string)($input['operatorId'] ?? ''));
        $operatorName = trim((string)($input['operatorName'] ?? ''));
        $mobile = preg_replace('/[\s()-]/', '', (string)($input['mobile'] ?? '')) ?? '';
        if (!preg_match('/^(?:\+?265)?0?9\d{8}$/', $mobile)) throw new ApiException('Enter a valid Malawi mobile number.', 422);
        if (str_starts_with($mobile, '+265')) $mobile = '0' . substr($mobile, 4);
        elseif (str_starts_with($mobile, '265')) $mobile = '0' . substr($mobile, 3);
        if ($operatorId === '' || mb_strlen($operatorId) > 100 || $operatorName === '' || mb_strlen($operatorName) > 120) {
            throw new ApiException('Choose a valid mobile money operator.', 422);
        }

        $pack = self::PACKS[$packId];
        $totalCoins = $pack['coins'] + $pack['bonus'];
        $transaction = $this->wallet->create((string)$user['id'], [
            'operatorId' => $operatorId,
            'operatorName' => $operatorName,
            'mobile' => $mobile,
            'coins' => $totalCoins,
            'amountMwk' => $totalCoins,
        ]);
        $payment = $this->payments->initialize($transaction, $user);
        $this->wallet->setReference((string)$user['id'], $transaction['chargeId'], $payment['txRef']);
        $transaction['txRef'] = $payment['txRef'];
        return ['status' => 201, 'data' => ['transaction' => $transaction, 'message' => $payment['message']]];
    }

    public function verifyTransaction(Request $request): array
    {
        $user = $this->authenticate->user($request);
        $chargeId = trim((string)($request->json()['chargeId'] ?? ''));
        if (!preg_match('/^LM[A-F0-9]{28}$/', $chargeId)) throw new ApiException('A valid payment reference is required.', 422);
        $transaction = $this->wallet->find((string)$user['id'], $chargeId);
        if (!$transaction) throw new ApiException('This payment could not be found in your wallet.', 404);
        if ($transaction['status'] === 'paid' && $transaction['credited']) {
            return ['data' => ['status' => 'paid', 'message' => 'Payment received. Your coins are in your wallet.', ...$this->wallet->show((string)$user['id'])]];
        }
        if (!$transaction['txRef']) throw new ApiException('This payment is not ready for verification yet.', 409);

        $result = $this->payments->verify($transaction['txRef']);
        $wallet = $this->wallet->applyVerification((string)$user['id'], $chargeId, $result['status'], $result['message']);
        return ['data' => ['status' => $result['status'], 'message' => $result['message'], ...$wallet]];
    }
}
