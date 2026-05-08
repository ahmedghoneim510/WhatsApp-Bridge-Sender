# دليل التشغيل السريع - بدون Docker

## 📋 المتطلبات

- Node.js 18 أو أحدث
- npm أو yarn
- حساب WhatsApp (Business أو شخصي)

---

## 🚀 خطوات التشغيل

### 1. تثبيت المتطلبات

```bash
# تأكد من أنك في مجلد المشروع
cd whatsapp-bridge

# تثبيت المكتبات المطلوبة
npm install
```

### 2. إعداد ملف البيئة

```bash
# نسخ ملف البيئة
cp env.example .env
```

**ملاحظة:** إذا كنت تستخدم Windows PowerShell:
```powershell
Copy-Item env.example .env
```

### 3. تعديل ملف .env (اختياري)

افتح ملف `.env` وعدّل الإعدادات حسب احتياجك:

```env
# Server Configuration
PORT=3000
LOG_LEVEL=info

# Security - API Authentication (اختياري للـ development)
# اتركه فارغاً للـ development، أو ضع مفتاح للأمان
API_KEY=

# Session Configuration
SESSION_DIR=data/sessions

# CORS Settings
CORS_ORIGIN=http://localhost:3001

# Bulk Messaging Settings
MAX_BULK_SIZE=100
```

**للـ development:** يمكنك ترك `API_KEY` فارغاً، وسيعمل المشروع بدون مصادقة.

### 4. تشغيل المشروع

#### أ. وضع Development (مع auto-reload):
```bash
npm run dev
```

#### ب. وضع Production:
```bash
npm start
```

سترى رسالة مثل:
```
{"level":30,"time":1234567890,"msg":"server listening","port":3000}
```

### 5. فتح Dashboard

افتح المتصفح واذهب إلى:
```
http://localhost:3000/dashboard
```

---

## 📱 إنشاء جلسة WhatsApp

### الطريقة الأولى: من Dashboard

1. افتح `http://localhost:3000/dashboard`
2. اضغط على "إنشاء جلسة جديدة"
3. أدخل:
   - **معرف الجلسة:** `main` (أو أي اسم تريده)
   - **عنوان URL للـ Webhook:** `http://localhost:8000/api/webhooks/whatsapp` (إذا كان لديك Laravel)
   - **سر الـ Webhook:** (اختياري)
4. اضغط "إنشاء"
5. ستظهر شاشة QR Code
6. افتح WhatsApp على هاتفك
7. اذهب إلى: **الإعدادات > الأجهزة المرتبطة > ربط جهاز**
8. امسح QR Code
9. انتظر حتى تصبح الحالة "متصل"

### الطريقة الثانية: من Terminal/API

```bash
# إنشاء جلسة جديدة
curl -X POST http://localhost:3000/sessions/main/connect \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "qr",
    "webhookUrl": "http://localhost:8000/api/webhooks/whatsapp",
    "webhookSecret": "your-secret-here"
  }'

# الحصول على QR Code
curl http://localhost:3000/sessions/main/qr
```

---

## 🧪 اختبار المشروع

### 1. اختبار Health Check

```bash
curl http://localhost:3000/health
```

**النتيجة المتوقعة:**
```json
{"status":"ok","uptime":123.45}
```

### 2. عرض الجلسات

```bash
curl http://localhost:3000/sessions
```

### 3. إرسال رسالة اختبار

**ملاحظة:** تأكد من أن الجلسة متصلة أولاً!

```bash
curl -X POST http://localhost:3000/sessions/main/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "message": "مرحباً! هذه رسالة اختبار"
  }'
```

**إذا كنت تستخدم API Key:**
```bash
curl -X POST http://localhost:3000/sessions/main/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "201234567890",
    "message": "مرحباً! هذه رسالة اختبار"
  }'
```

### 4. استخدام Script الاختبار

```bash
npm test
```

---

## 🔧 حل المشاكل الشائعة

### المشكلة: "Cannot find module"

**الحل:**
```bash
# تأكد من تثبيت المتطلبات
npm install
```

### المشكلة: "Port 3000 already in use"

**الحل:**
1. غير البورت في `.env`:
   ```env
   PORT=3001
   ```
2. أو أوقف البرنامج الذي يستخدم البورت 3000

### المشكلة: "QR Code لا يظهر"

**الحل:**
1. تأكد من أن الجلسة موجودة:
   ```bash
   curl http://localhost:3000/sessions/main
   ```
2. إذا كانت الحالة "connecting"، انتظر قليلاً
3. جرب إعادة إنشاء الجلسة

### المشكلة: "Session is not connected"

**الحل:**
1. افتح Dashboard: `http://localhost:3000/dashboard`
2. تحقق من حالة الجلسة
3. إذا كانت "closed" أو "connecting":
   - احذف الجلسة
   - أنشئ جلسة جديدة
   - امسح QR Code مرة أخرى

### المشكلة: "Unauthorized" عند الإرسال

**الحل:**
- إذا كان `API_KEY` محدد في `.env`، يجب إرساله في header:
  ```bash
  -H "X-API-Key: your-api-key"
  ```
- أو اترك `API_KEY` فارغاً في `.env` للـ development

---

## 📝 أمثلة استخدام

### إرسال رسالة نصية

```bash
curl -X POST http://localhost:3000/sessions/main/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "message": "مرحباً بك!"
  }'
```

### إرسال استطلاع رأي

```bash
curl -X POST http://localhost:3000/sessions/main/send-poll \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "name": "ما رأيك في خدماتنا؟",
    "options": ["ممتاز", "جيد", "يحتاج تحسين"],
    "selectableCount": 1
  }'
```

### إرسال رسالة بأزرار

```bash
curl -X POST http://localhost:3000/sessions/main/send-buttons \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "text": "كيف يمكننا مساعدتك؟",
    "buttons": [
      {"id": "support", "text": "دعم فني"},
      {"id": "sales", "text": "استفسار مبيعات"}
    ]
  }'
```

### إرسال رسائل جماعية

```bash
curl -X POST http://localhost:3000/sessions/main/send-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["201234567890", "201234567891"],
    "message": "رسالة جماعية",
    "delay": 1000
  }'
```

---

## 🎯 الخطوات التالية

1. ✅ تأكد من أن المشروع يعمل
2. ✅ أنشئ جلسة واربطها بـ WhatsApp
3. ✅ جرب إرسال رسالة اختبار
4. 📖 اقرأ `LARAVEL_INTEGRATION_GUIDE.md` لربط Laravel
5. 📖 اقرأ `README.md` للمزيد من التفاصيل

---

## 💡 نصائح

- **للـ Development:** اترك `API_KEY` فارغاً لتسهيل الاختبار
- **للـ Production:** حدد `API_KEY` قوي للأمان
- استخدم `npm run dev` أثناء التطوير (auto-reload)
- استخدم `npm start` في الإنتاج
- راجع السجلات في Terminal لمعرفة الأخطاء

---

**آخر تحديث:** 2026-01-26
