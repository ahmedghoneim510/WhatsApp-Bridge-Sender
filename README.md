# WhatsApp Bridge - جسر WhatsApp للتطبيقات

خدمة HTTP بسيطة وقوية تربط بين تطبيقك (Laravel أو أي تطبيق آخر) و WhatsApp باستخدام مكتبة Baileys. تتيح لك إرسال واستقبال الرسائل، إدارة جلسات متعددة، وإرسال أنواع مختلفة من المحتوى.

---

## 🚀 الميزات

- ✅ **إرسال رسائل نصية** - أرسل رسائل للعملاء بسهولة
- ✅ **إرسال الصور** - أرسل صور مع نصوص توضيحية
- ✅ **استقبال الرسائل** - استقبل ردود العملاء عبر webhooks
- ✅ **رسائل جماعية** - أرسل لعدة عملاء بنقرة واحدة
- ✅ **استطلاعات رأي** - أنشئ استطلاعات تفاعلية
- ✅ **أزرار تفاعلية** - أرسل رسائل بأزرار للتفاعل السريع
- ✅ **إدارة جلسات متعددة** - حسابات WhatsApp مختلفة لأغراض مختلفة
- ✅ **Dashboard ويب** - واجهة سهلة لإدارة الجلسات والرسائل
- ✅ **Docker Support** - نشر سهل وسريع
- ✅ **Laravel Integration** - تكامل كامل مع Laravel
- ✅ **API Authentication** - حماية API بمفاتيح
- ✅ **Rate Limiting** - حماية من الإفراط في الاستخدام

---

## 📋 متطلبات النظام

- Node.js 18 أو أحدث
- npm أو yarn
- حساب WhatsApp (Business أو شخصي)
- Docker & Docker Compose (اختياري)

---

## ⚡ التثبيت السريع

### الطريقة 1: بدون Docker (الأسهل للبدء)

```bash
# استنساخ المشروع
git clone https://github.com/your-repo/whatsapp-bridge.git
cd whatsapp-bridge

# تثبيت المتطلبات
npm install

# إنشاء ملف البيئة
cp env.example .env

# تشغيل الخدمة (مع إعداد قاعدة البيانات تلقائياً)
npm run start:db
```

**أو للتطوير (مع auto-reload):**
```bash
npm run dev
```

**أو بدون قاعدة بيانات:**
```bash
npm start
```

### الطريقة 2: باستخدام Docker

```bash
# استنساخ المشروع
git clone https://github.com/your-repo/whatsapp-bridge.git
cd whatsapp-bridge

# تشغيل بـ Docker
docker-compose up -d

# الوصول للـ dashboard
open http://localhost:3000
```

---

## 🔧 الإعداد

### ملف البيئة (.env)

```env
# Server Configuration
PORT=3000
LOG_LEVEL=info

# Security - API Authentication (اختياري للـ development)
API_KEY=

# Session Configuration
SESSION_DIR=data/sessions

# CORS Settings
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Bulk Messaging Settings
MAX_BULK_SIZE=100
```

**ملاحظة:** للـ development، يمكنك ترك `API_KEY` فارغاً. للـ production، حدد مفتاح قوي.

---

## 📱 استخدام Dashboard

1. افتح `http://localhost:3000/dashboard` في المتصفح
2. اضغط "إنشاء جلسة جديدة"
3. أدخل:
   - **معرف الجلسة:** `main` (أو أي اسم تريده)
   - **عنوان URL للـ Webhook:** `http://localhost:8000/api/webhooks/whatsapp` (إذا كان لديك Laravel)
   - **سر الـ Webhook:** (اختياري - مفتاح سري للأمان)
4. اضغط "إنشاء" - ستظهر شاشة QR Code
5. افتح WhatsApp على هاتفك
6. اذهب إلى: **الإعدادات > الأجهزة المرتبطة > ربط جهاز**
7. امسح QR Code
8. انتظر حتى تصبح الحالة "متصل"

---

## 🔗 التكامل مع Laravel

### 1. إعداد متغيرات البيئة

في ملف `.env` الخاص بـ Laravel:

```env
WHATSAPP_BRIDGE_URL=http://localhost:3000
WHATSAPP_WEBHOOK_SECRET=your-secret-key-here
WHATSAPP_DEFAULT_SESSION=main
WHATSAPP_API_KEY=  # إذا كان Bridge محمي بـ API Key
```

### 2. استخدام WhatsAppService

الخدمة موجودة في `whatsapp-laravel-demo/app/Services/WhatsAppService.php`

**مثال بسيط:**

