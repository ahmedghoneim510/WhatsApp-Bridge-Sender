<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use App\Models\MessageLog;
use App\Models\Customer;

class WhatsAppWebhookController extends Controller
{
    /**
     * استقبال webhooks من WhatsApp Bridge
     */
    public function handle(Request $request): JsonResponse
    {
        try {
            // التحقق من Webhook Secret للأمان
            $expectedSecret = config('whatsapp.webhook_secret');
            $receivedSecret = $request->header('x-webhook-secret');
            
            if ($expectedSecret && $receivedSecret !== $expectedSecret) {
                Log::warning('Invalid webhook secret', [
                    'ip' => $request->ip(),
                    'received' => $receivedSecret ? 'present' : 'missing'
                ]);
                return response()->json(['error' => 'Invalid webhook secret'], 401);
            }
            
            $payload = $request->all();
            $eventType = $payload['type'] ?? 'unknown';
            $sessionId = $payload['sessionId'] ?? 'unknown';

            Log::info('WhatsApp webhook received', [
                'type' => $eventType,
                'session_id' => $sessionId,
                'event_id' => $payload['eventId'] ?? null
            ]);

            switch ($eventType) {
                case 'connection_update':
                    $this->handleConnectionUpdate($payload);
                    break;

                case 'message':
                    $this->handleIncomingMessage($payload);
                    break;

                case 'button_reply':
                    $this->handleButtonReply($payload);
                    break;

                case 'list_reply':
                    $this->handleListReply($payload);
                    break;

                case 'poll':
                    $this->handlePollCreation($payload);
                    break;

                case 'poll_vote':
                    $this->handlePollVote($payload);
                    break;

                case 'message_update':
                    $this->handleMessageUpdate($payload);
                    break;

                default:
                    Log::warning('Unknown webhook event type', ['type' => $eventType]);
            }

            return response()->json(['status' => 'ok']);

        } catch (\Exception $e) {
            Log::error('Webhook processing error', [
                'error' => $e->getMessage(),
                'payload' => $request->all()
            ]);

            return response()->json(['error' => 'Processing failed'], 500);
        }
    }

    /**
     * معالجة تحديث حالة الاتصال
     */
    private function handleConnectionUpdate(array $payload): void
    {
        $status = $payload['status'] ?? 'unknown';
        $phoneNumber = $payload['phoneNumber'] ?? null;

        Log::info('WhatsApp connection status update', [
            'status' => $status,
            'phone_number' => $phoneNumber,
            'session_id' => $payload['sessionId']
        ]);

        // يمكنك حفظ حالة الاتصال في قاعدة البيانات
        // أو إرسال إشعار للمشرفين
    }

    /**
     * معالجة الرسائل الواردة
     */
    private function handleIncomingMessage(array $payload): void
    {
        $from = $payload['from'] ?? '';
        $sender = $payload['sender'] ?? '';
        $message = $payload['text'] ?? '';
        $messageType = $payload['messageType'] ?? 'text';

        // استخراج رقم الهاتف من JID
        $phoneNumber = $this->extractPhoneFromJid($sender);

        // البحث عن العميل في قاعدة البيانات
        $customer = Customer::where('phone', $phoneNumber)->first();

        if ($customer) {
            Log::info('Message from existing customer', [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'phone' => $phoneNumber,
                'message' => $message
            ]);
        } else {
            Log::info('Message from unknown number', [
                'phone' => $phoneNumber,
                'message' => $message
            ]);

            // يمكنك إنشاء عميل جديد أو حفظ الرسالة للمراجعة اللاحقة
        }

        // حفظ الرسالة في سجل الرسائل
        MessageLog::create([
            'session_id' => $payload['sessionId'],
            'message_id' => $payload['messageId'],
            'from' => $from,
            'sender' => $sender,
            'phone_number' => $phoneNumber,
            'message_type' => $messageType,
            'text' => $message,
            'direction' => 'incoming',
            'customer_id' => $customer?->id,
            'raw_payload' => json_encode($payload)
        ]);

        // معالجة الردود التلقائية
        $this->handleAutoReply($phoneNumber, $message, $customer);
    }

    /**
     * معالجة الردود على الأزرار
     */
    private function handleButtonReply(array $payload): void
    {
        $buttonId = $payload['id'] ?? '';
        $buttonText = $payload['text'] ?? '';
        $phoneNumber = $this->extractPhoneFromJid($payload['sender'] ?? '');

        Log::info('Button reply received', [
            'button_id' => $buttonId,
            'button_text' => $buttonText,
            'phone' => $phoneNumber
        ]);

        // حفظ الرد في سجل الرسائل
        MessageLog::create([
            'session_id' => $payload['sessionId'],
            'message_id' => $payload['messageId'],
            'from' => $payload['from'],
            'sender' => $payload['sender'],
            'phone_number' => $phoneNumber,
            'message_type' => 'button_reply',
            'text' => "Button reply: {$buttonText} (ID: {$buttonId})",
            'direction' => 'incoming',
            'raw_payload' => json_encode($payload)
        ]);

        // معالجة الرد حسب ID الزر
        $this->processButtonAction($buttonId, $phoneNumber, $payload);
    }

