# 📱 دليل إرسال OTP والإشعارات عبر WhatsApp Bridge

## ✅ نعم، يمكنك استخدام الخدمة لإرسال:
- ✅ **رسائل OTP** (كود التحقق)
- ✅ **إشعارات تلقائية** من مشاريعك
- ✅ **تنبيهات النظام**
- ✅ **تحديثات الطلبات**
- ✅ **أي رسائل تلقائية**

---

## 🔐 1. إرسال OTP من Laravel

### مثال: إرسال كود التحقق عند تسجيل الدخول

```php
<?php
// app/Http/Controllers/AuthController.php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AuthController extends Controller
{
    private WhatsAppService $whatsapp;

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    /**
     * إرسال كود OTP عبر WhatsApp
     */
    public function sendOTP(Request $request)
    {
        $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/'
        ]);

        // توليد كود OTP (6 أرقام)
        $otp = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        
        // حفظ الكود في Cache لمدة 10 دقائق
        Cache::put("otp:{$request->phone}", $otp, now()->addMinutes(10));

        // إرسال OTP عبر WhatsApp
        $message = "كود التحقق الخاص بك هو: *{$otp}*\n\nصالح لمدة 10 دقائق.\n\nلا تشارك هذا الكود مع أي شخص.";
        
        $result = $this->whatsapp->sendMessage(
            'main', // Session ID
            $request->phone,
            $message
        );

        if ($result['success']) {
            return response()->json([
                'success' => true,
                'message' => 'تم إرسال كود التحقق بنجاح'
            ]);
        }

        return response()->json([
            'success' => false,
            'error' => 'فشل إرسال كود التحقق'
        ], 500);
    }

    /**
     * التحقق من كود OTP
     */
    public function verifyOTP(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp' => 'required|string|size:6'
        ]);

        $cachedOTP = Cache::get("otp:{$request->phone}");

        if (!$cachedOTP || $cachedOTP !== $request->otp) {
            return response()->json([
                'success' => false,
                'error' => 'كود التحقق غير صحيح أو منتهي الصلاحية'
            ], 400);
        }

        // حذف الكود بعد الاستخدام
        Cache::forget("otp:{$request->phone}");

        // تسجيل الدخول أو إنشاء حساب...
        
        return response()->json([
            'success' => true,
            'message' => 'تم التحقق بنجاح'
        ]);
    }
}
```

### Routes:

```php
// routes/api.php
Route::post('/auth/send-otp', [AuthController::class, 'sendOTP']);
Route::post('/auth/verify-otp', [AuthController::class, 'verifyOTP']);
```

---

## 🔔 2. إرسال إشعارات تلقائية من Laravel

### مثال: إشعار عند إنشاء طلب جديد

```php
<?php
// app/Models/Order.php

namespace App\Models;

use App\Services\WhatsAppService;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = ['customer_phone', 'total', 'status'];

    protected static function booted()
    {
        // عند إنشاء طلب جديد
        static::created(function ($order) {
            $whatsapp = app(WhatsAppService::class);
            
            $message = "🎉 شكراً لك!\n\n";
            $message .= "تم استلام طلبك بنجاح.\n";
            $message .= "رقم الطلب: #{$order->id}\n";
            $message .= "المبلغ الإجمالي: {$order->total} جنيه\n\n";
            $message .= "سيتم تحديثك عند تغيير حالة الطلب.";
            
            $whatsapp->sendMessage('main', $order->customer_phone, $message);
        });

        // عند تحديث حالة الطلب
        static::updated(function ($order) {
            if ($order->isDirty('status')) {
                $whatsapp = app(WhatsAppService::class);
                
                $statusMessages = [
                    'processing' => '🔄 جاري معالجة طلبك...',
                    'shipped' => '📦 تم شحن طلبك!',
                    'delivered' => '✅ تم تسليم طلبك بنجاح!',
                    'cancelled' => '❌ تم إلغاء طلبك.'
                ];
                
                $message = "تحديث على طلبك #{$order->id}\n\n";
                $message .= $statusMessages[$order->status] ?? "تم تحديث حالة الطلب.";
                
                $whatsapp->sendMessage('main', $order->customer_phone, $message);
            }
        });
    }
}
```

---

## 🐍 3. إرسال OTP من Python (Django/Flask)

