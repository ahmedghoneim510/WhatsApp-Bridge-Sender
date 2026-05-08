<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Services\WhatsAppService;
use App\Models\Customer;

class CustomerController extends Controller
{
  private WhatsAppService $whatsappService;

  public function __construct(WhatsAppService $whatsappService)
  {
    $this->whatsappService = $whatsappService;
  }

  /**
   * إرسال رسالة لعميل محدد
   */
  public function sendMessage(Request $request, Customer $customer): JsonResponse
  {
    $request->validate([
      'message' => 'required|string|max:4096'
    ]);

    $result = $this->whatsappService->sendMessage(
      sessionId: 'main',
      phoneNumber: $customer->phone,
      message: $request->message
    );

    if ($result['success']) {
      // حفظ الرسالة في سجل الرسائل
      $customer->messages()->create([
        'message' => $request->message,
        'direction' => 'outgoing',
        'status' => 'sent',
        'message_id' => $result['message_id']
      ]);

      return response()->json([
        'success' => true,
        'message' => 'تم إرسال الرسالة بنجاح',
        'data' => $result
      ]);
    }

    return response()->json([
      'success' => false,
      'message' => 'فشل في إرسال الرسالة',
      'error' => $result['error']
    ], 400);
  }

  /**
   * إرسال استطلاع رأي للعميل
   */
  public function sendPoll(Request $request, Customer $customer): JsonResponse
  {
    $request->validate([
      'question' => 'required|string|max:300',
      'options' => 'required|array|min:2|max:12',
      'options.*' => 'string|max:100'
    ]);

    $result = $this->whatsappService->sendPoll(
      sessionId: 'main',
      phoneNumber: $customer->phone,
      question: $request->question,
      options: $request->options,
      selectableCount: $request->selectable_count ?? 1
    );

    if ($result['success']) {
      return response()->json([
        'success' => true,
        'message' => 'تم إرسال الاستطلاع بنجاح',
        'data' => $result
      ]);
    }

    return response()->json([
      'success' => false,
      'message' => 'فشل في إرسال الاستطلاع',
      'error' => $result['error']
    ], 400);
  }

  /**
   * إرسال رسالة ترحيب لعميل جديد
   */
  public function sendWelcomeMessage(Customer $customer): JsonResponse
  {
    $welcomeMessage = "مرحباً {$customer->name}!\n\n" .
      "شكراً لك على التسجيل معنا.\n" .
      "كيف يمكننا مساعدتك اليوم؟";

    $result = $this->whatsappService->sendMessage(
      sessionId: 'main',
      phoneNumber: $customer->phone,
      message: $welcomeMessage
    );

    if ($result['success']) {
      return response()->json([
        'success' => true,
        'message' => 'تم إرسال رسالة الترحيب بنجاح'
      ]);
    }

    return response()->json([
      'success' => false,
      'message' => 'فشل في إرسال رسالة الترحيب'
    ], 400);
  }

  /**
   * إرسال رسائل جماعية للعملاء
   */
  public function sendBulkMessages(Request $request): JsonResponse
  {
    $request->validate([
      'customer_ids' => 'required|array',
      'customer_ids.*' => 'integer|exists:customers,id',
      'message' => 'required|string|max:4096'
    ]);

    $customers = Customer::whereIn('id', $request->customer_ids)
      ->whereNotNull('phone')
      ->get(['id', 'name', 'phone']);

    if ($customers->isEmpty()) {
      return response()->json([
        'success' => false,
        'message' => 'لا توجد عملاء صالحين للإرسال'
      ], 400);
    }

    $result = $this->whatsappService->sendBulkMessages(
      sessionId: 'main',
      customers: $customers->toArray(),
      message: $request->message
    );

    return response()->json([
      'success' => true,
      'message' => "تم إرسال {$result['success']} رسالة من أصل {$result['total']}",
      'data' => $result
    ]);
  }

  /**
   * إرسال رسالة تأكيد طلب
   */
  public function sendOrderConfirmation(Request $request): JsonResponse
  {
    $request->validate([
      'order_id' => 'required|integer|exists:orders,id'
    ]);

    $order = \App\Models\Order::with('customer')->find($request->order_id);

    $confirmationMessage = "مرحباً {$order->customer->name}!\n\n" .
      "تم تأكيد طلبك رقم #{$order->id}\n" .
      "المبلغ الإجمالي: {$order->total} جنيه\n" .
      "تاريخ التسليم المتوقع: {$order->expected_delivery_date->format('d/m/Y')}\n\n" .
      "شكراً لك على ثقتك بنا!";

    $result = $this->whatsappService->sendMessage(
      sessionId: 'main',
      phoneNumber: $order->customer->phone,
      message: $confirmationMessage
    );

    if ($result['success']) {
      return response()->json([
        'success' => true,
        'message' => 'تم إرسال تأكيد الطلب بنجاح'
      ]);
    }

    return response()->json([
      'success' => false,
      'message' => 'فشل في إرسال تأكيد الطلب'
    ], 400);
  }

  /**
   * إرسال تذكير دفع
   */
  public function sendPaymentReminder(Request $request): JsonResponse
  {
    $request->validate([
      'customer_ids' => 'required|array',
      'amount' => 'required|numeric|min:0'
    ]);

    $customers = Customer::whereIn('id', $request->customer_ids)
      ->whereNotNull('phone')
      ->get(['id', 'name', 'phone']);

    $reminderMessage = "تذكير بالدفع\n\n" .
      "عزيزي العميل،\n" .
      "لديك مبلغ مستحق قدره {$request->amount} جنيه\n" .
      "يرجى تسوية المبلغ في أقرب وقت ممكن.\n\n" .
      "شكراً لك.";

    $result = $this->whatsappService->sendBulkMessages(
      sessionId: 'main',
      customers: $customers->toArray(),
      message: $reminderMessage
    );

    return response()->json([
      'success' => true,
      'message' => "تم إرسال تذكير الدفع لـ {$result['success']} عميل",
      'data' => $result
    ]);
  }
}