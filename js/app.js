/**
 * تطبيق نظام تقارير الحصص الرسمية - معهد الشارقة للسياقة (SDI)
 * Sharjah Driving Institute LLC
 * 
 * المخرجات الأساسية المعتمدة:
 * 1. تقرير لوحة المؤشرات الإحصائية (صفحتان A4)
 * 2. التقرير التفصيلي للحصص الفارغة (5 صفحات A4)
 * 
 * ميزات المحرر التفاعلي:
 * - فترتا عمل للمركبة الخفيفة: الأولى (1-10) والثانية (11-20) مع إخفاء الفترة الأخرى تلقائياً.
 * - فترتا عمل للشاحنة الثقيلة HTFM: الأولى (1-12) والثانية (13-24) ووقت الحصة 30 دقيقة.
 * - فترة ثابتة للدراجة النارية: (6-17) ووقت الحصة 30 دقيقة.
 * - نظام تكويد ذكي لكل مدرب (مثال: LMFM-S1, LMFA-S2, MCFM-FIX, HTFM-S1).
 * 
 * تطوير: م/ محمود محمد
 */

class SDIReportApp {
    constructor() {
        const saved = localStorage.getItem('sdi_instructors_custom');
        this.instructors = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(OFFICIAL_INSTRUCTORS));
        this.activeView = 'report1'; // 'report1' | 'report2' | 'interactive' | 'coding'
        this.theme = localStorage.getItem('sdi_theme') || 'light';
        this.lang = localStorage.getItem('sdi_lang') || 'ar'; // 'ar' | 'en'
        this.filterCategory = 'ALL';
        this.selectedInstId = this.instructors[0]?.id || '102671'; // المدرب المختار افتراضياً
        this.activePeriodFilter = 'all'; // 'all' | 'morning' | 'evening'
        this.isCodingFormExpanded = true;

        // نظام التزامن اللحظي متعدد المستخدمين (Multi-User Real-Time Sync)
        this.clientId = 'client_' + Math.random().toString(36).substring(2, 9);
        this.ws = null;
        this.isWsConnected = false;
        this.onlineUsersCount = 1;
        this.reconnectTimer = null;
        this.activeFileName = "Instructor Availability.pdf (الملف الرسمي المعتمد)";
        this.activeFileTime = "⚡ تم التحليل اللحظي المباشر";
        this.serverLocalIps = [];
        this.serverPort = 5173;

        // دعم قنوات البث المحلية الفورية بين التبويبات المفتوحة في نفس المتصفح
        if (typeof BroadcastChannel !== 'undefined') {
            this.broadcastChannel = new BroadcastChannel('sdi_realtime_channel');
            this.broadcastChannel.onmessage = (event) => {
                if (event.data && event.data.clientId !== this.clientId) {
                    this.handleRemoteStateUpdate(event.data.payload, event.data.action, true);
                }
            };
        }