```python
# services/whatsapp_service.py
import requests
import random
from django.core.cache import cache
from django.conf import settings

class WhatsAppService:
    def __init__(self):
        self.base_url = settings.WHATSAPP_BRIDGE_URL  # http://localhost:3000
        self.api_key = settings.WHATSAPP_API_KEY
        self.session_id = 'main'
    
    def send_message(self, phone, message):
        """إرسال رسالة عبر WhatsApp"""
        headers = {}
        if self.api_key:
            headers['X-API-Key'] = self.api_key
        
        url = f"{self.base_url}/sessions/{self.session_id}/send"
        
        response = requests.post(
            url,
            json={'to': phone, 'message': message},
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            return {'success': True, 'data': response.json()}
        return {'success': False, 'error': response.json()}

# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from services.whatsapp_service import WhatsAppService
import json

@csrf_exempt
def send_otp(request):
    """إرسال OTP عبر WhatsApp"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    data = json.loads(request.body)
    phone = data.get('phone')
    
    if not phone:
        return JsonResponse({'error': 'Phone required'}, status=400)
    
    # توليد OTP
    otp = str(random.randint(100000, 999999))
    
    # حفظ في Cache لمدة 10 دقائق
    cache.set(f"otp:{phone}", otp, 600)
    
    # إرسال عبر WhatsApp
    whatsapp = WhatsAppService()
    message = f"كود التحقق الخاص بك هو: *{otp}*\n\nصالح لمدة 10 دقائق."
    
    result = whatsapp.send_message(phone, message)
    
    if result['success']:
        return JsonResponse({'success': True, 'message': 'OTP sent successfully'})
    
    return JsonResponse({'success': False, 'error': 'Failed to send OTP'}, status=500)
```

---

## 🟨 4. إرسال OTP من JavaScript/Node.js

```javascript
// services/whatsapp.js
const axios = require('axios');
const crypto = require('crypto');

class WhatsAppService {
  constructor() {
    this.baseUrl = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3000';
    this.apiKey = process.env.WHATSAPP_API_KEY;
    this.sessionId = 'main';
  }

  async sendMessage(phone, message) {
    try {
      const headers = {};
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await axios.post(
        `${this.baseUrl}/sessions/${this.sessionId}/send`,
        { to: phone, message },
        { headers, timeout: 30000 }
      );

      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }
}

// routes/auth.js
const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');
const redis = require('redis');

const whatsapp = new WhatsAppService();
const client = redis.createClient();

router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }

  // توليد OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // حفظ في Redis لمدة 10 دقائق
  await client.setEx(`otp:${phone}`, 600, otp);

  // إرسال عبر WhatsApp
  const message = `كود التحقق الخاص بك هو: *${otp}*\n\nصالح لمدة 10 دقائق.`;
  const result = await whatsapp.sendMessage(phone, message);

  if (result.success) {
    return res.json({ success: true, message: 'OTP sent successfully' });
  }

  return res.status(500).json({ success: false, error: 'Failed to send OTP' });
});

router.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  const cachedOTP = await client.get(`otp:${phone}`);

  if (!cachedOTP || cachedOTP !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // حذف OTP بعد الاستخدام
  await client.del(`otp:${phone}`);

  return res.json({ success: true, message: 'OTP verified' });
});

module.exports = router;
```

---

## 🔒 5. تأمين API Key

### في `.env`:

```env
# WhatsApp Bridge Configuration
WHATSAPP_BRIDGE_URL=http://localhost:3000
WHATSAPP_API_KEY=your-secret-api-key-here-12345
```

### في `config/whatsapp.php` (Laravel):

```php
<?php

return [
    'bridge_url' => env('WHATSAPP_BRIDGE_URL', 'http://localhost:3000'),
    'api_key' => env('WHATSAPP_API_KEY'),
    'session_id' => env('WHATSAPP_SESSION_ID', 'main'),
    'webhook_secret' => env('WHATSAPP_WEBHOOK_SECRET'),
];
```

---

## 📋 6. أمثلة استخدامات أخرى

### إشعار عند استلام رسالة جديدة

```php
// app/Events/NewMessageReceived.php
namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use App\Services\WhatsAppService;

class NewMessageReceived
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public $message)
    {
        // إرسال إشعار للمسؤول
        $whatsapp = app(WhatsAppService::class);
        $whatsapp->sendMessage(
            'admin',
            '201234567890', // رقم المسؤول
            "📩 رسالة جديدة من: {$message->sender}\n\n{$message->content}"
        );
    }
}
```

### إشعار عند انتهاء الاشتراك

