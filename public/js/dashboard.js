/**
 * WhatsApp Bridge Dashboard
 * Main JavaScript Application
 */

// ===================================
// Configuration
// ===================================
const CONFIG = {
    API_BASE_URL: '',
    REFRESH_INTERVAL: 10000, // 10 seconds
    REQUEST_TIMEOUT: 35000, // 35 seconds
    NOTIFICATION_DURATION: 3000, // 3 seconds
};

// ===================================
// Alpine.js Dashboard App
// ===================================
function dashboardApp() {
    return {
        // State
        sessions: [],
        loading: false,
        refreshInterval: null,

        // Modals
        showCreateModal: false,
        showSendModal: false,
        showBulkModal: false,
        showQRModal: false,

        // Form Data
        createForm: {
            sessionId: '',
            webhookUrl: '',
            webhookSecret: ''
        },
        sendForm: {
            sessionId: '',
            phone: '',
            message: ''
        },
        bulkForm: {
            sessionId: '',
            recipients: '',
            message: '',
            delay: 1000
        },
        bulkResults: {
            show: false,
            data: null
        },
        qrData: {
            sessionId: '',
            qrCode: ''
        },

        // Computed Stats
        get stats() {
            return {
                connected: this.sessions.filter(s => s.status === 'open').length,
                connecting: this.sessions.filter(s => s.status === 'connecting').length,
                closed: this.sessions.filter(s => s.status === 'closed').length,
                total: this.sessions.length
            };
        },

        // ===================================
        // Initialization
        // ===================================
        async init() {
            console.log('Dashboard initialized');
            await this.loadSessions();
            this.startAutoRefresh();
            this.initLucideIcons();

            // Watch for modal changes to reinit icons
            this.$watch('showCreateModal', () => this.initLucideIcons());
            this.$watch('showSendModal', () => this.initLucideIcons());
            this.$watch('showBulkModal', () => this.initLucideIcons());
            this.$watch('showQRModal', () => this.initLucideIcons());
        },

        initLucideIcons() {
            setTimeout(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }, 100);
        },

        // ===================================
        // API Methods
        // ===================================
        async loadSessions() {
            this.loading = true;
            try {
                const response = await this.fetchWithTimeout('/sessions');
                const data = await response.json();

                if (data && Array.isArray(data.sessions)) {
                    this.sessions = data.sessions;
                } else {
                    throw new Error('Invalid response format');
                }
            } catch (error) {
                console.error('Error loading sessions:', error);
                this.showNotification('خطأ في تحميل الجلسات', 'error');
            } finally {
                this.loading = false;
                this.initLucideIcons();
            }
        },

        async createSession() {
            const rawSessionId = (this.createForm.sessionId || '').trim();
            if (!rawSessionId) {
                this.showNotification('يرجى إدخال معرف الجلسة', 'warning');
                return;
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(rawSessionId)) {
                this.showNotification('معرف الجلسة غير صالح: استخدم أحرف إنجليزية، أرقام، - أو _ فقط', 'warning');
                return;
            }

            const body = {
                mode: 'qr',
                reset: true
            };

            if (this.createForm.webhookUrl.trim()) {
                body.webhookUrl = this.createForm.webhookUrl.trim();
            }

            if (this.createForm.webhookSecret.trim()) {
                body.webhookSecret = this.createForm.webhookSecret.trim();
            }

            try {
                const response = await this.fetchWithTimeout(
                    `/sessions/${rawSessionId}/connect`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }
                );

                if (response.ok) {
                    this.showNotification('تم إنشاء الجلسة بنجاح', 'success');
                    this.showCreateModal = false;
                    this.resetCreateForm();
                    await this.loadSessions();
                } else {
                    const errorMessage = await this.getErrorMessage(response, 'فشل إنشاء الجلسة');
                    this.showNotification(`خطأ: ${errorMessage}`, 'error');
                }
            } catch (error) {
                console.error('Error creating session:', error);
                if (error.name === 'AbortError') {
                    this.showNotification('انتهت مهلة إنشاء الجلسة، حاول مرة أخرى', 'error');
                } else {
                    const reason = error.message || 'تعذر الوصول إلى السيرفر';
                    this.showNotification(`خطأ في إنشاء الجلسة: ${reason}`, 'error');
                }
            }
        },

        async sendMessage() {
            if (!this.sendForm.phone.trim() || !this.sendForm.message.trim()) {
                this.showNotification('يرجى إدخال الرقم والرسالة', 'warning');
                return;
            }

            try {
                const response = await this.fetchWithTimeout(
                    `/sessions/${this.sendForm.sessionId}/send`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: this.sendForm.phone.trim(),
                            message: this.sendForm.message.trim()
                        })
                    }
                );

                if (response.ok) {
                    this.showNotification('تم إرسال الرسالة بنجاح', 'success');
                    this.showSendModal = false;
                    this.resetSendForm();
                } else {
                    const error = await response.json();
                    this.showNotification(`خطأ: ${error.message || error.error || 'فشل الإرسال'}`, 'error');
                }
            } catch (error) {
                console.error('Error sending message:', error);
                if (error.name === 'AbortError') {
                    this.showNotification('انتهت مهلة الإرسال. تحقق من الرقم وحاول مرة أخرى', 'error');
                } else {
                    this.showNotification('خطأ في إرسال الرسالة', 'error');
                }
            }
        },

        async sendBulkMessages() {
            if (!this.bulkForm.recipients.trim() || !this.bulkForm.message.trim()) {
                this.showNotification('يرجى إدخال الأرقام والرسالة', 'warning');
                return;
            }

            const recipients = this.bulkForm.recipients
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (recipients.length === 0) {
                this.showNotification('يرجى إدخال رقم واحد على الأقل', 'warning');
                return;
            }

            try {
                const response = await this.fetchWithTimeout(
                    `/sessions/${this.bulkForm.sessionId}/send-bulk`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipients: recipients,
                            message: this.bulkForm.message.trim(),
                            delay: parseInt(this.bulkForm.delay) || 1000
                        })
                    },
                    60000 // Longer timeout for bulk
                );

                if (response.ok) {
                    const data = await response.json();
                    this.bulkResults.data = data;
                    this.bulkResults.show = true;

                    const message = `تم إرسال ${data.success} من ${data.total} رسالة`;
                    this.showNotification(message, data.failed > 0 ? 'warning' : 'success');
                } else {
                    const error = await response.json();
                    this.showNotification(`خطأ: ${error.message || error.error}`, 'error');
                }
            } catch (error) {
                console.error('Error sending bulk messages:', error);
                this.showNotification('خطأ في إرسال الرسائل الجماعية', 'error');
            }
        },

        async showQR(sessionId) {
            try {
                const response = await this.fetchWithTimeout(`/dashboard/${sessionId}/qr`);
                const data = await response.json();

                if (data.qr) {
                    this.qrData.sessionId = sessionId;
                    this.qrData.qrCode = data.qr;
                    this.showQRModal = true;
                } else {
                    this.showNotification('QR غير متاح بعد، جرب مرة أخرى', 'warning');
                }
            } catch (error) {
                console.error('Error loading QR:', error);
                this.showNotification('خطأ في تحميل QR', 'error');
            }
        },

        async deleteSession(sessionId) {
            if (!confirm(`هل أنت متأكد من حذف الجلسة "${sessionId}"؟`)) {
                return;
            }

            try {
                const response = await this.fetchWithTimeout(`/sessions/${sessionId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.showNotification('تم حذف الجلسة بنجاح', 'success');
                    await this.loadSessions();
                } else {
                    const error = await response.json();
                    this.showNotification(`خطأ: ${error.error}`, 'error');
                }
            } catch (error) {
                console.error('Error deleting session:', error);
                this.showNotification('خطأ في حذف الجلسة', 'error');
            }
        },

        // ===================================
        // Modal Methods
        // ===================================
        openSendModal(sessionId) {
            this.sendForm.sessionId = sessionId;
            this.showSendModal = true;
        },

        openBulkModal(sessionId) {
            this.bulkForm.sessionId = sessionId;
            this.bulkResults.show = false;
            this.bulkResults.data = null;
            this.showBulkModal = true;
        },

        closeBulkModal() {
            this.showBulkModal = false;
            this.resetBulkForm();
        },

        // ===================================
        // Helper Methods
        // ===================================
        async fetchWithTimeout(url, options = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(CONFIG.API_BASE_URL + url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        },

        async getErrorMessage(response, fallback = 'حدث خطأ غير متوقع') {
            try {
                const text = await response.text();
                if (!text) {
                    return `${fallback} (HTTP ${response.status})`;
                }

                try {
                    const data = JSON.parse(text);
                    return data.message || data.error || `${fallback} (HTTP ${response.status})`;
                } catch {
                    return text || `${fallback} (HTTP ${response.status})`;
                }
            } catch {
                return `${fallback} (HTTP ${response.status || 'unknown'})`;
            }
        },

        startAutoRefresh() {
            this.refreshInterval = setInterval(() => {
                this.loadSessions();
            }, CONFIG.REFRESH_INTERVAL);
        },

        stopAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        },

        // ===================================
        // UI Helper Methods
        // ===================================
        getStatusClass(status) {
            const classes = {
                'open': 'status-connected',
                'connecting': 'status-connecting',
                'closed': 'status-closed'
            };
            return classes[status] || 'bg-gray-100 text-gray-700';
        },

        getStatusBgClass(status) {
            const classes = {
                'open': 'status-bg-connected',
                'connecting': 'status-bg-connecting',
                'closed': 'status-bg-closed'
            };
            return classes[status] || 'bg-gray-500';
        },

        getStatusText(status) {
            const texts = {
                'open': 'متصل',
                'connecting': 'جاري الاتصال',
                'closed': 'غير متصل'
            };
            return texts[status] || status;
        },

        formatLastMessage(timestamp) {
            if (!timestamp) return 'لا توجد رسائل';

            try {
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) return 'لا توجد رسائل';

                const now = new Date();
                const diff = now - date;
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);

                if (minutes < 1) return 'الآن';
                if (minutes < 60) return `منذ ${minutes} دقيقة`;
                if (hours < 24) return `منذ ${hours} ساعة`;
                if (days < 7) return `منذ ${days} يوم`;

                return date.toLocaleDateString('ar-EG');
            } catch (error) {
                return 'لا توجد رسائل';
            }
        },

        showNotification(message, type = 'info') {
            const notification = new Notification(message, type);
            notification.show();
        },

        // ===================================
        // Form Reset Methods
        // ===================================
        resetCreateForm() {
            this.createForm = {
                sessionId: '',
                webhookUrl: '',
                webhookSecret: ''
            };
        },

        resetSendForm() {
            this.sendForm = {
                sessionId: '',
                phone: '',
                message: ''
            };
        },

        resetBulkForm() {
            this.bulkForm = {
                sessionId: '',
                recipients: '',
                message: '',
                delay: 1000
            };
            this.bulkResults = {
                show: false,
                data: null
            };
        },

        // ===================================
        // Cleanup
        // ===================================
        destroy() {
            this.stopAutoRefresh();
        }
    };
}

// ===================================
// Notification System
// ===================================
class Notification {
    constructor(message, type = 'info') {
        this.message = message;
        this.type = type;
        this.element = null;
    }

    show() {
        this.element = this.create();
        const container = document.getElementById('notifications');
        if (container) {
            container.appendChild(this.element);
            setTimeout(() => this.hide(), CONFIG.NOTIFICATION_DURATION);
        }
    }

    create() {
        const div = document.createElement('div');
        div.className = `notification-${this.type}`;

        const icon = this.getIcon();
        div.innerHTML = `
            <i data-lucide="${icon}" class="w-5 h-5"></i>
            <span>${this.message}</span>
        `;

        // Initialize icon
        setTimeout(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 0);

        return div;
    }

    hide() {
        if (this.element) {
            this.element.style.opacity = '0';
            this.element.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }, 300);
        }
    }

    getIcon() {
        const icons = {
            'success': 'check-circle',
            'error': 'x-circle',
            'warning': 'alert-triangle',
            'info': 'info'
        };
        return icons[this.type] || 'info';
    }
}

// ===================================
// Utility Functions
// ===================================
const Utils = {
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },

    formatPhone(phone) {
        return phone.replace(/\D/g, '');
    },

    validatePhone(phone) {
        const cleaned = this.formatPhone(phone);
        return cleaned.length >= 10 && cleaned.length <= 15;
    }
};

// ===================================
// Initialize on DOM Ready
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard loaded');

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// ===================================
// Cleanup on page unload
// ===================================
window.addEventListener('beforeunload', () => {
    // Cleanup will be handled by Alpine.js destroy
});

// ===================================
// Export for use in HTML
// ===================================
window.dashboardApp = dashboardApp;
window.Utils = Utils;
