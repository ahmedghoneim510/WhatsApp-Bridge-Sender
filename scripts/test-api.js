#!/usr/bin/env node

/**
 * Script اختبار بسيط لـ WhatsApp Bridge API
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testAPI() {
  console.log('🔍 اختبار WhatsApp Bridge API\n');

  try {
    // اختبار Health Check
    console.log('1. اختبار Health Check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health Check:', healthData);

    // اختبار قائمة الجلسات
    console.log('\n2. اختبار قائمة الجلسات...');
    const sessionsResponse = await fetch(`${BASE_URL}/sessions`);
    const sessionsData = await sessionsResponse.json();
    console.log('✅ Sessions:', sessionsData);

    // إذا كانت هناك جلسات، اختبار إرسال رسالة
    if (sessionsData.sessions && sessionsData.sessions.length > 0) {
      const sessionId = sessionsData.sessions[0].id;
      console.log(`\n3. اختبار إرسال رسالة للجلسة: ${sessionId}`);

      // هذا اختبار وهمي - لا ترسل رسالة حقيقية بدون رقم هاتف صحيح
      console.log('ℹ️  تجاهل إرسال الرسالة (أضف رقم هاتف للاختبار الحقيقي)');

      // مثال على كيفية إرسال رسالة:
      /*
      const messageData = {
        to: '201234567890', // ضع رقم هاتف صحيح
        message: 'رسالة اختبار من WhatsApp Bridge'
      };

      const sendResponse = await fetch(`${BASE_URL}/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData)
      });

      const sendResult = await sendResponse.json();
      console.log('✅ Send Message Result:', sendResult);
      */
    } else {
      console.log('\n⚠️  لا توجد جلسات نشطة. أنشئ جلسة أولاً من الـ Dashboard.');
    }

    console.log('\n🎉 انتهى الاختبار بنجاح!');

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }
}

// تشغيل الاختبار
testAPI();