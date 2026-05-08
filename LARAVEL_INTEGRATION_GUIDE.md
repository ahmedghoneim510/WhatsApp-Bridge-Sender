# دليل الربط مع Laravel - WhatsApp Bridge

## 📋 نظرة عامة

هذا الدليل يشرح كيفية ربط مشروع Laravel مع WhatsApp Bridge لإرسال واستقبال رسائل WhatsApp.

---

## 🚀 الخطوات الأساسية

### 1. تثبيت المتطلبات في Laravel

#### أ. إضافة Guzzle HTTP Client (عادة موجود مسبقاً)
```bash
composer require guzzlehttp/guzzle
```

#### ب. إنشاء Service Class

انسخ الملف `examples/laravel/WhatsAppService.php` إلى `app/Services/WhatsAppService.php`

أو أنشئه يدوياً:

```php
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
                return [
                    'success' => true,
                    'message_id' => $response->json()['id'] ?? null,
                    'data' => $response->json()
                ];
            }

            return [
                'success' => false,
                'error' => $response->json()['error'] ?? 'Unknown error',
                'status_code' => $response->status()
            ];
        } catch (\Exception $e) {
            Log::error('WhatsApp service exception', [
                'error' => $e->getMessage()
            ]);

            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    private function normalizePhoneNumber(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        
        if (str_starts_with($phone, '0')) {
            $phone = '20' . substr($phone, 1);
        }

        return $phone;
    }
}
```

### 2. إعداد Configuration

#### أ. إضافة Config File

أنشئ ملف `config/whatsapp.php`:

```php
<?php

return [
    'bridge_url' => env('WHATSAPP_BRIDGE_URL', 'http://localhost:3000'),
    'api_key' => env('WHATSAPP_API_KEY'), // اختياري - فقط إذا كان API_KEY محدد في Bridge
    'webhook_secret' => env('WHATSAPP_WEBHOOK_SECRET'), // مهم للأمان
];
```

#### ب. إضافة Environment Variables

في ملف `.env`:

```env
# WhatsApp Bridge Configuration
WHATSAPP_BRIDGE_URL=http://localhost:3000
WHATSAPP_API_KEY=your-api-key-here  # إذا كان محدد في Bridge
WHATSAPP_WEBHOOK_SECRET=your-secret-key-here  # مهم جداً للأمان
```

### 3. إنشاء Webhook Controller

انسخ `examples/laravel/WhatsAppWebhookController.php` إلى `app/Http/Controllers/WhatsAppWebhookController.php`

**ملاحظة مهمة:** Controller المحدث يحتوي على Webhook Secret Validation للأمان.

### 4. إضافة Routes

#### في `routes/api.php`:

```php
use App\Http\Controllers\WhatsAppWebhookController;
use App\Services\WhatsAppService;

// Webhook endpoint - استقبال الأحداث من Bridge
Route::post('/webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle']);

// مثال على استخدام Service
Route::post('/whatsapp/send', function (Request $request) {
    $whatsapp = app(WhatsAppService::class);
    $result = $whatsapp->sendMessage(
        $request->input('session_id', 'main'),
        $request->input('phone'),
        $request->input('message')
    );
    
    return response()->json($result);
});
```

### 5. إنشاء Models (اختياري)

إذا كنت تريد حفظ الرسائل في قاعدة البيانات:

```bash
php artisan make:model MessageLog -m
php artisan make:model Customer -m
```

#### Migration لـ MessageLog:

```php
Schema::create('message_logs', function (Blueprint $table) {
    $table->id();
    $table->string('session_id');
    $table->string('message_id')->nullable();
    $table->foreignId('customer_id')->nullable()->constrained();
    $table->string('phone_number');
    $table->enum('direction', ['incoming', 'outgoing']);
    $table->string('message_type');
    $table->text('text')->nullable();
    $table->string('status')->default('sent');
    $table->json('raw_payload')->nullable();
    $table->timestamps();
    
    $table->index('session_id');
    $table->index('phone_number');
});
```

#### Migration لـ Customer:

```php
Schema::create('customers', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('phone')->unique();
    $table->string('email')->nullable();
    $table->timestamps();
});
```

---

## 📤 أمثلة الاستخدام

### إرسال رسالة نصية

```php
use App\Services\WhatsAppService;

$whatsapp = app(WhatsAppService::class);

$result = $whatsapp->sendMessage(
    'main',  // session ID
    '201234567890',  // رقم الهاتف
    'مرحباً بك في خدمتنا!'
);

if ($result['success']) {
    echo "تم الإرسال بنجاح! ID: " . $result['message_id'];
} else {
    echo "فشل الإرسال: " . $result['error'];
}
```

### إرسال رسالة من Controller

```php
<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function confirmOrder(Request $request, $orderId)
    {
        $order = Order::findOrFail($orderId);
        
        $whatsapp = app(WhatsAppService::class);
        
        $message = "تم تأكيد طلبك #{$order->id}\n" .
                   "المبلغ: {$order->total} جنيه\n" .
                   "تاريخ التسليم: {$order->delivery_date->format('d/m/Y')}";
        
        $result = $whatsapp->sendMessage(
            'main',
            $order->customer->phone,
            $message
        );
        
        if ($result['success']) {
            return response()->json(['message' => 'Order confirmed and notification sent']);
        }
        
        return response()->json(['error' => 'Failed to send notification'], 500);
    }
}
```