```php
// app/Console/Commands/CheckExpiredSubscriptions.php
namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Subscription;
use App\Services\WhatsAppService;
use Carbon\Carbon;

class CheckExpiredSubscriptions extends Command
{
    protected $signature = 'subscriptions:check-expired';
    
    public function handle()
    {
        $whatsapp = app(WhatsAppService::class);
        
        $expiring = Subscription::where('expires_at', '<=', Carbon::now()->addDays(3))
            ->where('expires_at', '>', Carbon::now())
            ->get();
        
        foreach ($expiring as $subscription) {
            $message = "⚠️ تنبيه!\n\n";
            $message .= "اشتراكك سينتهي خلال 3 أيام.\n";
            $message .= "تاريخ الانتهاء: {$subscription->expires_at->format('Y-m-d')}\n\n";
            $message .= "جدد اشتراكك الآن لتجنب الانقطاع.";
            
            $whatsapp->sendMessage('main', $subscription->user->phone, $message);
        }
    }
}
```

---

## 🚀 7. نصائح مهمة

### ✅ افعل:
- ✅ استخدم **API Key** لتأمين الطلبات
- ✅ احفظ **OTP في Cache** مع انتهاء صلاحية
- ✅ استخدم **Session ID** ثابت لكل مشروع
- ✅ أضف **تأخير** عند الإرسال الجماعي
- ✅ تحقق من **صحة الأرقام** قبل الإرسال

### ❌ لا تفعل:
- ❌ لا ترسل **OTP في Logs**
- ❌ لا تستخدم **Session ID** واحد لعدة مشاريع
- ❌ لا ترسل **رسائل كثيرة** بسرعة (تجنب الحظر)
- ❌ لا تنسى **معالجة الأخطاء**

---

## 📞 8. مثال كامل: نظام OTP كامل

```php
<?php
// app/Http/Controllers/AuthController.php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    private WhatsAppService $whatsapp;
    private string $sessionId = 'main';

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    public function sendOTP(Request $request)
    {
        $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/'
        ]);

        $phone = $request->phone;
        
        // منع إرسال OTP أكثر من مرة كل دقيقة
        $key = "otp:rate_limit:{$phone}";
        if (Cache::has($key)) {
            return response()->json([
                'success' => false,
                'error' => 'يرجى الانتظار دقيقة قبل طلب كود جديد'
            ], 429);
        }

        // توليد OTP
        $otp = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        
        // حفظ OTP لمدة 10 دقائق
        Cache::put("otp:{$phone}", $otp, now()->addMinutes(10));
        
        // Rate limiting: منع إرسال جديد لمدة دقيقة
        Cache::put($key, true, now()->addMinute());

        // إرسال OTP
        $message = "🔐 كود التحقق\n\n";
        $message .= "كود التحقق الخاص بك هو:\n";
        $message .= "*{$otp}*\n\n";
        $message .= "⚠️ صالح لمدة 10 دقائق فقط.\n";
        $message .= "🔒 لا تشارك هذا الكود مع أي شخص.";
        
        $result = $this->whatsapp->sendMessage($this->sessionId, $phone, $message);

        if ($result['success']) {
            Log::info('OTP sent successfully', ['phone' => $phone]);
            return response()->json([
                'success' => true,
                'message' => 'تم إرسال كود التحقق بنجاح'
            ]);
        }

        Log::error('OTP send failed', ['phone' => $phone, 'error' => $result['error']]);
        return response()->json([
            'success' => false,
            'error' => 'فشل إرسال كود التحقق. يرجى المحاولة مرة أخرى.'
        ], 500);
    }

    public function verifyOTP(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp' => 'required|string|size:6'
        ]);

        $phone = $request->phone;
        $otp = $request->otp;
        
        $cachedOTP = Cache::get("otp:{$phone}");

        if (!$cachedOTP) {
            return response()->json([
                'success' => false,
                'error' => 'كود التحقق منتهي الصلاحية'
            ], 400);
        }

        if ($cachedOTP !== $otp) {
            return response()->json([
                'success' => false,
                'error' => 'كود التحقق غير صحيح'
            ], 400);
        }

        // حذف OTP بعد الاستخدام
        Cache::forget("otp:{$phone}");

        // هنا يمكنك تسجيل الدخول أو إنشاء حساب...
        // $user = User::firstOrCreate(['phone' => $phone]);
        // Auth::login($user);

        return response()->json([
            'success' => true,
            'message' => 'تم التحقق بنجاح'
        ]);
    }
}
```

---

## 🎯 الخلاصة

✅ **نعم، يمكنك استخدام WhatsApp Bridge لإرسال:**
- رسائل OTP
- إشعارات تلقائية
- تحديثات الطلبات
- تنبيهات النظام
- أي رسائل تلقائية من مشاريعك

**كل ما تحتاجه هو:**
1. ✅ Session ID (مثل: `main`)
2. ✅ API Key (للتأمين)
3. ✅ HTTP Request بسيط

**الخدمة جاهزة للاستخدام! 🚀**
