<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppService
{
  private string $baseUrl;
  private ?string $apiKey;

  public function __construct()
  {
    $this->baseUrl = config('whatsapp.bridge_url', 'http://localhost:3000');
    $this->apiKey = config('whatsapp.api_key');
  }

  /**
   * إرسال رسالة نصية
   */
  public function sendMessage(string $sessionId, string $phoneNumber, string $message): array
  {
    try {
      $headers = [];
      if ($this->apiKey) {
        $headers['X-API-Key'] = $this->apiKey;
      }

      $response = Http::withHeaders($headers)
        ->timeout(30)
        ->post("{$this->baseUrl}/sessions/{$sessionId}/send", [
          'to' => $this->normalizePhoneNumber($phoneNumber),
          'message' => $message
        ]);

      if ($response->successful()) {
        Log::info('WhatsApp message sent successfully', [
          'session_id' => $sessionId,
          'phone' => $phoneNumber,
          'message_id' => $response->json()['id'] ?? null
        ]);

        return [
          'success' => true,
          'message_id' => $response->json()['id'] ?? null,
          'data' => $response->json()
        ];
      }

      Log::error('WhatsApp message failed', [
        'session_id' => $sessionId,
        'phone' => $phoneNumber,
        'response' => $response->body()
      ]);

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Unknown error',
        'status_code' => $response->status()
      ];
    } catch (\Exception $e) {
      Log::error('WhatsApp service exception', [
        'session_id' => $sessionId,
        'phone' => $phoneNumber,
        'error' => $e->getMessage()
      ]);

      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * إرسال استطلاع رأي
   */
  public function sendPoll(string $sessionId, string $phoneNumber, string $question, array $options, int $selectableCount = 1): array
  {
    try {
      $headers = [];
      if ($this->apiKey) {
        $headers['X-API-Key'] = $this->apiKey;
      }

      $response = Http::withHeaders($headers)
        ->timeout(30)
        ->post("{$this->baseUrl}/sessions/{$sessionId}/send-poll", [
        'to' => $this->normalizePhoneNumber($phoneNumber),
        'name' => $question,
        'options' => $options,
        'selectableCount' => $selectableCount
      ]);

      if ($response->successful()) {
        return [
          'success' => true,
          'message_id' => $response->json()['id'] ?? null,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Unknown error'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * إرسال أزرار تفاعلية
   */
  public function sendButtons(string $sessionId, string $phoneNumber, string $text, array $buttons, array $options = []): array
  {
    try {
      $payload = array_merge([
        'to' => $this->normalizePhoneNumber($phoneNumber),
        'text' => $text,
        'buttons' => $buttons
      ], $options);

      $response = Http::timeout(30)->post("{$this->baseUrl}/sessions/{$sessionId}/send-buttons", $payload);

      if ($response->successful()) {
        return [
          'success' => true,
          'message_id' => $response->json()['id'] ?? null,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Unknown error'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * إرسال رسالة تفاعلية متقدمة
   */
  public function sendInteractive(string $sessionId, string $phoneNumber, array $content, array $options = []): array
  {
    try {
      $payload = array_merge([
        'to' => $this->normalizePhoneNumber($phoneNumber)
      ], $content, $options);

      $response = Http::timeout(30)->post("{$this->baseUrl}/sessions/{$sessionId}/send-interactive", $payload);

      if ($response->successful()) {
        return [
          'success' => true,
          'message_id' => $response->json()['id'] ?? null,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Unknown error'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * الحصول على معلومات الجلسة
   */
  public function getSessionInfo(string $sessionId): array
  {
    try {
      $response = Http::timeout(10)->get("{$this->baseUrl}/sessions/{$sessionId}");

      if ($response->successful()) {
        return [
          'success' => true,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Session not found'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * الحصول على جميع الجلسات
   */
  public function getAllSessions(): array
  {
    try {
      $response = Http::timeout(10)->get("{$this->baseUrl}/sessions");

      if ($response->successful()) {
        return [
          'success' => true,
          'sessions' => $response->json()['sessions'] ?? []
        ];
      }

      return [
        'success' => false,
        'error' => 'Failed to fetch sessions'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * إنشاء أو ربط جلسة جديدة
   */
  public function createSession(string $sessionId, string $webhookUrl, ?string $webhookSecret = null, bool $reset = false): array
  {
    try {
      $payload = [
        'mode' => 'qr',
        'webhookUrl' => $webhookUrl,
        'reset' => $reset
      ];

      if ($webhookSecret) {
        $payload['webhookSecret'] = $webhookSecret;
      }

      $response = Http::timeout(30)->post("{$this->baseUrl}/sessions/{$sessionId}/connect", $payload);

      if ($response->successful()) {
        return [
          'success' => true,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Failed to create session'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * حذف جلسة
   */
  public function deleteSession(string $sessionId): array
  {
    try {
      $response = Http::timeout(30)->delete("{$this->baseUrl}/sessions/{$sessionId}");

      if ($response->successful()) {
        return [
          'success' => true,
          'data' => $response->json()
        ];
      }

      return [
        'success' => false,
        'error' => $response->json()['error'] ?? 'Failed to delete session'
      ];
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => $e->getMessage()
      ];
    }
  }

  /**
   * إرسال رسائل جماعية للعملاء
   */
  public function sendBulkMessages(string $sessionId, array $customers, string $message): array
  {
    $results = [];
    $successCount = 0;
    $failCount = 0;

    foreach ($customers as $customer) {
      $phone = $customer['phone'] ?? $customer;
      $customerName = $customer['name'] ?? '';
      $personalizedMessage = $this->personalizeMessage($message, $customerName);

      $result = $this->sendMessage($sessionId, $phone, $personalizedMessage);
      $results[] = [
        'phone' => $phone,
        'name' => $customerName,
        'success' => $result['success'],
        'message_id' => $result['message_id'] ?? null,
        'error' => $result['error'] ?? null
      ];

      if ($result['success']) {
        $successCount++;
      } else {
        $failCount++;
      }

      // تأخير بين الرسائل لتجنب الحظر
      sleep(1);
    }

    return [
      'total' => count($customers),
      'success' => $successCount,
      'failed' => $failCount,
      'results' => $results
    ];
  }

  /**
   * تخصيص الرسالة بالاسم
   */
  private function personalizeMessage(string $message, string $name = ''): string
  {
    if (empty($name)) {
      return $message;
    }

    return str_replace(['{name}', '{اسم}'], $name, $message);
  }

  /**
   * تنسيق رقم الهاتف
   */
  private function normalizePhoneNumber(string $phone): string
  {
    // إزالة جميع المسافات والرموز
    $phone = preg_replace('/\D/', '', $phone);

    // إذا كان الرقم يبدأ بـ 0، استبدله بـ 20 للأرقام المصرية
    if (str_starts_with($phone, '0')) {
      $phone = '20' . substr($phone, 1);
    }

    // إذا لم يكن الرقم يبدأ بـ +، أضفه
    if (!str_starts_with($phone, '+')) {
      $phone = '+' . $phone;
    }

    return $phone;
  }
}