    /**
     * معالجة الردود على القوائم
     */
    private function handleListReply(array $payload): void
    {
        $selectedId = $payload['selectedRowId'] ?? '';
        $title = $payload['title'] ?? '';
        $phoneNumber = $this->extractPhoneFromJid($payload['sender'] ?? '');

        Log::info('List reply received', [
            'selected_id' => $selectedId,
            'title' => $title,
            'phone' => $phoneNumber
        ]);

        // حفظ الرد في سجل الرسائل
        MessageLog::create([
            'session_id' => $payload['sessionId'],
            'message_id' => $payload['messageId'],
            'from' => $payload['from'],
            'sender' => $payload['sender'],
            'phone_number' => $phoneNumber,
            'message_type' => 'list_reply',
            'text' => "List reply: {$title} (ID: {$selectedId})",
            'direction' => 'incoming',
            'raw_payload' => json_encode($payload)
        ]);
    }

    /**
     * معالجة إنشاء استطلاع رأي
     */
    private function handlePollCreation(array $payload): void
    {
        Log::info('Poll created', [
            'poll_name' => $payload['pollName'] ?? '',
            'options' => $payload['options'] ?? []
        ]);

        // يمكنك حفظ معلومات الاستطلاع في قاعدة البيانات
    }

    /**
     * معالجة تصويت في استطلاع رأي
     */
    private function handlePollVote(array $payload): void
    {
        $voter = $payload['voter'] ?? '';
        $selectedOptions = $payload['selectedOptions'] ?? [];
        $phoneNumber = $this->extractPhoneFromJid($voter);

        Log::info('Poll vote received', [
            'voter' => $voter,
            'phone' => $phoneNumber,
            'selected_options' => $selectedOptions,
            'poll_name' => $payload['pollName'] ?? ''
        ]);

        // حفظ التصويت في قاعدة البيانات
    }

    /**
     * معالجة تحديث الرسائل (قراءة، تسليم، إلخ)
     */
    private function handleMessageUpdate(array $payload): void
    {
        $messageId = $payload['messageId'] ?? '';
        $update = $payload['update'] ?? [];

        Log::info('Message update', [
            'message_id' => $messageId,
            'update' => $update
        ]);

        // تحديث حالة الرسالة في قاعدة البيانات
        MessageLog::where('message_id', $messageId)
            ->update(['status' => $update['status'] ?? 'unknown']);
    }

    /**
     * معالجة الردود التلقائية
     */
    private function handleAutoReply(string $phoneNumber, string $message, ?Customer $customer): void
    {
        $message = strtolower(trim($message));

        // ردود تلقائية بسيطة
        $autoReplies = [
            'مرحبا' => 'مرحباً بك! كيف يمكننا مساعدتك؟',
            'hello' => 'Hello! How can we help you?',
            'hi' => 'Hi there! How can we assist you?',
            'شكرا' => 'العفو! نتطلع لمساعدتك مرة أخرى',
            'thank you' => 'You\'re welcome! We hope to serve you again.',
            'bye' => 'Goodbye! Have a great day!',
            'مع السلامة' => 'مع السلامة! نراك قريباً إن شاء الله.'
        ];

        if (isset($autoReplies[$message])) {
            // إرسال رد تلقائي
            $whatsappService = app(\App\Services\WhatsAppService::class);
            $whatsappService->sendMessage('main', $phoneNumber, $autoReplies[$message]);
        }
    }

    /**
     * معالجة إجراءات الأزرار
     */
    private function processButtonAction(string $buttonId, string $phoneNumber, array $payload): void
    {
        switch ($buttonId) {
            case 'support':
                // إعادة توجيه لدعم فني
                $this->assignToSupport($phoneNumber);
                break;

            case 'sales':
                // إعادة توجيه للمبيعات
                $this->assignToSales($phoneNumber);
                break;

            case 'complaint':
                // معالجة شكوى
                $this->handleComplaint($phoneNumber, $payload);
                break;

            default:
                Log::info('Unknown button action', ['button_id' => $buttonId]);
        }
    }

    /**
     * إعادة توجيه للدعم الفني
     */
    private function assignToSupport(string $phoneNumber): void
    {
        Log::info('Customer assigned to support', ['phone' => $phoneNumber]);
        // يمكنك إضافة منطق لإعادة توجيه العميل لموظف دعم
    }

    /**
     * إعادة توجيه للمبيعات
     */
    private function assignToSales(string $phoneNumber): void
    {
        Log::info('Customer assigned to sales', ['phone' => $phoneNumber]);
        // يمكنك إضافة منطق لإعادة توجيه العميل لموظف مبيعات
    }

    /**
     * معالجة شكوى
     */
    private function handleComplaint(string $phoneNumber, array $payload): void
    {
        Log::info('Complaint received', ['phone' => $phoneNumber]);
        // حفظ الشكوى في قاعدة البيانات وإشعار المسؤولين
    }

    /**
     * استخراج رقم الهاتف من JID
     */
    private function extractPhoneFromJid(string $jid): string
    {
        // JID format: 201234567890@s.whatsapp.net
        $parts = explode('@', $jid);
        return $parts[0] ?? '';
    }
}