<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\WhatsAppWebhookController;

/*
|--------------------------------------------------------------------------
| WhatsApp Routes
|--------------------------------------------------------------------------
*/

// Webhook endpoint لاستقبال الرسائل من WhatsApp Bridge
Route::post('/webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle'])
    ->middleware(['api', 'webhook.signature']) // يمكنك إضافة middleware للتحقق من التوقيع
    ->name('webhooks.whatsapp');

// Routes لإدارة WhatsApp (اختيارية - للاختبار من المتصفح)
Route::prefix('whatsapp')->middleware(['auth'])->group(function () {

    // إرسال رسالة اختبار
    Route::post('/test-send', function (Illuminate\Http\Request $request) {
        $request->validate([
            'phone' => 'required|string',
            'message' => 'required|string'
        ]);

        $whatsappService = app(\App\Services\WhatsAppService::class);
        $result = $whatsappService->sendMessage('main', $request->phone, $request->message);

        return response()->json($result);
    })->name('whatsapp.test-send');

    // الحصول على حالة الجلسات
    Route::get('/sessions', function () {
        $whatsappService = app(\App\Services\WhatsAppService::class);
        return response()->json($whatsappService->getAllSessions());
    })->name('whatsapp.sessions');

    // إرسال رسائل جماعية
    Route::post('/bulk-send', function (Illuminate\Http\Request $request) {
        $request->validate([
            'customers' => 'required|array',
            'message' => 'required|string'
        ]);

        $whatsappService = app(\App\Services\WhatsAppService::class);
        $result = $whatsappService->sendBulkMessages('main', $request->customers, $request->message);

        return response()->json($result);
    })->name('whatsapp.bulk-send');
});