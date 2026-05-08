<?php

return [
  /*
  |--------------------------------------------------------------------------
  | WhatsApp Bridge Configuration
  |--------------------------------------------------------------------------
  */

  'whatsapp' => [
    // URL للـ WhatsApp Bridge
    'bridge_url' => env('WHATSAPP_BRIDGE_URL', 'http://localhost:3000'),

    // API Key إذا كان مطلوباً
    'api_key' => env('WHATSAPP_API_KEY'),

    // إعدادات الـ webhook
    'webhook_secret' => env('WHATSAPP_WEBHOOK_SECRET'),

    // جلسة WhatsApp الافتراضية
    'default_session' => env('WHATSAPP_DEFAULT_SESSION', 'main'),

    // تأخير بين الرسائل الجماعية (بالثواني)
    'bulk_message_delay' => env('WHATSAPP_BULK_DELAY', 1),

    // الحد الأقصى للرسائل الجماعية في الدقيقة
    'rate_limit_per_minute' => env('WHATSAPP_RATE_LIMIT', 60),
  ],
];