```php
use App\Services\WhatsAppService;

$whatsapp = app(WhatsAppService::class);

// إرسال رسالة نصية
$result = $whatsapp->sendMessage('main', '201234567890', 'مرحباً من Laravel!');

// إرسال صورة
$result = $whatsapp->sendImage(
    sessionId: 'main',
    phoneNumber: '201234567890',
    imageUrl: 'https://example.com/image.jpg',
    caption: 'هذه صورة تجريبية'
);
```

### 3. إعداد Webhook Controller

الـ Controller موجود في `whatsapp-laravel-demo/app/Http/Controllers/WhatsAppWebhookController.php`

**في `routes/api.php`:**

```php
Route::post('/webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle']);
```

---

## 📤 إرسال الرسائل

### رسالة نصية بسيطة

```php
$whatsapp = app(WhatsAppService::class);
$result = $whatsapp->sendMessage('main', '201234567890', 'مرحباً بك!');
```

### إرسال صورة

**من رابط URL:**
```php
$result = $whatsapp->sendImage(
    sessionId: 'main',
    phoneNumber: '201234567890',
    imageUrl: 'https://example.com/image.jpg',
    caption: 'صورة المنتج'
);
```

**من ملف محلي:**
```php
$result = $whatsapp->sendImage(
    sessionId: 'main',
    phoneNumber: '201234567890',
    imagePath: storage_path('app/images/product.jpg'),
    caption: 'صورة المنتج'
);
```

### استطلاع رأي

```php
$result = $whatsapp->sendPoll(
    'main',
    '201234567890',
    'ما رأيك في خدماتنا؟',
    ['ممتاز', 'جيد', 'يحتاج تحسين']
);
```

### رسائل جماعية

```php
$customers = [
    ['phone' => '201234567890', 'name' => 'أحمد'],
    ['phone' => '201234567891', 'name' => 'فاطمة']
];

$message = "مرحباً {name}، عروضنا الجديدة متاحة الآن!";

$result = $whatsapp->sendBulkMessages('main', $customers, $message);
```

---

## 📡 API Endpoints

### Bridge API

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/health` | التحقق من حالة Bridge |
| GET | `/sessions` | قائمة الجلسات |
| GET | `/sessions/:id` | معلومات جلسة محددة |
| POST | `/sessions/:id/connect` | إنشاء/إعادة الاتصال بجلسة |
| GET | `/sessions/:id/qr` | الحصول على QR Code |
| POST | `/sessions/:id/send` | إرسال رسالة نصية |
| POST | `/sessions/:id/send-image` | إرسال صورة |
| POST | `/sessions/:id/send-poll` | إرسال استطلاع رأي |
| POST | `/sessions/:id/send-buttons` | إرسال رسالة بأزرار |
| POST | `/sessions/:id/send-bulk` | إرسال رسائل جماعية |
| DELETE | `/sessions/:id` | حذف جلسة |

### أمثلة API

**إرسال رسالة:**
```bash
curl -X POST http://localhost:3000/sessions/main/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "message": "مرحباً!"
  }'
```

**إرسال صورة:**
```bash
curl -X POST http://localhost:3000/sessions/main/send-image \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "imageUrl": "https://example.com/image.jpg",
    "caption": "صورة تجريبية"
  }'