### إرسال رسائل جماعية

```php
$customers = Customer::where('subscribed', true)->get();

$whatsapp = app(WhatsAppService::class);

foreach ($customers as $customer) {
    $message = "عزيزي {$customer->name}، لدينا عروض جديدة!";
    
    $result = $whatsapp->sendMessage('main', $customer->phone, $message);
    
    // تأخير بين الرسائل لتجنب الحظر
    sleep(1);
}
```

**أفضل:** استخدام Laravel Queue:

```php
use App\Jobs\SendWhatsAppMessage;

foreach ($customers as $customer) {
    SendWhatsAppMessage::dispatch('main', $customer->phone, $message)
        ->delay(now()->addSeconds($index)); // تأخير تدريجي
}
```

---

## 🔐 الأمان

### 1. API Key Authentication

إذا كنت تستخدم API Key في Bridge:

```php
// في WhatsAppService.php
$headers = [];
if ($this->apiKey) {
    $headers['X-API-Key'] = $this->apiKey;
}

$response = Http::withHeaders($headers)->post(...);
```

### 2. Webhook Secret Validation

**مهم جداً:** تأكد من أن Webhook Secret محدد في Bridge و Laravel:

**في Bridge (.env):**
```env
API_KEY=your-secure-api-key
```

**في Laravel (.env):**
```env
WHATSAPP_WEBHOOK_SECRET=your-secure-secret
```

Controller يتحقق تلقائياً من الـ secret.

### 3. HTTPS في الإنتاج

**مهم:** استخدم HTTPS في الإنتاج:

```php
// في config/whatsapp.php
'bridge_url' => env('WHATSAPP_BRIDGE_URL', 'https://your-bridge-domain.com'),
```

---

## 🔄 استقبال الرسائل (Webhooks)

### أنواع الأحداث

1. **connection_update** - تغيير حالة الاتصال
2. **message** - رسالة واردة
3. **button_reply** - رد على زر
4. **list_reply** - رد على قائمة
5. **poll** - إنشاء استطلاع
6. **poll_vote** - تصويت في استطلاع
7. **message_update** - تحديث حالة الرسالة

### مثال على معالجة رسالة واردة

```php
private function handleIncomingMessage(array $payload): void
{
    $phoneNumber = $this->extractPhoneFromJid($payload['sender'] ?? '');
    $message = $payload['text'] ?? '';
    
    // البحث عن العميل
    $customer = Customer::where('phone', $phoneNumber)->first();
    
    // حفظ الرسالة
    MessageLog::create([
        'session_id' => $payload['sessionId'],
        'message_id' => $payload['messageId'],
        'phone_number' => $phoneNumber,
        'text' => $message,
        'direction' => 'incoming',
        'customer_id' => $customer?->id
    ]);
    
    // معالجة الرد التلقائي
    if (str_contains(strtolower($message), 'مرحبا')) {
        $whatsapp = app(WhatsAppService::class);
        $whatsapp->sendMessage('main', $phoneNumber, 'مرحباً بك! كيف يمكننا مساعدتك؟');
    }
}
```

---

## 🧪 الاختبار

### 1. اختبار الاتصال

```php
// في tinker أو route
$whatsapp = app(WhatsAppService::class);
$result = $whatsapp->sendMessage('main', '201234567890', 'رسالة اختبار');
dd($result);
```

### 2. اختبار Webhook محلياً

استخدم ngrok أو مشابه:

```bash
ngrok http 8000
```

ثم في Bridge:
```
webhookUrl: https://your-ngrok-url.ngrok.io/api/webhooks/whatsapp
```

---

## 📝 Checklist للربط

- [ ] تثبيت Guzzle HTTP
- [ ] إنشاء WhatsAppService
- [ ] إضافة config/whatsapp.php
- [ ] إضافة environment variables
- [ ] إنشاء WhatsAppWebhookController
- [ ] إضافة routes
- [ ] إنشاء Models (اختياري)
- [ ] تشغيل Bridge
- [ ] إنشاء جلسة في Bridge
- [ ] اختبار إرسال رسالة
- [ ] اختبار استقبال webhook

---

## 🐛 حل المشاكل

### مشكلة: "Unauthorized" عند الإرسال

**الحل:** تأكد من إضافة API Key في `.env` و Bridge:

```env
# Laravel
WHATSAPP_API_KEY=your-key

# Bridge
API_KEY=your-key
```

### مشكلة: Webhook لا يعمل

**الحل:**
1. تأكد من أن Bridge يمكنه الوصول لـ Laravel URL
2. تحقق من Webhook Secret
3. راجع Laravel logs: `storage/logs/laravel.log`

### مشكلة: "Session is not connected"

**الحل:**
1. افتح Dashboard: `http://localhost:3000/dashboard`
2. تأكد من أن الجلسة متصلة (status: open)
3. إذا لم تكن متصلة، امسح QR code

---

## 📚 موارد إضافية

- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys)
- [Laravel HTTP Client](https://laravel.com/docs/http-client)
- [Laravel Queues](https://laravel.com/docs/queues)

---

**آخر تحديث:** 2026-01-26