        this.init();
    }

    init() {
        this.applyTheme(this.theme);
        this.applyLanguage();
        this.refresh();
        this.setupEventListeners();
        this.initRealtimeConnection();
        this.listenToStorageEvents();
    }

    /* ================= 🌐 محرك اللغات والترجمة الثنائية (Bilingual Engine) ================= */
    t(key, replacements = {}) {
        const dict = (typeof SDI_TRANSLATIONS !== 'undefined' && SDI_TRANSLATIONS[this.lang])
            ? SDI_TRANSLATIONS[this.lang]
            : (typeof SDI_TRANSLATIONS !== 'undefined' && SDI_TRANSLATIONS['ar'] ? SDI_TRANSLATIONS['ar'] : {});
        let text = dict[key] !== undefined ? dict[key] : key;
        if (replacements && typeof replacements === 'object') {
            Object.keys(replacements).forEach(k => {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), replacements[k]);
            });
        }
        return text;
    }

    toggleLanguage() {
        this.lang = (this.lang === 'ar') ? 'en' : 'ar';
        localStorage.setItem('sdi_lang', this.lang);
        this.applyLanguage();
        this.refresh();
        this.showToast(this.lang === 'ar' ? '✅ تم تحويل واجهة النظام إلى اللغة العربية' : '✅ System interface switched to English');
    }

    applyLanguage() {
        document.documentElement.lang = this.lang;
        document.documentElement.dir = (this.lang === 'ar') ? 'rtl' : 'ltr';
        document.title = (this.lang === 'ar')
            ? 'نظام تقارير الحصص الرسمية - معهد الشارقة للسياقة (SDI)'
            : 'Official Schedule Reports System - Sharjah Driving Institute (SDI)';

        const langBtn = document.getElementById('lang-btn');
        if (langBtn) {
            langBtn.innerHTML = (this.lang === 'ar') ? '<span>🌐 English</span>' : '<span>🌐 عربي</span>';
        }

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            const val = this.t(k);
            if (val && val !== k) {
                el.textContent = val;
            }
        });

        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const k = el.getAttribute('data-i18n-html');
            const val = this.t(k);
            if (val && val !== k) {
                el.innerHTML = val;
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const k = el.getAttribute('data-i18n-placeholder');
            const val = this.t(k);
            if (val && val !== k) {
                el.placeholder = val;
            }
        });

        this.updateRealtimeBadge(this.isWsConnected, this.onlineUsersCount);
        this.updateModalCodePreview();
    }

    /* ================= ⚡ محرك التزامن اللحظي متعدد المستخدمين (WebSocket Engine) ================= */
    initRealtimeConnection() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:5173';
        const wsUrl = `${protocol}//${host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isWsConnected = true;
                this.updateRealtimeBadge(true, this.onlineUsersCount);
                console.log('[SDI Realtime] Connected to realtime sync server.');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'INIT_STATE') {
                        this.clientId = data.clientId || this.clientId;
                        this.onlineUsersCount = data.onlineUsers || 1;
                        this.serverLocalIps = data.localIps || [];
                        this.serverPort = data.port || 5173;
                        this.updateRealtimeBadge(true, this.onlineUsersCount);
                        this.updateNetworkModalUrls();

                        if (data.payload && Array.isArray(data.payload.instructors) && data.payload.instructors.length > 0) {
                            this.handleRemoteStateUpdate(data.payload, 'الاتصال بالخادم المركزي', false);
                        }
                    } else if (data.type === 'STATE_UPDATED') {
                        if (data.senderId !== this.clientId && data.payload) {
                            this.handleRemoteStateUpdate(data.payload, data.action || 'تحديث البيانات من مستخدم متصل', true);
                        }
                    } else if (data.type === 'ONLINE_USERS_COUNT') {
                        this.onlineUsersCount = data.count || 1;
                        this.updateRealtimeBadge(this.isWsConnected, this.onlineUsersCount);
                    }
                } catch (err) {
                    console.error('[SDI Realtime] Parse error:', err);
                }
            };

            this.ws.onclose = () => {
                this.isWsConnected = false;
                this.updateRealtimeBadge(false, 1);
                console.warn('[SDI Realtime] Disconnected. Reconnecting in 3s...');
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.initRealtimeConnection(), 3000);
            };

            this.ws.onerror = () => {
                this.isWsConnected = false;
                this.updateRealtimeBadge(false, 1);
            };
        } catch (e) {
            console.error('[SDI Realtime] Connection failed:', e);
            this.updateRealtimeBadge(false, 1);
        }
    }

    updateRealtimeBadge(isOnline, usersCount) {
        const pill = document.getElementById('realtime-pill');
        const dot = document.getElementById('realtime-dot');
        const text = document.getElementById('realtime-text');
        const badge = document.getElementById('online-users-badge');

        if (dot) {
            dot.className = `pulse-dot ${isOnline ? 'online' : 'offline'}`;
        }
        if (text) {
            text.innerText = isOnline ? this.t('statusOnline') : this.t('statusOffline');
        }
        if (badge) {
            const userWord = usersCount > 1 ? this.t('usersConnected') : this.t('userConnected');
            badge.innerText = `👥 ${usersCount} ${userWord}`;
        }
        if (pill) {
            pill.className = `realtime-status-pill ${isOnline ? '' : 'offline'}`;
            pill.title = isOnline 
                ? (this.lang === 'ar' ? `النظام متصل بالخادم | عدد المستخدمين المتصلين حالياً: ${usersCount} | التزامن اللحظي نشط فورياً` : `System connected to server | Active users: ${usersCount} | Real-Time Sync active`) 
                : (this.lang === 'ar' ? 'الخادم غير متصل حالياً، يتم الحفظ في المتصفح المحلي' : 'Server disconnected, saving to local browser storage');
        }
    }

    handleRemoteStateUpdate(newPayload, actionDescription = '', notifyUser = true) {
        if (!newPayload || !Array.isArray(newPayload.instructors)) return;

        this.instructors = newPayload.instructors;
        if (newPayload.activeFileName) this.activeFileName = newPayload.activeFileName;
        if (newPayload.activeFileTime) this.activeFileTime = newPayload.activeFileTime;

        localStorage.setItem('sdi_instructors_custom', JSON.stringify(this.instructors));

        if (this.selectedInstId !== 'all') {
            const exists = this.instructors.some(i => i.id === this.selectedInstId);
            if (!exists && this.instructors.length > 0) {
                this.selectedInstId = this.instructors[0].id;
            }
        }

        const nameEl = document.getElementById('active-file-name');
        const timeEl = document.getElementById('active-file-time');
        if (nameEl) nameEl.innerText = this.activeFileName;
        if (timeEl) timeEl.innerText = this.activeFileTime;

        this.refresh();

        if (notifyUser) {
            this.showToast(`⚡ تزامن لحظي: تم استلام تحديث جديد (${actionDescription}) وتطبيقه تلقائياً!`);
            // تأثير وميض بصري على العنصر النشط
            const target = document.querySelector('.focused-inst-card, .prominent-coding-card');
            if (target) {
                target.classList.add('remote-updated');
                setTimeout(() => target.classList.remove('remote-updated'), 1500);
            }
        }
    }

    syncStateWithServer(actionDescription) {
        localStorage.setItem('sdi_instructors_custom', JSON.stringify(this.instructors));

        const payload = {
            instructors: this.instructors,
            activeFileName: this.activeFileName,
            activeFileTime: this.activeFileTime,
            action: actionDescription
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'SYNC_STATE',
                payload: payload,
                clientId: this.clientId,
                action: actionDescription
            }));
        } else {
            fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, clientId: this.clientId, action: actionDescription })
            }).catch(e => console.warn('[SDI Realtime] REST sync error:', e));
        }

        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                clientId: this.clientId,
                payload: payload,
                action: actionDescription
            });
        }
    }

    listenToStorageEvents() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'sdi_instructors_custom' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (Array.isArray(parsed)) {
                        this.instructors = parsed;
                        this.refresh();
                    }
                } catch (err) {}
            }
        });
    }

    showNetworkShareModal() {
        this.updateNetworkModalUrls();
        const modal = document.getElementById('network-share-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeNetworkShareModal() {
        const modal = document.getElementById('network-share-modal');
        if (modal) modal.style.display = 'none';
    }

    updateNetworkModalUrls() {
        const localInput = document.getElementById('share-local-url');
        const netInput = document.getElementById('share-network-url');

        const currentPort = window.location.port || '5173';
        if (localInput) {
            localInput.value = `http://localhost:${currentPort}`;
        }
        if (netInput) {
            const ip = (this.serverLocalIps && this.serverLocalIps.length > 0) ? this.serverLocalIps[0] : '192.168.0.121';
            netInput.value = `http://${ip}:${currentPort}`;
        }
    }

    copyToClipboard(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.select();
        el.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(el.value).then(() => {
            this.showToast(`✅ تم نسخ الرابط بنجاح: ${el.value}`);
        }).catch(() => {
            document.execCommand('copy');
            this.showToast(`✅ تم نسخ الرابط بنجاح!`);
        });
    }

    /* ================= حساب الإحصائيات الحية المعتمدة ================= */
    computeStats() {
        let totalCap = 0;
        let totalOcc = 0;
        let totalEmp = 0;

        const categories = {
            LMFM: { cap: 0, occ: 0, emp: 0, rate: 0 },
            LMFA: { cap: 0, occ: 0, emp: 0, rate: 0 },
            MC:   { cap: 0, occ: 0, emp: 0, rate: 0 },
            HT:   { cap: 0, occ: 0, emp: 0, rate: 0 }
        };

        const instructorStats = this.instructors.map(inst => {
            let occ = 0;
            let emp = 0;
            const shiftSlots = this.getInstructorShiftSlots(inst);
            shiftSlots.forEach(s => {
                if (s.sat === 'occupied') occ++; else if (s.sat === 'empty') emp++;
                if (s.sun === 'occupied') occ++; else if (s.sun === 'empty') emp++;
            });
            const cap = occ + emp;
            const rate = cap > 0 ? ((occ / cap) * 100).toFixed(1) : "0.0";

            totalCap += cap;
            totalOcc += occ;
            totalEmp += emp;

            if (categories[inst.category]) {
                categories[inst.category].cap += cap;
                categories[inst.category].occ += occ;
                categories[inst.category].emp += emp;
            }

            return {
                id: inst.id,
                name: inst.shortName || inst.name,
                category: inst.category,
                categoryAr: (inst.category === 'LMFM') ? 'عادي (LMFM)' : ((inst.category === 'LMFA') ? 'أوتوماتيك (LMFA)' : (inst.category === 'MC' ? 'دراجة (MC)' : 'شاحنة (HTFM)')),
                shiftCode: inst.shiftCode,
                shiftName: inst.shiftName,
                cap,
                occ,
                emp,
                rate
            };
        });

        const overallRate = totalCap > 0 ? ((totalOcc / totalCap) * 100).toFixed(1) : "0.0";

        Object.keys(categories).forEach(k => {
            const c = categories[k];
            c.rate = c.cap > 0 ? ((c.occ / c.cap) * 100).toFixed(1) : "0.0";
        });

        return {
            totalCap,
            totalOcc,
            totalEmp,
            overallRate,
            categories,
            instructorStats
        };
    }

    /* ================= تحديث وتصيير كافة التقارير ================= */
    refresh() {
        const stats = this.computeStats();
        this.renderReport1(stats);
        this.renderReport2();
        this.renderInteractiveEditor(stats);
        this.renderCodingManager();
    }

    /* ================= 1. تصيير التقرير الأول: لوحة المؤشرات (صفحتان A4) ================= */
    renderReport1(stats) {
        const container = document.getElementById('report-1-container');
        if (!container) return;

        const isAr = this.lang === 'ar';

        // الصفحة 1: المؤشرات العامة وفئات التدريب
        let html = `
            <!-- Report 1 - Page 1 -->
            <div class="page" id="r1-page-1">
                <div class="page-content">
                    <div class="official-header sdi-official-header">
                        <div class="official-header-top-bar">
                            <img src="assets/sdi-logo.png" alt="SDI Logo" class="official-header-logo">
                        </div>
                        <div class="sdi-header-text-wrap">
                            <h1 class="header-main-title">${this.t('r1Title')}</h1>
                            <p class="header-sub-title">${this.t('r1Sub')}</p>
                        </div>
                    </div>

                    <div class="section-title">${this.t('r1KpiSection')}</div>
                    <div class="kpi-row-grid">
                        <div class="kpi-stat-card">
                            <div class="kpi-stat-title">${this.t('r1KpiCap')}</div>
                            <div class="kpi-stat-number text-blue">${stats.totalCap}</div>
                            <div class="kpi-stat-sub">${this.t('r1KpiCapSub')}</div>
                        </div>
                        <div class="kpi-stat-card">
                            <div class="kpi-stat-title">${this.t('r1KpiOcc')}</div>
                            <div class="kpi-stat-number text-orange">${stats.totalOcc}</div>
                            <div class="kpi-stat-sub">${this.t('r1KpiOccSub')}</div>
                        </div>
                        <div class="kpi-stat-card">
                            <div class="kpi-stat-title">${this.t('r1KpiEmp')}</div>
                            <div class="kpi-stat-number text-green">${stats.totalEmp}</div>
                            <div class="kpi-stat-sub">${this.t('r1KpiEmpSub')}</div>
                        </div>
                        <div class="kpi-stat-card">
                            <div class="kpi-stat-title">${this.t('r1KpiRate')}</div>
                            <div class="kpi-stat-number text-navy">${stats.overallRate}%</div>
                            <div class="kpi-stat-sub">${this.t('r1KpiRateSub')}</div>
                        </div>
                    </div>

                    <div class="section-title" style="margin-top: 30px;">${this.t('r1CatSection')}</div>
                    <div class="cat-kpi-grid">
                        <!-- LMFM -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catLMFM')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFM.occ}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.LMFM.emp}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFM.rate}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- LMFA -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catLMFA')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFA.occ}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.LMFA.emp}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFA.rate}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- MC -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catMC')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.MC.occ}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.MC.emp}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.MC.rate}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- HT -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catHT')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.HT.occ}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.HT.emp}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.HT.rate}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <footer class="page-footer">
                    <span>${this.t('r1Page1Footer')}</span>
                    <span>${isAr ? 'الصفحة 1' : 'Page 1'}</span>
                </footer>
            </div>

            <!-- Report 1 - Page 2 -->
            <div class="page" id="r1-page-2">
                <div class="page-content">
                    <h2 style="text-align: center; font-size: 16pt; font-weight: 800; color: #0c1e42; margin-bottom: 20px;">
                        ${this.t('r1PerfSection')}
                    </h2>
                    <table class="instructors-perf-table">
                        <thead>
                            <tr>
                                <th style="width: 25%;">${isAr ? 'اسم المدرب' : 'Instructor Name'}</th>
                                <th style="width: 20%;">${isAr ? 'الفئة والفترة' : 'Category & Shift'}</th>
                                <th style="width: 12%;">${isAr ? 'السعة الكلية' : 'Total Capacity'}</th>
                                <th style="width: 12%;">${isAr ? 'مشغولة' : 'Occupied'}</th>
                                <th style="width: 12%;">${isAr ? 'فارغة' : 'Empty'}</th>
                                <th style="width: 19%;">${isAr ? 'معدل الإشغال' : 'Occupancy Rate'}</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (stats.instructorStats.length === 0) {
            html += `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px 15px; color: #94a3b8; font-size: 13.5px;">
                        ${isAr 
                            ? '✨ تم تصفير البيانات بنجاح (0 مدربين) - يرجى رفع ملف التدريب أو تسجيل مدرب جديد من التبويب الرابع.' 
                            : '✨ Data zeroed out successfully (0 instructors) - Please upload a schedule file or register an instructor.'}
                    </td>
                </tr>
            `;
        } else {
            stats.instructorStats.forEach(inst => {
                const catText = isAr 
                    ? inst.categoryAr 
                    : (inst.category === 'LMFM' ? 'Manual (LMFM)' : (inst.category === 'LMFA' ? 'Auto (LMFA)' : (inst.category === 'MC' ? 'Motorcycle (MC)' : 'Truck (HTFM)')));

                html += `
                    <tr>
                        <td style="font-weight: 700; ${isAr ? 'text-align: right; padding-right: 15px;' : 'text-align: left; padding-left: 15px;'}">
                            ${inst.name}
                            <span style="font-size: 10px; background: #eff3fa; color: #09296b; padding: 2px 6px; border-radius: 4px; ${isAr ? 'margin-right: 6px;' : 'margin-left: 6px;'} font-weight: 800;">${inst.shiftCode}</span>
                        </td>
                        <td>${catText}</td>
                        <td>${inst.cap}</td>
                        <td style="font-weight: 700; color: #f37421;">${inst.occ}</td>
                        <td style="font-weight: 700; color: #16a34a;">${inst.emp}</td>
                        <td>
                            <div class="progress-cell-wrapper">
                                <span style="font-weight: 800; min-width: 45px; ${isAr ? 'text-align: left;' : 'text-align: right;'}">${inst.rate}%</span>
                                <div class="perf-bar-track">
                                    <div class="perf-bar-fill" style="width: ${inst.rate}%;"></div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
                <footer class="page-footer">
                    <span>${this.t('r1Page2Footer')}</span>
                    <span>${isAr ? 'الصفحة 2' : 'Page 2'}</span>
                </footer>
            </div>
        `;

        container.innerHTML = html;
    }

    /* ================= 2. تصيير التقرير الثاني: تفاصيل الحصص الفارغة المعتمدة ================= */
    renderReport2() {
        const container = document.getElementById('report-2-container');
        if (!container) return;

        const totalInsts = this.instructors.length;
        const isAr = this.lang === 'ar';

        // حالة التصفير الشامل: لا يوجد مدربين
        if (totalInsts === 0) {
            const tabR2Btn = document.getElementById('tab-btn-r2');
            if (tabR2Btn) tabR2Btn.innerHTML = `<span>🗓️</span> 2. ${this.t('tabReport2')} (0 ${this.t('pagesText')})`;

            container.innerHTML = `
                <div class="page" id="r2-page-empty">
                    <div class="page-content" style="text-align: center; padding: 80px 20px;">
                        <div style="font-size: 48px; margin-bottom: 14px;">🗓️</div>
                        <h2 style="color: #0c1e42; margin-bottom: 8px; font-size: 18px;">${this.t('r2EmptyStateTitle')}</h2>
                        <p style="color: #64748b; font-size: 13.5px; max-width: 450px; margin: 0 auto 20px auto; line-height: 1.6;">
                            ${this.t('r2EmptyStateDesc')}
                        </p>
                        <button class="btn btn-primary" onclick="document.getElementById('universal-file-input').click()">
                            <span>📤</span> ${this.t('btnUploadFile')}
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        // حساب عدد الصفحات ديناميكياً بناءً على عدد المدربين (مدربان في كل صفحة كحد أقصى)
        const maxPage = Math.max(1, Math.ceil(totalInsts / 2));

        // ضبط رقم صفحة التقرير لكل مدرب
        this.instructors.forEach((inst, idx) => {
            inst.reportPage = Math.floor(idx / 2) + 1;
        });

        // تحديث نص التبويب الرئيسي
        const tabR2Btn = document.getElementById('tab-btn-r2');
        if (tabR2Btn) {
            const pageTxt = (maxPage === 1) ? this.t('pageOneText') : `${maxPage} ${this.t('pagesText')}`;
            tabR2Btn.innerHTML = `<span>🗓️</span> 2. ${this.t('tabReport2')} (${pageTxt})`;
        }

        const pagesMap = {};
        for (let p = 1; p <= maxPage; p++) {
            pagesMap[p] = this.instructors.filter(i => (i.reportPage || 1) === p);
        }

        let html = '';

        for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
            const pageInstructors = pagesMap[pageNum] || [];
            if (pageInstructors.length === 0) continue;

            html += `
                <!-- Report 2 - Page ${pageNum} -->
                <div class="page" id="r2-page-${pageNum}">
                    <div class="page-content">
            `;

            // الصفحة الأولى تحتوي على الترويسة الزرقاء الداكنة الرسمية مع الشعار
            if (pageNum === 1) {
                const singleNote = (totalInsts === 1) ? ` (${isAr ? 'جدول تدريبي فردي: ' : 'Single Schedule: '}${this.instructors[0].name})` : '';
                html += `
                    <div class="official-header sdi-official-header" style="margin-bottom: 20px;">
                        <div class="official-header-top-bar">
                            <img src="assets/sdi-logo.png" alt="SDI Logo" class="official-header-logo">
                            <div class="official-header-badge">
                                <span class="header-badge-dot"></span>
                                <span>${isAr ? 'تقرير الحصص الفارغة' : 'Empty Slots Report'}</span>
                            </div>
                        </div>
                        <div class="sdi-header-text-wrap">
                            <h1 class="header-main-title">${this.t('r2Title')}</h1>
                            <p class="header-sub-title">${this.t('r2Sub')}${singleNote}</p>
                        </div>
                    </div>
                `;
            }

            pageInstructors.forEach(inst => {
                const noteHtml = inst.note ? ` | <span style="color: #f37421; font-weight: bold;">${inst.note}</span>` : '';
                const instLabel = isAr ? 'المدرب:' : 'Instructor:';
                const codeLabel = isAr ? 'كود:' : 'Code:';
                const vehicleLabel = isAr ? 'المركبة:' : 'Vehicle:';
                const rangeLabel = isAr ? 'النطاق:' : 'Range:';
                const toLabel = isAr ? 'إلى' : 'to';

                html += `
                    <div class="instructor-slots-card">
                        <div class="inst-card-title-row">
                            <span class="inst-card-title">${instLabel} ${inst.name} (${inst.id})</span>
                            <span style="font-size: 11px; background: #eff3fa; color: #09296b; padding: 2px 8px; border-radius: 4px; font-weight: bold; ${isAr ? 'margin-right: 8px;' : 'margin-left: 8px;'}">
                                ${codeLabel} ${inst.shiftCode} (${inst.shiftName})
                            </span>
                        </div>
                        <div class="inst-card-meta">
                            ${vehicleLabel} ${inst.vehicleType} | ${rangeLabel} ${inst.minSlot} ${toLabel} ${inst.maxSlot}${noteHtml}
                        </div>

                        <table class="slots-table">
                            <thead>
                                <tr>
                                    <th style="width: 25%;">${isAr ? 'رقم الحصة' : 'Slot No.'}</th>
                                    <th style="width: 37.5%;">${this.t('thSatDays')}</th>
                                    <th style="width: 37.5%;">${this.t('thSunDays')}</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                inst.slotsRows.forEach(row => {
                    const satBadge = (row.sat === 'مشغولة' || row.sat === 'occupied')
                        ? `<span class="badge-status occupied">${this.t('badgeOccupied')}</span>`
                        : `<span class="badge-status empty">${this.t('badgeEmpty')}</span>`;

                    const sunBadge = (row.sun === 'مشغولة' || row.sun === 'occupied')
                        ? `<span class="badge-status occupied">${this.t('badgeOccupied')}</span>`
                        : `<span class="badge-status empty">${this.t('badgeEmpty')}</span>`;

                    const slotTitleText = row.slotDisplay.replace('حصة', this.t('slotTitle'));

                    html += `
                        <tr>
                            <td><strong>${slotTitleText}</strong></td>
                            <td>${satBadge}</td>
                            <td>${sunBadge}</td>
                        </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>
                `;
            });

            html += `
                    </div>
                    <footer class="page-footer">
                        <span>${this.t('r2PageFooter')}</span>
                        <span>${isAr ? `الصفحة ${pageNum} من ${maxPage}` : `Page ${pageNum} of ${maxPage}`}</span>
                    </footer>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /* ================= 3. المحرر التفاعلي لجدول الحصص وفترات العمل (Zero Scrollbars) ================= */
    /* ================= استخراج المدربين المسجلين خلال الفترة المحددة ================= */
    getFilteredInstructors() {
        if (this.activePeriodFilter === 'morning') {
            return this.instructors.filter(i => i.shift === 'S1' || i.category === 'MC');
        } else if (this.activePeriodFilter === 'evening') {
            return this.instructors.filter(i => i.shift === 'S2');
        }
        return this.instructors;
    }

    /* ================= استخراج الحصص التابعة للوردية المسجلة للمدرب فقط (منع ظهور الـ 20 حصة) ================= */
    getInstructorShiftSlots(inst) {
        let min = 1;
        let max = 10;

        if (inst.category === 'MC') {
            min = 6;
            max = 17;
        } else if (inst.category === 'HT') {
            if (inst.shift === 'S2') {
                min = 13;
                max = 24;
            } else {
                min = 1;
                max = 12;
            }
        } else {
            // LMFM أو LMFA
            if (inst.shift === 'S2') {
                min = 11;
                max = 20;
            } else {
                min = 1;
                max = 10;
            }
        }

        // إرجاع الحصص المسجلة للمدرب فقط (10 حصص للمركبة، 12 للشاحنة والدراجة) دون الـ 20 كاملة
        return inst.fullSchedule.filter(s => s.slot >= min && s.slot <= max);
    }

    /* ================= 3. المحرر التفاعلي لجدول الحصص وفترات العمل (Zero Scrollbars) ================= */
    renderInteractiveEditor(stats) {
        const container = document.getElementById('interactive-editor-container');
        if (!container) return;

        const totalInsts = this.instructors.length;
        const periodInstructors = this.getFilteredInstructors();
        const isAr = this.lang === 'ar';

        // حساب عدد المدربين في كل فترة لعرضها على أزرار التصفية
        const morningCount = this.instructors.filter(i => i.shift === 'S1' || i.category === 'MC').length;
        const eveningCount = this.instructors.filter(i => i.shift === 'S2').length;

        // 1. شريط اختيار المدرب السريع (Pill Selector) محدد بالمدربين المسجلين في الفترة المختارة
        let pillsHtml = '';
        if (totalInsts === 1) {
            const singleInst = this.instructors[0];
            const icon = singleInst.category === 'MC' ? '🏍️' : (singleInst.category === 'HT' ? '🚛' : '🚗');
            pillsHtml = `
                <div class="inst-selector-bar" style="justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span style="font-weight: 800; font-size: 13.5px; color: var(--text-main);">
                            ${icon} ${isAr ? 'المدرب:' : 'Instructor:'} <strong>${singleInst.name}</strong> (#${singleInst.id})
                        </span>
                        <span style="background: #eff3fa; color: #09296b; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 800;">
                            ${singleInst.shiftCode} - ${singleInst.vehicleType}
                        </span>
                        <span class="single-inst-banner">
                            <span>📄</span> ${isAr ? 'جدول تدريبي فردي (تم تحليل ملف لمدرب واحد بنجاح)' : 'Single Instructor Schedule (Successfully parsed)'}
                        </span>
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="app.openInstructorModal('edit', '${singleInst.id}')" title="تعديل وتكويد بيانات المدرب">
                        ${this.t('btnEditCoding')}
                    </button>
                </div>
            `;
        } else {
            const periodLabel = this.activePeriodFilter === 'morning' 
                ? (isAr ? 'مدربو الصباحي' : 'Morning') 
                : (this.activePeriodFilter === 'evening' ? (isAr ? 'مدربو المسائي' : 'Evening') : (isAr ? 'جميع المدربين' : 'All'));

            pillsHtml = `
                <div class="inst-selector-bar">
                    <span style="font-weight: 800; font-size: 12.5px; color: var(--text-main); ${isAr ? 'margin-left: 6px;' : 'margin-right: 6px;'} display: flex; align-items: center;">
                        👤 ${this.t('selectInstructorLabel')} (${periodLabel} - ${periodInstructors.length}):
                    </span>
            `;

            if (periodInstructors.length === 0) {
                pillsHtml += `<span style="font-size: 12px; color: #94a3b8; padding: 4px 8px;">${this.t('noInstructorsInPeriod')}</span>`;
            } else {
                periodInstructors.forEach(inst => {
                    const isActive = (this.selectedInstId === inst.id);
                    const icon = inst.category === 'MC' ? '🏍️' : (inst.category === 'HT' ? '🚛' : '🚗');
                    pillsHtml += `
                        <button class="inst-pill ${isActive ? 'active' : ''}" onclick="app.selectInstructor('${inst.id}')">
                            <span>${icon}</span>
                            <span>${inst.shortName || inst.name}</span>
                            ${inst.isAutoAdded ? `<span style="font-size: 10px; color: #f37421;" title="${this.t('badgeAutoAddedTitle')}">⚡</span>` : ''}
                            <span class="inst-pill-code">${inst.shiftCode}</span>
                        </button>
                    `;
                });
            }

            const isAllActive = (this.selectedInstId === 'all');
            const allBtnText = this.activePeriodFilter === 'morning' 
                ? `👥 ${this.t('allMorningPill')} (${periodInstructors.length})` 
                : (this.activePeriodFilter === 'evening' ? `👥 ${this.t('allEveningPill')} (${periodInstructors.length})` : `👥 ${this.t('allInstructorsPill')} (${this.instructors.length})`);

            pillsHtml += `
                    <button class="inst-pill ${isAllActive ? 'active' : ''}" onclick="app.selectInstructor('all')" style="${isAr ? 'margin-right: auto;' : 'margin-left: auto;'}">
                        <span>👥</span>
                        <span>${allBtnText}</span>
                    </button>
                </div>
            `;
        }

        // دالة مساعدة لتوليد جدول الحصص مقسم الأعمدة حسب الأيام
        const renderDaysTable = (slotsList, instId, category) => {
            let rowsHtml = '';
            slotsList.forEach(slotItem => {
                let slotTimeStr = "";
                if (category === 'MC') {
                    const tObj = MC_TIME_SLOTS.find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                } else if (category === 'HT') {
                    const tObj = HT_TIME_SLOTS.find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                } else {
                    const tObj = LM_TIME_SLOTS.find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                }

                const isSatOcc = slotItem.sat === 'occupied';
                const isSunOcc = slotItem.sun === 'occupied';

                const satBtn = isSatOcc
                    ? `<button class="slot-day-btn-interactive occupied" onclick="app.toggleSlot('${instId}', ${slotItem.slot}, 'sat')" title="${isAr ? 'الحصة مشغولة - انقر لتفريغها' : 'Slot occupied - click to free'}">🔒 ${this.t('badgeOccupied')}</button>`
                    : `<button class="slot-day-btn-interactive empty" onclick="app.toggleSlot('${instId}', ${slotItem.slot}, 'sat')" title="${isAr ? 'الحصة خالية - انقر لحجزها' : 'Slot empty - click to book'}">✨ ${this.t('badgeEmpty')}</button>`;

                const sunBtn = isSunOcc
                    ? `<button class="slot-day-btn-interactive occupied" onclick="app.toggleSlot('${instId}', ${slotItem.slot}, 'sun')" title="${isAr ? 'الحصة مشغولة - انقر لتفريغها' : 'Slot occupied - click to free'}">🔒 ${this.t('badgeOccupied')}</button>`
                    : `<button class="slot-day-btn-interactive empty" onclick="app.toggleSlot('${instId}', ${slotItem.slot}, 'sun')" title="${isAr ? 'الحصة خالية - انقر لحجزها' : 'Slot empty - click to book'}">✨ ${this.t('badgeEmpty')}</button>`;

                const bothBtn = (isSatOcc && isSunOcc)
                    ? `<button class="slot-both-btn" onclick="app.toggleSatThu('${instId}', ${slotItem.slot}, 'empty')" style="background:#fee2e2; color:#991b1b; border-color:#fca5a5;" title="${isAr ? 'تفريغ الحصة لكامل الأسبوع' : 'Free for whole week'}">${this.t('btnFree')}</button>`
                    : `<button class="slot-both-btn" onclick="app.toggleSatThu('${instId}', ${slotItem.slot}, 'occupied')" title="${isAr ? 'حجز الحصة لكامل الأسبوع (السبت-الخميس)' : 'Book for whole week'}">${this.t('btnBook')}</button>`;

                rowsHtml += `
                    <tr>
                        <td class="td-slot">
                            <div style="display: flex; flex-direction: column; gap: 1px;">
                                <strong style="font-size: 12.5px; color: var(--text-main);">${this.t('slotTitle')} ${slotItem.slot}</strong>
                                <span style="font-size: 10.5px; color: #64748b; direction: ltr; font-weight: 600;">${slotTimeStr}</span>
                            </div>
                        </td>
                        <td class="td-sat">${satBtn}</td>
                        <td class="td-sun">${sunBtn}</td>
                        <td class="td-action">${bothBtn}</td>
                    </tr>
                `;
            });

            return `
                <table class="interactive-days-table">
                    <thead>
                        <tr>
                            <th class="th-slot">${this.t('thSlotAndTime')}</th>
                            <th class="th-sat">${this.t('thSatDays')}<br><span style="font-size: 10px; opacity: 0.85;">${this.t('thSatDaysSub')}</span></th>
                            <th class="th-sun">${this.t('thSunDays')}<br><span style="font-size: 10px; opacity: 0.85;">${this.t('thSunDaysSub')}</span></th>
                            <th class="th-action">${this.t('thWeeklyAction')}<br><span style="font-size: 10px; opacity: 0.85;">${this.t('thWeeklyActionSub')}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            `;
        };

        let contentHtml = '';

        if (totalInsts === 0) {
            contentHtml = `
                <div style="background: var(--bg-surface); border: 2px dashed var(--border-color); border-radius: 12px; padding: 50px 20px; text-align: center; margin-top: 10px;">
                    <div style="font-size: 48px; margin-bottom: 14px;">✨</div>
                    <h3 style="font-size: 17px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">${isAr ? 'تم تصفير جداول الحصص بالكامل' : 'All Slots Zeroed Out'}</h3>
                    <p style="font-size: 13.5px; color: #64748b; margin-bottom: 20px;">${isAr ? 'لا يوجد مدربين مسجلين في النظام حالياً (0 مدربين). يمكنك استخدام نموذج التسجيل أعلاه لتسجيل مدرب جديد أو رفع ملف التدريب المعتمد.' : 'No instructors registered currently (0 instructors). Register a new instructor above or upload an institute training schedule.'}</p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-primary" onclick="document.getElementById('universal-file-input').click()">
                            <span>📤</span> ${this.t('btnUploadFile')}
                        </button>
                        <button class="btn btn-outline" onclick="app.executeZeroReset('default')">
                            <span>↩️</span> ${isAr ? 'استعادة البيانات الافتراضية' : 'Restore Default Data'}
                        </button>
                    </div>
                </div>
            `;
        } else if (this.selectedInstId !== 'all') {
            const inst = this.instructors.find(i => i.id === this.selectedInstId) || periodInstructors[0] || this.instructors[0];

            // خيارات الوردية الرسمية المعتمدة للمدرب
            let shiftOptionsHtml = '';
            if (inst.category === 'MC') {
                shiftOptionsHtml = `
                    <div style="font-size: 12px; background: #ecfdf5; color: #065f46; padding: 4px 12px; border-radius: 6px; font-weight: bold; border: 1px solid #a7f3d0;">
                        🏍️ ${isAr ? 'فترة ثابتة: 6 إلى 17 (مدة الحصة: 30 دقيقة)' : 'Fixed Shift: 6 to 17 (30 min slots)'}
                    </div>
                `;
            } else if (inst.category === 'HT') {
                shiftOptionsHtml = `
                    <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                        <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الأولى (1 إلى 12 - صباحي)' : 'Shift: Morning (1 to 12)'}</option>
                        <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الثانية (13 إلى 24 - مسائي)' : 'Shift: Evening (13 to 24)'}</option>
                    </select>
                `;
            } else {
                shiftOptionsHtml = `
                    <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                        <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الأولى (1 إلى 10 - صباحي)' : 'Shift: Morning (1 to 10)'}</option>
                        <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الثانية (11 إلى 20 - مسائي)' : 'Shift: Evening (11 to 20)'}</option>
                    </select>
                `;
            }

            // استخراج الحصص التابعة للفترة المسجلة للمدرب فقط (10 حصص للمركبة، 12 للشاحنة) لمنع ظهور الـ 20 حصة
            const visibleSlots = this.getInstructorShiftSlots(inst);

            // حساب المؤشرات للحصص المعروضة حالياً
            let curOcc = 0, curEmp = 0;
            visibleSlots.forEach(s => {
                if (s.sat === 'occupied') curOcc++; else curEmp++;
                if (s.sun === 'occupied') curOcc++; else curEmp++;
            });
            const curCap = curOcc + curEmp;
            const curRate = curCap > 0 ? ((curOcc / curCap) * 100).toFixed(1) : "0.0";

            // تقسيم الحصص إلى عمودين متساويين في حال تجاوزت 5 حصص لتلائم الشاشة بالكامل بدون سكرول
            let tableLayoutHtml = '';
            if (visibleSlots.length > 5) {
                const mid = Math.ceil(visibleSlots.length / 2);
                const col1 = visibleSlots.slice(0, mid);
                const col2 = visibleSlots.slice(mid);
                tableLayoutHtml = `
                    <div class="slots-dual-columns">
                        <div class="slots-col">
                            ${renderDaysTable(col1, inst.id, inst.category)}
                        </div>
                        <div class="slots-col">
                            ${renderDaysTable(col2, inst.id, inst.category)}
                        </div>
                    </div>
                `;
            } else {
                tableLayoutHtml = renderDaysTable(visibleSlots, inst.id, inst.category);
            }

            contentHtml = `
                <div class="focused-inst-card">
                    <div class="focused-inst-header">
                        <div class="focused-inst-meta">
                            <div>
                                <h3 style="font-size: 17px; font-weight: 800; color: #0c1e42; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    ${inst.name} <span style="font-size: 13px; color: #64748b;">(#${inst.id})</span>
                                    ${inst.isAutoAdded ? `<span class="auto-added-badge" title="${this.t('badgeAutoAddedTitle')}">${this.t('badgeAutoAdded')}</span>` : ''}
                                </h3>
                                <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                                    <span style="background: #eff3fa; color: #09296b; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 800;">
                                        ${isAr ? 'كود الوردية:' : 'Shift Code:'} ${inst.shiftCode}
                                    </span>
                                    <span style="font-size: 12px; color: #475569;">${inst.vehicleType}</span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <div>${shiftOptionsHtml}</div>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn btn-outline btn-sm" onclick="app.openInstructorModal('edit', '${inst.id}')" title="تعديل بيانات وتكويد هذا المدرب">
                                    ${this.t('btnEditCoding')}
                                </button>
                                <button class="btn btn-outline btn-sm" onclick="app.setShiftAllSlots('${inst.id}', 'empty')" title="تفريغ كافة حصص هذا النطاق">
                                    ${this.t('btnClearRange')}
                                </button>
                                <button class="btn btn-outline btn-sm" onclick="app.setShiftAllSlots('${inst.id}', 'occupied')" title="حجز كافة حصص هذا النطاق">
                                    ${this.t('btnBookRange')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- إحصائيات سريعة للحصص المسجلة فقط -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; padding: 8px 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 12.5px; flex-wrap: wrap; gap: 8px;">
                        <span>${this.t('instShiftRegistered')} <strong>${inst.shiftName}</strong> | ${this.t('instSlotsRange')} <strong>${this.t('slotTitle')} ${visibleSlots[0]?.slot || 1} ${isAr ? 'إلى' : 'to'} ${visibleSlots[visibleSlots.length-1]?.slot || 10}</strong> (${visibleSlots.length} ${this.t('instSlotsCount')})</span>
                        <div style="display: flex; gap: 14px;">
                            <span>${isAr ? 'مشغولة:' : 'Occupied:'} <strong style="color: #f37421;">${curOcc}</strong></span>
                            <span>${isAr ? 'فارغة:' : 'Empty:'} <strong style="color: #16a34a;">${curEmp}</strong></span>
                            <span>${this.t('instShiftRate')} <strong style="color: #09296b;">${curRate}%</strong></span>
                        </div>
                    </div>

                    <!-- شبكة الحصص المقسمة حسب أيام التدريب -->
                    ${tableLayoutHtml}
                </div>
            `;
        } else {
            // عرض كافة مدربي الفترة المحددة معاً في شبكة منظمة
            contentHtml = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 16px; width: 100%;">
            `;

            periodInstructors.forEach(inst => {
                const visibleSlots = this.getInstructorShiftSlots(inst);

                contentHtml += `
                    <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                            <div>
                                <strong style="font-size: 14px;">${inst.shortName || inst.name}</strong>
                                <span style="font-size: 11px; background: #eff3fa; color: #09296b; padding: 1px 6px; border-radius: 4px; ${isAr ? 'margin-right: 4px;' : 'margin-left: 4px;'} font-weight: 800;">${inst.shiftCode}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 11.5px; color: #64748b;">${inst.shiftName}</span>
                                <button class="btn btn-outline btn-sm" style="font-size: 10.5px; padding: 2px 7px;" onclick="app.openInstructorModal('edit', '${inst.id}')" title="تعديل التكويد">
                                    ⚙️ ${isAr ? 'تكويد' : 'Code'}
                                </button>
                            </div>
                        </div>
                        <div>
                            ${renderDaysTable(visibleSlots, inst.id, inst.category)}
                        </div>
                    </div>
                `;
            });

            contentHtml += `</div>`;
        }

        // شريط تصفية الفترات الصباحية والمسائية والكل
        const periodFilterToolbar = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                <div class="period-filter-group">
                    <span style="font-size: 12px; font-weight: 800; color: var(--text-secondary); padding: 0 6px;">⏱️ ${this.t('editorPeriodsTitle')}</span>
                    <button class="period-filter-btn ${this.activePeriodFilter === 'morning' ? 'active' : ''}" onclick="app.setPeriodFilter('morning')" title="تحميل مدربي الفترة الصباحية الأولى فقط">
                        <span>🌅</span> ${this.t('filterMorning')} (${morningCount})
                    </button>
                    <button class="period-filter-btn ${this.activePeriodFilter === 'evening' ? 'active' : ''}" onclick="app.setPeriodFilter('evening')" title="تحميل مدربي الفترة المسائية الثانية فقط">
                        <span>🌇</span> ${this.t('filterEvening')} (${eveningCount})
                    </button>
                    <button class="period-filter-btn ${this.activePeriodFilter === 'all' ? 'active' : ''}" onclick="app.setPeriodFilter('all')" title="عرض جميع المدربين وكافة الفترات">
                        <span>🌐</span> ${this.t('filterAll')} (${this.instructors.length})
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="btn btn-primary btn-sm" onclick="app.openInstructorModal('create')" title="تسجيل وتكويد مدرب جديد وتحديد فئة التدريب وفترة العمل">
                        <span>➕</span> ${isAr ? 'تسجيل وتكويد مدرب جديد' : 'Register & Code Instructor'}
                    </button>
                </div>
            </div>
        `;

        const prominentCodingCardHtml = `
            <div class="prominent-coding-card">
                <div class="prominent-coding-header" onclick="app.toggleCodingFormCollapse()">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">📝</span>
                        <div>
                            <strong style="font-size: 14px; color: var(--text-main);">${this.t('prominentFormTitle')}</strong>
                            <span style="font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; font-weight: bold; ${isAr ? 'margin-right: 8px;' : 'margin-left: 8px;'}">
                                ${this.t('prominentFormBadge')}
                            </span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline btn-sm" id="collapse-coding-form-btn" onclick="event.stopPropagation(); app.toggleCodingFormCollapse();">
                        ${this.isCodingFormExpanded ? this.t('btnHideForm') : this.t('btnShowForm')}
                    </button>
                </div>

                <div id="prominent-coding-body" class="prominent-coding-body" style="${this.isCodingFormExpanded ? 'display: block;' : 'display: none;'}">
                    <form onsubmit="event.preventDefault(); app.saveInstructorFromInline();" style="display: flex; flex-direction: column; gap: 14px;">
                        <div class="coding-form-grid">
                            <div class="form-group">
                                <label for="inline-inst-name">${this.t('lblInstName')} <span style="color:#ef4444;">*</span></label>
                                <input type="text" id="inline-inst-name" class="form-control" placeholder="مثال: Maqsood Ali" required oninput="app.updateInlinePreview()">
                            </div>

                            <div class="form-group">
                                <label for="inline-inst-id">${this.t('lblInstId')} <span style="color:#ef4444;">*</span></label>
                                <input type="text" id="inline-inst-id" class="form-control" placeholder="مثال: 102671" required>
                            </div>

                            <div class="form-group">
                                <label for="inline-inst-category">${this.t('lblInstCategory')} <span style="color:#ef4444;">*</span></label>
                                <select id="inline-inst-category" class="form-control" onchange="app.updateInlinePreview()">
                                    <option value="LMFM">🚗 ${isAr ? 'مركبة خفيفة - جير عادي (LMFM - 40 دقيقة)' : 'Light Motor - Manual (LMFM - 40 mins)'}</option>
                                    <option value="LMFA">🚙 ${isAr ? 'مركبة خفيفة - أوتوماتيك (LMFA - 40 دقيقة)' : 'Light Motor - Automatic (LMFA - 40 mins)'}</option>
                                    <option value="HT">🚛 ${isAr ? 'شاحنة ثقيلة (HTFM - 30 دقيقة)' : 'Heavy Truck (HTFM - 30 mins)'}</option>
                                    <option value="MC">🏍️ ${isAr ? 'دراجة نارية (MC - 30 دقيقة)' : 'Motorcycle (MC - 30 mins)'}</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="inline-inst-shift">${this.t('lblInstShift')} <span style="color:#ef4444;">*</span></label>
                                <select id="inline-inst-shift" class="form-control" onchange="app.updateInlinePreview()">
                                    <option value="S1">🌅 ${isAr ? 'الفترة الصباحية (الأولى) - حصص 1 إلى 10' : 'Morning Shift (1 to 10)'}</option>
                                    <option value="S2">🌇 ${isAr ? 'الفترة المسائية (الثانية) - حصص 11 إلى 20' : 'Evening Shift (11 to 20)'}</option>
                                    <option value="FIX">⏱️ ${isAr ? 'فترة ثابتة للدراجة النارية (6 إلى 17)' : 'Fixed Shift Motorcycle (6 to 17)'}</option>
                                </select>
                            </div>
                        </div>

                        <!-- شريط المعاينة وزر الحفظ المباشر -->
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span style="font-size: 12.5px; font-weight: 800; color: #166534;">${this.t('lblShiftCodePreview')}</span>
                                <span id="inline-preview-code" class="smart-code-badge">LMFM-S1</span>
                                <span id="inline-preview-desc" style="font-size: 12px; color: #15803d; font-weight: 600;">
                                    ${isAr ? 'الحصص المعتمدة: 1 إلى 10 فقط (تمت إزالة الحصص 11 إلى 20)' : 'Approved slots: 1 to 10 (slots 11-20 eliminated)'}
                                </span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button type="button" class="btn btn-outline btn-sm" onclick="app.clearInlineForm()">${this.t('btnClearFields')}</button>
                                <button type="submit" class="btn btn-primary btn-sm">${this.t('btnSaveInstructor')}</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="interactive-panel">
                <div class="interactive-toolbar">
                    <div>
                        <h3 style="font-size: 17px; font-weight: 800; margin-bottom: 2px;">🎮 ${isAr ? 'المحرر التفاعلي لجدول الحصص وفترات العمل' : 'Interactive Schedule & Shifts Editor'}</h3>
                        <p style="color: var(--text-muted); font-size: 12.5px;">
                            ${isAr ? 'تحميل المدربين حسب فترات العمل (صباحية ومسائية) وتوليد التكويد الذكي وإزالة الحصص خارج فترة العمل.' : 'Filter instructors by morning/evening shifts, auto-code, and remove slots outside approved shifts.'}
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline btn-sm" onclick="app.switchTab('coding')">📝 ${isAr ? 'لوحة إدارة المدربين' : 'Instructors Dashboard'}</button>
                        <button class="btn btn-outline btn-sm" onclick="app.resetAllData()">🔄 ${isAr ? 'استعادة البيانات الأصلية' : 'Restore Initial Data'}</button>
                    </div>
                </div>
                ${prominentCodingCardHtml}
                ${periodFilterToolbar}
                ${pillsHtml}
                ${contentHtml}
            </div>
        `;
    }

    /* ================= طي وإظهار نموذج التكويد البارز ================= */
    toggleCodingFormCollapse() {
        this.isCodingFormExpanded = !this.isCodingFormExpanded;
        const bodyEl = document.getElementById('prominent-coding-body');
        const btnEl = document.getElementById('collapse-coding-form-btn');
        if (bodyEl) bodyEl.style.display = this.isCodingFormExpanded ? 'block' : 'none';
        if (btnEl) btnEl.innerText = this.isCodingFormExpanded ? '🔼 إخفاء النموذج' : '🔽 إظهار نموذج التسجيل';
    }

    /* ================= تحديث المعاينة الحية لنموذج التكويد البارز ================= */
    updateInlinePreview() {
        const catEl = document.getElementById('inline-inst-category');
        const shiftEl = document.getElementById('inline-inst-shift');
        const codeEl = document.getElementById('inline-preview-code');
        const descEl = document.getElementById('inline-preview-desc');
        if (!catEl || !shiftEl || !codeEl || !descEl) return;

        const cat = catEl.value;
        let sh = shiftEl.value;

        if (cat === 'MC') {
            shiftEl.value = 'FIX';
            codeEl.innerText = 'MC-FIX';
            descEl.innerHTML = 'الفترة الثابتة: الحصص <strong>6 إلى 17</strong> فقط (12 حصة | 30 دقيقة)';
        } else if (cat === 'HT') {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                codeEl.innerText = 'HTFM-S1';
                descEl.innerHTML = 'الفترة الصباحية: الحصص <strong>1 إلى 12</strong> فقط (تمت إزالة 13 إلى 24)';
            } else {
                codeEl.innerText = 'HTFM-S2';
                descEl.innerHTML = 'الفترة المسائية: الحصص <strong>13 إلى 24</strong> فقط (تمت إزالة 1 إلى 12)';
            }
        } else {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                codeEl.innerText = `${cat}-S1`;
                descEl.innerHTML = 'الفترة الصباحية: الحصص <strong>1 إلى 10</strong> فقط (تمت إزالة 11 إلى 20)';
            } else {
                codeEl.innerText = `${cat}-S2`;
                descEl.innerHTML = 'الفترة المسائية: الحصص <strong>11 إلى 20</strong> فقط (تمت إزالة 1 إلى 10)';
            }
        }
    }

    /* ================= حفظ المدرب من النموذج البارز ================= */
    saveInstructorFromInline() {
        const name = document.getElementById('inline-inst-name')?.value.trim();
        const id = document.getElementById('inline-inst-id')?.value.trim();
        const category = document.getElementById('inline-inst-category')?.value || 'LMFM';
        const shift = document.getElementById('inline-inst-shift')?.value || 'S1';

        if (!name || !id) {
            alert("يرجى إدخال اسم المدرب والرقم الوظيفي / الكود.");
            return;
        }

        const shortName = name.split(' ').slice(0, 2).join(' ');

        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';

        if (category === 'MC') {
            shiftCode = 'MC-FIX';
            shiftName = 'فترة ثابتة (6 - 17)';
            minSlot = 6;
            maxSlot = 17;
            vehicleType = 'دراجة نارية (MC)';
        } else if (category === 'HT') {
            vehicleType = 'شاحنة ثقيلة (HTFM)';
            if (shift === 'S2') {
                shiftCode = 'HTFM-S2';
                shiftName = 'الفترة الثانية (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = 'HTFM-S1';
                shiftName = 'الفترة الأولى (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            vehicleType = category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)';
            if (shift === 'S2') {
                shiftCode = `${category}-S2`;
                shiftName = 'الفترة الثانية (11 - 20)';
                minSlot = 11;
                maxSlot = 20;
            } else {
                shiftCode = `${category}-S1`;
                shiftName = 'الفترة الأولى (1 - 10)';
                minSlot = 1;
                maxSlot = 10;
            }
        }

        const existing = this.instructors.find(i => i.id === id);
        if (existing) {
            existing.name = name;
            existing.shortName = shortName;
            existing.category = category;
            existing.vehicleType = vehicleType;
            existing.shift = shift;
            existing.shiftCode = shiftCode;
            existing.shiftName = shiftName;
            existing.minSlot = minSlot;
            existing.maxSlot = maxSlot;

            if (typeof SDIPdfParser !== 'undefined') {
                existing.slotsRows = SDIPdfParser.generateEmptySlotsRows(existing.fullSchedule, existing.minSlot, existing.maxSlot);
            }
            this.selectedInstId = id;
            this.showToast(`✅ تم تحديث وتكويد المدرب (${shortName}) وإزالة الحصص خارج ${shiftName}.`);
        } else {
            const maxSlotsCount = category === 'HT' ? 24 : 20;
            const fullSchedule = [];
            for (let s = 1; s <= maxSlotsCount; s++) {
                fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
            }

            let slotsRows = [];
            if (typeof SDIPdfParser !== 'undefined') {
                slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, minSlot, maxSlot);
            }

            const newInst = {
                id,
                name,
                shortName,
                category,
                vehicleType,
                shift,
                shiftCode,
                shiftName,
                capacity: (maxSlot - minSlot + 1) * 2,
                occupied: 0,
                empty: (maxSlot - minSlot + 1) * 2,
                rate: 0,
                minSlot,
                maxSlot,
                note: '',
                slotsRows,
                fullSchedule
            };

            this.instructors.push(newInst);
            this.selectedInstId = id;
            this.showToast(`✅ تم تسجيل وتكويد المدرب الجديد (${shortName} - ${shiftCode}) بنجاح.`);
        }

        if (shift === 'S1') this.activePeriodFilter = 'morning';
        else if (shift === 'S2') this.activePeriodFilter = 'evening';

        this.syncStateWithServer(`تسجيل وتكويد مدرب جديد (${shortName} - ${shiftCode})`);
        this.clearInlineForm();
        this.refresh();
    }

    clearInlineForm() {
        const nameEl = document.getElementById('inline-inst-name');
        const idEl = document.getElementById('inline-inst-id');
        if (nameEl) nameEl.value = '';
        if (idEl) idEl.value = '';
        this.updateInlinePreview();
    }

    /* ================= تصفية الفترات (صباحي / مسائي / الكل) ================= */
    setPeriodFilter(filter) {
        this.activePeriodFilter = filter;
        const periodInsts = this.getFilteredInstructors();

        // إذا كان المدرب المختار حالياً غير موجود في الفترة المحددة، نختار أول مدرب في الفترة تلقائياً
        if (this.selectedInstId !== 'all') {
            const exists = periodInsts.some(i => i.id === this.selectedInstId);
            if (!exists && periodInsts.length > 0) {
                this.selectedInstId = periodInsts[0].id;
            }
        }

        const stats = this.computeStats();
        this.renderInteractiveEditor(stats);

        const nameMap = { 
            morning: 'الفترة الصباحية (الأولى)', 
            evening: 'الفترة المسائية (الثانية)', 
            all: 'جميع الفترات (كامل اليوم)' 
        };
        this.showToast(`تم تحميل مدربي: ${nameMap[filter]} (${periodInsts.length} مدرب)`);
    }

    /* ================= اختيار المدرب في المحرر التفاعلي ================= */
    selectInstructor(id) {
        this.selectedInstId = id;
        const stats = this.computeStats();
        this.renderInteractiveEditor(stats);
    }

    /* ================= نافذة تسجيل وتكويد المدرب (Instructor Modal Logic) ================= */
    openInstructorModal(mode = 'create', instId = null) {
        const modal = document.getElementById('instructor-coding-modal');
        if (!modal) return;

        const titleEl = document.getElementById('modal-title');
        const modeEl = document.getElementById('modal-inst-mode');
        const origIdEl = document.getElementById('modal-original-id');
        const nameEl = document.getElementById('modal-inst-name');
        const shortNameEl = document.getElementById('modal-inst-shortname');
        const idEl = document.getElementById('modal-inst-id');
        const catEl = document.getElementById('modal-inst-category');
        const shiftEl = document.getElementById('modal-inst-shift');
        const delBtn = document.getElementById('modal-delete-btn');

        modeEl.value = mode;

        if (mode === 'edit' && instId) {
            const inst = this.instructors.find(i => i.id === instId);
            if (!inst) return;

            titleEl.innerHTML = (this.lang === 'ar')
                ? `⚙️ تعديل بيانات وتكويد المدرب: <strong>${inst.shortName || inst.name}</strong>`
                : `⚙️ Edit Instructor Coding: <strong>${inst.shortName || inst.name}</strong>`;
            origIdEl.value = inst.id;
            nameEl.value = inst.name;
            shortNameEl.value = inst.shortName || '';
            idEl.value = inst.id;
            catEl.value = inst.category || 'LMFM';
            shiftEl.value = inst.shift || 'S1';

            if (delBtn) delBtn.style.display = (this.instructors.length > 1) ? 'inline-block' : 'none';
        } else {
            titleEl.innerText = (this.lang === 'ar') ? '➕ تسجيل وتكويد مدرب جديد' : '➕ Register & Code New Instructor';
            origIdEl.value = '';
            nameEl.value = '';
            shortNameEl.value = '';
            idEl.value = String(Math.floor(100000 + Math.random() * 900000));
            catEl.value = 'LMFM';
            shiftEl.value = (this.activePeriodFilter === 'evening') ? 'S2' : 'S1';

            if (delBtn) delBtn.style.display = 'none';
        }

        this.updateModalCodePreview();
        modal.style.display = 'flex';
    }

    closeInstructorModal() {
        const modal = document.getElementById('instructor-coding-modal');
        if (modal) modal.style.display = 'none';
    }

    updateModalCodePreview() {
        const categoryEl = document.getElementById('modal-inst-category');
        const shiftEl = document.getElementById('modal-inst-shift');
        const badgeEl = document.getElementById('preview-shift-code');
        const descEl = document.getElementById('preview-shift-desc');

        if (!categoryEl || !shiftEl || !badgeEl || !descEl) return;

        const isAr = this.lang === 'ar';
        const cat = categoryEl.value;
        let sh = shiftEl.value;

        if (cat === 'MC') {
            shiftEl.value = 'FIX';
            sh = 'FIX';
            badgeEl.innerText = 'MC-FIX';
            descEl.innerHTML = isAr 
                ? 'نطاق الحصص المسجلة: <strong>6 إلى 17</strong> (12 حصة | مدة الحصة: 30 دقيقة)'
                : 'Approved Slot Range: <strong>6 to 17</strong> (12 slots | 30 mins per slot)';
        } else if (cat === 'HT') {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                badgeEl.innerText = 'HTFM-S1';
                descEl.innerHTML = isAr 
                    ? 'الفترة الأولى (الصباحية): الحصص <strong>1 إلى 12</strong> فقط (12 حصة | مدة الحصة: 30 دقيقة)'
                    : 'Morning Shift (1st): Slots <strong>1 to 12</strong> (12 slots | 30 mins per slot)';
            } else {
                badgeEl.innerText = 'HTFM-S2';
                descEl.innerHTML = isAr 
                    ? 'الفترة الثانية (المسائية): الحصص <strong>13 إلى 24</strong> فقط (12 حصة | مدة الحصة: 30 دقيقة)'
                    : 'Evening Shift (2nd): Slots <strong>13 to 24</strong> (12 slots | 30 mins per slot)';
            }
        } else {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                badgeEl.innerText = `${cat}-S1`;
                descEl.innerHTML = isAr 
                    ? 'الفترة الأولى (الصباحية): الحصص <strong>1 إلى 10</strong> فقط (10 حصص | مدة الحصة: 40 دقيقة)'
                    : 'Morning Shift (1st): Slots <strong>1 to 10</strong> (10 slots | 40 mins per slot)';
            } else {
                badgeEl.innerText = `${cat}-S2`;
                descEl.innerHTML = isAr 
                    ? 'الفترة الثانية (المسائية): الحصص <strong>11 إلى 20</strong> فقط (10 حصص | مدة الحصة: 40 دقيقة)'
                    : 'Evening Shift (2nd): Slots <strong>11 to 20</strong> (10 slots | 40 mins per slot)';
            }
        }
    }

    saveInstructorFromModal() {
        const mode = document.getElementById('modal-inst-mode').value;
        const origId = document.getElementById('modal-original-id').value;
        const name = document.getElementById('modal-inst-name').value.trim();
        const shortNameInput = document.getElementById('modal-inst-shortname').value.trim();
        const id = document.getElementById('modal-inst-id').value.trim();
        const category = document.getElementById('modal-inst-category').value;
        const shift = document.getElementById('modal-inst-shift').value;

        if (!name || !id) {
            alert("يرجى إدخال اسم المدرب والرقم الوظيفي / الكود.");
            return;
        }

        const shortName = shortNameInput || name.split(' ').slice(0, 2).join(' ');

        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';

        if (category === 'MC') {
            shiftCode = 'MC-FIX';
            shiftName = 'فترة ثابتة (6 - 17)';
            minSlot = 6;
            maxSlot = 17;
            vehicleType = 'دراجة نارية (MC)';
        } else if (category === 'HT') {
            vehicleType = 'شاحنة ثقيلة (HTFM)';
            if (shift === 'S2') {
                shiftCode = 'HTFM-S2';
                shiftName = 'الفترة الثانية (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = 'HTFM-S1';
                shiftName = 'الفترة الأولى (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            vehicleType = category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)';
            if (shift === 'S2') {
                shiftCode = `${category}-S2`;
                shiftName = 'الفترة الثانية (11 - 20)';
                minSlot = 11;
                maxSlot = 20;
            } else {
                shiftCode = `${category}-S1`;
                shiftName = 'الفترة الأولى (1 - 10)';
                minSlot = 1;
                maxSlot = 10;
            }
        }

        if (mode === 'edit') {
            const inst = this.instructors.find(i => i.id === origId);
            if (!inst) return;

            if (id !== origId && this.instructors.some(i => i.id === id)) {
                alert(`الرقم الوظيفي / الكود (${id}) مسجل بالفعل لمدرب آخر.`);
                return;
            }

            inst.id = id;
            inst.name = name;
            inst.shortName = shortName;
            inst.category = category;
            inst.vehicleType = vehicleType;
            inst.shift = shift;
            inst.shiftCode = shiftCode;
            inst.shiftName = shiftName;
            inst.minSlot = minSlot;
            inst.maxSlot = maxSlot;

            const maxNeededSlot = category === 'HT' ? 24 : 20;
            if (!inst.fullSchedule || inst.fullSchedule.length < maxNeededSlot) {
                inst.fullSchedule = [];
                for (let s = 1; s <= maxNeededSlot; s++) {
                    inst.fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
                }
            }

            if (typeof SDIPdfParser !== 'undefined') {
                inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
            }

            this.selectedInstId = id;
            this.showToast(`✅ تم تحديث بيانات وتكويد المدرب (${shortName}) بنجاح.`);

        } else {
            if (this.instructors.some(i => i.id === id)) {
                alert(`الرقم الوظيفي / الكود (${id}) مسجل بالفعل لمدرب آخر.`);
                return;
            }

            const maxSlotsCount = category === 'HT' ? 24 : 20;
            const fullSchedule = [];
            for (let s = 1; s <= maxSlotsCount; s++) {
                fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
            }

            let slotsRows = [];
            if (typeof SDIPdfParser !== 'undefined') {
                slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, minSlot, maxSlot);
            }

            const newInst = {
                id,
                name,
                shortName,
                category,
                vehicleType,
                shift,
                shiftCode,
                shiftName,
                capacity: maxSlotsCount * 2,
                occupied: 0,
                empty: maxSlotsCount * 2,
                rate: 0,
                minSlot,
                maxSlot,
                note: '',
                slotsRows,
                fullSchedule
            };

            this.instructors.push(newInst);
            this.selectedInstId = id;
            this.showToast(`✅ تم تسجيل وتكويد المدرب الجديد (${shortName} - ${shiftCode}) بنجاح.`);
        }

        this.syncStateWithServer(`تعديل وتكويد بيانات المدرب (${shortName} - ${shiftCode})`);
        this.closeInstructorModal();
        this.refresh();
    }

    deleteInstructorFromModal() {
        const origId = document.getElementById('modal-original-id').value;
        if (this.instructors.length <= 1) {
            alert("لا يمكن حذف المدرب الوحيد في النظام.");
            return;
        }

        const inst = this.instructors.find(i => i.id === origId);
        if (!inst) return;

        if (confirm(`هل أنت متأكد من حذف المدرب "${inst.name}" (${inst.shiftCode}) نهائياً؟`)) {
            this.instructors = this.instructors.filter(i => i.id !== origId);
            this.syncStateWithServer(`حذف المدرب (${inst.shortName || inst.name}) من النظام`);
            this.selectedInstId = this.instructors[0].id;
            this.closeInstructorModal();
            this.refresh();
            this.showToast(`تم حذف المدرب (${inst.shortName || inst.name}) بنجاح.`);
        }
    }

    /* ================= حجز أو تفريغ أسبوع كامل لحصة SAT-THU ================= */
    toggleSatThu(instId, slotNumber, targetStatus) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem) return;

        slotItem.sat = targetStatus;
        slotItem.sun = targetStatus;

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        const msg = targetStatus === 'occupied' ? 'حجز الحصة طوال الأسبوع (السبت-الخميس)' : 'تفريغ الحصة طوال الأسبوع';
        this.syncStateWithServer(`${msg} للحصة ${slotNumber} للمدرب (${inst.shortName || inst.name})`);
        this.showToast(`تم ${msg} للحصة ${slotNumber} للمدرب (${inst.shortName || inst.name})`);
        this.refresh();
    }

    /* ================= حجز أو تفريغ كافة حصص الوردية دفعة واحدة ================= */
    setShiftAllSlots(instId, targetStatus) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        inst.fullSchedule.forEach(s => {
            if (s.slot >= inst.minSlot && s.slot <= inst.maxSlot) {
                s.sat = targetStatus;
                s.sun = targetStatus;
            }
        });

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        const msg = targetStatus === 'occupied' ? 'حجز كافة حصص الوردية' : 'تفريغ كافة حصص الوردية';
        this.syncStateWithServer(`${msg} للمدرب (${inst.shortName || inst.name})`);
        this.showToast(`تم ${msg} للمدرب (${inst.shortName || inst.name}) بنجاح.`);
        this.refresh();
    }

    /* ================= تغيير فترة عمل المدرب وتحديث تكويده ================= */
    changeInstructorShift(instId, newShift) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        inst.shift = newShift;

        if (inst.category === 'LMFA' || inst.category === 'LMFM') {
            if (newShift === 'S1') {
                inst.shiftName = "الفترة الأولى (1 - 10)";
                inst.shiftCode = `${inst.category}-S1`;
                inst.minSlot = 1;
                inst.maxSlot = 10;
            } else {
                inst.shiftName = "الفترة الثانية (11 - 20)";
                inst.shiftCode = `${inst.category}-S2`;
                inst.minSlot = 11;
                inst.maxSlot = 20;
            }
        } else if (inst.category === 'HT') {
            if (newShift === 'S1') {
                inst.shiftName = "الفترة الأولى (1 - 12)";
                inst.shiftCode = "HTFM-S1";
                inst.minSlot = 1;
                inst.maxSlot = 12;
            } else {
                inst.shiftName = "الفترة الثانية (13 - 24)";
                inst.shiftCode = "HTFM-S2";
                inst.minSlot = 13;
                inst.maxSlot = 24;
            }
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        this.syncStateWithServer(`تعيين المدرب (${inst.shortName || inst.name}) على: ${inst.shiftName}`);
        this.showToast(`تم تعيين المدرب (${inst.shortName || inst.name}) على: ${inst.shiftName} (الكود: ${inst.shiftCode})`);
        this.refresh();
    }

    /* ================= تبديل الحصة في المحرر التفاعلي ================= */
    toggleSlot(instId, slotNumber, dayGroup) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem) return;

        const current = slotItem[dayGroup];
        slotItem[dayGroup] = (current === 'occupied') ? 'empty' : 'occupied';

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        const statusAr = slotItem[dayGroup] === 'occupied' ? 'مشغولة 🔒' : 'فارغة ✨';
        this.syncStateWithServer(`تغيير حصة ${slotNumber} (${dayGroup === 'sat' ? 'السبت' : 'الأحد'}) للمدرب (${inst.shortName || inst.name}) إلى ${statusAr}`);
        this.showToast(`تم تغيير حصة ${slotNumber} للمدرب (${inst.shortName || inst.name}) إلى: ${statusAr}`);
        this.refresh();
    }

    /* ================= 4. تصيير صفحة إدارة وتكويد فترات المدربين ================= */
    renderCodingManager() {
        const container = document.getElementById('coding-manager-container');
        if (!container) return;

        const isAr = this.lang === 'ar';
        const totalInsts = this.instructors.length;
        const morningCount = this.instructors.filter(i => i.shift === 'S1' || i.category === 'MC').length;
        const eveningCount = this.instructors.filter(i => i.shift === 'S2').length;

        let rowsHtml = '';
        if (totalInsts === 0) {
            rowsHtml = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px 15px; color: #94a3b8; font-size: 13.5px;">
                        ${isAr 
                            ? '✨ تم تصفير كافة المدربين بالكامل (0 مدربين). استخدم النموذج أعلاه لتسجيل وتكويد مدرب جديد أو ارفع ملف التدريب المعتمد.' 
                            : '✨ All instructors cleared (0 instructors). Use the form above to register and code an instructor or upload a schedule file.'}
                    </td>
                </tr>
            `;
        } else {
            this.instructors.forEach((inst) => {
            const isMorning = inst.shift === 'S1' || inst.category === 'MC';
            const shiftBadge = isMorning
                ? `<span class="shift-badge-morning">🌅 ${isAr ? 'الفترة الصباحية (1-10)' : 'Morning Shift (1-10)'}</span>`
                : `<span class="shift-badge-evening">🌇 ${isAr ? 'الفترة المسائية (11-20)' : 'Evening Shift (11-20)'}</span>`;

            const icon = inst.category === 'MC' ? '🏍️' : (inst.category === 'HT' ? '🚛' : '🚗');
            const shiftActionBtn = inst.category === 'MC'
                ? `<span style="font-size:11px; color:#64748b;">${isAr ? 'فترة ثابتة' : 'Fixed Shift'}</span>`
                : (inst.shift === 'S1'
                    ? `<button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.quickSwitchShift('${inst.id}', 'S2')" title="${isAr ? 'تحويل هذا المدرب للفترة المسائية فورياً وإزالة الحصص الصباحية' : 'Switch instructor to evening shift'}">${this.t('btnSwitchEvening')}</button>`
                    : `<button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.quickSwitchShift('${inst.id}', 'S1')" title="${isAr ? 'تحويل هذا المدرب للفترة الصباحية فورياً وإزالة الحصص المسائية' : 'Switch instructor to morning shift'}">${this.t('btnSwitchMorning')}</button>`);

            const toTxt = isAr ? 'إلى' : 'to';
            const slotsTxt = isAr ? 'حصة' : 'slots';
            const slotsRangeStr = inst.category === 'MC' 
                ? `6 ${toTxt} 17 (12 ${slotsTxt})` 
                : (inst.category === 'HT' 
                    ? (inst.shift === 'S2' ? `13 ${toTxt} 24 (12 ${slotsTxt})` : `1 ${toTxt} 12 (12 ${slotsTxt})`)
                    : (inst.shift === 'S2' ? `11 ${toTxt} 20 (10 ${slotsTxt})` : `1 ${toTxt} 10 (10 ${slotsTxt})`));

            const autoBadge = inst.isAutoAdded 
                ? `<span class="auto-added-badge" title="${this.t('badgeAutoAddedTitle')}">${this.t('badgeAutoAdded')}</span>` 
                : '';

            rowsHtml += `
                <tr>
                    <td style="font-weight: 800; font-family: monospace; color: #0284c7;">#${inst.id}</td>
                    <td>
                        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <strong style="font-size: 13px; color: var(--text-main);">${icon} ${inst.name}</strong>
                            ${autoBadge}
                        </div>
                    </td>
                    <td><span style="font-size: 12px; color: #475569;">${inst.vehicleType}</span></td>
                    <td>${shiftBadge}</td>
                    <td><span class="smart-code-badge">${inst.shiftCode}</span></td>
                    <td><span style="font-size: 11.5px; font-weight: 700; color: #166534;">${slotsRangeStr}</span></td>
                    <td style="text-align: center;">
                        <div style="display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap;">
                            ${shiftActionBtn}
                            <button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.populateCodingForm('${inst.id}')" title="${isAr ? 'تعديل بيانات المدرب' : 'Edit Instructor'}">
                                ${this.t('btnEdit')}
                            </button>
                            <button class="btn btn-primary btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.openInstructorInSchedule('${inst.id}')" title="${isAr ? 'عرض جدول حصص هذا المدرب في المحرر' : 'View Instructor Schedule'}">
                                ${this.t('btnSchedule')}
                            </button>
                            <button class="btn btn-danger btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.deleteInstructorQuick('${inst.id}')" title="${isAr ? 'حذف المدرب' : 'Delete'}" ${totalInsts <= 1 ? 'disabled' : ''}>
                                ${this.t('btnDelete')}
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            });
        }

        container.innerHTML = `
            <div class="interactive-panel">
                <div class="official-header sdi-official-header" style="margin-bottom: 20px;">
                    <div class="official-header-top-bar">
                        <img src="assets/sdi-logo.png" alt="SDI Logo" class="official-header-logo">
                        <div class="official-header-badge">
                            <span class="header-badge-dot"></span>
                            <span>${isAr ? 'لوحة فترات العمل والتكويد' : 'Instructor Shifts Coding'}</span>
                        </div>
                    </div>
                    <div class="sdi-header-text-wrap">
                        <h1 class="header-main-title">${this.t('tab4HeaderTitle')}</h1>
                        <p class="header-sub-title">${this.t('tab4HeaderSub')}</p>
                    </div>
                </div>

                <!-- بطاقة النموذج لتسجيل وتكويد مدرب جديد أو تعديل مدرب قائم -->
                <div class="prominent-coding-card">
                    <div class="prominent-coding-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">📝</span>
                            <strong style="font-size: 15px; color: var(--text-main);" id="tab4-form-title">
                                ${this.t('prominentFormTitle')}
                            </strong>
                        </div>
                        <span style="font-size: 11.5px; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; font-weight: bold;">
                            ${this.t('prominentFormBadge')}
                        </span>
                    </div>

                    <div class="prominent-coding-body">
                        <form onsubmit="event.preventDefault(); app.saveInstructorFromTab4();" style="display: flex; flex-direction: column; gap: 14px;">
                            <div class="coding-form-grid">
                                <div class="form-group">
                                    <label for="tab4-inst-name">${this.t('lblInstName')} <span style="color:#ef4444;">*</span></label>
                                    <input type="text" id="tab4-inst-name" class="form-control" placeholder="${isAr ? 'مثال: Maqsood Ali Kachkol Amir' : 'e.g. Maqsood Ali'}" required oninput="app.updateTab4Preview()">
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-id">${this.t('lblInstId')} <span style="color:#ef4444;">*</span></label>
                                    <input type="text" id="tab4-inst-id" class="form-control" placeholder="${isAr ? 'مثال: 102671' : 'e.g. 102671'}" required>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-category">${this.t('lblInstCategory')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-category" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="LMFM">${isAr ? '🚗 مركبة خفيفة - جير عادي (LMFM - 40 دقيقة)' : '🚗 Light Motor - Manual (LMFM - 40 mins)'}</option>
                                        <option value="LMFA">${isAr ? '🚙 مركبة خفيفة - أوتوماتيك (LMFA - 40 دقيقة)' : '🚙 Light Motor - Automatic (LMFA - 40 mins)'}</option>
                                        <option value="HT">${isAr ? '🚛 شاحنة ثقيلة (HTFM - 30 دقيقة)' : '🚛 Heavy Truck (HTFM - 30 mins)'}</option>
                                        <option value="MC">${isAr ? '🏍️ دراجة نارية (MC - 30 دقيقة)' : '🏍️ Motorcycle (MC - 30 mins)'}</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-shift">${this.t('lblInstShift')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-shift" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="S1">${isAr ? '🌅 الفترة الصباحية (الأولى) - حصص 1 إلى 10 (إزالة 11-20)' : '🌅 Morning Shift (1st) - Slots 1 to 10 (remove 11-20)'}</option>
                                        <option value="S2">${isAr ? '🌇 الفترة المسائية (الثانية) - حصص 11 إلى 20 (إزالة 1-10)' : '🌇 Evening Shift (2nd) - Slots 11 to 20 (remove 1-10)'}</option>
                                        <option value="FIX">${isAr ? '⏱️ فترة ثابتة للدراجة النارية (6 إلى 17)' : '⏱️ Fixed Shift Motorcycle (6 to 17)'}</option>
                                    </select>
                                </div>
                            </div>

                            <!-- شريط المعاينة وزر الحفظ -->
                            <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; flex-wrap: wrap; gap: 10px;">
                                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                    <span style="font-size: 13px; font-weight: 800; color: #166534;">${this.t('lblShiftCodePreview')}</span>
                                    <span id="tab4-preview-code" class="smart-code-badge">LMFM-S1</span>
                                    <span id="tab4-preview-desc" style="font-size: 12.5px; color: #15803d; font-weight: 600;">
                                        ${isAr ? 'الحصص المسجلة: 1 إلى 10 فقط (تمت إزالة الحصص 11 إلى 20)' : 'Approved slots: 1 to 10 only (slots 11 to 20 eliminated)'}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" class="btn btn-outline btn-sm" onclick="app.clearTab4Form()">${this.t('btnClearFields')}</button>
                                    <button type="submit" class="btn btn-primary btn-sm">${this.t('btnSaveInstructor')}</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- جدول المدربين المعتمدين -->
                <div style="margin-top: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <strong style="font-size: 15px; color: var(--text-main);">👥 ${isAr ? 'الكادر التدريبي المسجل' : 'Registered Instructors'} (${totalInsts} ${isAr ? 'مدرب' : 'instructors'}):</strong>
                            <span style="font-size: 12px; color: #64748b; ${isAr ? 'margin-right: 8px;' : 'margin-left: 8px;'}">(${isAr ? 'لكل مدرب حصصه المسجلة فقط وتمت إزالة الحصص خارج فترته' : 'Slots outside approved shift eliminated for each instructor'})</span>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span class="shift-badge-morning">🌅 ${isAr ? 'الصباحي' : 'Morning'}: ${morningCount}</span>
                            <span class="shift-badge-evening">🌇 ${isAr ? 'المسائي' : 'Evening'}: ${eveningCount}</span>
                        </div>
                    </div>

                    <table class="coding-table">
                        <thead>
                            <tr>
                                <th style="width: 10%;">${this.t('tab4TableStaffId')}</th>
                                <th style="width: 22%;">${this.t('tab4TableName')}</th>
                                <th style="width: 16%;">${this.t('tab4TableCat')}</th>
                                <th style="width: 16%;">${this.t('tab4TableShift')}</th>
                                <th style="width: 10%;">${this.t('tab4TableCode')}</th>
                                <th style="width: 12%;">${this.t('tab4TableRange')}</th>
                                <th style="width: 14%; text-align: center;">${this.t('tab4TableActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    updateTab4Preview() {
        const catEl = document.getElementById('tab4-inst-category');
        const shiftEl = document.getElementById('tab4-inst-shift');
        const codeEl = document.getElementById('tab4-preview-code');
        const descEl = document.getElementById('tab4-preview-desc');
        if (!catEl || !shiftEl || !codeEl || !descEl) return;

        const isAr = this.lang === 'ar';
        const cat = catEl.value;
        let sh = shiftEl.value;

        if (cat === 'MC') {
            shiftEl.value = 'FIX';
            codeEl.innerText = 'MC-FIX';
            descEl.innerHTML = isAr
                ? 'الفترة الثابتة: الحصص <strong>6 إلى 17</strong> فقط (12 حصة | 30 دقيقة)'
                : 'Fixed Shift: Slots <strong>6 to 17</strong> only (12 slots | 30 mins)';
        } else if (cat === 'HT') {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                codeEl.innerText = 'HTFM-S1';
                descEl.innerHTML = isAr
                    ? 'الفترة الصباحية: الحصص <strong>1 إلى 12</strong> فقط (تمت إزالة 13 إلى 24)'
                    : 'Morning Shift: Slots <strong>1 to 12</strong> only (13 to 24 removed)';
            } else {
                codeEl.innerText = 'HTFM-S2';
                descEl.innerHTML = isAr
                    ? 'الفترة المسائية: الحصص <strong>13 إلى 24</strong> فقط (تمت إزالة 1 إلى 12)'
                    : 'Evening Shift: Slots <strong>13 to 24</strong> only (1 to 12 removed)';
            }
        } else {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                codeEl.innerText = `${cat}-S1`;
                descEl.innerHTML = isAr
                    ? 'الفترة الصباحية: الحصص <strong>1 إلى 10</strong> فقط (تمت إزالة 11 إلى 20)'
                    : 'Morning Shift: Slots <strong>1 to 10</strong> only (11 to 20 removed)';
            } else {
                codeEl.innerText = `${cat}-S2`;
                descEl.innerHTML = isAr
                    ? 'الفترة المسائية: الحصص <strong>11 إلى 20</strong> فقط (تمت إزالة 1 إلى 10)'
                    : 'Evening Shift: Slots <strong>11 to 20</strong> only (1 to 10 removed)';
            }
        }
    }

    saveInstructorFromTab4() {
        const name = document.getElementById('tab4-inst-name')?.value.trim();
        const id = document.getElementById('tab4-inst-id')?.value.trim();
        const category = document.getElementById('tab4-inst-category')?.value || 'LMFM';
        const shift = document.getElementById('tab4-inst-shift')?.value || 'S1';

        if (!name || !id) {
            alert("يرجى إدخال اسم المدرب والرقم الوظيفي / الكود.");
            return;
        }

        const shortName = name.split(' ').slice(0, 2).join(' ');

        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';

        if (category === 'MC') {
            shiftCode = 'MC-FIX';
            shiftName = 'فترة ثابتة (6 - 17)';
            minSlot = 6;
            maxSlot = 17;
            vehicleType = 'دراجة نارية (MC)';
        } else if (category === 'HT') {
            vehicleType = 'شاحنة ثقيلة (HTFM)';
            if (shift === 'S2') {
                shiftCode = 'HTFM-S2';
                shiftName = 'الفترة الثانية (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = 'HTFM-S1';
                shiftName = 'الفترة الأولى (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            vehicleType = category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)';
            if (shift === 'S2') {
                shiftCode = `${category}-S2`;
                shiftName = 'الفترة الثانية (11 - 20)';
                minSlot = 11;
                maxSlot = 20;
            } else {
                shiftCode = `${category}-S1`;
                shiftName = 'الفترة الأولى (1 - 10)';
                minSlot = 1;
                maxSlot = 10;
            }
        }

        const existing = this.instructors.find(i => i.id === id);
        if (existing) {
            existing.name = name;
            existing.shortName = shortName;
            existing.category = category;
            existing.vehicleType = vehicleType;
            existing.shift = shift;
            existing.shiftCode = shiftCode;
            existing.shiftName = shiftName;
            existing.minSlot = minSlot;
            existing.maxSlot = maxSlot;

            if (typeof SDIPdfParser !== 'undefined') {
                existing.slotsRows = SDIPdfParser.generateEmptySlotsRows(existing.fullSchedule, existing.minSlot, existing.maxSlot);
            }
            this.selectedInstId = id;
            this.showToast(`✅ تم تحديث وتكويد المدرب (${shortName}) وإزالة الحصص خارج ${shiftName}.`);
        } else {
            const maxSlotsCount = category === 'HT' ? 24 : 20;
            const fullSchedule = [];
            for (let s = 1; s <= maxSlotsCount; s++) {
                fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
            }

            let slotsRows = [];
            if (typeof SDIPdfParser !== 'undefined') {
                slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, minSlot, maxSlot);
            }

            const newInst = {
                id,
                name,
                shortName,
                category,
                vehicleType,
                shift,
                shiftCode,
                shiftName,
                capacity: (maxSlot - minSlot + 1) * 2,
                occupied: 0,
                empty: (maxSlot - minSlot + 1) * 2,
                rate: 0,
                minSlot,
                maxSlot,
                note: '',
                slotsRows,
                fullSchedule
            };

            this.instructors.push(newInst);
            this.selectedInstId = id;
            this.showToast(`✅ تم تسجيل وتكويد المدرب الجديد (${shortName} - ${shiftCode}) بنجاح.`);
        }

        if (shift === 'S1') this.activePeriodFilter = 'morning';
        else if (shift === 'S2') this.activePeriodFilter = 'evening';

        this.syncStateWithServer(`تسجيل وتكويد المدرب (${shortName} - ${shiftCode})`);
        this.clearTab4Form();
        this.refresh();
    }

    clearTab4Form() {
        const nameEl = document.getElementById('tab4-inst-name');
        const idEl = document.getElementById('tab4-inst-id');
        const titleEl = document.getElementById('tab4-form-title');
        if (nameEl) nameEl.value = '';
        if (idEl) idEl.value = '';
        if (titleEl) titleEl.innerText = this.t('prominentFormTitle');
        this.updateTab4Preview();
    }

    populateCodingForm(instId) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        // تعبئة حقول النموذج في التبويب الرابع
        const nameEl = document.getElementById('tab4-inst-name');
        const idEl = document.getElementById('tab4-inst-id');
        const catEl = document.getElementById('tab4-inst-category');
        const shiftEl = document.getElementById('tab4-inst-shift');
        const titleEl = document.getElementById('tab4-form-title');

        if (nameEl) nameEl.value = inst.name;
        if (idEl) idEl.value = inst.id;
        if (catEl) catEl.value = inst.category;
        if (shiftEl) shiftEl.value = inst.shift;
        if (titleEl) {
            titleEl.innerHTML = (this.lang === 'ar')
                ? `✏️ تعديل بيانات وتكويد: <strong>${inst.shortName || inst.name}</strong> (#${inst.id})`
                : `✏️ Edit Instructor Coding: <strong>${inst.shortName || inst.name}</strong> (#${inst.id})`;
        }

        this.updateTab4Preview();

        // التمرير بسلاسة إلى النموذج
        const formCard = document.querySelector('#view-coding .prominent-coding-card');
        if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });

        this.showToast(this.lang === 'ar'
            ? `تم تحميل بيانات المدرب (${inst.shortName || inst.name}) في النموذج.`
            : `Instructor (${inst.shortName || inst.name}) loaded into form.`);
    }

    quickSwitchShift(instId, targetShift) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        inst.shift = targetShift;
        if (inst.category === 'MC') {
            inst.shift = 'FIX';
            inst.shiftCode = 'MC-FIX';
            inst.shiftName = 'فترة ثابتة (6 - 17)';
            inst.minSlot = 6;
            inst.maxSlot = 17;
        } else if (inst.category === 'HT') {
            if (targetShift === 'S2') {
                inst.shiftCode = 'HTFM-S2';
                inst.shiftName = 'الفترة الثانية (13 - 24)';
                inst.minSlot = 13;
                inst.maxSlot = 24;
            } else {
                inst.shiftCode = 'HTFM-S1';
                inst.shiftName = 'الفترة الأولى (1 - 12)';
                inst.minSlot = 1;
                inst.maxSlot = 12;
            }
        } else {
            if (targetShift === 'S2') {
                inst.shiftCode = `${inst.category}-S2`;
                inst.shiftName = 'الفترة الثانية (11 - 20)';
                inst.minSlot = 11;
                inst.maxSlot = 20;
            } else {
                inst.shiftCode = `${inst.category}-S1`;
                inst.shiftName = 'الفترة الأولى (1 - 10)';
                inst.minSlot = 1;
                inst.maxSlot = 10;
            }
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        const shiftAr = targetShift === 'S1' ? 'الفترة الصباحية (1 إلى 10)' : 'الفترة المسائية (11 إلى 20)';
        this.syncStateWithServer(`تحويل المدرب (${inst.shortName || inst.name}) إلى ${shiftAr}`);
        this.refresh();
        this.showToast(`تم تحويل المدرب (${inst.shortName || inst.name}) إلى: ${shiftAr} وإزالة الحصص الأخرى فورياً.`);
    }

    openInstructorInSchedule(instId) {
        this.selectedInstId = instId;
        const inst = this.instructors.find(i => i.id === instId);
        if (inst) {
            if (inst.shift === 'S1') this.activePeriodFilter = 'morning';
            else if (inst.shift === 'S2') this.activePeriodFilter = 'evening';
            else this.activePeriodFilter = 'all';
        }
        this.switchTab('interactive');
        this.refresh();
        this.showToast(`تم فتح جدول حصص المدرب (${inst?.shortName || instId}) في المحرر التفاعلي.`);
    }

    deleteInstructorQuick(instId) {
        if (this.instructors.length <= 1) {
            alert("لا يمكن حذف المدرب الأخير في النظام.");
            return;
        }

        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        if (confirm(`هل أنت متأكد من حذف المدرب "${inst.name}" (#${inst.id}) نهائياً؟`)) {
            this.instructors = this.instructors.filter(i => i.id !== instId);
            this.syncStateWithServer(`حذف المدرب (${inst.shortName || inst.name}) نهائياً`);
            this.selectedInstId = this.instructors[0].id;
            this.refresh();
            this.showToast(`تم حذف المدرب (${inst.shortName || inst.name}) بنجاح.`);
        }
    }

    /* ================= التحقق من أسماء المدربين ومطابقتهم الذكية ================= */
    normalizeText(str) {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
            .replace(/[إأآآ]/g, 'ا')               // توحيد الألف
            .replace(/ة/g, 'ه')                    // توحيد التاء المربوطة
            .replace(/ى/g, 'ي')                    // توحيد الياء
            .replace(/\s+/g, ' ');                 // إزالة المسافات الزائدة
    }

    findMatchingInstructor(target, list = null) {
        if (!target) return null;
        const targetList = Array.isArray(list) ? list : this.instructors;
        const targetId = String(target.id || '').trim();
        const targetNameNorm = this.normalizeText(target.name || '');
        const targetShortNorm = this.normalizeText(target.shortName || '');

        // 1. المطابقة بالرقم الوظيفي أولاً (مع إزالة الأصفار على اليسار)
        if (targetId) {
            const cleanTargetId = targetId.replace(/^0+/, '');
            const matchById = targetList.find(inst => {
                const curId = String(inst.id || '').trim();
                if (!curId) return false;
                if (curId === targetId) return true;
                if (cleanTargetId && curId.replace(/^0+/, '') === cleanTargetId) return true;
                return false;
            });
            if (matchById) return matchById;
        }

        // 2. المطابقة التامة بالاسم الكامل أو المختصر
        if (targetNameNorm) {
            const matchByName = targetList.find(inst => {
                const instNameNorm = this.normalizeText(inst.name || '');
                const instShortNorm = this.normalizeText(inst.shortName || '');
                if (instNameNorm && instNameNorm === targetNameNorm) return true;
                if (instShortNorm && instShortNorm === targetNameNorm) return true;
                if (targetShortNorm && instNameNorm === targetShortNorm) return true;
                if (targetShortNorm && instShortNorm && instShortNorm === targetShortNorm) return true;
                return false;
            });
            if (matchByName) return matchByName;
        }

        // 3. المطابقة الجزئية للاسم في حال كان أحدهما اسماً كاملاً والآخر اسماً مختصراً
        if (targetNameNorm && targetNameNorm.length >= 4) {
            const matchPartial = targetList.find(inst => {
                const instNameNorm = this.normalizeText(inst.name || '');
                const instShortNorm = this.normalizeText(inst.shortName || '');
                if (instNameNorm && (instNameNorm.startsWith(targetNameNorm) || targetNameNorm.startsWith(instNameNorm))) return true;
                if (instShortNorm && instShortNorm.length >= 4 && (targetNameNorm.includes(instShortNorm) || instNameNorm.includes(targetShortNorm))) return true;
                return false;
            });
            if (matchPartial) return matchPartial;
        }

        return null;
    }

    /* ================= معالجة رفع ملف جديد (PDF أو Excel) في نفس الوقت فورياً ================= */
    async handleUploadedFile(file) {
        if (!file) return;

        const loadingModal = document.getElementById('parsing-loading-modal');
        const loadingTitle = document.getElementById('parsing-loading-title');
        const loadingDesc = document.getElementById('parsing-loading-desc');

        if (loadingModal) {
            if (loadingTitle) loadingTitle.innerText = this.lang === 'ar' ? `جاري تحليل الملف في نفس الوقت...` : `Parsing file in real-time...`;
            if (loadingDesc) loadingDesc.innerText = this.lang === 'ar'
                ? `الملف: ${file.name} (يتم استخراج جداول التدريب وحساب الحصص الفارغة والمؤشرات فورياً)`
                : `File: ${file.name} (Extracting training schedules & computing indicators in real-time)`;
            loadingModal.style.display = 'flex';
        }

        this.showToast(`⚡ ${this.lang === 'ar' ? 'جاري تحليل' : 'Parsing'} "${file.name}"...`);

        try {
            const fileName = file.name.toLowerCase();
            let parsedInstructors = [];

            if (fileName.endsWith('.pdf')) {
                if (typeof SDIPdfParser === 'undefined') {
                    throw new Error("قارئ ملفات الـ PDF غير محمل.");
                }
                parsedInstructors = await SDIPdfParser.parsePdfFile(file);
            } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                if (typeof SDIParser === 'undefined') {
                    throw new Error("قارئ ملفات الإكسل غير محمل.");
                }
                const res = await SDIParser.parseFile(file);
                if (res.instructors && res.instructors.length > 0) {
                    parsedInstructors = res.instructors;
                } else {
                    throw new Error(res.message || "لم يتم العثور على جداول تدريب معتمدة في ملف الإكسل.");
                }
            } else {
                throw new Error("يرجى اختيار ملف مدعوم بصيغة PDF أو Excel (.xlsx, .xls, .csv).");
            }

            if (!parsedInstructors || parsedInstructors.length === 0) {
                throw new Error("لم يتم العثور على أي جداول تدريب أو مدربين معتمدين في هذا الملف.");
            }

            // 1. فحص وتأكيد تسجيل المدربين وإضافة الأسماء غير المسجلة تلقائياً في سجل النظام المعتمد
            let masterRoster = [];
            try {
                const rawMaster = localStorage.getItem('sdi_master_roster');
                if (rawMaster) masterRoster = JSON.parse(rawMaster);
            } catch (e) {}

            if (!Array.isArray(masterRoster) || masterRoster.length === 0) {
                masterRoster = (typeof OFFICIAL_INSTRUCTORS !== 'undefined')
                    ? JSON.parse(JSON.stringify(OFFICIAL_INSTRUCTORS))
                    : [];
            }

            const newlyAddedInstructors = [];
            let verifiedCount = 0;

            parsedInstructors.forEach((parsedInst) => {
                const existingInMaster = this.findMatchingInstructor(parsedInst, masterRoster);

                if (existingInMaster) {
                    verifiedCount++;
                    // الاحتفاظ بالملاحظات أو التكويدات المخصصة السابقة إن وجدت
                    if (existingInMaster.note && !parsedInst.note) {
                        parsedInst.note = existingInMaster.note;
                    }
                } else {
                    // المدرب غير مسجل مسبقاً بالنظام: يتم اعتماده وتسجيله تلقائياً
                    parsedInst.isAutoAdded = true;
                    newlyAddedInstructors.push(parsedInst);
                    masterRoster.push(JSON.parse(JSON.stringify(parsedInst)));
                }
            });

            // حفظ سجل المدربين المعتمد في التخزين
            localStorage.setItem('sdi_master_roster', JSON.stringify(masterRoster));

            // 2. تعيين جدول المدربين النشط فورياً ليعكس الملف المرفوع بدقة 100% وتتحدث المؤشرات فوراً
            this.instructors = parsedInstructors;

            // ضبط ترقيم صفحات التقارير لجميع مدربي الملف (2 مدربين بكل صفحة في تقرير 1)
            this.instructors.forEach((inst, idx) => {
                inst.reportPage = Math.floor(idx / 2) + 1;
            });

            // حفظ قائمة المدربين المحدثة محلياً
            localStorage.setItem('sdi_instructors_custom', JSON.stringify(this.instructors));

            // تحديد أول مدرب كمدرب نشط في العرض
            if (this.instructors.length > 0) {
                this.selectedInstId = this.instructors[0].id;
            }

            this.activeFileName = file.name;
            const now = new Date();
            const timeStr = now.toLocaleTimeString(this.lang === 'ar' ? 'ar-AE' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.activeFileTime = `⚡ ${this.lang === 'ar' ? 'تم التحليل اللحظي:' : 'Real-Time Parsed:'} ${timeStr}`;

            // مزامنة الملف والمدربين المحدثين فورياً مع جميع الأجهزة والمستخدمين المتصلين
            const syncSummary = newlyAddedInstructors.length > 0
                ? (this.lang === 'ar'
                    ? `رفع ملف "${file.name}": رصد وإضافة ${newlyAddedInstructors.length} مدرب غير مسجل تلقائياً وتحديث المؤشرات (${this.instructors.length} مدرب)`
                    : `Upload "${file.name}": Auto-registered ${newlyAddedInstructors.length} new instructors & updated indicators (${this.instructors.length} instructors)`)
                : (this.lang === 'ar'
                    ? `رفع ملف "${file.name}": فحص ومطابقة جميع المدربين (${verifiedCount}) وتحديث المؤشرات فورياً`
                    : `Upload "${file.name}": Verified all ${verifiedCount} instructors & updated indicators`);

            this.syncStateWithServer(syncSummary);

            // تحديث شريط حالة الملف في الواجهة
            const activeFileNameEl = document.getElementById('active-file-name');
            const activeFileTimeEl = document.getElementById('active-file-time');
            if (activeFileNameEl) {
                activeFileNameEl.innerText = file.name;
                const newNote = newlyAddedInstructors.length > 0 
                    ? (this.lang === 'ar' ? ` (تمت إضافة ${newlyAddedInstructors.length} مدرب تلقائياً)` : ` (+${newlyAddedInstructors.length} auto-added)`) 
                    : '';
                activeFileNameEl.title = `${this.lang === 'ar' ? 'إجمالي المدربين في الملف:' : 'Total Instructors:'} ${this.instructors.length}${newNote}`;
            }
            if (activeFileTimeEl) {
                activeFileTimeEl.innerText = this.activeFileTime;
            }

            // تحديث كل العروض والمؤشرات والتقارير فوراً!
            this.refresh();
            this.switchTab('report1');

            if (loadingModal) loadingModal.style.display = 'none';

            // رسالة التنبيه الذكية حسب حالة الفحص والإضافة
            let toastMsg = '';
            if (newlyAddedInstructors.length > 0 && verifiedCount > 0) {
                const namesList = newlyAddedInstructors.map(i => i.shortName || i.name).slice(0, 3).join('، ') + (newlyAddedInstructors.length > 3 ? ` +${newlyAddedInstructors.length - 3}` : '');
                toastMsg = this.t('toastRosterNewAndUpdated', {
                    newCount: newlyAddedInstructors.length,
                    newNames: namesList,
                    updatedCount: verifiedCount
                });
            } else if (newlyAddedInstructors.length > 0) {
                const namesList = newlyAddedInstructors.map(i => i.shortName || i.name).slice(0, 3).join('، ') + (newlyAddedInstructors.length > 3 ? ` +${newlyAddedInstructors.length - 3}` : '');
                toastMsg = this.t('toastRosterAllNew', {
                    newCount: newlyAddedInstructors.length,
                    newNames: namesList
                });
            } else {
                toastMsg = this.t('toastRosterVerifiedAll', {
                    count: verifiedCount
                });
            }

            this.showToast(toastMsg);

        } catch (err) {
            if (loadingModal) loadingModal.style.display = 'none';
            alert(`خطأ أثناء تحليل الملف: ${err.message}\n\nيرجى التأكد من اختيار ملف جدول التدريب الصادر من المعهد بصيغة PDF أو Excel.`);
        }
    }

    /* ================= تصفير واستعادة بيانات النظام ================= */
    openResetModal() {
        const modal = document.getElementById('reset-confirm-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeResetModal() {
        const modal = document.getElementById('reset-confirm-modal');
        if (modal) modal.style.display = 'none';
    }

    resetAllData() {
        this.openResetModal();
    }

    async executeZeroReset(type = 'slots') {
        this.closeResetModal();

        if (type === 'wipe') {
            // الخيار 2: مسح شامل وتصفير كافة المدربين (0 مدربين)
            this.instructors = [];
            this.selectedInstId = null;
            this.activeFileName = "لا يوجد ملف نشط (تم تصفير البيانات بالكامل)";
            this.activeFileTime = "⚡ تم التصفير اللحظي";

            const activeFileNameEl = document.getElementById('active-file-name');
            const activeFileTimeEl = document.getElementById('active-file-time');
            if (activeFileNameEl) activeFileNameEl.innerText = this.activeFileName;
            if (activeFileTimeEl) activeFileTimeEl.innerText = this.activeFileTime;

            try {
                await fetch('/api/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'wipe' })
                });
            } catch (e) {}

            this.syncStateWithServer("تصفير شامل ومسح كافة المدربين (0)");
            this.showToast("🗑️ تم تصفير ومسح كافة البيانات والمدربين بالكامل بنجاح.");
            this.refresh();
            return;
        }

        if (type === 'default') {
            // الخيار 3: استعادة البيانات الافتراضية الأولية (9 مدربين)
            this.instructors = JSON.parse(JSON.stringify(OFFICIAL_INSTRUCTORS));
            this.selectedInstId = this.instructors[0]?.id || null;
            this.activePeriodFilter = 'all';
            this.activeFileName = "Instructor Availability.pdf (الملف الرسمي المعتمد)";
            this.activeFileTime = "⚡ تم التحليل اللحظي المباشر";

            const activeFileNameEl = document.getElementById('active-file-name');
            const activeFileTimeEl = document.getElementById('active-file-time');
            if (activeFileNameEl) activeFileNameEl.innerText = this.activeFileName;
            if (activeFileTimeEl) activeFileTimeEl.innerText = this.activeFileTime;

            try {
                await fetch('/api/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'default' })
                });
            } catch (e) {}

            this.syncStateWithServer("استعادة البيانات الأولية المعتمدة (9 مدربين)");
            this.showToast("↩️ تمت استعادة البيانات الرسمية الأولية بنجاح.");
            this.refresh();
            return;
        }

        // الخيار 1 (الأساسي): تصفير وتفريغ كافة الحصص بنسبة 0% إشغال
        if (this.instructors.length === 0) {
            this.showToast("ℹ️ لا توجد جداول مدربين لتصفير حصصها حالياً.");
            return;
        }

        this.instructors.forEach(inst => {
            inst.occupied = 0;
            inst.empty = inst.capacity;
            inst.rate = "0.0";
            if (Array.isArray(inst.fullSchedule)) {
                inst.fullSchedule.forEach(s => {
                    s.sat = 'empty';
                    s.sun = 'empty';
                });
            }
            if (typeof SDIPdfParser !== 'undefined') {
                inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
            } else if (Array.isArray(inst.slotsRows)) {
                inst.slotsRows.forEach(r => {
                    r.sat = 'خالية';
                    r.sun = 'خالية';
                });
            }
        });

        this.activeFileTime = "⚡ تم تصفير كافة الحصص (0% إشغال)";
        const activeFileTimeEl = document.getElementById('active-file-time');
        if (activeFileTimeEl) activeFileTimeEl.innerText = this.activeFileTime;

        try {
            await fetch('/api/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'slots' })
            });
        } catch (e) {}

        this.syncStateWithServer("تصفير وتفريغ كافة الحصص التدريبية (0% إشغال)");
        this.showToast("✨ تم بنجاح تصفير وتفريغ كافة الحصص بالكامل (0% إشغال) لدى جميع المستخدمين المتصلين!");
        this.refresh();
    }

    /* ================= التبديل بين التبويبات ================= */
    switchTab(tabId) {
        this.activeView = tabId;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        const r1 = document.getElementById('view-report-1');
        const r2 = document.getElementById('view-report-2');
        const interactive = document.getElementById('view-interactive');
        const coding = document.getElementById('view-coding');

        if (r1) r1.style.display = (tabId === 'report1') ? 'block' : 'none';
        if (r2) r2.style.display = (tabId === 'report2') ? 'block' : 'none';
        if (interactive) interactive.style.display = (tabId === 'interactive') ? 'block' : 'none';
        if (coding) coding.style.display = (tabId === 'coding') ? 'block' : 'none';
    }

    /* ================= أوامر الطباعة ================= */
    printReport(type) {
        const r1 = document.getElementById('view-report-1');
        const r2 = document.getElementById('view-report-2');
        const interactive = document.getElementById('view-interactive');

        if (type === 'report1') {
            r1.style.display = 'block';
            r2.style.display = 'none';
            if (interactive) interactive.style.display = 'none';
        } else if (type === 'report2') {
            r1.style.display = 'none';
            r2.style.display = 'block';
            if (interactive) interactive.style.display = 'none';
        } else if (type === 'all') {
            r1.style.display = 'block';
            r2.style.display = 'block';
            if (interactive) interactive.style.display = 'none';
        }

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                this.switchTab(this.activeView);
            }, 500);
        }, 100);
    }

    /* ================= تصدير إكسل ================= */
    exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert("مكتبة التصدير غير متوفرة.");
            return;
        }

        const stats = this.computeStats();
        const wb = XLSX.utils.book_new();

        // ورقة 1: لوحة المؤشرات
        const kpiRows = [
            ["لوحة المؤشرات الإحصائية - معهد الشارقة للسياقة"],
            ["ملخص سعة التشغيل وتوزيع الحصص التدريبية"],
            ["تطوير", "م/ محمود محمد"],
            ["تاريخ التصدير", new Date().toLocaleDateString('ar-AE')],
            [],
            ["المؤشر", "القيمة"],
            ["إجمالي السعة المتاحة", stats.totalCap],
            ["إجمالي الحصص المشغولة", stats.totalOcc],
            ["إجمالي الحصص الفارغة", stats.totalEmp],
            ["نسبة الإشغال الكلية", stats.overallRate + "%"],
            [],
            ["الفئة", "المشغول", "الفارغ", "نسبة الإشغال"],
            ["مركبة خفيفة - جير عادي (LMFM)", stats.categories.LMFM.occ, stats.categories.LMFM.emp, stats.categories.LMFM.rate + "%"],
            ["مركبة خفيفة - أوتوماتيك (LMFA)", stats.categories.LMFA.occ, stats.categories.LMFA.emp, stats.categories.LMFA.rate + "%"],
            ["دراجة نارية (MC)", stats.categories.MC.occ, stats.categories.MC.emp, stats.categories.MC.rate + "%"],
            ["شاحنة ثقيلة (HTFM)", stats.categories.HT.occ, stats.categories.HT.emp, stats.categories.HT.rate + "%"]
        ];

        const ws1 = XLSX.utils.aoa_to_sheet(kpiRows);
        XLSX.utils.book_append_sheet(wb, ws1, "لوحة المؤشرات");

        // ورقة 2: أداء المدربين
        const perfRows = [
            ["اسم المدرب", "كود الوردية", "الفئة", "السعة الكلية", "مشغولة", "فارغة", "معدل الإشغال"]
        ];
        stats.instructorStats.forEach(inst => {
            perfRows.push([
                inst.name,
                inst.shiftCode,
                inst.categoryAr,
                inst.cap,
                inst.occ,
                inst.emp,
                inst.rate + "%"
            ]);
        });

        const ws2 = XLSX.utils.aoa_to_sheet(perfRows);
        XLSX.utils.book_append_sheet(wb, ws2, "أداء المدربين");

        XLSX.writeFile(wb, `SDI_Schedule_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showToast("تم تصدير ملف الإكسل بنجاح.");
    }

    /* ================= الوضع الليلي / الفاتح ================= */
    toggleTheme() {
        this.theme = (this.theme === 'light') ? 'dark' : 'light';
        localStorage.setItem('sdi_theme', this.theme);
        this.applyTheme(this.theme);
    }

    applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            const icon = document.getElementById('theme-icon');
            if (icon) icon.innerText = '☀️';
        } else {
            document.body.classList.remove('dark-theme');
            const icon = document.getElementById('theme-icon');
            if (icon) icon.innerText = '🌙';
        }
    }

    /* ================= التنبيهات ================= */
    showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>ℹ️</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    setupEventListeners() {
        // 1. الاستماع لرفع الملفات عبر الزر
        const fileInput = document.getElementById('universal-file-input');
        if (fileInput) {
            fileInput.addEventListener('click', (e) => {
                e.target.value = ''; // تصفير القيمة لضمان التقاط نفس الملف عند تكرار اختياره
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    e.target.value = '';
                    this.handleUploadedFile(file);
                }
            });
        }

        // 2. دعم السحب والإفلات الكامل (Drag & Drop) في أي مكان بالمتصفح للتحليل الفوري في نفس الوقت
        const dropOverlay = document.getElementById('drag-drop-overlay');
        let dragCounter = 0;

        window.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            if (dropOverlay) dropOverlay.style.display = 'flex';
        });

        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                if (dropOverlay) dropOverlay.style.display = 'none';
            }
        });

        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            if (dropOverlay) dropOverlay.style.display = 'none';

            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFile = e.dataTransfer.files[0];
                this.handleUploadedFile(droppedFile);
            }
        });
    }
}

let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new SDIReportApp();
});