```

---

## 📥 استقبال الرسائل (Webhooks)

### أنواع الأحداث

- `connection_update` - تغيير حالة الاتصال
- `message` - رسالة واردة
- `button_reply` - رد على زر
- `list_reply` - رد على قائمة
- `poll` - إنشاء استطلاع
- `poll_vote` - تصويت في استطلاع
- `message_update` - تحديث حالة الرسالة

### مثال Webhook Payload

```json
{
  "type": "message",
  "sessionId": "main",
  "eventId": "abc123",
  "messageId": "XYZ789",
  "from": "201234567890@s.whatsapp.net",
  "sender": "201234567890@s.whatsapp.net",
  "text": "مرحباً",
  "messageType": "conversation",
  "timestamp": 1234567890
}
```

---

## 🎯 أمثلة الاستخدام

### إرسال تأكيد طلب

```php
public function confirmOrder(Order $order)
{
    $message = "تم تأكيد طلبك #{$order->id}\n" .
               "المبلغ: {$order->total} جنيه\n" .
               "تاريخ التسليم: {$order->delivery_date->format('d/m/Y')}";

    $whatsapp = app(WhatsAppService::class);
    return $whatsapp->sendMessage('main', $order->customer->phone, $message);
}
```

### إرسال صورة منتج

```php
public function sendProductImage($customerPhone, Product $product)
{
    $whatsapp = app(WhatsAppService::class);
    
    return $whatsapp->sendImage(
        sessionId: 'main',
        phoneNumber: $customerPhone,
        imageUrl: $product->image_url,
        caption: "منتج جديد: {$product->name}\nالسعر: {$product->price} جنيه"
    );
}
```

### الردود التلقائية

```php
// في WhatsAppWebhookController
private function handleIncomingMessage(array $payload): void
{
    $phone = $this->extractPhoneFromJid($payload['from']);
    $message = $payload['text'] ?? '';
    
    $replies = [
        'مرحبا' => 'مرحباً بك! كيف يمكننا مساعدتك؟',
        'شكرا' => 'العفو! نتطلع لمساعدتك مرة أخرى.',
    ];
    
    if (isset($replies[strtolower($message)])) {
        $whatsapp = app(WhatsAppService::class);
        $whatsapp->sendMessage('main', $phone, $replies[$message]);
    }
}
```

---

## 🔒 الأمان

### 1. API Key Authentication

في Bridge `.env`:
```env
API_KEY=your-secure-api-key-here
```

في Laravel `.env`:
```env
WHATSAPP_API_KEY=your-secure-api-key-here
```

### 2. Webhook Secret Validation

تأكد من أن Webhook Secret متطابق في Bridge و Laravel:

**في Bridge (عند إنشاء الجلسة):**
```json
{
  "webhookUrl": "http://localhost:8000/api/webhooks/whatsapp",
  "webhookSecret": "your-secret-key-here"
}
```

**في Laravel `.env`:**
```env
WHATSAPP_WEBHOOK_SECRET=your-secret-key-here
```

### 3. HTTPS في الإنتاج

استخدم HTTPS في الإنتاج:
```env
WHATSAPP_BRIDGE_URL=https://your-bridge-domain.com
```

---

## 🐛 حل المشاكل

### المشكلة: "Session is not connected"

**الحل:**
1. افتح Dashboard: `http://localhost:3000/dashboard`
2. تحقق من حالة الجلسة
3. إذا كانت "closed" أو "connecting":
   - احذف الجلسة
   - أنشئ جلسة جديدة
   - امسح QR Code مرة أخرى

### المشكلة: "QR Code لا يظهر"

**الحل:**
1. تأكد من أن الجلسة موجودة
2. إذا كانت الحالة "connecting"، انتظر قليلاً
3. جرب إعادة إنشاء الجلسة

### المشكلة: "Unauthorized" (401)

**الحل:**
- إذا كان `API_KEY` محدد في Bridge، يجب إضافته في Laravel `.env`
- أو اترك `API_KEY` فارغاً في Bridge للـ development

### المشكلة: "Recipient is invalid"

**الحل:**
- استخدم التنسيق الدولي بدون `+`: `201234567890`
- تأكد أن الرقم مسجل في WhatsApp

---

## 📊 المراقبة

### فحص الحالة

```bash
curl http://localhost:3000/health
```

**النتيجة:**
```json
{"status":"ok","uptime":123.45}
```

### عرض الجلسات

```bash
curl http://localhost:3000/sessions
```

### عرض سجلات Docker

```bash
docker-compose logs -f whatsapp-bridge
```

---

## 📚 الوثائق الإضافية

- [دليل التشغيل السريع](QUICK_START.md) - خطوات البدء السريع
- [دليل التكامل مع Laravel](LARAVEL_INTEGRATION_GUIDE.md) - تفاصيل التكامل
- [أمثلة OTP والإشعارات](examples/OTP_AND_NOTIFICATIONS.md) - أمثلة عملية

---

## 🛠️ التطوير

### تشغيل في وضع Development

```bash
npm run dev
```

### اختبار API

```bash
npm test
```

### بناء Docker Image

```bash
npm run docker:build
```

---

## 📝 الترخيص

هذا المشروع مفتوح المصدر تحت رخصة MIT.

---

## 🤝 المساهمة

نرحب بالمساهمات! يرجى:
1. إنشاء Issue لمناقشة التغييرات
2. عمل Fork للمشروع
3. إنشاء Pull Request

---

## 📞 الدعم

- إنشاء Issue على GitHub
- مراجعة الوثائق
- فحص الأمثلة في مجلد `examples/`

---

## 🎉 شكراً لاستخدام WhatsApp Bridge!

إذا أعجبك المشروع، لا تنسى ⭐ Star على GitHub!

---

**آخر تحديث:** 2026-01-26
