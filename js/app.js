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
    safeJsonParse(str, fallback) {
        if (!str) return fallback;
        try {
            const parsed = JSON.parse(str);
            return parsed !== null && parsed !== undefined ? parsed : fallback;
        } catch (e) {
            console.warn('[SDI SafeParse] Failed to parse JSON, using fallback:', e);
            return fallback;
        }
    }

    isSupervisor(inst) {
        if (!inst) return false;
        if (inst.isSupervisor === true || inst.role === 'supervisor' || inst.shift === 'SUP') return true;
        if (typeof SDIMasterRoster !== 'undefined') {
            return SDIMasterRoster.isSupervisor(inst);
        }
        return false;
    }

    isAssistant(inst) {
        if (!inst) return false;
        if (inst.isAssistant === true || inst.role === 'assistant' || inst.shift === 'AST') return true;
        if (typeof SDIMasterRoster !== 'undefined') {
            return SDIMasterRoster.isAssistant(inst);
        }
        return false;
    }

    isFlexibleRole(inst) {
        if (!inst) return false;
        return this.isSupervisor(inst) || this.isAssistant(inst);
    }

    constructor() {
        const saved = localStorage.getItem('sdi_instructors_custom');
        const defaultInsts = (typeof OFFICIAL_INSTRUCTORS !== 'undefined') ? JSON.parse(JSON.stringify(OFFICIAL_INSTRUCTORS)) : [];
        this.instructors = this.safeJsonParse(saved, defaultInsts);
        // تطهير فوري واستبعاد أي مدربين أشباح أو بدون أسماء معتمدة
        if (Array.isArray(this.instructors)) {
            this.instructors = this.instructors.filter(i => 
                i && i.id && !String(i.id).startsWith('INST_') && 
                i.name && !String(i.name).includes('undefined')
            );

            // تعزيز ومزامنة بيانات الملاك التدريبي المعتمد (النوع، الصفة، السعة المعتمدة)
            if (typeof SDIMasterRoster !== 'undefined') {
                this.instructors.forEach(inst => {
                    const rosterMeta = SDIMasterRoster.lookup(inst.id, inst.name);
                    if (rosterMeta) {
                        if (!inst.gender) inst.gender = rosterMeta.gender;
                        if (!inst.role) inst.role = rosterMeta.role;
                        if (rosterMeta.role === 'supervisor') inst.isSupervisor = true;
                        if (rosterMeta.role === 'assistant') inst.isAssistant = true;
                    } else {
                        // إعدادات افتراضية
                        if (!inst.gender) inst.gender = 'male';
                        if (!inst.role) inst.role = inst.isSupervisor ? 'supervisor' : (inst.isAssistant ? 'assistant' : 'instructor');
                    }

                    if (this.isFlexibleRole(inst)) {
                        SDIMasterRoster.pruneSupervisorSchedule(inst);
                    } else {
                        const rules = SDIMasterRoster.getShiftRules(inst.category, inst.shift, inst.gender, inst.role);
                        inst.minSlot = rules.minSlot;
                        inst.maxSlot = rules.maxSlot;
                        inst.capacity = rules.capacity;
                    }
                });
            }
        }

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

        // بيانات خطة اليوم الرسمية (Instructor Day Plan) والمقارنة
        const savedDayPlan = localStorage.getItem('sdi_day_plan_data');
        const defaultPlan = (typeof DEFAULT_DAY_PLAN_DATA !== 'undefined') ? JSON.parse(JSON.stringify(DEFAULT_DAY_PLAN_DATA)) : null;
        this.dayPlanData = this.safeJsonParse(savedDayPlan, defaultPlan);
        if (this.dayPlanData && Array.isArray(this.dayPlanData.instructors)) {
            this.dayPlanData.instructors = this.dayPlanData.instructors.filter(i => 
                i && i.instructorId && !String(i.instructorId).startsWith('INST_') && 
                i.instructorName && !String(i.instructorName).includes('undefined')
            );
        }
        this.dayPlanFileName = localStorage.getItem('sdi_day_plan_filename') || (this.dayPlanData?.fileName || "Instructor Day Plan.pdf (الملف الرسمي المعتمد)");
        this.dayPlanFileTime = localStorage.getItem('sdi_day_plan_filetime') || "⚡ تم التحليل اللحظي المباشر";

        this.comparisonFilterStatus = 'all'; // 'all' | 'conflicts' | 'extra' | 'matching'
        this.comparisonDayKey = 'auto'; // 'auto' | 'sun' | 'sat'
        this.comparisonInstId = 'all';

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
        try { this.applyTheme(this.theme); } catch (e) { console.warn('applyTheme note:', e); }
        try { this.applyLanguage(); } catch (e) { console.warn('applyLanguage note:', e); }
        try { this.refresh(); } catch (e) { console.error('refresh error:', e); }
        try { this.setupEventListeners(); } catch (e) { console.error('setupEventListeners error:', e); }
        try { this.initRealtimeConnection(); } catch (e) { console.warn('initRealtimeConnection note:', e); }
        try { this.listenToStorageEvents(); } catch (e) { console.warn('listenToStorageEvents note:', e); }
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
        if (typeof SDIMasterRoster !== 'undefined' && Array.isArray(this.instructors)) {
            this.instructors.forEach(inst => {
                const rosterMeta = SDIMasterRoster.lookup(inst.id, inst.name);
                if (rosterMeta) {
                    if (!inst.gender) inst.gender = rosterMeta.gender;
                    if (!inst.role) inst.role = rosterMeta.role;
                    if (rosterMeta.role === 'supervisor') inst.isSupervisor = true;
                    if (rosterMeta.role === 'assistant') inst.isAssistant = true;
                }
                if (this.isFlexibleRole(inst)) {
                    SDIMasterRoster.pruneSupervisorSchedule(inst);
                } else {
                    const rules = SDIMasterRoster.getShiftRules(inst.category, inst.shift, inst.gender, inst.role);
                    inst.minSlot = rules.minSlot;
                    inst.maxSlot = rules.maxSlot;
                    inst.capacity = rules.capacity;
                }
            });
        }
        if (newPayload.activeFileName) this.activeFileName = newPayload.activeFileName;
        if (newPayload.activeFileTime) this.activeFileTime = newPayload.activeFileTime;

        if (newPayload.dayPlan !== undefined) {
            this.dayPlanData = newPayload.dayPlan;
            localStorage.setItem('sdi_day_plan_data', JSON.stringify(this.dayPlanData));
        }
        if (newPayload.dayPlanFileName) {
            this.dayPlanFileName = newPayload.dayPlanFileName;
            localStorage.setItem('sdi_day_plan_filename', this.dayPlanFileName);
        }
        if (newPayload.dayPlanFileTime) {
            this.dayPlanFileTime = newPayload.dayPlanFileTime;
            localStorage.setItem('sdi_day_plan_filetime', this.dayPlanFileTime);
        }

        localStorage.setItem('sdi_instructors_custom', JSON.stringify(this.instructors));

        if (this.selectedInstId !== 'all') {
            const exists = this.instructors.some(i => i.id === this.selectedInstId);
            if (!exists && this.instructors.length > 0) {
                this.selectedInstId = this.instructors[0].id;
            }
        }

        this.updateActiveFileBar();
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
            dayPlan: this.dayPlanData,
            dayPlanFileName: this.dayPlanFileName,
            dayPlanFileTime: this.dayPlanFileTime,
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
            HT:   { cap: 0, occ: 0, emp: 0, rate: 0 },
            HB:   { cap: 0, occ: 0, emp: 0, rate: 0 },
            LB:   { cap: 0, occ: 0, emp: 0, rate: 0 }
        };

        const instructorStats = this.instructors.map(inst => {
            let occ = 0;
            let emp = 0;
            let cap = 0;
            let rate = "0.0";

            const isFlex = this.isFlexibleRole(inst);
            const isSup = this.isSupervisor(inst);
            const isAst = this.isAssistant(inst);

            if (isFlex) {
                // قاعدة مساعد المدرب والمشرف (Flexible Schedule - Assistant & Supervisor):
                // ليس لديه جدول تدريب نظامي (لا توجد أي حصص خالية تؤثر على الداشبورد أو معدلات الإشغال)
                // الحصص المشغولة = الحصص المسندة إليه فقط (تدريب حصتين -> 2 فقط، 3 حصص -> 3 فقط)
                // الحصص الخالية = 0 تماماً
                // السعة = عدد الحصص المشغولة المسندة
                // معدل الإشغال = 100.0% دائماً عند وجود حصص (أو 0.0% عند عدم وجود حصص)
                (inst.fullSchedule || []).forEach(s => {
                    if (s.sat === 'occupied') occ++;
                    if (s.sun === 'occupied') occ++;
                });
                cap = occ;
                emp = 0; // ممنوع احتساب أي حصص خالية للمساعد والمشرف
                rate = occ > 0 ? "100.0" : "0.0";
                inst.slotsRows = []; // تصفير تقرير الحصص الفارغة للمساعد والمشرف
            } else {
                const shiftSlots = this.getInstructorShiftSlots(inst);
                shiftSlots.forEach(s => {
                    if (s.sat === 'occupied') occ++; else if (s.sat === 'empty') emp++;
                    if (s.sun === 'occupied') occ++; else if (s.sun === 'empty') emp++;
                });
                cap = occ + emp;
                rate = cap > 0 ? ((occ / cap) * 100).toFixed(1) : "0.0";
            }

            inst.occupied = occ;
            inst.empty = emp;
            inst.capacity = cap;
            inst.rate = rate;

            totalCap += cap;
            totalOcc += occ;
            totalEmp += emp;

            const catKey = (inst.category === 'LB') ? 'HB' : inst.category;
            if (categories[catKey]) {
                categories[catKey].cap += cap;
                categories[catKey].occ += occ;
                categories[catKey].emp += emp;
            }
            if (inst.category === 'LB' && categories.LB) {
                categories.LB.cap += cap;
                categories.LB.occ += occ;
                categories.LB.emp += emp;
            }

            return {
                id: inst.id,
                name: inst.shortName || inst.name,
                category: inst.category,
                categoryAr: (inst.category === 'LMFM') ? 'عادي (LMFM)' :
                            ((inst.category === 'LMFA') ? 'أوتوماتيك (LMFA)' :
                            (inst.category === 'MC' ? 'دراجة (MC)' :
                            ((inst.category === 'HB' || inst.category === 'LB') ? 'باص ثقيل (HBFM)' : 'شاحنة (HTFM)'))),
                shiftCode: inst.shiftCode,
                shiftName: inst.shiftName,
                isSupervisor: isSup,
                isAssistant: isAst,
                isFlexible: isFlex,
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

        const supervisorCount = this.instructors.filter(i => this.isSupervisor(i)).length;
        const assistantCount = this.instructors.filter(i => this.isAssistant(i)).length;
        const femaleCount = this.instructors.filter(i => i.gender === 'female' && !this.isFlexibleRole(i)).length;
        const maleCount = this.instructors.filter(i => !this.isFlexibleRole(i) && (i.gender === 'male' || !i.gender)).length;

        return {
            totalCap,
            totalOcc,
            totalEmp,
            overallRate,
            categories,
            instructorStats,
            supervisorCount,
            assistantCount,
            femaleCount,
            maleCount
        };
    }

    updateActiveFileBar() {
        const nameEl = document.getElementById('active-file-name');
        const timeEl = document.getElementById('active-file-time');
        if (nameEl) nameEl.innerText = this.activeFileName;
        if (timeEl) timeEl.innerText = this.activeFileTime;

        const dayNameEl = document.getElementById('active-dayplan-name');
        const dayTimeEl = document.getElementById('active-dayplan-time');
        if (dayNameEl) {
            dayNameEl.innerText = this.dayPlanFileName + (this.dayPlanData?.date ? ` (${this.dayPlanData.date})` : '');
        }
        if (dayTimeEl) dayTimeEl.innerText = this.dayPlanFileTime;
    }

    /* ================= تحديث وتصيير كافة التقارير ================= */
    refresh() {
        const stats = this.computeStats();
        this.renderReport1(stats);
        this.renderReport2();
        this.renderInteractiveEditor(stats);
        this.renderCodingManager();
        this.renderComparisonView();
        this.updateActiveFileBar();
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

                    <!-- شريط توزيع الكادر التدريبي والمساعدين والمشرفين (Staff & Flexible KPI Bar) -->
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 16px; margin: 16px 0 20px 0; flex-wrap:wrap; gap:10px;">
                        <div style="font-size:12px; color:#334155; font-weight:600;">
                            👥 <strong>${isAr ? 'الكادر التدريبي المعتمد:' : 'Training Staff:'}</strong> ${this.instructors.length} ${isAr ? 'إجمالي' : 'Total'} | 👨 ${stats.maleCount || 0} ${isAr ? 'مدربين' : 'Instructors'} | 👩 ${stats.femaleCount || 0} ${isAr ? 'مدربات' : 'Female Instructors'}
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${stats.assistantCount > 0 ? `
                            <div style="font-size:12px; color:#065f46; background:#d1fae5; border:1px solid #a7f3d0; padding:4px 10px; border-radius:6px; font-weight:700;">
                                🤝 <strong>${isAr ? 'مساعد مدرب:' : 'Assistant:'}</strong> ${stats.assistantCount} | ${isAr ? 'جدول مرن (الحصص المسجلة فقط)' : 'Flexible (Recorded only)'}
                            </div>` : ''}
                            <div style="font-size:12px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:4px 10px; border-radius:6px; font-weight:700;">
                                👔 <strong>${isAr ? 'المشرفون:' : 'Supervisors:'}</strong> ${stats.supervisorCount || 0} ${isAr ? 'مشرف' : 'Supervisors'} | ${isAr ? 'جدول مرن (صفر فارغة)' : 'Flexible (0 empty)'}
                            </div>
                        </div>
                    </div>

                    <div class="section-title" style="margin-top: 25px;">${this.t('r1CatSection')}</div>
                    <div class="cat-kpi-grid">
                        <!-- LMFM -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catLMFM')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFM ? stats.categories.LMFM.occ : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.LMFM ? stats.categories.LMFM.emp : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFM ? stats.categories.LMFM.rate : 0}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- LMFA -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catLMFA')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFA ? stats.categories.LMFA.occ : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.LMFA ? stats.categories.LMFA.emp : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.LMFA ? stats.categories.LMFA.rate : 0}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- MC -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catMC')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.MC ? stats.categories.MC.occ : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.MC ? stats.categories.MC.emp : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.MC ? stats.categories.MC.rate : 0}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- HT -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catHT')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.HT ? stats.categories.HT.occ : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${stats.categories.HT ? stats.categories.HT.emp : 0}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${stats.categories.HT ? stats.categories.HT.rate : 0}%</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'نسبة الإشغال' : 'Occupancy Rate'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- HB / LB (Heavy Bus) -->
                        <div class="cat-kpi-card">
                            <div class="cat-kpi-card-header">${this.t('catHB') || this.t('catLB')}</div>
                            <div class="cat-kpi-card-body">
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${(stats.categories.HB ? stats.categories.HB.occ : 0) || (stats.categories.LB ? stats.categories.LB.occ : 0)}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'مشغولة' : 'Occupied'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-green">${(stats.categories.HB ? stats.categories.HB.emp : 0) || (stats.categories.LB ? stats.categories.LB.emp : 0)}</div>
                                    <div class="cat-kpi-lbl">${isAr ? 'فارغة' : 'Empty'}</div>
                                </div>
                                <div class="cat-kpi-stat">
                                    <div class="cat-kpi-val text-orange">${(stats.categories.HB && stats.categories.HB.cap > 0 ? stats.categories.HB.rate : (stats.categories.LB ? stats.categories.LB.rate : 0))}%</div>
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
                    : (inst.category === 'LMFM' ? 'Manual (LMFM)' : (inst.category === 'LMFA' ? 'Auto (LMFA)' : (inst.category === 'MC' ? 'Motorcycle (MC)' : ((inst.category === 'HB' || inst.category === 'LB') ? 'Heavy Bus (HBFM)' : 'Heavy Truck (HTFM)'))));

                let shiftCodeBadge = '';
                if (inst.isAssistant) {
                    shiftCodeBadge = `<span style="font-size: 10px; background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px; ${isAr ? 'margin-right: 6px;' : 'margin-left: 6px;'} font-weight: 800;">🤝 ${isAr ? 'مساعد مدرب (مرن)' : 'Assistant'}</span>`;
                } else if (inst.isSupervisor) {
                    shiftCodeBadge = `<span style="font-size: 10px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; ${isAr ? 'margin-right: 6px;' : 'margin-left: 6px;'} font-weight: 800;">👔 ${isAr ? 'مشرف (مرن)' : 'Supervisor'}</span>`;
                } else {
                    shiftCodeBadge = `<span style="font-size: 10px; background: #eff3fa; color: #09296b; padding: 2px 6px; border-radius: 4px; ${isAr ? 'margin-right: 6px;' : 'margin-left: 6px;'} font-weight: 800;">${inst.shiftCode}</span>`;
                }

                html += `
                    <tr>
                        <td style="font-weight: 700; ${isAr ? 'text-align: right; padding-right: 15px;' : 'text-align: left; padding-left: 15px;'}">
                            ${inst.name}
                            ${shiftCodeBadge}
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
                `;

                const isSup = !!(inst.isSupervisor || inst.shift === 'SUP');
                if (isSup || !inst.slotsRows || inst.slotsRows.length === 0) {
                    html += `
                        <div style="text-align: center; padding: 20px 14px; margin-top: 10px; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-weight: bold; font-size: 13px;">
                            👔 ${isAr ? 'مشرف / سوبرفايزر (Supervisor) - لا توجد حصص فارغة (جميع الحصص المسندة مشغولة بنسبة إشغال 100%)' : 'Supervisor - No empty slots (Assigned sessions only with 100% occupancy)'}
                        </div>
                    </div>
                    `;
                } else {
                    html += `
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
                        const slotNum = parseInt(row.slotDisplay.replace(/\D/g, ''), 10);
                        const fullSlot = inst.fullSchedule?.find(s => s.slot === slotNum);
                        const satIsFixed = fullSlot?.satDetails?.isFixed;
                        const sunIsFixed = fullSlot?.sunDetails?.isFixed;

                        let satBadge;
                        if (row.sat === 'مشغولة' || row.sat === 'occupied') {
                            satBadge = satIsFixed 
                                ? `<span class="badge-status occupied" style="background: linear-gradient(135deg, #c2410c, #ea580c); color: white; font-weight:800; border:none;" title="حصة مثبتة يدوياً بالخطة">🔒 ${this.t('badgeOccupied')} - Fixed</span>`
                                : `<span class="badge-status occupied">${this.t('badgeOccupied')}</span>`;
                        } else {
                            satBadge = `<span class="badge-status empty">${this.t('badgeEmpty')}</span>`;
                        }

                        let sunBadge;
                        if (row.sun === 'مشغولة' || row.sun === 'occupied') {
                            sunBadge = sunIsFixed 
                                ? `<span class="badge-status occupied" style="background: linear-gradient(135deg, #c2410c, #ea580c); color: white; font-weight:800; border:none;" title="حصة مثبتة يدوياً بالخطة">🔒 ${this.t('badgeOccupied')} - Fixed</span>`
                                : `<span class="badge-status occupied">${this.t('badgeOccupied')}</span>`;
                        } else {
                            sunBadge = `<span class="badge-status empty">${this.t('badgeEmpty')}</span>`;
                        }

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
                }
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
            return this.instructors.filter(i => i.shift === 'S1' || i.shift === 'FIX' || (i.category === 'MC' && i.shift !== 'S2'));
        } else if (this.activePeriodFilter === 'evening') {
            return this.instructors.filter(i => i.shift === 'S2');
        }
        return this.instructors;
    }

    /* ================= استخراج الحصص التابعة للوردية المسجلة للمدرب فقط (منع ظهور الـ 20 حصة) ================= */
    getInstructorShiftSlots(inst) {
        if (this.isFlexibleRole(inst)) {
            // مساعد المدرب والمشرف: ليس لديه جدول تدريب ثابت، بل يتم استخراج الحصص المسندة إليه فقط بدون أي حصص خالية
            return (inst.fullSchedule || []).filter(s => s.sat === 'occupied' || s.sun === 'occupied');
        }

        let min = 1;
        let max = 10;
        const isFem = (inst.gender === 'female');

        if (inst.category === 'MC') {
            if (inst.shift === 'S1') {
                min = 1;
                max = 13;
            } else if (inst.shift === 'S2') {
                min = 14;
                max = 26;
            } else {
                min = inst.minSlot || 6;
                max = inst.maxSlot || 17;
            }
        } else if (inst.category === 'HT' || inst.category === 'HB' || inst.category === 'LB') {
            if (inst.shift === 'S2') {
                min = 13;
                max = 24;
            } else {
                min = 1;
                max = 12;
            }
        } else {
            // المركبات الخفيفة (عادي وأوتوماتيك):
            // السيدات: 9 حصص يومياً (1-9 صباحاً، 11-19 مساءً | سعة 18)
            // الذكور: 10 حصص يومياً (1-10 صباحاً، 11-20 مساءً | سعة 20)
            if (isFem) {
                if (inst.shift === 'S2') {
                    min = 11;
                    max = 19;
                } else {
                    min = 1;
                    max = 9;
                }
            } else {
                if (inst.shift === 'S2') {
                    min = 11;
                    max = 20;
                } else {
                    min = 1;
                    max = 10;
                }
            }
        }

        // إرجاع الحصص المسجلة لفترة عمل المدرب المعتمدة فقط
        const scheduleList = Array.isArray(inst.fullSchedule) ? inst.fullSchedule : [];
        return scheduleList.filter(s => s.slot >= min && s.slot <= max);
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
        const renderDaysTable = (slotsList, instId, category, instObj = null) => {
            const effectiveCategory = category || instObj?.category || 'LMFM';
            let rowsHtml = '';
            slotsList.forEach(slotItem => {
                let slotTimeStr = "";
                if (effectiveCategory === 'MC') {
                    const tObj = (typeof MC_TIME_SLOTS !== 'undefined' ? MC_TIME_SLOTS : []).find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                } else if (effectiveCategory === 'HT') {
                    const tObj = (typeof HT_TIME_SLOTS !== 'undefined' ? HT_TIME_SLOTS : []).find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                } else {
                    const tObj = (typeof LM_TIME_SLOTS !== 'undefined' ? LM_TIME_SLOTS : []).find(t => t.id === slotItem.slot);
                    slotTimeStr = tObj ? tObj.time : "";
                }

                const isSatOcc = slotItem.sat === 'occupied';
                const isSunOcc = slotItem.sun === 'occupied';

                const renderSlotCell = (dayGroup) => {
                    const isOcc = slotItem[dayGroup] === 'occupied';
                    let details = (dayGroup === 'sat') ? (slotItem.satDetails || {}) : (slotItem.sunDetails || {});

                    // فحص وجود الحصة في خطة اليوم
                    let planSession = null;
                    if (this.dayPlanData && Array.isArray(this.dayPlanData.instructors)) {
                        const pInst = this.dayPlanData.instructors.find(pi => String(pi.instructorId).trim() === String(instId).trim());
                        if (pInst && Array.isArray(pInst.sessions)) {
                            const pDate = pInst.date || this.dayPlanData.date;
                            const pDayKey = (this.comparisonDayKey === 'auto') ? SDIComparisonEngine.detectDayKeyFromDate(pDate) : this.comparisonDayKey;
                            if (dayGroup === pDayKey) {
                                planSession = pInst.sessions.find(ps => ps.slot === slotItem.slot);
                            }
                        }
                    }

                    // استعادة وإثراء بيانات الطالب تلقائياً إذا كانت الحصة مشغولة وتفاصيلها غير مكتملة
                    if (isOcc && (!details.studentName && !details.studentId)) {
                        if (planSession) {
                            details = {
                                studentName: planSession.studentName || '',
                                studentId: planSession.studentId || '',
                                course: planSession.course || effectiveCategory,
                                location: planSession.location || 'R',
                                isDouble: !!planSession.isDouble,
                                classType: planSession.classType || 'R',
                                isDoublePart1: !!planSession.isDoublePart1,
                                isDoublePart2: !!planSession.isDoublePart2,
                                hasDualStudents: !!planSession.hasDualStudents,
                                student2Name: planSession.student2Name || '',
                                student2Id: planSession.student2Id || '',
                                student2Course: planSession.student2Course || '',
                                isFixed: !!planSession.isFixed
                            };
                            if (dayGroup === 'sat') slotItem.satDetails = details;
                            else slotItem.sunDetails = details;
                        } else if (instObj && Array.isArray(instObj.students)) {
                            const matchedSt = instObj.students.find(st => {
                                if (st.slot !== slotItem.slot) return false;
                                if (dayGroup === 'sat') return st.days === 'SAT-MON-WED' || st.days === 'SAT-THU' || st.days === 'DAILY' || st.days === 'SAT-FRI' || st.days === 'FRI-SAT';
                                if (dayGroup === 'sun') return st.days === 'SUN-TUE-THU' || st.days === 'SAT-THU' || st.days === 'DAILY' || st.days === 'SAT-FRI' || st.days === 'FRI-SAT';
                                return false;
                            });
                            if (matchedSt) {
                                details = {
                                    studentName: matchedSt.name || matchedSt.studentName || '',
                                    studentId: matchedSt.id || matchedSt.studentId || '',
                                    course: matchedSt.course || effectiveCategory,
                                    location: matchedSt.location || (/Y/i.test(matchedSt.course || '') ? 'Y' : 'R'),
                                    isDouble: !!matchedSt.isDouble,
                                    classType: matchedSt.classType || 'R',
                                    isDoublePart1: !!matchedSt.isDoublePart1,
                                    isDoublePart2: !!matchedSt.isDoublePart2,
                                    time: matchedSt.time || '',
                                    isFixed: false
                                };
                                if (dayGroup === 'sat') slotItem.satDetails = details;
                                else slotItem.sunDetails = details;
                            }
                        }
                    }

                    const loc = details.location || 'R';
                    const isDouble = !!details.isDouble;
                    const isDoublePart2 = !!details.isDoublePart2;
                    const isFixed = !!details.isFixed;

                    if (!isOcc) {
                        if (planSession) {
                            return `
                                <div class="slot-interactive-cell" style="background: #fff7ed; border: 1.5px dashed #f97316; border-radius: 8px; padding: 4px;">
                                    <button class="slot-day-btn-interactive empty" style="background: #ffedd5; color: #9a3412; border-color: #fdba74; font-weight: 800; font-size: 11px; width: 100%;" onclick="app.applySingleSlotToSchedule('${instId}', ${slotItem.slot})" title="${isAr ? 'حصة مدرجة يدوياً بخطة اليوم (خالية بالإتاحة) - انقر لتسجيلها كـ مشغول - Fixed' : 'Manually entered in Day Plan - Click to record as Occupied - Fixed'}">
                                        📌 مسجلة بالخطة (Fixed)
                                    </button>
                                    <div class="slot-quick-meta" style="margin-top: 3px; justify-content: center; gap: 4px;">
                                        <span style="font-size: 10px; color: #c2410c; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;" title="${planSession.studentName || ''}">👤 ${planSession.studentName ? planSession.studentName.split(' ')[0] : 'يدوية'}</span>
                                        <button type="button" class="slot-meta-pill badge-fixed-pill" style="font-size: 9.5px; padding: 1px 5px; cursor: pointer;" onclick="event.stopPropagation(); app.applySingleSlotToSchedule('${instId}', ${slotItem.slot})" title="${isAr ? 'اعتماد كـ مشغول - Fixed' : 'Apply as Occupied - Fixed'}">⚡ ${isAr ? 'اعتماد' : 'Apply'}</button>
                                    </div>
                                </div>
                            `;
                        }
                        return `<button class="slot-day-btn-interactive empty" onclick="app.toggleSlot('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'الحصة خالية - انقر لحجزها' : 'Slot empty - click to book'}">✨ ${this.t('badgeEmpty')}</button>`;
                    }

                    let btnLabel = `🔒 ${this.t('badgeOccupied')}`;
                    let btnStyle = '';
                    let extraClass = '';

                    if (isFixed) {
                        // يسجل في المحرر التفاعلي: مشغول - Fixed
                        btnLabel = isAr ? '🔒 مشغول - Fixed' : '🔒 Occupied - Fixed';
                        btnStyle = 'background: linear-gradient(135deg, #c2410c, #ea580c); border-color: #9a3412; color: white; font-weight: 800; box-shadow: 0 2px 4px rgba(194, 65, 12, 0.3);';
                        extraClass = 'fixed-slot';
                        if (isDoublePart2) {
                            btnLabel = isAr ? '🔒 مشغول - Fixed (⚡ دبل)' : '🔒 Occupied - Fixed (⚡ Double)';
                        }
                    } else if (isDoublePart2) {
                        btnLabel = `🔒 ${this.t('badgeOccupied')} (⚡ دبل)`;
                        btnStyle = 'background: #6d28d9; border-color: #7c3aed; color: white;';
                    }

                    let hoverIndicator = '';
                    if (isOcc) {
                        if (details.hasDualStudents && details.student2Name) {
                            hoverIndicator = isAr
                                ? `👥 دمج طالبين بساحة الدراجة النارية:\n👤 الطالب 1: ${details.studentName || '-'}\n🆔 رقم التسجيل: ${details.studentId || '-'}\n👥 الطالب 2: ${details.student2Name}\n🆔 رقم التسجيل 2: ${details.student2Id || '-'}\n📋 الدورة: ${details.course || effectiveCategory}\n📍 مكان التدريب: 🅿️ ساحة (Yard)\n${isFixed ? '📌 الحالة: مثبتة يدوياً بالخطة (Fixed)\n' : ''}💡 انقر للتفريغ، أو ✏️ للتعديل`
                                : `👥 Dual Students (MC Yard):\n👤 Student 1: ${details.studentName || '-'}\n🆔 Reg No 1: ${details.studentId || '-'}\n👥 Student 2: ${details.student2Name}\n🆔 Reg No 2: ${details.student2Id || '-'}\n📋 Course: ${details.course || effectiveCategory}\n📍 Location: 🅿️ Yard\n${isFixed ? '📌 Status: Fixed in Day Plan\n' : ''}💡 Click to free, or ✏️ to edit`;
                        } else if (details.studentName || details.studentId) {
                            hoverIndicator = isAr
                                ? `👤 اسم الطالب: ${details.studentName || 'غير مسجل'}\n🆔 رقم التسجيل / القيد: ${details.studentId || 'غير مسجل'}\n📋 كود الدورة: ${details.course || effectiveCategory}\n📍 مكان التدريب: ${loc === 'Y' ? '🅿️ ساحة (Yard)' : '🛣️ شارع (Road)'}\n${isFixed ? '📌 الحالة: مثبتة يدوياً بالخطة (Fixed)\n' : ''}💡 انقر للتفريغ، أو ✏️ للتعديل`
                                : `👤 Student Name: ${details.studentName || 'N/A'}\n🆔 Registration No: ${details.studentId || 'N/A'}\n📋 Course Code: ${details.course || effectiveCategory}\n📍 Location: ${loc === 'Y' ? '🅿️ Yard' : '🛣️ Road'}\n${isFixed ? '📌 Status: Fixed in Day Plan\n' : ''}💡 Click to free, or ✏️ to edit`;
                        } else {
                            hoverIndicator = isAr
                                ? `🔒 الحصة مشغولة\n📍 مكان التدريب: ${loc === 'Y' ? '🅿️ ساحة (Yard)' : '🛣️ شارع (Road)'}\n${isFixed ? '📌 حصة مثبتة يدوياً (Fixed)\n' : ''}💡 انقر ✏️ لتسجيل اسم ورقم قيد الطالب`
                                : `🔒 Slot Occupied\n📍 Location: ${loc === 'Y' ? '🅿️ Yard' : '🛣️ Road'}\n${isFixed ? '📌 Status: Fixed\n' : ''}💡 Click ✏️ to add student name and ID`;
                        }
                    }

                    const mainBtn = `<button class="slot-day-btn-interactive occupied ${extraClass}" style="${btnStyle}" 
                        onclick="app.toggleSlot('${instId}', ${slotItem.slot}, '${dayGroup}')" 
                        onmouseenter="app.showSlotTooltip(event, this)" 
                        onmousemove="app.moveSlotTooltip(event)" 
                        onmouseleave="app.hideSlotTooltip()"
                        data-inst-id="${instId}"
                        data-slot="${slotItem.slot}"
                        data-day="${dayGroup}"
                        data-student-name="${(details.studentName || '').replace(/"/g, '&quot;')}"
                        data-student-id="${(details.studentId || '').replace(/"/g, '&quot;')}"
                        data-student2-name="${(details.student2Name || '').replace(/"/g, '&quot;')}"
                        data-student2-id="${(details.student2Id || '').replace(/"/g, '&quot;')}"
                        data-course="${(details.course || effectiveCategory).replace(/"/g, '&quot;')}"
                        data-location="${loc}"
                        data-is-fixed="${isFixed ? '1' : '0'}"
                        data-has-dual="${details.hasDualStudents ? '1' : '0'}"
                        title="${hoverIndicator.replace(/"/g, '&quot;')}">${btnLabel}</button>`;

                    const locBtn = (loc === 'Y')
                        ? `<button type="button" class="slot-meta-pill badge-yard" onclick="event.stopPropagation(); app.toggleSlotLocation('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'مكان التدريب: ساحة / باركنج (Y) - انقر للتحويل إلى شارع (R)' : 'Yard / Parking (Y) - Click to switch to Road (R)'}">🅿️ Y</button>`
                        : `<button type="button" class="slot-meta-pill badge-road" onclick="event.stopPropagation(); app.toggleSlotLocation('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'مكان التدريب: تدريب بالشارع (R) - انقر للتحويل إلى ساحة (Y)' : 'Road (R) - Click to switch to Yard (Y)'}">🛣️ R</button>`;

                    let typeBtn = '';
                    if (isDoublePart2) {
                        typeBtn = `<span class="badge-double-part2" title="${isAr ? 'حصة مزدوجة تابعة للحصة السابقة (Double D)' : 'Double Class Part 2'}">⚡ دبل (D)</span>`;
                    } else if (isDouble) {
                        typeBtn = `<button type="button" class="slot-meta-pill badge-double" onclick="event.stopPropagation(); app.toggleSlotClassType('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'حصة مزدوجة (Double D) - انقر للتحويل إلى عادية' : 'Double Class (D) - Click to switch to Regular'}">⚡ دبل (D)</button>`;
                    } else {
                        typeBtn = `<button type="button" class="slot-meta-pill" style="font-size: 10px; background: rgba(0,0,0,0.04); color: #64748b; border: 1px solid rgba(0,0,0,0.1); border-radius: 4px; padding: 1px 5px;" onclick="event.stopPropagation(); app.toggleSlotClassType('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'حصة عادية (Regular R) - انقر للتحويل إلى مزدوجة (D)' : 'Regular (R) - Click to switch to Double (D)'}">👤 عادي (R)</button>`;
                    }

                    const fixedPill = isFixed
                        ? `<button type="button" class="slot-meta-pill badge-fixed-pill" style="cursor: pointer;" onclick="event.stopPropagation(); app.toggleSlotFixed('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'حصة مسجلة يدوياً بالخطة (Fixed) - انقر لإلغاء التثبيت' : 'Manually registered in plan (Fixed) - Click to toggle'}">📌 Fixed</button>`
                        : `<button type="button" class="slot-meta-pill" style="font-size: 9.5px; background: rgba(0,0,0,0.03); color: #94a3b8; border: 1px dashed rgba(0,0,0,0.18); border-radius: 4px; padding: 1px 4px; cursor: pointer;" onclick="event.stopPropagation(); app.toggleSlotFixed('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'تثبيت الحصة يدوياً كـ Fixed' : 'Mark as Fixed'}">+ Fixed</button>`;

                    let dualPill = '';
                    if (details.hasDualStudents && (category === 'MC' || details.student2Name) && loc === 'Y') {
                        dualPill = `<span class="slot-meta-pill badge-dual-students" title="${isAr ? 'دمج طالبين في ساحة الدراجة النارية (مسموح وفق لائحة المعهد)' : '2 Students merged in Motorcycle Yard (Permitted)'}">👥 ${isAr ? 'طالبان' : '2 Students'}</span>`;
                    }

                    const editBtn = `<button type="button" class="slot-meta-pill" style="background: white; border: 1px solid #cbd5e1; font-size: 10px; padding: 1px 5px; border-radius: 4px;" onclick="event.stopPropagation(); app.openSlotModal('${instId}', ${slotItem.slot}, '${dayGroup}')" title="${isAr ? 'تعديل تفاصيل الحصة والطالب' : 'Edit details'}">✏️</button>`;

                    let studentChip = '';
                    if (details.hasDualStudents && details.student2Name && loc === 'Y') {
                        studentChip = `
                            <div class="slot-student-mini" style="background: #f0fdf4; border-color: #86efac; color: #166534; font-size: 10.5px; line-height: 1.3;" 
                                onmouseenter="app.showSlotTooltip(event, this.parentElement.querySelector('.slot-day-btn-interactive'))" 
                                onmousemove="app.moveSlotTooltip(event)" 
                                onmouseleave="app.hideSlotTooltip()"
                                title="${hoverIndicator.replace(/"/g, '&quot;')}">
                                <div>👤 1: ${details.studentName || '-'} <span style="font-size:9.5px; opacity:0.8; font-family:monospace;">(#${details.studentId || '-'})</span></div>
                                <div style="font-weight: 700; color: #15803d;">👥 2: ${details.student2Name} <span style="font-size:9.5px; opacity:0.8; font-family:monospace;">(#${details.student2Id || '-'})</span></div>
                            </div>
                        `;
                    } else if (details.studentName || details.studentId) {
                        const sIdPart = details.studentId ? ` <span style="font-size:9.5px; opacity:0.8; font-family:monospace;">(#${details.studentId})</span>` : '';
                        studentChip = `<div class="slot-student-mini" 
                            onmouseenter="app.showSlotTooltip(event, this.parentElement.querySelector('.slot-day-btn-interactive'))" 
                            onmousemove="app.moveSlotTooltip(event)" 
                            onmouseleave="app.hideSlotTooltip()"
                            title="${hoverIndicator.replace(/"/g, '&quot;')}">👤 ${details.studentName || 'طالب'}${sIdPart}</div>`;
                    }

                    return `
                        <div class="slot-interactive-cell">
                            ${mainBtn}
                            <div class="slot-quick-meta">
                                ${locBtn}
                                ${typeBtn}
                                ${dualPill}
                                ${fixedPill}
                                ${editBtn}
                            </div>
                            ${studentChip}
                        </div>
                    `;
                };

                const satCell = renderSlotCell('sat');
                const sunCell = renderSlotCell('sun');

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
                        <td class="td-sat">${satCell}</td>
                        <td class="td-sun">${sunCell}</td>
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
            const isFlex = this.isFlexibleRole(inst);
            const isSup = this.isSupervisor(inst);
            const isAst = this.isAssistant(inst);

            if (isFlex) {
                shiftOptionsHtml = `
                    <div style="font-size: 12px; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 6px; font-weight: bold; border: 1px solid #fde68a;">
                        ${isAst ? (isAr ? '🤝 مساعد مدرب (جدول مرن بدون حد حصص)' : '🤝 Assistant Trainer (Flexible)') : (isAr ? '👔 مشرف (جدول مرن بدون حد حصص)' : '👔 Supervisor (Flexible)')}
                    </div>
                `;
            } else if (inst.category === 'MC') {
                shiftOptionsHtml = `
                    <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                        <option value="FIX" ${inst.shift === 'FIX' ? 'selected' : ''}>${isAr ? '🏍️ فترة واحدة بالفرع (13 حصة: 6 إلى 17)' : '🏍️ Fixed Branch Shift (13 slots: 6 to 17)'}</option>
                        <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? '🌅 وردية أولى صباحية - المركز الرئيسي (13 حصة: 1 إلى 13)' : '🌅 Morning Shift - HQ (13 slots: 1 to 13)'}</option>
                        <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? '🌇 وردية ثانية مسائية - المركز الرئيسي (13 حصة: 14 إلى 26)' : '🌇 Evening Shift - HQ (13 slots: 14 to 26)'}</option>
                    </select>
                `;
            } else if (inst.category === 'HT' || inst.category === 'HB' || inst.category === 'LB') {
                const isHB = (inst.category === 'HB' || inst.category === 'LB');
                const catNameAr = isHB ? 'باص ثقيل (HBFM)' : 'الشاحنة الثقيلة';
                const catNameEn = isHB ? 'Heavy Bus' : 'Heavy Truck';
                shiftOptionsHtml = `
                    <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                        <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? `الوردية المعتمدة لـ ${catNameAr}: الفترة الأولى (12 حصة: 1 إلى 12 - صباحي)` : `Shift: Morning (12 slots: 1 to 12 - ${catNameEn})`}</option>
                        <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? `الوردية المعتمدة لـ ${catNameAr}: الفترة الثانية (12 حصة: 13 إلى 24 - مسائي)` : `Shift: Evening (12 slots: 13 to 24 - ${catNameEn})`}</option>
                    </select>
                `;
            } else {
                const isFem = (inst.gender === 'female');
                if (isFem) {
                    shiftOptionsHtml = `
                        <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                            <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة (سيدات): الفترة الصباحية (9 حصص: 1 إلى 9)' : 'Female Shift: Morning (9 slots: 1 to 9)'}</option>
                            <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة (سيدات): الفترة المسائية (9 حصص: 11 إلى 19)' : 'Female Shift: Evening (9 slots: 11 to 19)'}</option>
                        </select>
                    `;
                } else {
                    shiftOptionsHtml = `
                        <select class="filter-select" style="font-size: 12px; padding: 4px 10px; font-weight: bold;" onchange="app.changeInstructorShift('${inst.id}', this.value)">
                            <option value="S1" ${inst.shift === 'S1' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الأولى (10 حصص: 1 إلى 10 - صباحي)' : 'Shift: Morning (10 slots: 1 to 10)'}</option>
                            <option value="S2" ${inst.shift === 'S2' ? 'selected' : ''}>${isAr ? 'الوردية المعتمدة: الفترة الثانية (10 حصص: 11 إلى 20 - مسائي)' : 'Shift: Evening (10 slots: 11 to 20)'}</option>
                        </select>
                    `;
                }
            }

            // استخراج الحصص التابعة للفترة المسجلة للمدرب فقط (10 حصص للمركبة، 12 للشاحنة والباص، 13 للدراجة) لمنع ظهور الـ 20 حصة
            const visibleSlots = this.getInstructorShiftSlots(inst);

            // حساب المؤشرات للحصص المعروضة حالياً
            let curOcc = 0, curEmp = 0;
            if (isFlex) {
                visibleSlots.forEach(s => {
                    if (s.sat === 'occupied') curOcc++;
                    if (s.sun === 'occupied') curOcc++;
                });
                curEmp = 0; // ممنوع احتساب أي حصص خالية للمساعد أو المشرف (جدوله خالي من الحصص الفارغة)
            } else {
                visibleSlots.forEach(s => {
                    if (s.sat === 'occupied') curOcc++; else curEmp++;
                    if (s.sun === 'occupied') curOcc++; else curEmp++;
                });
            }
            const curCap = isFlex ? curOcc : (curOcc + curEmp);
            const curRate = curCap > 0 ? ((curOcc / curCap) * 100).toFixed(1) : "0.0";

            // تقسيم الحصص إلى عمودين متساويين في حال تجاوزت 5 حصص لتلائم الشاشة بالكامل بدون سكرول
            let tableLayoutHtml = '';
            if (isFlex && visibleSlots.length === 0) {
                const roleIcon = isAst ? '🤝' : '👔';
                const roleTitle = isAst 
                    ? (isAr ? 'مساعد المدرب ليس لديه جدول تدريبي ثابت (0 حصص مسجلة | 0 حصص خالية)' : 'Assistant Trainer has no fixed template (0 recorded | 0 empty)')
                    : (isAr ? 'المشرف ليس لديه جدول تدريبي ثابت (0 حصص مسجلة | 0 حصص خالية)' : 'Supervisor has no fixed template (0 recorded | 0 empty)');
                const roleDesc = isAr
                    ? 'وفق اللائحة المعتمدة، جدول مساعد المدرب والمشرف مرن وخالي من خانات الحصص الفارغة، ولا يُسجل له عدد محدد مسبقاً من الحصص، بل الحصص التي يقوم بتدريبها هي العدد الذي يُسجل له فقط (عند تدريب حصتين يُسجل له 2، وعند تدريب ثلاث يُسجل 3 ولا تُسجل له حصص فارغة).'
                    : 'According to regulations, assistants and supervisors have a flexible schedule. Only actually trained sessions are recorded, with zero empty slots.';
                tableLayoutHtml = `
                    <div style="background: #fffbeb; border: 1.5px dashed #fde68a; border-radius: 10px; padding: 40px 20px; text-align: center; margin-top: 10px;">
                        <div style="font-size: 38px; margin-bottom: 10px;">${roleIcon}</div>
                        <h4 style="font-size: 15px; font-weight: 800; color: #92400e; margin-bottom: 6px;">${roleTitle}</h4>
                        <p style="font-size: 13px; color: #b45309; max-width: 600px; margin: 0 auto 16px auto; line-height: 1.6;">${roleDesc}</p>
                    </div>
                `;
            } else if (visibleSlots.length > 5) {
                const mid = Math.ceil(visibleSlots.length / 2);
                const col1 = visibleSlots.slice(0, mid);
                const col2 = visibleSlots.slice(mid);
                tableLayoutHtml = `
                    <div class="slots-dual-columns">
                        <div class="slots-col">
                            ${renderDaysTable(col1, inst.id, inst.category, inst)}
                        </div>
                        <div class="slots-col">
                            ${renderDaysTable(col2, inst.id, inst.category, inst)}
                        </div>
                    </div>
                `;
            } else {
                tableLayoutHtml = renderDaysTable(visibleSlots, inst.id, inst.category, inst);
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
                                ${!isFlex ? `
                                <button class="btn btn-outline btn-sm" onclick="app.setShiftAllSlots('${inst.id}', 'empty')" title="تفريغ كافة حصص هذا النطاق">
                                    ${this.t('btnClearRange')}
                                </button>
                                <button class="btn btn-outline btn-sm" onclick="app.setShiftAllSlots('${inst.id}', 'occupied')" title="حجز كافة حصص هذا النطاق">
                                    ${this.t('btnBookRange')}
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- إحصائيات سريعة للحصص المسجلة فقط -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; padding: 8px 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 12.5px; flex-wrap: wrap; gap: 8px;">
                        <span>
                            ${isSup 
                                ? (isAr ? `👔 <strong>مشرف / سوبرفايزر</strong> (بدون جدول ثابت | الحصص المسجلة فقط: <strong>${visibleSlots.length} حصة</strong>)` : `👔 <strong>Supervisor</strong> (No fixed schedule | Recorded: <strong>${visibleSlots.length}</strong>)`)
                                : `${this.t('instShiftRegistered')} <strong>${inst.shiftName}</strong> | ${this.t('instSlotsRange')} <strong>${this.t('slotTitle')} ${visibleSlots[0]?.slot || 1} ${isAr ? 'إلى' : 'to'} ${visibleSlots[visibleSlots.length-1]?.slot || 10}</strong> (${visibleSlots.length} ${this.t('instSlotsCount')})`
                            }
                        </span>
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
                            ${renderDaysTable(visibleSlots, inst.id, inst.category, inst)}
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
                                    <option value="HB">🚌 ${isAr ? 'باص ثقيل (HBFM - 30 دقيقة)' : 'Heavy Bus (HBFM - 30 mins)'}</option>
                                    <option value="HT">🚛 ${isAr ? 'شاحنة ثقيلة (HTFM - 30 دقيقة)' : 'Heavy Truck (HTFM - 30 mins)'}</option>
                                    <option value="MC">🏍️ ${isAr ? 'دراجة نارية (MC - 30 دقيقة)' : 'Motorcycle (MC - 30 mins)'}</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="inline-inst-shift">${this.t('lblInstShift')} <span style="color:#ef4444;">*</span></label>
                                <select id="inline-inst-shift" class="form-control" onchange="app.updateInlinePreview()">
                                    <option value="S1">🌅 ${isAr ? 'الفترة الصباحية (الأولى) - خفيف (1-10 ذكور / 1-9 إناث) أو ثقيل/باص (1-12) أو دراجة إدارة (1-13)' : 'Morning Shift (1st)'}</option>
                                    <option value="S2">🌇 ${isAr ? 'الفترة المسائية (الثانية) - خفيف (11-20 ذكور / 11-19 إناث) أو ثقيل/باص (13-24) أو دراجة إدارة (14-26)' : 'Evening Shift (2nd)'}</option>
                                    <option value="FIX">⏱️ ${isAr ? 'فترة الدراجة النارية بالفرع: 12 حصة (6 إلى 17)' : 'Motorcycle Branch Fixed: 12 slots (6 to 17)'}</option>
                                </select>
                            </div>
                        </div>

                        <!-- شريط المعاينة وزر الحفظ المباشر -->
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span style="font-size: 12.5px; font-weight: 800; color: #166534;">${this.t('lblShiftCodePreview')}</span>
                                <span id="inline-preview-code" class="smart-code-badge">LMFM-S1</span>
                                <span id="inline-preview-desc" style="font-size: 12px; color: #15803d; font-weight: 600;">
                                    ${isAr ? 'الحصص المعتمدة: 10 حصص (1 إلى 10) فقط (السعة الكلية 20 حصة)' : 'Approved slots: 10 slots (1 to 10) (20 capacity)'}
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

        const isAr = this.lang === 'ar';
        const cat = catEl.value;
        let sh = shiftEl.value;

        if (cat === 'MC') {
            if (sh !== 'S1' && sh !== 'S2' && sh !== 'FIX') {
                shiftEl.value = 'FIX';
                sh = 'FIX';
            }
            if (sh === 'S1') {
                codeEl.innerText = 'MC-S1';
                descEl.innerHTML = isAr 
                    ? '🏍️ <strong>دراجة نارية (صباحي إدارة):</strong> 13 حصة (الحصص <strong>1 إلى 13</strong> | مدة 30 دقيقة | سعة 26)'
                    : 'Motorcycle HQ Morning: 13 slots (1 to 13 | 30 mins | 26 cap)';
            } else if (sh === 'S2') {
                codeEl.innerText = 'MC-S2';
                descEl.innerHTML = isAr 
                    ? '🏍️ <strong>دراجة نارية (مسائي إدارة):</strong> 13 حصة (الحصص <strong>14 إلى 26</strong> | مدة 30 دقيقة | سعة 26)'
                    : 'Motorcycle HQ Evening: 13 slots (14 to 26 | 30 mins | 26 cap)';
            } else {
                codeEl.innerText = 'MC-FIX';
                descEl.innerHTML = isAr 
                    ? '🏍️ <strong>دراجة نارية (فترة الفرع):</strong> 12 حصة (الحصص <strong>6 إلى 17</strong> | مدة 30 دقيقة | سعة 24)'
                    : 'Motorcycle Branch Fixed: 12 slots (6 to 17 | 30 mins | 24 cap)';
            }
        } else if (cat === 'HT' || cat === 'HB' || cat === 'LB') {
            const isBus = (cat === 'HB' || cat === 'LB');
            const prefix = isBus ? 'HBFM' : 'HTFM';
            const catName = isBus ? (isAr ? 'باص ثقيل' : 'Heavy Bus') : (isAr ? 'شاحنة ثقيلة' : 'Heavy Truck');
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                codeEl.innerText = `${prefix}-S1`;
                descEl.innerHTML = isAr 
                    ? `🌅 <strong>${catName} (صباحي):</strong> 12 حصة (الحصص <strong>1 إلى 12</strong> | مدة الحصة 30 دقيقة | سعة 24)`
                    : `Morning Shift: 12 slots (Slots 1 to 12 | 30 mins | 24 cap)`;
            } else {
                codeEl.innerText = `${prefix}-S2`;
                descEl.innerHTML = isAr 
                    ? `🌇 <strong>${catName} (مسائي):</strong> 12 حصة (الحصص <strong>13 إلى 24</strong> | مدة الحصة 30 دقيقة | سعة 24)`
                    : `Evening Shift: 12 slots (Slots 13 to 24 | 30 mins | 24 cap)`;
            }
        } else {
            if (sh === 'FIX') { shiftEl.value = 'S1'; sh = 'S1'; }
            const masterEntry = (typeof SDIMasterRoster !== 'undefined') ? SDIMasterRoster.lookup(document.getElementById('inline-inst-id')?.value, document.getElementById('inline-inst-name')?.value) : null;
            const isFem = masterEntry ? masterEntry.gender === 'female' : false;
            const suffix = isFem ? '-F' : '';
            if (sh === 'S1') {
                codeEl.innerText = `${cat}-S1${suffix}`;
                descEl.innerHTML = isFem
                    ? (isAr ? '👩 <strong>سيدات (صباحي):</strong> 9 حصص (الحصص <strong>1 إلى 9</strong> | مدة 40 دقيقة | سعة 18)' : 'Female Morning: 9 slots (1 to 9 | 18 cap)')
                    : (isAr ? '🌅 <strong>مركبة خفيفة (صباحي):</strong> 10 حصص (الحصص <strong>1 إلى 10</strong> | مدة 40 دقيقة | سعة 20)' : 'Morning Shift: 10 slots (1 to 10 | 20 cap)');
            } else {
                codeEl.innerText = `${cat}-S2${suffix}`;
                descEl.innerHTML = isFem
                    ? (isAr ? '👩 <strong>سيدات (مسائي):</strong> 9 حصص (الحصص <strong>11 إلى 19</strong> | مدة 40 دقيقة | سعة 18)' : 'Female Evening: 9 slots (11 to 19 | 18 cap)')
                    : (isAr ? '🌇 <strong>مركبة خفيفة (مسائي):</strong> 10 حصص (الحصص <strong>11 إلى 20</strong> | مدة 40 دقيقة | سعة 20)' : 'Evening Shift: 10 slots (11 to 20 | 20 cap)');
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

        const isAr = this.lang === 'ar';
        const shortName = name.split(' ').slice(0, 2).join(' ');

        const masterEntry = (typeof SDIMasterRoster !== 'undefined') ? SDIMasterRoster.lookup(id, name) : null;
        const isFem = masterEntry ? masterEntry.gender === 'female' : false;
        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';
        let capacity = 20;

        if (category === 'MC') {
            vehicleType = isAr ? 'دراجة نارية (MC)' : 'Motorcycle (MC)';
            if (shift === 'S1') {
                shiftCode = 'MC-S1';
                shiftName = isAr ? 'فترة صباحية - إدارة (1 - 13)' : 'HQ Morning (1 - 13)';
                minSlot = 1;
                maxSlot = 13;
                capacity = 26;
            } else if (shift === 'S2') {
                shiftCode = 'MC-S2';
                shiftName = isAr ? 'فترة مسائية - إدارة (14 - 26)' : 'HQ Evening (14 - 26)';
                minSlot = 14;
                maxSlot = 26;
                capacity = 26;
            } else {
                shift = 'FIX';
                shiftCode = 'MC-FIX';
                shiftName = isAr ? 'فترة الفرع (6 - 17)' : 'Branch Shift (6 - 17)';
                minSlot = 6;
                maxSlot = 17;
                capacity = 24;
            }
        } else if (category === 'HT' || category === 'HB' || category === 'LB') {
            const isBus = (category === 'HB' || category === 'LB');
            const prefix = isBus ? 'HBFM' : 'HTFM';
            vehicleType = isBus ? (isAr ? 'باص ثقيل (HBFM)' : 'Heavy Bus (HBFM)') : (isAr ? 'شاحنة ثقيلة (HTFM)' : 'Heavy Truck (HTFM)');
            capacity = 24;
            if (shift === 'S2') {
                shiftCode = `${prefix}-S2`;
                shiftName = isAr ? 'الفترة الثانية (13 - 24) [12 حصة]' : 'Evening Shift (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = `${prefix}-S1`;
                shiftName = isAr ? 'الفترة الأولى (1 - 12) [12 حصة]' : 'Morning Shift (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            vehicleType = category === 'LMFM' ? (isAr ? 'مركبة خفيفة عادي (LMFM)' : 'Light Motor - Manual') : (isAr ? 'مركبة خفيفة أوتوماتيك (LMFA)' : 'Light Motor - Auto');
            const suffix = isFem ? '-F' : '';
            if (isFem) {
                capacity = 18;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2${suffix}`;
                    shiftName = isAr ? 'الفترة الثانية سيدات (11 - 19) [9 حصص]' : 'Female Evening (11 - 19)';
                    minSlot = 11;
                    maxSlot = 19;
                } else {
                    shiftCode = `${category}-S1${suffix}`;
                    shiftName = isAr ? 'الفترة الأولى سيدات (1 - 9) [9 حصص]' : 'Female Morning (1 - 9)';
                    minSlot = 1;
                    maxSlot = 9;
                }
            } else {
                capacity = 20;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2${suffix}`;
                    shiftName = isAr ? 'الفترة الثانية (11 - 20) [10 حصص]' : 'Evening Shift (11 - 20)';
                    minSlot = 11;
                    maxSlot = 20;
                } else {
                    shiftCode = `${category}-S1${suffix}`;
                    shiftName = isAr ? 'الفترة الأولى (1 - 10) [10 حصص]' : 'Morning Shift (1 - 10)';
                    minSlot = 1;
                    maxSlot = 10;
                }
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
            const maxSlotsCount = (category === 'HT' || category === 'LB') ? 24 : 20;
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
        const roleEl = document.getElementById('modal-inst-role');
        const genderEl = document.getElementById('modal-inst-gender');
        const catEl = document.getElementById('modal-inst-category');
        const shiftEl = document.getElementById('modal-inst-shift');
        const delBtn = document.getElementById('modal-delete-btn');

        modeEl.value = mode;

        if (mode === 'edit' && instId) {
            const inst = this.instructors.find(i => i.id === instId);
            if (!inst) return;

            titleEl.innerHTML = (this.lang === 'ar')
                ? `⚙️ تعديل بيانات وتكويد: <strong>${inst.shortName || inst.name}</strong>`
                : `⚙️ Edit Instructor Coding: <strong>${inst.shortName || inst.name}</strong>`;
            origIdEl.value = inst.id;
            nameEl.value = inst.name;
            shortNameEl.value = inst.shortName || '';
            idEl.value = inst.id;
            
            const isSup = this.isSupervisor(inst);
            const isAst = this.isAssistant(inst);
            if (roleEl) roleEl.value = isAst ? 'assistant' : (isSup ? 'supervisor' : 'instructor');
            if (genderEl) genderEl.value = (inst.gender === 'female') ? 'female' : 'male';
            if (catEl) catEl.value = inst.category || 'LMFM';
            if (shiftEl) shiftEl.value = isAst ? 'AST' : (isSup ? 'SUP' : (inst.shift || 'S1'));

            if (delBtn) delBtn.style.display = (this.instructors.length > 1) ? 'inline-block' : 'none';
        } else {
            titleEl.innerText = (this.lang === 'ar') ? '➕ تسجيل وتكويد مدرب جديد' : '➕ Register & Code New Instructor';
            origIdEl.value = '';
            nameEl.value = '';
            shortNameEl.value = '';
            idEl.value = String(Math.floor(100000 + Math.random() * 900000));
            if (roleEl) roleEl.value = 'instructor';
            if (genderEl) genderEl.value = 'male';
            if (catEl) catEl.value = 'LMFM';
            if (shiftEl) shiftEl.value = (this.activePeriodFilter === 'evening') ? 'S2' : 'S1';

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
        const roleEl = document.getElementById('modal-inst-role');
        const genderEl = document.getElementById('modal-inst-gender');
        const categoryEl = document.getElementById('modal-inst-category');
        const shiftEl = document.getElementById('modal-inst-shift');
        const badgeEl = document.getElementById('preview-shift-code');
        const descEl = document.getElementById('preview-shift-desc');

        if (!categoryEl || !shiftEl || !badgeEl || !descEl) return;

        const isAr = this.lang === 'ar';
        const role = roleEl ? roleEl.value : 'instructor';
        const gender = genderEl ? genderEl.value : 'male';
        const cat = categoryEl.value;
        let sh = shiftEl.value;

        if (role === 'assistant' || sh === 'AST') {
            shiftEl.value = 'AST';
            badgeEl.innerText = `AST-${cat}`;
            descEl.innerHTML = isAr 
                ? '🤝 <strong>مساعد مدرب:</strong> ليس لديه جدول تدريبي ثابت ولا يُسجل له عدد محدد من الحصص، بل الحصص التي يقوم بتدريبها هي العدد الذي يُسجل له فقط (الحصص المسجلة فقط وبدون أي حصص خالية).'
                : '🤝 <strong>Assistant Trainer:</strong> Flexible schedule without fixed slot cap. Only actually trained sessions are recorded, with zero empty slots.';
            return;
        }

        if (role === 'supervisor' || sh === 'SUP') {
            shiftEl.value = 'SUP';
            badgeEl.innerText = `SUP-${cat}`;
            descEl.innerHTML = isAr 
                ? '👔 <strong>مشرف / سوبرفايزر:</strong> ليس لديه جدول تدريبي ثابت (جدوله مرن). لا تُحسب له إلا الحصص المسجلة بالنظام فقط، وتكون سعته مساوية لعدد الحصص المسجلة وبدون أي حصص خالية.'
                : '👔 <strong>Supervisor:</strong> Flexible schedule without fixed template. Only actually recorded sessions count, with zero empty slots.';
            return;
        }

        if (cat === 'MC') {
            if (sh === 'S1') {
                badgeEl.innerText = 'MC-S1';
                descEl.innerHTML = isAr 
                    ? '🌅 <strong>دراجة نارية (فترة صباحية):</strong> 13 حصة (الحصص <strong>1 إلى 13</strong> | مدة الحصة 30 دقيقة | السعة 26 حصة)'
                    : 'Morning Shift: 13 slots (Slots <strong>1 to 13</strong> | 30 mins | 26 capacity)';
            } else if (sh === 'S2') {
                badgeEl.innerText = 'MC-S2';
                descEl.innerHTML = isAr 
                    ? '🌇 <strong>دراجة نارية (فترة مسائية):</strong> 13 حصة (الحصص <strong>14 إلى 26</strong> | مدة الحصة 30 دقيقة | السعة 26 حصة)'
                    : 'Evening Shift: 13 slots (Slots <strong>14 to 26</strong> | 30 mins | 26 capacity)';
            } else {
                shiftEl.value = 'FIX';
                badgeEl.innerText = 'MC-FIX';
                descEl.innerHTML = isAr 
                    ? '🏍️ <strong>دراجة نارية (فترة ثابتة بالفرع):</strong> 13 حصة تبدأ من الحصة <strong>6 إلى 17</strong> (مدة الحصة 30 دقيقة | السعة 26 حصة)'
                    : 'Motorcycle (Fixed Shift): 13 slots starting from <strong>6 to 17</strong> (30 min duration | 26 capacity)';
            }
        } else if (cat === 'HT' || cat === 'HB' || cat === 'LB') {
            const isHB = (cat === 'HB' || cat === 'LB');
            const prefix = isHB ? 'HBFM' : 'HTFM';
            const catName = isHB ? (isAr ? 'باص ثقيل (HBFM)' : 'Heavy Bus') : (isAr ? 'شاحنة ثقيلة' : 'Heavy Truck');
            if (sh === 'FIX' || sh === 'SUP' || sh === 'AST') { shiftEl.value = 'S1'; sh = 'S1'; }
            if (sh === 'S1') {
                badgeEl.innerText = `${prefix}-S1`;
                descEl.innerHTML = isAr 
                    ? `🌅 <strong>${catName} (صباحية):</strong> 12 حصة (الحصص <strong>1 إلى 12</strong> | مدة الحصة 30 دقيقة | السعة 24 حصة)`
                    : `Morning Shift: 12 slots (Slots <strong>1 to 12</strong> | 30 min duration | 24 capacity)`;
            } else {
                badgeEl.innerText = `${prefix}-S2`;
                descEl.innerHTML = isAr 
                    ? `🌇 <strong>${catName} (مسائية):</strong> 12 حصة (الحصص <strong>13 إلى 24</strong> | مدة الحصة 30 دقيقة | السعة 24 حصة)`
                    : `Evening Shift: 12 slots (Slots <strong>13 to 24</strong> | 30 min duration | 24 capacity)`;
            }
        } else {
            // المركبات الخفيفة
            if (sh === 'FIX' || sh === 'SUP' || sh === 'AST') { shiftEl.value = 'S1'; sh = 'S1'; }
            const isFem = (gender === 'female');
            if (isFem) {
                // جدول السيدات: 9 حصص يومياً (18 حصة معتمدة)
                if (sh === 'S1') {
                    badgeEl.innerText = `${cat}-S1-F`;
                    descEl.innerHTML = isAr 
                        ? '🌅 <strong>مركبة خفيفة (سيدات - صباحية):</strong> 9 حصص معتمدة (الحصص <strong>1 إلى 9</strong> | مدة 40 دقيقة | السعة الكلية 18 حصة)'
                        : 'Female Morning Shift: 9 slots (Slots <strong>1 to 9</strong> | 40 mins | Capacity 18 slots)';
                } else {
                    badgeEl.innerText = `${cat}-S2-F`;
                    descEl.innerHTML = isAr 
                        ? '🌇 <strong>مركبة خفيفة (سيدات - مسائية):</strong> 9 حصص معتمدة (الحصص <strong>11 إلى 19</strong> | مدة 40 دقيقة | السعة الكلية 18 حصة)'
                        : 'Female Evening Shift: 9 slots (Slots <strong>11 to 19</strong> | 40 mins | Capacity 18 slots)';
                }
            } else {
                // جدول الذكور: 10 حصص يومياً (20 حصة معتمدة)
                if (sh === 'S1') {
                    badgeEl.innerText = `${cat}-S1`;
                    descEl.innerHTML = isAr 
                        ? '🌅 <strong>مركبة خفيفة (ذكور - صباحية):</strong> 10 حصص معتمدة (الحصص <strong>1 إلى 10</strong> | مدة 40 دقيقة | السعة الكلية 20 حصة)'
                        : 'Morning Shift: 10 approved slots (Slots <strong>1 to 10</strong> | 40 mins | Approved Capacity 20 slots)';
                } else {
                    badgeEl.innerText = `${cat}-S2`;
                    descEl.innerHTML = isAr 
                        ? '🌇 <strong>مركبة خفيفة (ذكور - مسائية):</strong> 10 حصص معتمدة (الحصص <strong>11 إلى 20</strong> | مدة 40 دقيقة | السعة الكلية 20 حصة)'
                        : 'Evening Shift: 10 approved slots (Slots <strong>11 to 20</strong> | 40 mins | Approved Capacity 20 slots)';
                }
            }
        }
    }

    saveInstructorFromModal() {
        const mode = document.getElementById('modal-inst-mode').value;
        const origId = document.getElementById('modal-original-id').value;
        const name = document.getElementById('modal-inst-name').value.trim();
        const shortNameInput = document.getElementById('modal-inst-shortname').value.trim();
        const id = document.getElementById('modal-inst-id').value.trim();
        const role = document.getElementById('modal-inst-role')?.value || 'instructor';
        const gender = document.getElementById('modal-inst-gender')?.value || 'male';
        const category = document.getElementById('modal-inst-category').value;
        let shift = document.getElementById('modal-inst-shift').value;

        if (!name || !id) {
            alert("يرجى إدخال اسم المدرب والرقم الوظيفي / الكود.");
            return;
        }

        const isAr = this.lang === 'ar';
        const shortName = shortNameInput || name.split(' ').slice(0, 2).join(' ');
        const isAssistant = (role === 'assistant' || shift === 'AST');
        const isSupervisor = (role === 'supervisor' || shift === 'SUP');
        const isFlexible = isAssistant || isSupervisor;

        if (isAssistant) shift = 'AST';
        else if (isSupervisor) shift = 'SUP';

        const isFem = (gender === 'female');
        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';
        let capacity = 20;

        if (isAssistant) {
            shiftCode = `AST-${category}`;
            shiftName = isAr ? 'مساعد مدرب (Assistant) - جدول مرن' : 'Assistant Trainer - Flexible';
            minSlot = 1;
            maxSlot = (category === 'HT' || category === 'HB' || category === 'LB' || category === 'MC') ? (category === 'MC' ? 26 : 24) : 20;
            vehicleType = category === 'MC' ? (isAr ? 'دراجة نارية (MC)' : 'Motorcycle (MC)') :
                          (category === 'HT' ? (isAr ? 'شاحنة ثقيلة (HTFM)' : 'Heavy Truck (HTFM)') :
                          ((category === 'HB' || category === 'LB') ? (isAr ? 'باص ثقيل (HBFM)' : 'Heavy Bus (HBFM)') :
                          (category === 'LMFM' ? (isAr ? 'خفيفة عادي (LMFM)' : 'Light Motor - Manual') : (isAr ? 'خفيفة أوتوماتيك (LMFA)' : 'Light Motor - Auto'))));
            capacity = 0;
        } else if (isSupervisor) {
            shiftCode = `SUP-${category}`;
            shiftName = isAr ? 'مشرف (Supervisor) - جدول مرن' : 'Supervisor - Flexible';
            minSlot = 1;
            maxSlot = (category === 'HT' || category === 'HB' || category === 'LB' || category === 'MC') ? (category === 'MC' ? 26 : 24) : 20;
            vehicleType = category === 'MC' ? (isAr ? 'دراجة نارية (MC)' : 'Motorcycle (MC)') :
                          (category === 'HT' ? (isAr ? 'شاحنة ثقيلة (HTFM)' : 'Heavy Truck (HTFM)') :
                          ((category === 'HB' || category === 'LB') ? (isAr ? 'باص ثقيل (HBFM)' : 'Heavy Bus (HBFM)') :
                          (category === 'LMFM' ? (isAr ? 'خفيفة عادي (LMFM)' : 'Light Motor - Manual') : (isAr ? 'خفيفة أوتوماتيك (LMFA)' : 'Light Motor - Auto'))));
            capacity = 0;
        } else if (category === 'MC') {
            capacity = 26;
            vehicleType = isAr ? 'دراجة نارية (MC)' : 'Motorcycle (MC)';
            if (shift === 'S1') {
                shiftCode = 'MC-S1';
                shiftName = isAr ? 'الفترة الأولى صباحي (1 - 13) [13 حصة]' : 'Morning Shift (1 - 13)';
                minSlot = 1;
                maxSlot = 13;
            } else if (shift === 'S2') {
                shiftCode = 'MC-S2';
                shiftName = isAr ? 'الفترة الثانية مسائي (14 - 26) [13 حصة]' : 'Evening Shift (14 - 26)';
                minSlot = 14;
                maxSlot = 26;
            } else {
                shift = 'FIX';
                shiftCode = 'MC-FIX';
                shiftName = isAr ? 'فترة الدراجة النارية الثابتة (6 - 17)' : 'Motorcycle Fixed (6 - 17)';
                minSlot = 6;
                maxSlot = 17;
            }
        } else if (category === 'HT' || category === 'HB' || category === 'LB') {
            const isHB = (category === 'HB' || category === 'LB');
            const prefix = isHB ? 'HBFM' : 'HTFM';
            vehicleType = isHB ? (isAr ? 'باص ثقيل (HBFM)' : 'Heavy Bus (HBFM)') : (isAr ? 'شاحنة ثقيلة (HTFM)' : 'Heavy Truck (HTFM)');
            capacity = 24;
            if (shift === 'S2') {
                shiftCode = `${prefix}-S2`;
                shiftName = isAr ? 'الفترة الثانية (13 - 24) [12 حصة]' : 'Evening Shift (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = `${prefix}-S1`;
                shiftName = isAr ? 'الفترة الأولى (1 - 12) [12 حصة]' : 'Morning Shift (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            // المركبات الخفيفة
            vehicleType = category === 'LMFM' ? (isAr ? 'مركبة خفيفة عادي (LMFM)' : 'Light Motor - Manual') : (isAr ? 'مركبة خفيفة أوتوماتيك (LMFA)' : 'Light Motor - Auto');
            if (isFem) {
                // جدول السيدات: 9 حصص يومياً (18 سعة)
                capacity = 18;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2-F`;
                    shiftName = isAr ? 'الفترة المسائية سيدات (11 - 19) [9 حصص]' : 'Female Evening (11 - 19)';
                    minSlot = 11;
                    maxSlot = 19;
                } else {
                    shiftCode = `${category}-S1-F`;
                    shiftName = isAr ? 'الفترة الصباحية سيدات (1 - 9) [9 حصص]' : 'Female Morning (1 - 9)';
                    minSlot = 1;
                    maxSlot = 9;
                }
            } else {
                // جدول الذكور: 10 حصص يومياً (20 سعة)
                capacity = 20;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2`;
                    shiftName = isAr ? 'الفترة الثانية (11 - 20) [10 حصص]' : 'Evening Shift (11 - 20)';
                    minSlot = 11;
                    maxSlot = 20;
                } else {
                    shiftCode = `${category}-S1`;
                    shiftName = isAr ? 'الفترة الأولى (1 - 10) [10 حصص]' : 'Morning Shift (1 - 10)';
                    minSlot = 1;
                    maxSlot = 10;
                }
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
            inst.gender = gender;
            inst.role = role;
            inst.vehicleType = vehicleType;
            inst.shift = shift;
            inst.shiftCode = shiftCode;
            inst.shiftName = shiftName;
            inst.minSlot = minSlot;
            inst.maxSlot = maxSlot;
            inst.isSupervisor = isSupervisor;
            inst.isAssistant = isAssistant;

            if (isFlexible) {
                // قاعدة المساعد والمشرف: ليس لديه جدول تدريب ثابت (جدوله مرن وخالي من خانات الحصص الفارغة)
                // لا تحسب له إلا الحصص المسجلة بالنظام فقط، وتطهير كافة الحصص الفارغة
                if (Array.isArray(inst.fullSchedule)) {
                    inst.fullSchedule = inst.fullSchedule.filter(s => s && (s.sat === 'occupied' || s.sun === 'occupied'));
                    inst.fullSchedule.forEach(s => {
                        if (s.sat !== 'occupied') { s.sat = 'none'; s.origSat = 'none'; }
                        if (s.sun !== 'occupied') { s.sun = 'none'; s.origSun = 'none'; }
                    });
                } else {
                    inst.fullSchedule = [];
                }

                let occ = 0;
                inst.fullSchedule.forEach(s => {
                    if (s.sat === 'occupied') occ++;
                    if (s.sun === 'occupied') occ++;
                });

                inst.occupied = occ;
                inst.capacity = occ;
                inst.empty = 0;
                inst.rate = occ > 0 ? "100.0" : "0.0";
                inst.slotsRows = [];
                if (typeof SDIMasterRoster !== 'undefined') {
                    SDIMasterRoster.pruneSupervisorSchedule(inst);
                }
            } else {
                inst.capacity = capacity;
                const maxNeededSlot = (category === 'HT' || category === 'LB') ? 24 : 20;
                if (!inst.fullSchedule || inst.fullSchedule.length < maxNeededSlot) {
                    inst.fullSchedule = [];
                    for (let s = 1; s <= maxNeededSlot; s++) {
                        inst.fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
                    }
                }
                if (typeof SDIPdfParser !== 'undefined') {
                    inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
                }
            }

            this.selectedInstId = id;
            const roleLabel = isAssistant ? (isAr ? 'مساعد المدرب' : 'Assistant Trainer') : (isSupervisor ? (isAr ? 'المشرف' : 'Supervisor') : (isFem ? (isAr ? 'المدربة' : 'Instructor') : (isAr ? 'المدرب' : 'Instructor')));
            this.showToast(`✅ تم تحديث بيانات وتكويد ${roleLabel} (${shortName}) بنجاح.`);

        } else {
            if (this.instructors.some(i => i.id === id)) {
                alert(`الرقم الوظيفي / الكود (${id}) مسجل بالفعل لمدرب آخر.`);
                return;
            }

            const maxSlotsCount = (category === 'HT' || category === 'LB') ? 24 : 20;
            const fullSchedule = [];
            if (!isFlexible) {
                for (let s = 1; s <= maxSlotsCount; s++) {
                    fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
                }
            }

            let slotsRows = [];
            if (!isFlexible && typeof SDIPdfParser !== 'undefined') {
                slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, category, shift, gender);
            }

            const newInst = {
                id,
                name,
                shortName,
                gender,
                role,
                category,
                vehicleType,
                shift,
                shiftCode,
                shiftName,
                isSupervisor,
                isAssistant,
                capacity: isFlexible ? 0 : capacity,
                occupied: 0,
                empty: isFlexible ? 0 : capacity,
                rate: "0.0",
                minSlot,
                maxSlot,
                note: '',
                slotsRows: isFlexible ? [] : slotsRows,
                fullSchedule
            };

            this.instructors.push(newInst);
            this.selectedInstId = id;
            const roleLabel = isAssistant ? (isAr ? 'مساعد المدرب' : 'Assistant Trainer') : (isSupervisor ? (isAr ? 'المشرف' : 'Supervisor') : (isFem ? (isAr ? 'المدربة' : 'Instructor') : (isAr ? 'المدرب' : 'Instructor')));
            this.showToast(`✅ تم تسجيل وتكويد ${roleLabel} الجديد (${shortName} - ${shiftCode}) بنجاح.`);
        }

        // مزامنة فورية مع سجل الملاك التدريبي المعتمد SDIMasterRoster
        if (typeof SDIMasterRoster !== 'undefined') {
            SDIMasterRoster.registerOrUpdate({
                id,
                name,
                shortName,
                gender,
                role,
                category,
                shift,
                shiftCode,
                approvedCapacity: capacity
            });
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
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
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
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
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
        const isFem = (inst.gender === 'female');

        if (inst.category === 'LMFA' || inst.category === 'LMFM') {
            if (isFem) {
                inst.capacity = 18;
                if (newShift === 'S2') {
                    inst.shiftName = "الفترة المسائية سيدات (11 - 19) [9 حصص | 18 سعة]";
                    inst.shiftCode = `${inst.category}-S2-F`;
                    inst.minSlot = 11;
                    inst.maxSlot = 19;
                } else {
                    inst.shiftName = "الفترة الصباحية سيدات (1 - 9) [9 حصص | 18 سعة]";
                    inst.shiftCode = `${inst.category}-S1-F`;
                    inst.minSlot = 1;
                    inst.maxSlot = 9;
                }
            } else {
                inst.capacity = 20;
                if (newShift === 'S2') {
                    inst.shiftName = "الفترة الثانية (11 - 20) [20 حصة]";
                    inst.shiftCode = `${inst.category}-S2`;
                    inst.minSlot = 11;
                    inst.maxSlot = 20;
                } else {
                    inst.shiftName = "الفترة الأولى (1 - 10) [20 حصة]";
                    inst.shiftCode = `${inst.category}-S1`;
                    inst.minSlot = 1;
                    inst.maxSlot = 10;
                }
            }
        } else if (inst.category === 'HT' || inst.category === 'HB' || inst.category === 'LB') {
            const isHB = (inst.category === 'HB' || inst.category === 'LB');
            const prefix = isHB ? 'HBFM' : 'HTFM';
            const catName = isHB ? 'باص ثقيل (HBFM)' : 'الشاحنة الثقيلة';
            inst.capacity = 24;
            if (newShift === 'S2') {
                inst.shiftName = `الفترة الثانية (${catName}: 13 - 24) [24 حصة]`;
                inst.shiftCode = `${prefix}-S2`;
                inst.minSlot = 13;
                inst.maxSlot = 24;
            } else {
                inst.shiftName = `الفترة الأولى (${catName}: 1 - 12) [24 حصة]`;
                inst.shiftCode = `${prefix}-S1`;
                inst.minSlot = 1;
                inst.maxSlot = 12;
            }
        } else if (inst.category === 'MC') {
            inst.capacity = 26;
            if (newShift === 'S1') {
                inst.shift = 'S1';
                inst.shiftName = "الفترة الأولى صباحي - المركز الرئيسي (1 - 13) [26 حصة]";
                inst.shiftCode = "MC-S1";
                inst.minSlot = 1;
                inst.maxSlot = 13;
            } else if (newShift === 'S2') {
                inst.shift = 'S2';
                inst.shiftName = "الفترة الثانية مسائي - المركز الرئيسي (14 - 26) [26 حصة]";
                inst.shiftCode = "MC-S2";
                inst.minSlot = 14;
                inst.maxSlot = 26;
            } else {
                inst.shift = 'FIX';
                inst.shiftName = "فترة الدراجة النارية الثابتة بالفرع (6 - 17) [26 حصة]";
                inst.shiftCode = "MC-FIX";
                inst.minSlot = 6;
                inst.maxSlot = 17;
            }
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
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

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        const current = slotItem[dayGroup];

        if (current === 'occupied') {
            slotItem[dayGroup] = 'empty';

            // إذا كانت الحصة دبل، تفريغ الحصة التابعة أيضاً
            if (slotItem[detailsKey]?.isDouble && !slotItem[detailsKey]?.isDoublePart2) {
                const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
                if (nextSlot && nextSlot[detailsKey]?.isDoublePart2) {
                    nextSlot[dayGroup] = 'empty';
                    delete nextSlot[detailsKey];
                }
            } else if (slotItem[detailsKey]?.isDoublePart2) {
                // إذا تم تفريغ الحصة التابعة، تحويل الحصة الأصلية إلى عادية
                const prevSlot = inst.fullSchedule.find(s => s.slot === slotNumber - 1);
                if (prevSlot && prevSlot[detailsKey]) {
                    prevSlot[detailsKey].isDouble = false;
                    prevSlot[detailsKey].classType = 'R';
                }
            }

            delete slotItem[detailsKey];
        } else {
            slotItem[dayGroup] = 'occupied';
            slotItem[detailsKey] = {
                location: 'R', // افتراضي شارع
                isDouble: false,
                classType: 'R'
            };
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
        }

        const statusAr = slotItem[dayGroup] === 'occupied' ? 'مشغولة 🔒' : 'فارغة ✨';
        this.syncStateWithServer(`تغيير حصة ${slotNumber} (${dayGroup === 'sat' ? 'السبت' : 'الأحد'}) للمدرب (${inst.shortName || inst.name}) إلى ${statusAr}`);
        this.showToast(`تم تغيير حصة ${slotNumber} للمدرب (${inst.shortName || inst.name}) إلى: ${statusAr}`);
        this.refresh();
    }

    /* ================= تبديل مكان التدريب: ساحة Y أو شارع R ================= */
    toggleSlotLocation(instId, slotNumber, dayGroup) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem || slotItem[dayGroup] !== 'occupied') return;

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        if (!slotItem[detailsKey]) {
            slotItem[detailsKey] = { location: 'R', isDouble: false, classType: 'R' };
        }

        const currentLoc = slotItem[detailsKey].location || 'R';
        const newLoc = (currentLoc === 'Y') ? 'R' : 'Y';
        slotItem[detailsKey].location = newLoc;

        // قاعدة الدراجة النارية: تدريب الشارع (R) يسمح بطالب واحد فقط
        if (inst.category === 'MC' && newLoc === 'R' && slotItem[detailsKey].hasDualStudents) {
            slotItem[detailsKey].hasDualStudents = false;
            delete slotItem[detailsKey].student2Name;
            delete slotItem[detailsKey].student2Id;
            delete slotItem[detailsKey].student2Course;
            this.showToast(this.lang === 'ar' 
                ? '⚠️ تنبيه: تم التحويل إلى شارع (R). تدريب الشارع للدراجة النارية يسمح بطالب واحد فقط، تم إلغاء الطالب الثاني تلقائياً.' 
                : 'Warning: Switched to Road (R). Motorcycle Road allows 1 student only; 2nd student cleared.');
        }

        // إذا كانت حصة مزدوجة، مزامنة مكان الحصة التابعة
        if (slotItem[detailsKey].isDouble && !slotItem[detailsKey].isDoublePart2) {
            const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
            if (nextSlot && nextSlot[detailsKey]) {
                nextSlot[detailsKey].location = newLoc;
            }
        }

        const locNameAr = (newLoc === 'Y') ? '🅿️ ساحة / باركنج (Yard)' : '🛣️ تدريب بالشارع (Road)';
        this.syncStateWithServer(`تغيير مكان تدريب حصة ${slotNumber} (${dayGroup}) للمدرب (${inst.shortName || inst.name}) إلى ${locNameAr}`);
        this.showToast(`تم تغيير مكان التدريب للحصة ${slotNumber} إلى: ${locNameAr}`);
        this.refresh();
    }

    /* ================= تبديل نوع الحصة: عادية R أو مزدوجة D ================= */
    toggleSlotClassType(instId, slotNumber, dayGroup) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem || slotItem[dayGroup] !== 'occupied') return;

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        if (!slotItem[detailsKey]) {
            slotItem[detailsKey] = { location: 'R', isDouble: false, classType: 'R' };
        }

        // قاعدة منع التسلسل: إذا كانت هذه الحصة جزءاً ثانياً لحصة دبل سابقة، يُمنع جعلها دبل إضافي
        if (slotItem[detailsKey].isDoublePart2) {
            this.showToast(this.lang === 'ar'
                ? `⚠️ غير مسموح: الحصة ${slotNumber} هي جزء ثانٍ لحصة مزدوجة بدأت في الحصة ${slotItem[detailsKey].parentSlot || (slotNumber - 1)}. الحصة المزدوجة حصتان فقط وممنوع إعطاء أكثر من حصتين لنفس المتدرب يومياً.`
                : `Warning: Slot ${slotNumber} is Part 2 of a double session. Max 2 slots per student per day allowed.`);
            return;
        }

        const currentlyDouble = !!slotItem[detailsKey].isDouble;

        if (!currentlyDouble) {
            // فحص الحد الأقصى للمتدرب (ممنوع أكثر من حصتين يومياً)
            const sName = slotItem[detailsKey].studentName;
            const sId = slotItem[detailsKey].studentId;
            if (sName || sId) {
                let otherSlotsCount = 0;
                this.instructors.forEach(otherInst => {
                    otherInst.fullSchedule.forEach(otherSlot => {
                        if (otherInst.id === instId && (otherSlot.slot === slotNumber || otherSlot.slot === slotNumber + 1)) return;
                        if (otherSlot[dayGroup] === 'occupied') {
                            const d = (dayGroup === 'sat') ? otherSlot.satDetails : otherSlot.sunDetails;
                            if (d) {
                                const matchId = sId && d.studentId && d.studentId === sId;
                                const clean1 = sName ? sName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim().toLowerCase() : '';
                                const clean2 = d.studentName ? d.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim().toLowerCase() : '';
                                if (matchId || (clean1 && clean2 && clean1 === clean2)) otherSlotsCount++;
                            }
                        }
                    });
                });

                if (otherSlotsCount > 0) {
                    alert(this.lang === 'ar'
                        ? `⚠️ تنبيه رسمي: غير مسموح بتحويل هذه الحصة إلى مزدوجة!\nالمتدرب (${sName || sId}) لديه بالفعل ${otherSlotsCount} حصة مسجلة في هذا اليوم.\nوفق لوائح معهد الشارقة للسياقة، يُمنع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً.`
                        : `Warning: Student already has ${otherSlotsCount} slots on this day. Max 2 classes per student per day.`);
                    return;
                }
            }

            // تحويل إلى حصة مزدوجة (حصتان فقط متتاليتان: slotNumber و slotNumber + 1)
            slotItem[detailsKey].isDouble = true;
            slotItem[detailsKey].classType = 'D';
            slotItem[detailsKey].isDoublePart1 = true;
            slotItem[detailsKey].isDoublePart2 = false;

            const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
            if (nextSlot) {
                nextSlot[dayGroup] = 'occupied';
                nextSlot[detailsKey] = {
                    studentName: slotItem[detailsKey].studentName ? `(حصة مزدوجة تابعة) ${slotItem[detailsKey].studentName}` : 'حصة مزدوجة تابعة',
                    studentId: slotItem[detailsKey].studentId || '',
                    course: slotItem[detailsKey].course || inst.category,
                    location: slotItem[detailsKey].location || 'R',
                    isDouble: true,
                    classType: 'D',
                    isDoublePart1: false,
                    isDoublePart2: true,
                    parentSlot: slotNumber
                };
            }

            if (typeof SDIPdfParser !== 'undefined') {
                inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
            }

            this.syncStateWithServer(`تحويل حصة ${slotNumber} للمدرب (${inst.shortName || inst.name}) إلى حصة مزدوجة (حصتان فقط)`);
            this.showToast(`⚡ تم تفعيل الحصة المزدوجة (Double Class): حجز الحصة ${slotNumber} والحصة ${slotNumber + 1} متتاليتين فقط (حصتان لنفس الطالب).`);
        } else {
            // إعادة إلى حصة عادية وتفريغ الحصة التابعة إن وجدت
            slotItem[detailsKey].isDouble = false;
            slotItem[detailsKey].classType = 'R';
            slotItem[detailsKey].isDoublePart1 = false;
            slotItem[detailsKey].isDoublePart2 = false;

            const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
            if (nextSlot && nextSlot[detailsKey]?.isDoublePart2 && nextSlot[detailsKey]?.parentSlot === slotNumber) {
                nextSlot[dayGroup] = 'empty';
                delete nextSlot[detailsKey];
            }

            if (typeof SDIPdfParser !== 'undefined') {
                inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
            }

            this.syncStateWithServer(`إعادة حصة ${slotNumber} للمدرب (${inst.shortName || inst.name}) إلى حصة عادية`);
            this.showToast(`تمت إعادة الحصة ${slotNumber} إلى حصة عادية (Regular) وتفريغ الحصة التابعة.`);
        }

        this.refresh();
    }

    /* ================= تبديل حالة التثبيت اليدوي (Fixed): مشغول - Fixed ================= */
    toggleSlotFixed(instId, slotNumber, dayGroup) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem || slotItem[dayGroup] !== 'occupied') return;

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        if (!slotItem[detailsKey]) {
            slotItem[detailsKey] = { location: 'R', isDouble: false, classType: 'R' };
        }

        slotItem[detailsKey].isFixed = !slotItem[detailsKey].isFixed;
        slotItem[detailsKey].note = slotItem[detailsKey].isFixed ? 'Fixed' : '';

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
        }

        const newStatus = slotItem[detailsKey].isFixed 
            ? (this.lang === 'ar' ? 'مشغول - Fixed 📌 (مثبتة يدوياً)' : 'Occupied - Fixed 📌') 
            : (this.lang === 'ar' ? 'مشغول عادي 🔒' : 'Regular Occupied 🔒');

        this.syncStateWithServer(`تغيير حالة تثبيت حصة ${slotNumber} (${dayGroup}) للمدرب (${inst.shortName || inst.name}) إلى ${newStatus}`);
        this.showToast(this.lang === 'ar' 
            ? `تم تحديث الحصة ${slotNumber} إلى: ${newStatus}` 
            : `Slot ${slotNumber} updated to: ${newStatus}`);
        this.refresh();
    }

    /* ================= معالجة تغيير نوع الحصة في النافذة المنبثقة ================= */
    handleSlotModalTypeChange() {
        const typeEl = document.getElementById('slot-modal-type');
        const noticeEl = document.getElementById('double-class-notice');
        if (typeEl && noticeEl) {
            noticeEl.style.display = (typeEl.value === 'D') ? 'block' : 'none';
        }
    }

    /* ================= معالجة تغيير مكان التدريب في النافذة المنبثقة ================= */
    handleSlotModalLocationChange() {
        const instId = document.getElementById('slot-modal-inst-id').value;
        const inst = this.instructors.find(i => i.id === instId);
        const loc = document.getElementById('slot-modal-location').value;
        const mcSection = document.getElementById('slot-modal-mc-second-student-section');

        if (inst && inst.category === 'MC') {
            if (loc === 'Y') {
                if (mcSection) mcSection.style.display = 'block';
            } else {
                if (mcSection) mcSection.style.display = 'none';
                const s2Name = document.getElementById('slot-modal-student2-name')?.value.trim();
                if (s2Name) {
                    if (document.getElementById('slot-modal-student2-name')) document.getElementById('slot-modal-student2-name').value = '';
                    if (document.getElementById('slot-modal-student2-id')) document.getElementById('slot-modal-student2-id').value = '';
                    if (document.getElementById('slot-modal-student2-course')) document.getElementById('slot-modal-student2-course').value = '';
                    this.showToast(this.lang === 'ar' 
                        ? '⚠️ تنبيه: تدريب الشارع (Road) للدراجة النارية يسمح بطالب واحد فقط. تم إلغاء الطالب الثاني.' 
                        : 'Warning: Motorcycle Road allows only 1 student. 2nd student cleared.');
                }
            }
        } else {
            if (mcSection) mcSection.style.display = 'none';
        }
    }

    /* ================= مؤشر تفاصيل الطالب التفاعلي اللحظي (Hover Tooltip) ================= */
    showSlotTooltip(e, el) {
        if (!el) return;
        let tooltip = document.getElementById('sdi-global-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'sdi-global-tooltip';
            tooltip.className = 'sdi-floating-tooltip';
            document.body.appendChild(tooltip);
        }

        let sName = el.dataset.studentName || '';
        let sId = el.dataset.studentId || '';
        let s2Name = el.dataset.student2Name || '';
        let s2Id = el.dataset.student2Id || '';
        let course = el.dataset.course || '';
        let loc = el.dataset.location || 'R';
        let isFixed = el.dataset.isFixed === '1';
        let hasDual = el.dataset.hasDual === '1';
        const isAr = this.lang === 'ar';

        // محاولة الاستخراج اللحظي من المدرب إذا لم تكن البيانات مسجلة على الزر
        if ((!sName && !sId) && el.dataset.instId && el.dataset.slot) {
            const instId = el.dataset.instId;
            const slotNum = parseInt(el.dataset.slot, 10);
            const dayKey = el.dataset.day || 'sat';
            const inst = (this.instructors || []).find(i => String(i.id).trim() === String(instId).trim());
            if (inst && Array.isArray(inst.fullSchedule)) {
                const sObj = inst.fullSchedule.find(s => s.slot === slotNum);
                if (sObj) {
                    const d = (dayKey === 'sat') ? sObj.satDetails : sObj.sunDetails;
                    if (d && (d.studentName || d.studentId)) {
                        sName = d.studentName || '';
                        sId = d.studentId || '';
                        s2Name = d.student2Name || '';
                        s2Id = d.student2Id || '';
                        course = d.course || course;
                        loc = d.location || loc;
                        isFixed = !!d.isFixed;
                        hasDual = !!d.hasDualStudents;
                    }
                }
            }
        }

        const headerTitle = isFixed 
            ? (isAr ? '📌 مشغول - Fixed (مثبتة بالخطة)' : '📌 Occupied - Fixed') 
            : (isAr ? '🔒 حصة مشغولة' : '🔒 Occupied Slot');

        const locText = (loc === 'Y') 
            ? (isAr ? '🅿️ ساحة (Yard)' : '🅿️ Yard') 
            : (isAr ? '🛣️ شارع (Road)' : '🛣️ Road');

        let bodyHtml = '';
        if (hasDual && s2Name) {
            bodyHtml = `
                <div class="sdi-tooltip-student">
                    <div class="student-line">
                        <span class="label">👤 ${isAr ? 'طالب 1:' : 'Student 1:'}</span>
                        <strong class="name">${sName || '-'}</strong>
                        <span class="reg-id">🆔 ${sId || '-'}</span>
                    </div>
                    <div class="student-line student2">
                        <span class="label">👥 ${isAr ? 'طالب 2:' : 'Student 2:'}</span>
                        <strong class="name">${s2Name}</strong>
                        <span class="reg-id">🆔 ${s2Id || '-'}</span>
                    </div>
                    <div class="dual-note">👥 ${isAr ? 'دمج طالبين بساحة الدراجة النارية (مسموح)' : 'Dual students allowed in MC Yard'}</div>
                </div>
            `;
        } else {
            bodyHtml = `
                <div class="sdi-tooltip-student">
                    <div class="student-line">
                        <span class="label">👤 ${isAr ? 'اسم الطالب:' : 'Student Name:'}</span>
                        <strong class="name">${sName || (isAr ? 'غير مسجل' : 'N/A')}</strong>
                    </div>
                    <div class="student-line">
                        <span class="label">🆔 ${isAr ? 'رقم التسجيل / القيد:' : 'Registration No:'}</span>
                        <span class="reg-id">${sId ? `#${sId}` : (isAr ? 'غير مسجل' : 'N/A')}</span>
                    </div>
                </div>
            `;
        }

        tooltip.innerHTML = `
            <div class="sdi-tooltip-header">
                <span class="sdi-tooltip-title">${headerTitle}</span>
                <span class="sdi-tooltip-pill ${loc === 'Y' ? 'yard' : 'road'}">${locText}</span>
            </div>
            ${bodyHtml}
            <div class="sdi-tooltip-meta">
                <span>${isAr ? 'كود الدورة:' : 'Course:'} <strong>${course || '-'}</strong></span>
                ${isFixed ? `<span class="fixed-tag">📌 Fixed</span>` : ''}
            </div>
        `;

        tooltip.style.right = 'auto';
        tooltip.style.bottom = 'auto';
        tooltip.style.display = 'block';
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
        this.moveSlotTooltip(e);
    }

    moveSlotTooltip(e) {
        const tooltip = document.getElementById('sdi-global-tooltip');
        if (!tooltip || tooltip.style.display === 'none') return;

        const offset = 14;
        let x = e.clientX + offset;
        let y = e.clientY + offset;

        const tooltipWidth = tooltip.offsetWidth || 270;
        const tooltipHeight = tooltip.offsetHeight || 120;

        if (x + tooltipWidth > window.innerWidth - 10) {
            x = e.clientX - tooltipWidth - offset;
        }
        if (y + tooltipHeight > window.innerHeight - 10) {
            y = e.clientY - tooltipHeight - offset;
        }

        tooltip.style.left = `${Math.max(10, x)}px`;
        tooltip.style.top = `${Math.max(10, y)}px`;
    }

    hideSlotTooltip() {
        const tooltip = document.getElementById('sdi-global-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.style.visibility = 'hidden';
        }
    }

    /* ================= نافذة تعديل تفاصيل الحصة ================= */
    openSlotModal(instId, slotNumber, dayGroup) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem) return;

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        const details = slotItem[detailsKey] || {};

        document.getElementById('slot-modal-inst-id').value = instId;
        document.getElementById('slot-modal-slot-num').value = slotNumber;
        document.getElementById('slot-modal-day-key').value = dayGroup;

        const dayName = (dayGroup === 'sat') ? 'السبت - الإثنين - الأربعاء' : 'الأحد - الثلاثاء - الخميس';
        const sub = document.getElementById('slot-modal-subtitle');
        if (sub) {
            let subHtml = `المدرب: <strong>${inst.name}</strong> | الفئة: <strong>${inst.category}</strong> | الحصة ${slotNumber} (${dayName})`;
            if (details.isDoublePart2) {
                subHtml += `<br><span style="color:#b45309; font-weight:700;">⚠️ هذه الحصة جزء ثانٍ لحصة مزدوجة تابعة للحصة #${details.parentSlot || (slotNumber - 1)}. الحصص المزدوجة حصتان فقط وممنوع تمديدها.</span>`;
            }
            sub.innerHTML = subHtml;
        }

        document.getElementById('slot-modal-student-name').value = details.studentName || '';
        document.getElementById('slot-modal-student-id').value = details.studentId || '';
        document.getElementById('slot-modal-course').value = details.course || (inst.category === 'MC' ? 'MCFM15R' : (inst.category + '30R'));
        
        const locVal = details.location || 'R';
        document.getElementById('slot-modal-location').value = locVal;

        const typeSelect = document.getElementById('slot-modal-type');
        const optD = typeSelect ? typeSelect.querySelector('option[value="D"]') : null;
        if (optD) {
            if (details.isDoublePart2) {
                optD.disabled = true;
                optD.title = 'ممنوع تمديد الحصة المزدوجة لأكثر من حصتين';
            } else {
                optD.disabled = false;
                optD.title = '';
            }
        }
        if (typeSelect) typeSelect.value = details.isDouble ? 'D' : 'R';
        this.handleSlotModalTypeChange();

        // تهيئة قسم الطالب الثاني (مسموح به حصراً في ساحة الدراجة النارية Yard - Y)
        const mcSection = document.getElementById('slot-modal-mc-second-student-section');
        const s2NameInput = document.getElementById('slot-modal-student2-name');
        const s2IdInput = document.getElementById('slot-modal-student2-id');
        const s2CourseInput = document.getElementById('slot-modal-student2-course');

        if (s2NameInput) s2NameInput.value = details.student2Name || '';
        if (s2IdInput) s2IdInput.value = details.student2Id || '';
        if (s2CourseInput) s2CourseInput.value = details.student2Course || 'MCFM15R';

        if (mcSection) {
            if (inst.category === 'MC' && locVal === 'Y') {
                mcSection.style.display = 'block';
            } else {
                mcSection.style.display = 'none';
            }
        }

        const fixedEl = document.getElementById('slot-modal-fixed');
        if (fixedEl) fixedEl.checked = !!details.isFixed;

        const modal = document.getElementById('slot-details-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeSlotModal() {
        const modal = document.getElementById('slot-details-modal');
        if (modal) modal.style.display = 'none';
    }

    saveSlotModal() {
        const instId = document.getElementById('slot-modal-inst-id').value;
        const slotNumber = parseInt(document.getElementById('slot-modal-slot-num').value, 10);
        const dayGroup = document.getElementById('slot-modal-day-key').value;

        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        const slotItem = inst.fullSchedule.find(s => s.slot === slotNumber);
        if (!slotItem) return;

        const detailsKey = (dayGroup === 'sat') ? 'satDetails' : 'sunDetails';
        const studentName = document.getElementById('slot-modal-student-name').value.trim();
        const studentId = document.getElementById('slot-modal-student-id').value.trim();
        const course = document.getElementById('slot-modal-course').value.trim().toUpperCase() || (inst.category === 'MC' ? 'MCFM15R' : 'LMFA30R');
        const location = document.getElementById('slot-modal-location').value;
        const classType = document.getElementById('slot-modal-type').value;
        const isDouble = (classType === 'D' || course.endsWith('D'));

        // فحص منع تمديد الحصة التابعة (Part 2) إلى دبل إضافي
        if (slotItem[detailsKey]?.isDoublePart2 && isDouble) {
            alert(this.lang === 'ar'
                ? '⚠️ غير مسموح: هذه الحصة هي جزء ثانٍ لحصة مزدوجة سابقة. الحصة المزدوجة حصتان فقط وممنوع تمديدها لحصة ثالثة.'
                : 'Warning: This slot is Part 2 of a double class. Extending beyond 2 slots is forbidden.');
            return;
        }

        // قاعدة التحقق من الحد الأقصى للمتدرب الواحد: ممنوع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً
        if (studentName || studentId) {
            let otherBookedSlots = 0;
            this.instructors.forEach(otherInst => {
                otherInst.fullSchedule.forEach(otherSlot => {
                    // استبعاد الحصة الحالية والحصة التابعة المباشرة لها
                    if (otherInst.id === instId && (otherSlot.slot === slotNumber || (isDouble && otherSlot.slot === slotNumber + 1))) {
                        return;
                    }
                    if (otherSlot[dayGroup] === 'occupied') {
                        const d = (dayGroup === 'sat') ? otherSlot.satDetails : otherSlot.sunDetails;
                        if (d) {
                            const matchId = studentId && d.studentId && d.studentId === studentId;
                            const clean1 = studentName ? studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim().toLowerCase() : '';
                            const clean2 = d.studentName ? d.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim().toLowerCase() : '';
                            if (matchId || (clean1 && clean2 && clean1 === clean2)) {
                                otherBookedSlots++;
                            }
                        }
                    }
                });
            });

            const slotsToOccupy = isDouble ? 2 : 1;
            if (otherBookedSlots + slotsToOccupy > 2) {
                alert(this.lang === 'ar'
                    ? `⚠️ تنبيه رسمي: غير مسموح بحجز هذه الحصة للمتدرب!\n\nالمتدرب (${studentName || studentId}) لديه بالفعل ${otherBookedSlots} حصة مسجلة في هذا اليوم (${dayGroup === 'sat' ? 'السبت - الإثنين - الأربعاء' : 'الأحد - الثلاثاء - الخميس'}).\n\nوفق لوائح معهد الشارقة للسياقة، يُمنع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً.`
                    : `Warning: Student already has ${otherBookedSlots} slots on this day. Max 2 slots per student per day allowed.`);
                return;
            }
        }

        const fixedEl = document.getElementById('slot-modal-fixed');
        const isFixed = fixedEl ? fixedEl.checked : false;

        // قراءة بيانات الطالب الثاني (خاصة بساحة الدراجة النارية Y فقط)
        const student2Name = document.getElementById('slot-modal-student2-name')?.value.trim() || '';
        const student2Id = document.getElementById('slot-modal-student2-id')?.value.trim() || '';
        const student2Course = document.getElementById('slot-modal-student2-course')?.value.trim().toUpperCase() || 'MCFM15R';
        const hasDualStudents = (inst.category === 'MC' && location === 'Y' && !!student2Name);

        // إذا كانت الحصة دبل سابقاً وتم تحويلها الآن إلى عادية (Regular)، تفريغ الحصة التابعة المرتبطة بها
        const wasDoublePart1 = !!slotItem[detailsKey]?.isDouble && !slotItem[detailsKey]?.isDoublePart2;
        if (wasDoublePart1 && !isDouble) {
            const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
            if (nextSlot && nextSlot[detailsKey]?.isDoublePart2 && nextSlot[detailsKey]?.parentSlot === slotNumber) {
                nextSlot[dayGroup] = 'empty';
                delete nextSlot[detailsKey];
            }
        }

        slotItem[dayGroup] = 'occupied';
        slotItem[detailsKey] = {
            studentName: studentName,
            studentId: studentId,
            course: course,
            location: location,
            isDouble: isDouble,
            classType: isDouble ? 'D' : 'R',
            isDoublePart1: isDouble,
            isDoublePart2: false,
            isFixed: isFixed,
            note: isFixed ? 'Fixed' : '',
            hasDualStudents: hasDualStudents,
            student2Name: hasDualStudents ? student2Name : '',
            student2Id: hasDualStudents ? student2Id : '',
            student2Course: hasDualStudents ? student2Course : ''
        };

        // إذا تم تحديد حصة مزدوجة، حجز الحصة التالية تلقائياً (حصتان متتاليتان فقط: slotNumber و slotNumber + 1)
        if (isDouble) {
            const nextSlot = inst.fullSchedule.find(s => s.slot === slotNumber + 1);
            if (nextSlot) {
                nextSlot[dayGroup] = 'occupied';
                nextSlot[detailsKey] = {
                    studentName: studentName ? `(حصة مزدوجة تابعة) ${studentName}` : 'حصة مزدوجة تابعة',
                    studentId: studentId,
                    course: course,
                    location: location,
                    isDouble: true,
                    classType: 'D',
                    isDoublePart1: false,
                    isDoublePart2: true,
                    isFixed: isFixed,
                    note: isFixed ? 'Fixed' : '',
                    parentSlot: slotNumber
                };
            }
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
        }

        this.closeSlotModal();
        this.syncStateWithServer(`تحديث بيانات الحصة ${slotNumber} للمدرب (${inst.shortName || inst.name})`);
        this.showToast(`تم حفظ تفاصيل الحصة ${slotNumber} بنجاح.`);
        this.refresh();
    }

    /* ================= 4. تصيير صفحة إدارة وتكويد فترات المدربين ================= */
    renderCodingManager() {
        const container = document.getElementById('coding-manager-container');
        if (!container) return;

        const isAr = this.lang === 'ar';
        const totalInsts = this.instructors.length;
        const supervisorCount = this.instructors.filter(i => this.isSupervisor(i)).length;
        const assistantCount = this.instructors.filter(i => this.isAssistant(i)).length;
        const femaleCount = this.instructors.filter(i => i.gender === 'female' && !this.isFlexibleRole(i)).length;
        const maleCount = this.instructors.filter(i => !this.isFlexibleRole(i) && (i.gender === 'male' || !i.gender)).length;
        const morningCount = this.instructors.filter(i => !this.isFlexibleRole(i) && (i.shift === 'S1' || i.category === 'MC')).length;
        const eveningCount = this.instructors.filter(i => !this.isFlexibleRole(i) && i.shift === 'S2').length;

        let rowsHtml = '';
        if (totalInsts === 0) {
            rowsHtml = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px 15px; color: #94a3b8; font-size: 13.5px;">
                        ${isAr 
                            ? '✨ تم تصفير كافة المدربين بالكامل (0 مدربين). استخدم النموذج أعلاه لتسجيل وتكويد مدرب جديد أو ارفع ملف التدريب المعتمد.' 
                            : '✨ All instructors cleared (0 instructors). Use the form above to register and code an instructor or upload a schedule file.'}
                    </td>
                </tr>
            `;
        } else {
            this.instructors.forEach((inst) => {
                const isSup = this.isSupervisor(inst);
                const isAst = this.isAssistant(inst);
                const isFlex = this.isFlexibleRole(inst);
                const isFem = (inst.gender === 'female');
                const isMorning = inst.shift === 'S1' || (inst.category === 'MC' && inst.shift !== 'S2');

                let shiftBadge = '';
                if (isSup) {
                    shiftBadge = `<span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">👔 ${isAr ? 'مشرف (تكليف طارئ)' : 'Supervisor (Ad-hoc)'}</span>`;
                } else if (isAst) {
                    shiftBadge = `<span style="background:#f3e8ff; color:#7e22ce; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">🤝 ${isAr ? 'مساعد مدرب (جدول مرن)' : 'Assistant (Flexible)'}</span>`;
                } else if (inst.category === 'MC') {
                    if (inst.shift === 'S2') {
                        shiftBadge = `<span class="shift-badge-evening">🏍️ ${isAr ? 'مسائي إدارة (14-26 | 13 حصة)' : 'HQ Evening (14-26 | 13 slots)'}</span>`;
                    } else if (inst.shift === 'S1') {
                        shiftBadge = `<span class="shift-badge-morning">🏍️ ${isAr ? 'صباحي إدارة (1-13 | 13 حصة)' : 'HQ Morning (1-13 | 13 slots)'}</span>`;
                    } else {
                        shiftBadge = `<span class="shift-badge-morning">🏍️ ${isAr ? 'فترة فرعية (6-17 | 13 حصة)' : 'Branch Shift (6-17 | 13 slots)'}</span>`;
                    }
                } else if (inst.category === 'HB' || inst.category === 'HT' || inst.category === 'LB') {
                    const isBus = (inst.category === 'HB' || inst.category === 'LB');
                    const catLabel = isBus ? (isAr ? 'باص ثقيل' : 'Heavy Bus') : (isAr ? 'شاحنة ثقيلة' : 'Heavy Truck');
                    shiftBadge = inst.shift === 'S2'
                        ? `<span class="shift-badge-evening">🌇 ${isAr ? `مسائي (${catLabel} 13-24 | 12 حصة)` : `Evening (${catLabel} 13-24 | 12 slots)`}</span>`
                        : `<span class="shift-badge-morning">🌅 ${isAr ? `صباحي (${catLabel} 1-12 | 12 حصة)` : `Morning (${catLabel} 1-12 | 12 slots)`}</span>`;
                } else {
                    if (isFem) {
                        shiftBadge = inst.shift === 'S2'
                            ? `<span class="shift-badge-evening">🌇 ${isAr ? 'مسائي سيدات (11-19 | 9 حصص)' : 'Female Evening (11-19 | 9 slots)'}</span>`
                            : `<span class="shift-badge-morning">🌅 ${isAr ? 'صباحي سيدات (1-9 | 9 حصص)' : 'Female Morning (1-9 | 9 slots)'}</span>`;
                    } else {
                        shiftBadge = inst.shift === 'S2'
                            ? `<span class="shift-badge-evening">🌇 ${isAr ? 'مسائي (11-20 | 10 حصص)' : 'Evening (11-20 | 10 slots)'}</span>`
                            : `<span class="shift-badge-morning">🌅 ${isAr ? 'صباحي (1-10 | 10 حصص)' : 'Morning (1-10 | 10 slots)'}</span>`;
                    }
                }

                // شارة الصفة والجنس
                let roleGenderBadge = '';
                if (isSup) {
                    roleGenderBadge = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">👔 ${isAr ? 'مشرف / سوبرفايزر' : 'Supervisor'}</span>`;
                } else if (isAst) {
                    roleGenderBadge = `<span style="background:#f3e8ff; color:#7e22ce; border:1px solid #e9d5ff; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">🤝 ${isAr ? 'مساعد مدرب' : 'Assistant Trainer'}</span>`;
                } else if (isFem) {
                    roleGenderBadge = `<span style="background:#fce7f3; color:#be185d; border:1px solid #fbcfe8; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">👩 ${isAr ? 'مدربة سيدة (9 حصص | 18 سعة)' : 'Female (9 slots | 18 cap)'}</span>`;
                } else {
                    roleGenderBadge = `<span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">👨 ${isAr ? 'مدرب رسمي' : 'Male Instructor'}</span>`;
                }

                const icon = inst.category === 'MC' ? '🏍️' : (inst.category === 'HT' ? '🚛' : ((inst.category === 'HB' || inst.category === 'LB') ? '🚌' : '🚗'));
                
                let shiftActionBtn = '';
                if (isFlex) {
                    shiftActionBtn = `<span style="font-size:11px; color:#7e22ce; font-weight:bold;">${isAr ? 'جدول مرن' : 'Flexible'}</span>`;
                } else if (inst.category === 'MC') {
                    const nextShift = inst.shift === 'FIX' ? 'S1' : (inst.shift === 'S1' ? 'S2' : 'FIX');
                    const nextLabel = inst.shift === 'FIX' ? (isAr ? 'صباحي إدارة' : 'HQ Morning') : (inst.shift === 'S1' ? (isAr ? 'مسائي إدارة' : 'HQ Evening') : (isAr ? 'فرعي' : 'Branch FIX'));
                    shiftActionBtn = `<button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.quickSwitchShift('${inst.id}', '${nextShift}')" title="${isAr ? `تحويل إلى ${nextLabel}` : `Switch to ${nextLabel}`}">🔄 ${nextLabel}</button>`;
                } else {
                    shiftActionBtn = (inst.shift === 'S1'
                        ? `<button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.quickSwitchShift('${inst.id}', 'S2')" title="${isAr ? 'تحويل هذا المدرب للفترة المسائية فورياً' : 'Switch instructor to evening shift'}">${this.t('btnSwitchEvening')}</button>`
                        : `<button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.quickSwitchShift('${inst.id}', 'S1')" title="${isAr ? 'تحويل هذا المدرب للفترة الصباحية فورياً' : 'Switch instructor to morning shift'}">${this.t('btnSwitchMorning')}</button>`);
                }

                // حساب السعة والنطاق المعتمد
                let slotsRangeStr = '';
                if (isFlex) {
                    slotsRangeStr = `<span style="color:#7e22ce; font-weight:700;">${isAr ? 'الحصص المسجلة فقط (جدول مرن | 0 خالية)' : 'Recorded only (Flexible | 0 empty)'}</span>`;
                } else if (inst.category === 'MC') {
                    if (inst.shift === 'S2') {
                        slotsRangeStr = `<span style="color:#166534; font-weight:700;">14 إلى 26 (13 حصة يومياً | 26 سعة)</span>`;
                    } else if (inst.shift === 'S1') {
                        slotsRangeStr = `<span style="color:#166534; font-weight:700;">1 إلى 13 (13 حصة يومياً | 26 سعة)</span>`;
                    } else {
                        slotsRangeStr = `<span style="color:#166534; font-weight:700;">6 إلى 17 (12 حصة يومياً | 24 سعة)</span>`;
                    }
                } else if (inst.category === 'HB' || inst.category === 'HT' || inst.category === 'LB') {
                    slotsRangeStr = inst.shift === 'S2'
                        ? `<span style="color:#166534; font-weight:700;">13 إلى 24 (12 حصة يومياً | 24 سعة)</span>`
                        : `<span style="color:#166534; font-weight:700;">1 إلى 12 (12 حصة يومياً | 24 سعة)</span>`;
                } else {
                    if (isFem) {
                        slotsRangeStr = inst.shift === 'S2'
                            ? `<span style="color:#166534; font-weight:700;">11 إلى 19 (9 حصص يومياً | 18 سعة)</span>`
                            : `<span style="color:#166534; font-weight:700;">1 إلى 9 (9 حصص يومياً | 18 سعة)</span>`;
                    } else {
                        slotsRangeStr = inst.shift === 'S2'
                            ? `<span style="color:#166534; font-weight:700;">11 إلى 20 (10 حصص يومياً | 20 سعة)</span>`
                            : `<span style="color:#166534; font-weight:700;">1 إلى 10 (10 حصص يومياً | 20 سعة)</span>`;
                    }
                }

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
                        <td>${roleGenderBadge}</td>
                        <td><span style="font-size: 12px; color: #475569;">${inst.vehicleType}</span></td>
                        <td>${shiftBadge}</td>
                        <td><span class="smart-code-badge">${inst.shiftCode}</span></td>
                        <td><span style="font-size: 11.5px;">${slotsRangeStr}</span></td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap;">
                                ${shiftActionBtn}
                                <button class="btn btn-outline btn-sm" style="font-size:11px; padding:3px 8px;" onclick="app.populateCodingForm('${inst.id}')" title="${isAr ? 'تعديل بيانات وتكويد هذا المدرب' : 'Edit Instructor'}">
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

                <!-- بطاقات إحصائيات الكادر التدريبي (KPIs) -->
                <div class="summary-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px;">
                    <div class="summary-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; border-right: 4px solid #0284c7;">
                        <span style="font-size: 11.5px; color: #64748b; font-weight: 700;">👥 ${this.t('tab4TotalKpi')}</span>
                        <div style="font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 4px;">${totalInsts}</div>
                        <span style="font-size: 11px; color: #0284c7;">${isAr ? 'إجمالي المدربين والمشرفين' : 'Total staff'}</span>
                    </div>

                    <div class="summary-card" style="background: white; border: 1px solid #f3e8ff; border-radius: 8px; padding: 12px 16px; border-right: 4px solid #9333ea;">
                        <span style="font-size: 11.5px; color: #7e22ce; font-weight: 700;">👔 المشرفون ومساعدو المدربين</span>
                        <div style="font-size: 22px; font-weight: 900; color: #7e22ce; margin-top: 4px;">${supervisorCount + assistantCount}</div>
                        <span style="font-size: 11px; color: #9333ea;">${isAr ? `مشرف: ${supervisorCount} | مساعد: ${assistantCount} (جدول مرن)` : `Sup: ${supervisorCount} | Ast: ${assistantCount} (Flexible)`}</span>
                    </div>

                    <div class="summary-card" style="background: white; border: 1px solid #fbcfe8; border-radius: 8px; padding: 12px 16px; border-right: 4px solid #db2777;">
                        <span style="font-size: 11.5px; color: #9d174d; font-weight: 700;">👩 ${this.t('tab4FemaleKpi')}</span>
                        <div style="font-size: 22px; font-weight: 900; color: #be185d; margin-top: 4px;">${femaleCount}</div>
                        <span style="font-size: 11px; color: #be185d;">${isAr ? '9 حصص يومياً (18 حصة معتمدة)' : '9 slots daily (18 cap)'}</span>
                    </div>

                    <div class="summary-card" style="background: white; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; border-right: 4px solid #0284c7;">
                        <span style="font-size: 11.5px; color: #0369a1; font-weight: 700;">👨 مدربين رسميين (ذكور)</span>
                        <div style="font-size: 22px; font-weight: 900; color: #0284c7; margin-top: 4px;">${maleCount}</div>
                        <span style="font-size: 11px; color: #0284c7;">${isAr ? '10 حصص يومياً (20 حصة معتمدة)' : '10 slots daily (20 cap)'}</span>
                    </div>

                    <div class="summary-card" style="background: white; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; border-right: 4px solid #16a34a;">
                        <span style="font-size: 11.5px; color: #15803d; font-weight: 700;">🌅 وردية صباحية / مسائية</span>
                        <div style="font-size: 18px; font-weight: 900; color: #166534; margin-top: 4px;">${morningCount} ص | ${eveningCount} م</div>
                        <span style="font-size: 11px; color: #15803d;">${isAr ? 'توزيع الورديات الأساسية' : 'Primary shifts distribution'}</span>
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
                            <div class="coding-form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px;">
                                <div class="form-group">
                                    <label for="tab4-inst-name">${this.t('lblInstName')} <span style="color:#ef4444;">*</span></label>
                                    <input type="text" id="tab4-inst-name" class="form-control" placeholder="${isAr ? 'مثال: Maqsood Ali Kachkol Amir' : 'e.g. Maqsood Ali'}" required oninput="app.updateTab4Preview()">
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-id">${this.t('lblInstId')} <span style="color:#ef4444;">*</span></label>
                                    <input type="text" id="tab4-inst-id" class="form-control" placeholder="${isAr ? 'مثال: 102671' : 'e.g. 102671'}" required>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-role">${this.t('lblInstRole')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-role" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="instructor">🚗 مدرب تدريب رسمي (10 حصص خفيفة ذكور / 9 إناث / 12 ثقيل وباص / 13 دراجة)</option>
                                        <option value="assistant">🤝 مساعد مدرب (جدول مرن - الحصص المسجلة فقط | 0 خالية)</option>
                                        <option value="supervisor">👔 مشرف / سوبرفايزر (جدول مرن - الحصص المسجلة فقط | 0 خالية)</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-gender">${this.t('lblInstGender')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-gender" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="male">👨 ذكر (10 حصص للمركبات الخفيفة | 20 سعة)</option>
                                        <option value="female">👩 سيدة / أنثى (9 حصص للمركبات الخفيفة | 18 سعة)</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-category">${this.t('lblInstCategory')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-category" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="LMFM">${isAr ? '🚗 مركبة خفيفة - جير عادي (LMFM - 40 د)' : '🚗 Light Motor - Manual (LMFM - 40m)'}</option>
                                        <option value="LMFA">${isAr ? '🚙 مركبة خفيفة - أوتوماتيك (LMFA - 40 د)' : '🚙 Light Motor - Automatic (LMFA - 40m)'}</option>
                                        <option value="HB">${isAr ? '🚌 باص ثقيل (HBFM - 12 حصة / 30 د)' : '🚌 Heavy Bus (HBFM - 12 slots / 30m)'}</option>
                                        <option value="HT">${isAr ? '🚛 شاحنة ثقيلة (HTFM - 12 حصة / 30 د)' : '🚛 Heavy Truck (HTFM - 12 slots / 30m)'}</option>
                                        <option value="MC">${isAr ? '🏍️ دراجة نارية (MC - 13 حصة / 30 د)' : '🏍️ Motorcycle (MC - 13 slots / 30m)'}</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="tab4-inst-shift">${this.t('lblInstShift')} <span style="color:#ef4444;">*</span></label>
                                    <select id="tab4-inst-shift" class="form-control" onchange="app.updateTab4Preview()">
                                        <option value="S1">${isAr ? '🌅 الفترة الصباحية (الأولى) - خفيف (1-10 ذكور / 1-9 إناث) أو ثقيل/باص (1-12) أو دراجة إدارة (1-13)' : '🌅 Morning Shift (1st) - Light (1-10 M / 1-9 F) | Heavy/Bus (1-12) | MC HQ (1-13)'}</option>
                                        <option value="S2">${isAr ? '🌇 الفترة المسائية (الثانية) - خفيف (11-20 ذكور / 11-19 إناث) أو ثقيل/باص (13-24) أو دراجة إدارة (14-26)' : '🌇 Evening Shift (2nd) - Light (11-20 M / 11-19 F) | Heavy/Bus (13-24) | MC HQ (14-26)'}</option>
                                        <option value="FIX">${isAr ? '⏱️ دراجة نارية - فترة الفرع (6 إلى 17 | 13 حصة معتمدة مدة 30 د)' : '⏱️ Motorcycle - Branch Shift (6 to 17 | 13 slots / 30m)'}</option>
                                        <option value="AST">${isAr ? '🤝 مساعد مدرب (Assistant) - جدول مرن (الحصص المسجلة فقط)' : '🤝 Assistant - Flexible (Trained slots only)'}</option>
                                        <option value="SUP">${isAr ? '👔 مشرف / سوبرفايزر (Supervisor) - جدول مرن (الحصص المسجلة فقط)' : '👔 Supervisor - Flexible (Trained slots only)'}</option>
                                    </select>
                                </div>
                            </div>

                            <!-- شريط المعاينة وزر الحفظ -->
                            <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; flex-wrap: wrap; gap: 10px;">
                                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                    <span style="font-size: 13px; font-weight: 800; color: #166534;">${this.t('lblShiftCodePreview')}</span>
                                    <span id="tab4-preview-code" class="smart-code-badge">LMFM-S1</span>
                                    <span id="tab4-preview-desc" style="font-size: 12.5px; color: #15803d; font-weight: 600;">
                                        ${isAr ? 'الحصص المعتمدة: 1 إلى 10 (10 حصص يومياً | السعة الكلية 20 حصة)' : 'Approved slots: 1 to 10 (10 slots daily | 20 capacity)'}
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
                            <strong style="font-size: 15px; color: var(--text-main);">👥 ${isAr ? 'الكادر التدريبي المسجل' : 'Registered Instructors'} (${totalInsts} ${isAr ? 'مدرب ومساعد ومشرف' : 'instructors, assistants & supervisors'}):</strong>
                            <span style="font-size: 12px; color: #64748b; ${isAr ? 'margin-right: 8px;' : 'margin-left: 8px;'}">(${isAr ? 'خفيف: ذكور 10 حصص (20 سعة) وإناث 9 حصص (18 سعة) | ثقيل وباص 12 حصة (24 سعة) | دراجة 13 حصة (26 سعة) | مساعد ومشرف جدول مرن' : 'Light: Male 10 slots (20 cap), Female 9 slots (18 cap) | Heavy & Bus 12 slots (24 cap) | MC 13 slots (26 cap) | Flexible Ast/Sup'})</span>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span class="shift-badge-morning">🌅 ${isAr ? 'الصباحي' : 'Morning'}: ${morningCount}</span>
                            <span class="shift-badge-evening">🌇 ${isAr ? 'المسائي' : 'Evening'}: ${eveningCount}</span>
                        </div>
                    </div>

                    <table class="coding-table">
                        <thead>
                            <tr>
                                <th style="width: 9%;">${this.t('tab4TableStaffId')}</th>
                                <th style="width: 20%;">${this.t('tab4TableName')}</th>
                                <th style="width: 14%;">${this.t('tab4TableRoleGender')}</th>
                                <th style="width: 12%;">${this.t('tab4TableCat')}</th>
                                <th style="width: 14%;">${this.t('tab4TableShift')}</th>
                                <th style="width: 9%;">${this.t('tab4TableCode')}</th>
                                <th style="width: 13%;">${this.t('tab4TableRange')}</th>
                                <th style="width: 9%; text-align: center;">${this.t('tab4TableActions')}</th>
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
        const roleEl = document.getElementById('tab4-inst-role');
        const genderEl = document.getElementById('tab4-inst-gender');
        const catEl = document.getElementById('tab4-inst-category');
        const shiftEl = document.getElementById('tab4-inst-shift');
        const codeEl = document.getElementById('tab4-preview-code');
        const descEl = document.getElementById('tab4-preview-desc');
        if (!catEl || !shiftEl || !codeEl || !descEl) return;

        const isAr = this.lang === 'ar';
        const role = roleEl ? roleEl.value : 'instructor';
        const gender = genderEl ? genderEl.value : 'male';
        const cat = catEl.value;
        let sh = shiftEl.value;

        if (role === 'supervisor' || sh === 'SUP') {
            shiftEl.value = 'SUP';
            codeEl.innerText = `SUP-${cat}`;
            descEl.innerHTML = isAr
                ? '👔 <strong>مشرف / سوبرفايزر:</strong> جدول مرن ليس لديه سعة ثابتة، تحسب له الحصص المسندة فقط بمعدل إشغال 100% وبدون أي حصص خالية.'
                : '👔 <strong>Supervisor:</strong> Flexible schedule without fixed template; only assigned sessions count at 100% occupancy with zero empty slots.';
            return;
        }

        if (role === 'assistant' || sh === 'AST') {
            shiftEl.value = 'AST';
            codeEl.innerText = `AST-${cat}`;
            descEl.innerHTML = isAr
                ? '🤝 <strong>مساعد مدرب:</strong> جدول مرن ليس لديه سعة ثابتة، يُسجل له عدد الحصص التي يقوم بتدريبها فقط بمعدل إشغال 100% وبدون أي حصص خالية.'
                : '🤝 <strong>Assistant Trainer:</strong> Flexible schedule without fixed template; only trained sessions count at 100% occupancy with zero empty slots.';
            return;
        }

        if (cat === 'MC') {
            if (sh !== 'S1' && sh !== 'S2' && sh !== 'FIX') {
                shiftEl.value = 'FIX';
                sh = 'FIX';
            }
            if (sh === 'S1') {
                codeEl.innerText = 'MC-S1';
                descEl.innerHTML = isAr
                    ? '🏍️ <strong>دراجة نارية (فترة صباحية - الإدارة العليا):</strong> الحصص <strong>1 إلى 13</strong> (13 حصة يومياً | مدة 30 دقيقة | السعة الكلية 26 حصة)'
                    : '🏍️ <strong>Motorcycle (Morning - HQ):</strong> Slots <strong>1 to 13</strong> (13 slots daily | 30 mins | 26 total capacity)';
            } else if (sh === 'S2') {
                codeEl.innerText = 'MC-S2';
                descEl.innerHTML = isAr
                    ? '🏍️ <strong>دراجة نارية (فترة مسائية - الإدارة العليا):</strong> الحصص <strong>14 إلى 26</strong> (13 حصة يومياً | مدة 30 دقيقة | السعة الكلية 26 حصة)'
                    : '🏍️ <strong>Motorcycle (Evening - HQ):</strong> Slots <strong>14 to 26</strong> (13 slots daily | 30 mins | 26 total capacity)';
            } else {
                codeEl.innerText = 'MC-FIX';
                descEl.innerHTML = isAr
                    ? '🏍️ <strong>دراجة نارية (فترة الفرع الثابتة):</strong> الحصص <strong>6 إلى 17</strong> (12 حصة يومياً | مدة 30 دقيقة | السعة الكلية 24 حصة)'
                    : '🏍️ <strong>Motorcycle (Branch Shift):</strong> Slots <strong>6 to 17</strong> (12 slots daily | 30 mins | 24 total capacity)';
            }
        } else if (cat === 'HB' || cat === 'HT' || cat === 'LB') {
            if (sh === 'FIX' || sh === 'SUP' || sh === 'AST') { shiftEl.value = 'S1'; sh = 'S1'; }
            const isBus = (cat === 'HB' || cat === 'LB');
            const prefix = isBus ? 'HBFM' : 'HTFM';
            const catLabel = isBus ? (isAr ? 'باص ثقيل' : 'Heavy Bus') : (isAr ? 'شاحنة ثقيلة' : 'Heavy Truck');
            if (sh === 'S1') {
                codeEl.innerText = `${prefix}-S1`;
                descEl.innerHTML = isAr
                    ? `🚌 <strong>فترة صباحية (${catLabel}):</strong> الحصص <strong>1 إلى 12</strong> (12 حصة يومياً | مدة 30 دقيقة | السعة الكلية 24 حصة)`
                    : `Morning Shift (${catLabel}): Slots <strong>1 to 12</strong> (12 slots daily | 30 mins | 24 capacity)`;
            } else {
                codeEl.innerText = `${prefix}-S2`;
                descEl.innerHTML = isAr
                    ? `🚌 <strong>فترة مسائية (${catLabel}):</strong> الحصص <strong>13 إلى 24</strong> (12 حصة يومياً | مدة 30 دقيقة | السعة الكلية 24 حصة)`
                    : `Evening Shift (${catLabel}): Slots <strong>13 to 24</strong> (12 slots daily | 30 mins | 24 capacity)`;
            }
        } else {
            // المركبات الخفيفة LMFM / LMFA: إناث 9 حصص (18 سعة) وذكور 10 حصص (20 سعة)
            if (sh === 'FIX' || sh === 'SUP' || sh === 'AST') { shiftEl.value = 'S1'; sh = 'S1'; }
            const isFem = (gender === 'female');
            const suffix = isFem ? '-F' : '';

            if (sh === 'S1') {
                codeEl.innerText = `${cat}-S1${suffix}`;
                descEl.innerHTML = isFem
                    ? (isAr
                        ? `👩 <strong>فترة صباحية (مدربة سيدة):</strong> 9 حصص يومياً (الحصص <strong>1 إلى 9</strong> | مدة 40 دقيقة) | السعة الكلية 18 حصة.`
                        : `👩 <strong>Morning Shift (Female):</strong> 9 slots daily (Slots <strong>1 to 9</strong> | 40 mins) | Approved Capacity 18 slots.`)
                    : (isAr
                        ? `👨 <strong>فترة صباحية (مدرب رسمي):</strong> 10 حصص يومياً (الحصص <strong>1 إلى 10</strong> | مدة 40 دقيقة) | السعة الكلية 20 حصة.`
                        : `👨 <strong>Morning Shift (Male):</strong> 10 slots daily (Slots <strong>1 to 10</strong> | 40 mins) | Approved Capacity 20 slots.`);
            } else {
                codeEl.innerText = `${cat}-S2${suffix}`;
                descEl.innerHTML = isFem
                    ? (isAr
                        ? `👩 <strong>فترة مسائية (مدربة سيدة):</strong> 9 حصص يومياً (الحصص <strong>11 إلى 19</strong> | مدة 40 دقيقة) | السعة الكلية 18 حصة.`
                        : `👩 <strong>Evening Shift (Female):</strong> 9 slots daily (Slots <strong>11 to 19</strong> | 40 mins) | Approved Capacity 18 slots.`)
                    : (isAr
                        ? `👨 <strong>فترة مسائية (مدرب رسمي):</strong> 10 حصص يومياً (الحصص <strong>11 إلى 20</strong> | مدة 40 دقيقة) | السعة الكلية 20 حصة.`
                        : `👨 <strong>Evening Shift (Male):</strong> 10 slots daily (Slots <strong>11 to 20</strong> | 40 mins) | Approved Capacity 20 slots.`);
            }
        }
    }

    saveInstructorFromTab4() {
        const name = document.getElementById('tab4-inst-name')?.value.trim();
        const id = document.getElementById('tab4-inst-id')?.value.trim();
        const role = document.getElementById('tab4-inst-role')?.value || 'instructor';
        const gender = document.getElementById('tab4-inst-gender')?.value || 'male';
        const category = document.getElementById('tab4-inst-category')?.value || 'LMFM';
        let shift = document.getElementById('tab4-inst-shift')?.value || 'S1';

        if (!name || !id) {
            alert("يرجى إدخال اسم المدرب والرقم الوظيفي / الكود.");
            return;
        }

        const isAr = this.lang === 'ar';
        const shortName = name.split(' ').slice(0, 2).join(' ');
        const isSupervisor = (role === 'supervisor' || shift === 'SUP');
        const isAssistant = (role === 'assistant' || shift === 'AST');
        const isFlex = isSupervisor || isAssistant;

        if (isSupervisor) shift = 'SUP';
        if (isAssistant) shift = 'AST';

        const isFem = (gender === 'female');
        let shiftCode = '';
        let shiftName = '';
        let minSlot = 1;
        let maxSlot = 10;
        let vehicleType = '';
        let capacity = 20;

        if (isSupervisor) {
            shiftCode = `SUP-${category}`;
            shiftName = isAr ? 'مشرف (Supervisor) - تكليف طارئ' : 'Supervisor - Flexible';
            minSlot = 1;
            maxSlot = (category === 'HT' || category === 'HB' || category === 'LB') ? 24 : (category === 'MC' ? 26 : 20);
            vehicleType = category === 'MC' ? 'دراجة نارية (MC)' : (category === 'HT' ? 'شاحنة ثقيلة (HTFM)' : ((category === 'HB' || category === 'LB') ? 'باص ثقيل (HBFM)' : (category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)')));
            capacity = 0;
        } else if (isAssistant) {
            shiftCode = `AST-${category}`;
            shiftName = isAr ? 'مساعد مدرب (Assistant) - جدول مرن' : 'Assistant Trainer - Flexible';
            minSlot = 1;
            maxSlot = (category === 'HT' || category === 'HB' || category === 'LB') ? 24 : (category === 'MC' ? 26 : 20);
            vehicleType = category === 'MC' ? 'دراجة نارية (MC)' : (category === 'HT' ? 'شاحنة ثقيلة (HTFM)' : ((category === 'HB' || category === 'LB') ? 'باص ثقيل (HBFM)' : (category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)')));
            capacity = 0;
        } else if (category === 'MC') {
            vehicleType = 'دراجة نارية (MC)';
            if (shift === 'S1') {
                shiftCode = 'MC-S1';
                shiftName = isAr ? 'فترة صباحية - إدارة (1 - 13)' : 'HQ Morning (1 - 13)';
                minSlot = 1;
                maxSlot = 13;
                capacity = 26; // 13 حصة يومياً
            } else if (shift === 'S2') {
                shiftCode = 'MC-S2';
                shiftName = isAr ? 'فترة مسائية - إدارة (14 - 26)' : 'HQ Evening (14 - 26)';
                minSlot = 14;
                maxSlot = 26;
                capacity = 26; // 13 حصة يومياً
            } else {
                shift = 'FIX';
                shiftCode = 'MC-FIX';
                shiftName = isAr ? 'فترة الفرع (6 - 17)' : 'Branch Shift (6 - 17)';
                minSlot = 6;
                maxSlot = 17;
                capacity = 24; // 12 حصة يومياً
            }
        } else if (category === 'HT' || category === 'HB' || category === 'LB') {
            const isBus = (category === 'HB' || category === 'LB');
            const prefix = isBus ? 'HBFM' : 'HTFM';
            vehicleType = isBus ? 'باص ثقيل (HBFM)' : 'شاحنة ثقيلة (HTFM)';
            capacity = 24; // 12 حصة يومياً
            if (shift === 'S2') {
                shiftCode = `${prefix}-S2`;
                shiftName = 'الفترة الثانية (13 - 24)';
                minSlot = 13;
                maxSlot = 24;
            } else {
                shiftCode = `${prefix}-S1`;
                shiftName = 'الفترة الأولى (1 - 12)';
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            // المركبات الخفيفة: إناث 9 حصص يومياً (سعة 18)، ذكور 10 حصص يومياً (سعة 20)
            vehicleType = category === 'LMFM' ? 'خفيفة عادي (LMFM)' : 'خفيفة أوتوماتيك (LMFA)';
            const suffix = isFem ? '-F' : '';
            if (isFem) {
                capacity = 18;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2${suffix}`;
                    shiftName = 'الفترة الثانية سيدات (11 - 19) [9 حصص]';
                    minSlot = 11;
                    maxSlot = 19;
                } else {
                    shiftCode = `${category}-S1${suffix}`;
                    shiftName = 'الفترة الأولى سيدات (1 - 9) [9 حصص]';
                    minSlot = 1;
                    maxSlot = 9;
                }
            } else {
                capacity = 20;
                if (shift === 'S2') {
                    shiftCode = `${category}-S2${suffix}`;
                    shiftName = 'الفترة الثانية (11 - 20) [10 حصص]';
                    minSlot = 11;
                    maxSlot = 20;
                } else {
                    shiftCode = `${category}-S1${suffix}`;
                    shiftName = 'الفترة الأولى (1 - 10) [10 حصص]';
                    minSlot = 1;
                    maxSlot = 10;
                }
            }
        }

        const existing = this.instructors.find(i => i.id === id);
        if (existing) {
            existing.name = name;
            existing.shortName = shortName;
            existing.category = category;
            existing.gender = gender;
            existing.role = role;
            existing.vehicleType = vehicleType;
            existing.shift = shift;
            existing.shiftCode = shiftCode;
            existing.shiftName = shiftName;
            existing.minSlot = minSlot;
            existing.maxSlot = maxSlot;
            existing.isSupervisor = isSupervisor;
            existing.isAssistant = isAssistant;
            existing.capacity = isFlex ? 0 : capacity;

            if (isFlex) {
                if (typeof SDIMasterRoster !== 'undefined') {
                    SDIMasterRoster.pruneSupervisorSchedule(existing);
                } else {
                    existing.slotsRows = [];
                    existing.empty = 0;
                }
            } else if (typeof SDIPdfParser !== 'undefined') {
                existing.slotsRows = SDIPdfParser.generateEmptySlotsRows(existing.fullSchedule, existing.category, existing.shift, existing.gender);
            }
            this.selectedInstId = id;
            const roleLabel = isSupervisor ? 'المشرف' : (isAssistant ? 'مساعد المدرب' : (isFem ? 'المدربة' : 'المدرب'));
            this.showToast(`✅ تم تحديث وتكويد ${roleLabel} (${shortName}) بنجاح.`);
        } else {
            const maxSlotsCount = (category === 'MC') ? 26 : ((category === 'HT' || category === 'HB' || category === 'LB') ? 24 : 20);
            const fullSchedule = [];
            for (let s = 1; s <= maxSlotsCount; s++) {
                fullSchedule.push({ slot: s, sat: 'empty', sun: 'empty' });
            }

            let slotsRows = [];
            if (!isFlex && typeof SDIPdfParser !== 'undefined') {
                slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, category, shift, gender);
            }

            const newInst = {
                id,
                name,
                shortName,
                gender,
                role,
                category,
                vehicleType,
                shift,
                shiftCode,
                shiftName,
                isSupervisor,
                isAssistant,
                capacity: isFlex ? 0 : capacity,
                occupied: 0,
                empty: isFlex ? 0 : capacity,
                rate: "0.0",
                minSlot,
                maxSlot,
                note: '',
                slotsRows,
                fullSchedule
            };

            this.instructors.push(newInst);
            this.selectedInstId = id;
            const roleLabel = isSupervisor ? 'المشرف' : (isAssistant ? 'مساعد المدرب' : (isFem ? 'المدربة' : 'المدرب'));
            this.showToast(`✅ تم تسجيل وتكويد ${roleLabel} الجديد (${shortName} - ${shiftCode}) بنجاح.`);
        }

        // مزامنة فورية مع سجل الملاك التدريبي المعتمد SDIMasterRoster
        if (typeof SDIMasterRoster !== 'undefined') {
            SDIMasterRoster.registerOrUpdate({
                id,
                name,
                shortName,
                gender,
                role,
                category,
                shift,
                shiftCode,
                approvedCapacity: capacity
            });
        }

        if (!isFlex) {
            if (shift === 'S1') this.activePeriodFilter = 'morning';
            else if (shift === 'S2') this.activePeriodFilter = 'evening';
        }

        const roleLabel = isSupervisor ? 'المشرف' : (isAssistant ? 'مساعد المدرب' : 'المدرب');
        this.syncStateWithServer(`تسجيل وتكويد ${roleLabel} (${shortName} - ${shiftCode})`);
        this.clearTab4Form();
        this.refresh();
    }

    clearTab4Form() {
        const nameEl = document.getElementById('tab4-inst-name');
        const idEl = document.getElementById('tab4-inst-id');
        const roleEl = document.getElementById('tab4-inst-role');
        const genderEl = document.getElementById('tab4-inst-gender');
        const titleEl = document.getElementById('tab4-form-title');
        if (nameEl) nameEl.value = '';
        if (idEl) idEl.value = '';
        if (roleEl) roleEl.value = 'instructor';
        if (genderEl) genderEl.value = 'male';
        if (titleEl) titleEl.innerText = this.t('prominentFormTitle');
        this.updateTab4Preview();
    }

    populateCodingForm(instId) {
        const inst = this.instructors.find(i => i.id === instId);
        if (!inst) return;

        // تعبئة حقول النموذج في التبويب الرابع
        const nameEl = document.getElementById('tab4-inst-name');
        const idEl = document.getElementById('tab4-inst-id');
        const roleEl = document.getElementById('tab4-inst-role');
        const genderEl = document.getElementById('tab4-inst-gender');
        const catEl = document.getElementById('tab4-inst-category');
        const shiftEl = document.getElementById('tab4-inst-shift');
        const titleEl = document.getElementById('tab4-form-title');

        if (nameEl) nameEl.value = inst.name;
        if (idEl) idEl.value = inst.id;
        
        const isSup = this.isSupervisor(inst);
        const isAst = this.isAssistant(inst);
        if (roleEl) {
            if (isSup) roleEl.value = 'supervisor';
            else if (isAst) roleEl.value = 'assistant';
            else roleEl.value = 'instructor';
        }
        if (genderEl) genderEl.value = (inst.gender === 'female') ? 'female' : 'male';
        if (catEl) catEl.value = (inst.category === 'LB' ? 'HB' : inst.category);
        if (shiftEl) {
            if (isSup) shiftEl.value = 'SUP';
            else if (isAst) shiftEl.value = 'AST';
            else shiftEl.value = inst.shift;
        }

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
            if (targetShift === 'S1') {
                inst.shiftCode = 'MC-S1';
                inst.shiftName = 'فترة صباحية - إدارة (1 - 13)';
                inst.minSlot = 1;
                inst.maxSlot = 13;
                inst.capacity = 26; // 13 حصة يومياً
            } else if (targetShift === 'S2') {
                inst.shiftCode = 'MC-S2';
                inst.shiftName = 'فترة مسائية - إدارة (14 - 26)';
                inst.minSlot = 14;
                inst.maxSlot = 26;
                inst.capacity = 26; // 13 حصة يومياً
            } else {
                inst.shift = 'FIX';
                inst.shiftCode = 'MC-FIX';
                inst.shiftName = 'فترة الفرع (6 - 17)';
                inst.minSlot = 6;
                inst.maxSlot = 17;
                inst.capacity = 24; // 12 حصة يومياً
            }
        } else if (inst.category === 'HB' || inst.category === 'HT' || inst.category === 'LB') {
            const isBus = (inst.category === 'HB' || inst.category === 'LB');
            const prefix = isBus ? 'HBFM' : 'HTFM';
            inst.capacity = 24; // 12 حصة يومياً
            if (targetShift === 'S2') {
                inst.shiftCode = `${prefix}-S2`;
                inst.shiftName = 'الفترة الثانية (13 - 24)';
                inst.minSlot = 13;
                inst.maxSlot = 24;
            } else {
                inst.shiftCode = `${prefix}-S1`;
                inst.shiftName = 'الفترة الأولى (1 - 12)';
                inst.minSlot = 1;
                inst.maxSlot = 12;
            }
        } else {
            // المركبات الخفيفة
            const isFem = (inst.gender === 'female');
            const suffix = isFem ? '-F' : '';
            if (isFem) {
                inst.capacity = 18;
                if (targetShift === 'S2') {
                    inst.shiftCode = `${inst.category}-S2${suffix}`;
                    inst.shiftName = 'الفترة الثانية سيدات (11 - 19) [9 حصص]';
                    inst.minSlot = 11;
                    inst.maxSlot = 19;
                } else {
                    inst.shiftCode = `${inst.category}-S1${suffix}`;
                    inst.shiftName = 'الفترة الأولى سيدات (1 - 9) [9 حصص]';
                    inst.minSlot = 1;
                    inst.maxSlot = 9;
                }
            } else {
                inst.capacity = 20;
                if (targetShift === 'S2') {
                    inst.shiftCode = `${inst.category}-S2${suffix}`;
                    inst.shiftName = 'الفترة الثانية (11 - 20) [10 حصص]';
                    inst.minSlot = 11;
                    inst.maxSlot = 20;
                } else {
                    inst.shiftCode = `${inst.category}-S1${suffix}`;
                    inst.shiftName = 'الفترة الأولى (1 - 10) [10 حصص]';
                    inst.minSlot = 1;
                    inst.maxSlot = 10;
                }
            }
        }

        if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.category, inst.shift, inst.gender);
        }

        const shiftAr = targetShift === 'S1' 
            ? 'الفترة الصباحية' 
            : (targetShift === 'S2' ? 'الفترة المسائية' : 'فترة الفرع');
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

        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('day') || lowerName.includes('plan') || lowerName.includes('خطة') || lowerName.includes('يوم')) {
            return this.handleUploadedDayPlanFile(file);
        }

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
                try {
                    parsedInstructors = await SDIPdfParser.parsePdfFile(file);
                } catch (pdfErr) {
                    // إذا فشل قراءة الإتاحة، فحص ما إذا كان الملف هو خطة اليوم Day Plan
                    if (typeof SDIDayPlanParser !== 'undefined') {
                        if (loadingModal) loadingModal.style.display = 'none';
                        return await this.handleUploadedDayPlanFile(file);
                    }
                    throw pdfErr;
                }
            } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                if (typeof SDIParser === 'undefined') {
                    throw new Error("قارئ ملفات الإكسل غير محمل.");
                }
                const res = await SDIParser.parseFile(file);
                if (res.instructors && res.instructors.length > 0) {
                    parsedInstructors = res.instructors;
                } else {
                    // فحص كخطة يوم في الإكسل
                    if (typeof SDIDayPlanParser !== 'undefined') {
                        if (loadingModal) loadingModal.style.display = 'none';
                        return await this.handleUploadedDayPlanFile(file);
                    }
                    throw new Error(res.message || "لم يتم العثور على جداول تدريب معتمدة في ملف الإكسل.");
                }
            } else {
                throw new Error("يرجى اختيار ملف مدعوم بصيغة PDF أو Excel (.xlsx, .xls, .csv).");
            }

            if (!parsedInstructors || parsedInstructors.length === 0) {
                if (typeof SDIDayPlanParser !== 'undefined') {
                    if (loadingModal) loadingModal.style.display = 'none';
                    return await this.handleUploadedDayPlanFile(file);
                }
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

            if (typeof SDIMasterRoster !== 'undefined') {
                this.instructors.forEach(inst => {
                    const rosterMeta = SDIMasterRoster.lookup(inst.id, inst.name);
                    if (rosterMeta) {
                        if (!inst.gender) inst.gender = rosterMeta.gender;
                        if (!inst.role) inst.role = rosterMeta.role;
                        if (rosterMeta.role === 'supervisor') inst.isSupervisor = true;
                        if (inst.gender === 'female' && (inst.category === 'LMFM' || inst.category === 'LMFA')) {
                            if (inst.shift === 'S1') { inst.minSlot = 1; inst.maxSlot = 9; }
                            else if (inst.shift === 'S2') { inst.minSlot = 11; inst.maxSlot = 19; }
                            inst.capacity = 18;
                        }
                    }
                });
            }

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

            setTimeout(() => {
                const promptMsg = (this.lang === 'ar')
                    ? `📋 هل تود أيضاً رفع ملف خطة اليوم المقابل (Instructor Day Plan) لإجراء المقارنة ورصد الحصص المثبتة يدوياً (Fixed)؟ انقر على زر "رفع خطة اليوم" بالأعلى.`
                    : `📋 Would you like to also upload the Instructor Day Plan to run comparison and detect Fixed manual sessions? Click "Upload Day Plan" above.`;
                this.showToast(promptMsg);
            }, 3500);

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

    /* ================= 5. تصيير لوحة مقارنة خطة اليوم (Instructor Day Plan vs Availability) ================= */
    renderComparisonView() {
        const container = document.getElementById('comparison-view-container');
        if (!container) return;

        const isAr = this.lang === 'ar';

        const dualFileBannerHtml = `
            <div class="dual-file-manager-banner">
                <!-- الملف الأول: جدول الإتاحة المعتمد -->
                <div class="file-card avail-card">
                    <div class="file-card-header">
                        <span class="file-num">1</span>
                        <div>
                            <strong style="color: #09296b; font-size: 14px;">${isAr ? 'جدول الإتاحة المعتمد (Availability)' : 'Instructor Availability'}</strong>
                            <span class="file-sub" style="display: block; font-size: 11px; color: #64748b;">${isAr ? 'الجدول الأسبوعي المعتمد لفترات وحصص المدربين' : 'Official weekly schedule & shifts'}</span>
                        </div>
                    </div>
                    <div class="file-name-pill">📄 ${this.activeFileName}</div>
                    <div class="file-meta">
                        <span>👥 ${this.instructors.length} ${isAr ? 'مدرب مسجل' : 'instructors'}</span>
                        <span>⏱️ ${this.activeFileTime}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('universal-file-input').click()" style="margin-top: 4px;">
                        <span>📤</span> ${isAr ? 'رفع / استبدال جدول الإتاحة' : 'Upload / Replace Availability'}
                    </button>
                </div>

                <!-- رمز الربط والمنطق الذكي -->
                <div class="dual-connector">
                    <span class="connector-icon">⚡</span>
                    <span class="connector-text" style="font-weight: 800; font-size: 11px;">${isAr ? 'المطابقة والمنطق الذكي' : 'Smart Matching & Logic'}</span>
                    <span style="font-size: 10px; color: #64748b;">Fixed • Y / R • Double D</span>
                </div>

                <!-- الملف الثاني: خطة اليوم الفعلية -->
                <div class="file-card dayplan-card">
                    <div class="file-card-header">
                        <span class="file-num">2</span>
                        <div>
                            <strong style="color: #c2410c; font-size: 14px;">${isAr ? 'خطة اليوم الفعلية (Instructor Day Plan)' : 'Instructor Day Plan'}</strong>
                            <span class="file-sub" style="display: block; font-size: 11px; color: #64748b;">${isAr ? 'كشف الحصص اليومية المسجلة وتوزيع الساحة والشارع' : 'Daily sessions, Yard & Road distribution'}</span>
                        </div>
                    </div>
                    <div class="file-name-pill">📋 ${this.dayPlanFileName}</div>
                    <div class="file-meta">
                        <span>🗓️ ${this.dayPlanData?.date ? (isAr ? 'تاريخ الخطة: ' + this.dayPlanData.date : 'Date: ' + this.dayPlanData.date) : (isAr ? 'غير محدد' : 'N/A')}</span>
                        <span>📊 ${this.dayPlanData?.stats?.totalSessions || 0} ${isAr ? 'حصة يومية' : 'sessions'}</span>
                    </div>
                    <button class="btn btn-warning btn-sm" style="background:#f37421; color:white; font-weight:700; margin-top: 4px;" onclick="document.getElementById('dayplan-file-input').click()">
                        <span>📋</span> ${isAr ? 'رفع / استبدال خطة اليوم' : 'Upload / Replace Day Plan'}
                    </button>
                </div>
            </div>
        `;

        if (!this.dayPlanData || !Array.isArray(this.dayPlanData.instructors) || this.dayPlanData.instructors.length === 0) {
            container.innerHTML = `
                ${dualFileBannerHtml}
                <div style="background: var(--bg-surface); border: 2px dashed var(--border-color); border-radius: 12px; padding: 60px 20px; text-align: center; margin-top: 10px;">
                    <div style="font-size: 54px; margin-bottom: 14px;">📋</div>
                    <h3 style="font-size: 19px; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                        ${isAr ? 'لم يتم رفع ملف خطة اليوم (Instructor Day Plan) بعد' : 'No Instructor Day Plan Uploaded Yet'}
                    </h3>
                    <p style="font-size: 14px; color: #64748b; max-width: 620px; margin: 0 auto 24px; line-height: 1.6;">
                        ${isAr 
                            ? 'قم برفع ملف خطة اليوم لمقارنة الحصص الفعلية مع جدول الإتاحة المعتمد، ورصد الحصص المضافة يدوياً (Fixed) التي تسبب تعارضات، وتتبع مكان التدريب: ساحة (Y) أو شارع (R).'
                            : 'Upload the Instructor Day Plan file to match daily sessions against official availability, detect manual bookings causing conflicts, and track Yard (Y) vs Road (R) training distribution.'}
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-warning" style="background:#f37421; color:white; font-weight:700;" onclick="document.getElementById('dayplan-file-input').click()">
                            <span>📋</span> ${this.t('btnUploadDayPlan')}
                        </button>
                        <button class="btn btn-outline" onclick="app.loadDefaultDayPlanSample()">
                            <span>✨</span> ${isAr ? 'تحميل عينة خطة اليوم الرسمية (11/10/2026 - 4 مدربين)' : 'Load Official Sample Day Plan (11/10/2026)'}
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const comparison = SDIComparisonEngine.compare(this.instructors, this.dayPlanData, this.comparisonDayKey);
        const stats = comparison.stats;

        // تحديث عداد الحصص الزائدة في شريط التبويبات العلوي
        const conflictsPill = document.getElementById('comparison-conflicts-pill');
        if (conflictsPill) {
            if (stats.manualExtraSessions > 0) {
                conflictsPill.style.display = 'inline-block';
                conflictsPill.innerText = `${stats.manualExtraSessions} ${isAr ? 'زائدة' : 'extra'}`;
            } else {
                conflictsPill.style.display = 'none';
            }
        }

        // راية تحذيرات وتجاوزات الحد الأقصى للمتدرب (حصتان يومياً)
        let warningsBannerHtml = '';
        if (comparison.warnings && comparison.warnings.length > 0) {
            const warnListItems = comparison.warnings.map(w => `
                <li style="margin-bottom: 8px; display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.5;">
                    <span style="color: #dc2626; font-size: 16px; flex-shrink: 0; line-height: 1;">🚫</span>
                    <span style="color: #7f1d1d;"><strong>${isAr ? w.messageAr : w.messageEn}</strong></span>
                </li>
            `).join('');

            warningsBannerHtml = `
                <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(239,68,68,0.12);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #fecaca; padding-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 26px;">⚠️</span>
                            <div>
                                <strong style="color: #991b1b; font-size: 15px; display: block;">
                                    ${isAr ? `تنبيه ومخالفة لوائح المعهد: تجاوز الحد الأقصى للمتدرب (حصتان يومياً) - [${comparison.warnings.length} مخالفة]` : `SDI Policy Violation: Student Daily Limit Exceeded (2 Classes Max) - [${comparison.warnings.length} warnings]`}
                                </strong>
                                <span style="font-size: 12px; color: #b91c1c;">
                                    ${isAr 
                                        ? 'القاعدة الصارمة: لا يُسمح للمتدرب الواحد بأخذ أكثر من حصتين (2 حصة فقط يومياً) سواء متفرقة أو حصص مزدوجة (D). تم حظر واستبعاد الحصص الزائدة تلقائياً لتحقيق دقة النظام والالتزام بلوائح المعهد.' 
                                        : 'Strict SDI Rule: A student cannot take more than 2 classes per day (individual or double D). Excess slots were blocked automatically to ensure compliance.'}
                                </span>
                            </div>
                        </div>
                        <span style="background: #dc2626; color: white; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 800;">
                            ${comparison.warnings.length} ${isAr ? 'حصة مستبعدة' : 'blocked sessions'}
                        </span>
                    </div>
                    <ul style="margin: 0; padding-${isAr ? 'right' : 'left'}: 10px; list-style-type: none;">
                        ${warnListItems}
                    </ul>
                </div>
            `;
        }

        // كروت المؤشرات العامة للمقارنة
        const kpisHtml = `
            ${dualFileBannerHtml}
            ${warningsBannerHtml}
            <div class="comparison-kpi-grid">
                <div class="comparison-kpi-card">
                    <div class="comparison-kpi-icon" style="background: #eff6ff; color: #1d4ed8;">📋</div>
                    <div>
                        <div class="comparison-kpi-num">${stats.totalPlanSessions}</div>
                        <div class="comparison-kpi-label">${this.t('kpiTotalPlan')}</div>
                    </div>
                </div>

                <div class="comparison-kpi-card">
                    <div class="comparison-kpi-icon" style="background: #ecfdf5; color: #059669;">✅</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #059669;">${stats.matchedSessions}</div>
                        <div class="comparison-kpi-label">${this.t('kpiMatched')}</div>
                    </div>
                </div>

                <div class="comparison-kpi-card" style="border-color: #fdba74; background: #fffaf5;">
                    <div class="comparison-kpi-icon" style="background: #fff7ed; color: #ea580c;">⚠️</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #ea580c;">${stats.manualExtraSessions}</div>
                        <div class="comparison-kpi-label">
                            ${this.t('kpiManualExtra')}
                            <span style="font-size: 10px; color: #c2410c; display: block;">${isAr ? '(خارج جدول الإتاحة)' : '(Outside Availability)'}</span>
                        </div>
                    </div>
                </div>

                <div class="comparison-kpi-card">
                    <div class="comparison-kpi-icon" style="background: #f8fafc; color: #475569;">ℹ️</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #475569;">${stats.notInPlanSessions}</div>
                        <div class="comparison-kpi-label">${this.t('kpiMissingInPlan')}</div>
                    </div>
                </div>

                <div class="comparison-kpi-card">
                    <div class="comparison-kpi-icon" style="background: #fef3c7; color: #b45309;">🅿️</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #b45309;">${stats.yardSessions} <span style="font-size: 13px; font-weight: 600;">(${stats.yardRate}%)</span></div>
                        <div class="comparison-kpi-label">${this.t('kpiYardSessions')}</div>
                    </div>
                </div>

                <div class="comparison-kpi-card">
                    <div class="comparison-kpi-icon" style="background: #e0f2fe; color: #0284c7;">🛣️</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #0284c7;">${stats.roadSessions} <span style="font-size: 13px; font-weight: 600;">(${stats.roadRate}%)</span></div>
                        <div class="comparison-kpi-label">${this.t('kpiRoadSessions')}</div>
                    </div>
                </div>

                ${comparison.warnings && comparison.warnings.length > 0 ? `
                <div class="comparison-kpi-card" style="border-color: #ef4444; background: #fff5f5;">
                    <div class="comparison-kpi-icon" style="background: #fee2e2; color: #dc2626;">🚫</div>
                    <div>
                        <div class="comparison-kpi-num" style="color: #dc2626;">${comparison.warnings.length}</div>
                        <div class="comparison-kpi-label">
                            ${isAr ? 'تجاوز حد الحصتين' : 'Limit Violations'}
                            <span style="font-size: 10px; color: #991b1b; display: block;">${isAr ? '(محظورة ومستبعدة)' : '(Blocked)'}</span>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        // خيارات تصفية المدربين
        let instOptionsHtml = `<option value="all">${isAr ? '🌐 كافة المدربين المشمولين بالخطة' : 'All Instructors in Plan'} (${comparison.instructors.length})</option>`;
        comparison.instructors.forEach(inst => {
            const sel = (this.comparisonInstId === inst.instructorId) ? 'selected' : '';
            instOptionsHtml += `<option value="${inst.instructorId}" ${sel}>${inst.instructorName} (#${inst.instructorId}) - ${inst.stats.totalPlanSessions} ${isAr ? 'حصة' : 'slots'}</option>`;
        });

        // شريط أدوات المقارنة
        const toolbarHtml = `
            <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 12px; font-weight: 800; color: var(--text-secondary);">🔍 ${isAr ? 'تصفية الحصص:' : 'Filter:'}</span>
                    <button class="period-filter-btn ${this.comparisonFilterStatus === 'all' ? 'active' : ''}" onclick="app.setComparisonFilter('all')">
                        ${this.t('filterAllComparison')} (${stats.totalPlanSessions})
                    </button>
                    <button class="period-filter-btn ${this.comparisonFilterStatus === 'extra' ? 'active' : ''}" onclick="app.setComparisonFilter('extra')" style="${stats.manualExtraSessions > 0 ? 'border-color: #f97316; font-weight: 800;' : ''}">
                        ⚠️ ${this.t('filterExtraOnly')} (${stats.manualExtraSessions})
                    </button>
                    <button class="period-filter-btn ${this.comparisonFilterStatus === 'matching' ? 'active' : ''}" onclick="app.setComparisonFilter('matching')">
                        ✅ ${this.t('filterMatchingOnly')} (${stats.matchedSessions})
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 12px; font-weight: 800; color: var(--text-secondary);">${this.t('daySelectLabel')}</label>
                        <select class="filter-select" style="font-size: 12px; padding: 4px 8px;" onchange="app.setComparisonDay(this.value)">
                            <option value="sun" ${comparison.dayKey === 'sun' ? 'selected' : ''}>🗓️ ${isAr ? 'الأحد - الثلاثاء - الخميس (SUN)' : 'Sunday - Tue - Thu'}</option>
                            <option value="sat" ${comparison.dayKey === 'sat' ? 'selected' : ''}>🗓️ ${isAr ? 'السبت - الإثنين - الأربعاء (SAT)' : 'Saturday - Mon - Wed'}</option>
                        </select>
                    </div>

                    <select class="filter-select" style="font-size: 12px; padding: 4px 8px;" onchange="app.setComparisonInstructor(this.value)">
                        ${instOptionsHtml}
                    </select>

                    <button class="btn btn-success btn-sm" onclick="app.applyPlanToSchedule('${this.comparisonInstId}')" title="${isAr ? 'اعتماد الحصص المضافة بالخطة ونقلها لجدول الإتاحة' : 'Apply plan sessions to schedule'}">
                        <span>⚡</span> ${this.t('btnApplyToSchedule')}
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="app.exportComparisonExcel()" title="تصدير جدول المطابقة كـ Excel">
                        <span>📥</span> ${this.t('btnExportComparison')}
                    </button>
                </div>
            </div>
        `;

        // جداول المقارنة التفصيلية لكل مدرب
        let tablesHtml = '';
        const filteredInstructors = (this.comparisonInstId === 'all')
            ? comparison.instructors
            : comparison.instructors.filter(i => i.instructorId === this.comparisonInstId);

        filteredInstructors.forEach(inst => {
            // تصفية حصص المدرب حسب الفلتر المختار
            let visibleSlots = inst.slots;
            if (this.comparisonFilterStatus === 'extra') {
                visibleSlots = inst.slots.filter(s => s.status === 'MANUAL_EXTRA');
            } else if (this.comparisonFilterStatus === 'matching') {
                visibleSlots = inst.slots.filter(s => s.status === 'MATCHING');
            }

            let rowsHtml = '';
            visibleSlots.forEach(s => {
                let rowClass = '';
                if (s.status === 'MANUAL_EXTRA') rowClass = 'row-extra-manual';
                else if (s.status === 'CONFLICT_ROAD_DUAL') rowClass = 'row-conflict-risk';

                const locBadge = (s.location === 'Y')
                    ? `<span class="badge-yard">🅿️ ${this.t('badgeYard')}</span>`
                    : `<span class="badge-road">🛣️ ${this.t('badgeRoad')}</span>`;

                let typeBadge = '';
                if (s.isDoublePart2) {
                    typeBadge = `<span class="badge-double-part2">⚡ ${this.t('badgeDoublePart2')}</span>`;
                } else if (s.isDouble) {
                    typeBadge = `<span class="badge-double">⚡ ${this.t('badgeDouble')}</span>`;
                } else {
                    typeBadge = `<span class="badge-free" style="border:none; color:#475569;">👤 ${this.t('badgeRegular')}</span>`;
                }

                const availStatusBadge = s.isAvailOccupied
                    ? `<span style="color:#059669; font-weight:700;">🔒 ${this.t('badgeOccupied')}</span>`
                    : `<span style="color:#94a3b8;">✨ ${this.t('badgeEmpty')}</span>`;

                const planStatusBadge = s.isPlanOccupied
                    ? `<span style="color:#0284c7; font-weight:700;">🔒 ${this.t('badgeOccupied')}</span>`
                    : `<span style="color:#94a3b8;">✨ ${this.t('badgeEmpty')}</span>`;

                rowsHtml += `
                    <tr class="${rowClass}">
                        <td style="font-weight: 800; color: var(--text-main); font-size: 13px;">
                            ${this.t('slotTitle')} ${s.slot}
                            <span style="font-size: 11px; color: #64748b; display: block; font-weight: 600; direction: ltr;">${s.time}</span>
                        </td>
                        <td>${availStatusBadge}</td>
                        <td>${planStatusBadge}</td>
                        <td style="font-weight: 700; color: #0f172a;">
                            ${s.hasDualStudents && s.student2Name ? `
                                <div style="line-height: 1.35;">
                                    <div>👤 1: ${s.studentName || '-'} ${s.studentId ? `<span style="font-size: 10px; color: #64748b; font-family: monospace;">(#${s.studentId})</span>` : ''}</div>
                                    <div style="color: #15803d; margin-top: 3px;">👥 2: ${s.student2Name} ${s.student2Id ? `<span style="font-size: 10px; color: #166534; font-family: monospace;">(#${s.student2Id})</span>` : ''}</div>
                                    <span class="badge-dual-students" style="display:inline-block; margin-top:3px; font-size:10px; padding: 2px 6px;">👥 ${isAr ? 'دمج طالبين بالساحة (Y)' : '2 Students in Yard (Y)'}</span>
                                </div>
                            ` : `
                                ${s.studentName || '-'}
                                ${s.studentId ? `<span style="font-size: 10.5px; color: #64748b; display: block; font-family: monospace;">#${s.studentId}</span>` : ''}
                            `}
                        </td>
                        <td style="font-family: monospace; font-weight: 800; color: #09296b;">
                            ${s.course || '-'}
                            ${s.hasDualStudents && s.student2Course ? `<div style="font-size: 10.5px; color: #166534; font-weight: 600;">+ ${s.student2Course}</div>` : ''}
                        </td>
                        <td>${locBadge}</td>
                        <td>${typeBadge}</td>
                        <td><span class="${s.badgeClass}">${isAr ? s.statusTextAr : s.statusTextEn}</span></td>
                        <td>
                            ${s.status === 'MANUAL_EXTRA' 
                                ? `<button class="btn btn-outline btn-sm" style="font-size:10.5px; padding: 2px 7px;" onclick="app.applySingleSlotToSchedule('${inst.instructorId}', ${s.slot})">⚡ ${isAr ? 'اعتماد' : 'Apply'}</button>` 
                                : '-'}
                        </td>
                    </tr>
                `;
            });

            if (visibleSlots.length === 0) {
                rowsHtml = `
                    <tr>
                        <td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">
                            ${isAr ? 'لا توجد حصص تطابق التصفية الحالية لهذا المدرب.' : 'No slots match the current filter for this instructor.'}
                        </td>
                    </tr>
                `;
            }

            tablesHtml += `
                <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #09296b, #0c1e42); color: white; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <strong style="font-size: 15px; letter-spacing: 0.2px;">👤 ${inst.instructorName}</strong>
                            <span style="background: rgba(255,255,255,0.15); font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 800;">#${inst.instructorId}</span>
                            <span style="background: #f37421; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 800;">${inst.category} - ${inst.shift}</span>
                        </div>
                        <div style="display: flex; gap: 12px; font-size: 12px; align-items: center;">
                            <span>✅ ${isAr ? 'متطابقة:' : 'Matching:'} <strong>${inst.stats.matched}</strong></span>
                            <span>⚠️ ${isAr ? 'مضافة يدوياً:' : 'Extra:'} <strong style="color: #fdba74;">${inst.stats.manualExtra}</strong></span>
                            <span>🅿️ ${isAr ? 'ساحة:' : 'Yard:'} <strong>${inst.stats.yardCount}</strong></span>
                            <span>🛣️ ${isAr ? 'شارع:' : 'Road:'} <strong>${inst.stats.roadCount}</strong></span>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="comparison-table">
                            <thead>
                                <tr>
                                    <th>${this.t('thSlotAndTime')}</th>
                                    <th>${isAr ? 'جدول الإتاحة' : 'Availability'}</th>
                                    <th>${isAr ? 'خطة اليوم' : 'Day Plan'}</th>
                                    <th>${isAr ? 'اسم الطالب ورقم القيد' : 'Student & ID'}</th>
                                    <th>${isAr ? 'الدورة' : 'Course'}</th>
                                    <th>${isAr ? 'مكان التدريب' : 'Location'}</th>
                                    <th>${isAr ? 'نوع الحصة' : 'Class Type'}</th>
                                    <th>${isAr ? 'حالة المطابقة' : 'Match Result'}</th>
                                    <th>${isAr ? 'إجراء' : 'Action'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = `
            <div class="no-print" style="background: white; padding: 12px 18px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong style="color: #0f172a; font-size: 15px;">🔍 ${this.t('comparisonTitle')}</strong>
                    <div style="font-size: 12px; color: #64748b;">${this.t('comparisonSub')}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('dayplan-file-input').click()">
                        <span>📋</span> ${this.t('btnUploadDayPlan')}
                    </button>
                    <button class="btn btn-success btn-sm" onclick="app.printComparisonReport()">
                        <span>🖨️</span> ${this.t('btnPrintComparison')}
                    </button>
                </div>
            </div>

            ${kpisHtml}
            ${toolbarHtml}
            ${tablesHtml}
        `;
    }

    setComparisonFilter(filterStatus) {
        this.comparisonFilterStatus = filterStatus;
        this.renderComparisonView();
    }

    setComparisonDay(dayKey) {
        this.comparisonDayKey = dayKey;
        this.renderComparisonView();
    }

    setComparisonInstructor(instId) {
        this.comparisonInstId = instId;
        this.renderComparisonView();
    }

    /* ================= اعتماد حصص خطة اليوم ودمجها في جدول الإتاحة ================= */
    applyPlanToSchedule(targetInstId = 'all', isSilent = false) {
        if (!this.dayPlanData || !Array.isArray(this.dayPlanData.instructors)) return;

        const isAr = this.lang === 'ar';
        const targetPlans = (targetInstId === 'all')
            ? this.dayPlanData.instructors
            : this.dayPlanData.instructors.filter(i => i.instructorId === targetInstId);

        let appliedCount = 0;

        targetPlans.forEach(planInst => {
            let inst = this.instructors.find(i => String(i.id).trim() === String(planInst.instructorId).trim());
            if (!inst) {
                // تطبيق توجيه المستخدم: حصر التطبيق بالمدربين المسجلين مسبقاً في الإتاحة وعدم اختراع أي مدربين أشباح
                return;
            }

            // تحديد يوم الخطة لهذا المدرب أو اليوم العام (السبت sat أو الأحد sun)
            const instDate = planInst.date || this.dayPlanData.date;
            const instDayKey = (this.comparisonDayKey === 'auto' && instDate)
                ? SDIComparisonEngine.detectDayKeyFromDate(instDate)
                : ((this.comparisonDayKey === 'auto') ? 'sun' : this.comparisonDayKey);
            const instDetailsKey = (instDayKey === 'sat') ? 'satDetails' : 'sunDetails';

            const isSup = this.isSupervisor(inst);

            planInst.sessions.forEach(session => {
                let slotObj = inst.fullSchedule.find(s => s.slot === session.slot);
                if (!slotObj && isSup) {
                    slotObj = {
                        slot: session.slot,
                        sat: 'none',
                        sun: 'none',
                        origSat: 'none',
                        origSun: 'none'
                    };
                    inst.fullSchedule.push(slotObj);
                    inst.fullSchedule.sort((a, b) => a.slot - b.slot);
                }

                if (slotObj) {
                    // الحفاظ على الحالة الأساسية لجدول الإتاحة الرسمي قبل أي تعديلات
                    if (slotObj.origSat === undefined) slotObj.origSat = slotObj.sat;
                    if (slotObj.origSun === undefined) slotObj.origSun = slotObj.sun;

                    const prevDetails = slotObj[instDetailsKey] || {};
                    const baselineStatus = (instDayKey === 'sat') 
                        ? (slotObj.origSat || slotObj.sat) 
                        : (slotObj.origSun || slotObj.sun);

                    // الحصة تعتبر Fixed إذا كانت فارغة في الإتاحة الرسمية، أو كانت مثبتة مسبقاً، أو معلمة كـ Fixed
                    const wasEmptyInBaseline = (baselineStatus === 'empty' || baselineStatus === 'none') || !!prevDetails.isFixed || !!session.isFixed;

                    slotObj[instDayKey] = 'occupied';
                    slotObj[instDetailsKey] = {
                        studentName: session.studentName,
                        studentId: session.studentId,
                        course: session.course,
                        location: session.location,
                        isDouble: session.isDouble,
                        classType: session.classType,
                        isDoublePart1: session.isDoublePart1,
                        isDoublePart2: session.isDoublePart2,
                        isFixed: wasEmptyInBaseline,
                        note: wasEmptyInBaseline ? 'Fixed' : '',
                        hasDualStudents: !!session.hasDualStudents,
                        student2Name: session.student2Name || '',
                        student2Id: session.student2Id || '',
                        student2Course: session.student2Course || ''
                    };
                    appliedCount++;
                }
            });

            if (isSup) {
                if (typeof SDIMasterRoster !== 'undefined') {
                    SDIMasterRoster.pruneSupervisorSchedule(inst);
                } else {
                    inst.fullSchedule = inst.fullSchedule.filter(s => s.sat === 'occupied' || s.sun === 'occupied');
                    let occ = 0;
                    inst.fullSchedule.forEach(s => {
                        if (s.sat === 'occupied') occ++;
                        if (s.sun === 'occupied') occ++;
                    });
                    inst.occupied = occ;
                    inst.capacity = occ;
                    inst.empty = 0;
                    inst.rate = occ > 0 ? "100.0" : "0.0";
                    inst.slotsRows = [];
                }
            } else if (typeof SDIPdfParser !== 'undefined') {
                inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
            }
        });

        localStorage.setItem('sdi_instructors_custom', JSON.stringify(this.instructors));
        if (!isSilent) {
            this.syncStateWithServer(`اعتماد وتحديث ${appliedCount} حصة من خطة اليوم وتسجيل الحصص اليدوية كـ (مشغول - Fixed)`);
            this.refresh();
            this.showToast(isAr 
                ? `🎉 تم بنجاح اعتماد ودمج ${appliedCount} حصة وتسجيل الحصص الإضافية كـ (مشغول - Fixed) في المحرر التفاعلي!` 
                : `🎉 Successfully applied ${appliedCount} sessions, recording extra manual slots as (Occupied - Fixed)!`);
        }
    }

    applySingleSlotToSchedule(instId, slotNum) {
        if (!this.dayPlanData) return;
        const planInst = this.dayPlanData.instructors.find(i => String(i.instructorId).trim() === String(instId).trim());
        if (!planInst) return;

        const session = planInst.sessions.find(s => s.slot === slotNum);
        if (!session) return;

        const inst = this.instructors.find(i => String(i.id).trim() === String(instId).trim());
        if (!inst) return;

        const isAr = this.lang === 'ar';
        const instDate = planInst.date || this.dayPlanData.date;
        const instDayKey = (this.comparisonDayKey === 'auto' && instDate)
            ? SDIComparisonEngine.detectDayKeyFromDate(instDate)
            : ((this.comparisonDayKey === 'auto') ? 'sun' : this.comparisonDayKey);
        const instDetailsKey = (instDayKey === 'sat') ? 'satDetails' : 'sunDetails';

        const isSup = this.isSupervisor(inst);
        let slotObj = inst.fullSchedule.find(s => s.slot === slotNum);
        if (!slotObj && isSup) {
            slotObj = {
                slot: slotNum,
                sat: 'none',
                sun: 'none',
                origSat: 'none',
                origSun: 'none'
            };
            inst.fullSchedule.push(slotObj);
            inst.fullSchedule.sort((a, b) => a.slot - b.slot);
        }

        if (slotObj) {
            if (slotObj.origSat === undefined) slotObj.origSat = slotObj.sat;
            if (slotObj.origSun === undefined) slotObj.origSun = slotObj.sun;

            const prevDetails = slotObj[instDetailsKey] || {};
            const baselineStatus = (instDayKey === 'sat') 
                ? (slotObj.origSat || slotObj.sat) 
                : (slotObj.origSun || slotObj.sun);
            const wasEmptyInBaseline = (baselineStatus === 'empty' || baselineStatus === 'none') || !!prevDetails.isFixed || !!session.isFixed;

            slotObj[instDayKey] = 'occupied';
            slotObj[instDetailsKey] = {
                studentName: session.studentName,
                studentId: session.studentId,
                course: session.course,
                location: session.location,
                isDouble: session.isDouble,
                classType: session.classType,
                isDoublePart1: session.isDoublePart1,
                isDoublePart2: session.isDoublePart2,
                isFixed: wasEmptyInBaseline,
                note: wasEmptyInBaseline ? 'Fixed' : '',
                hasDualStudents: !!session.hasDualStudents,
                student2Name: session.student2Name || '',
                student2Id: session.student2Id || '',
                student2Course: session.student2Course || ''
            };
        }

        if (isSup) {
            if (typeof SDIMasterRoster !== 'undefined') {
                SDIMasterRoster.pruneSupervisorSchedule(inst);
            } else {
                inst.fullSchedule = inst.fullSchedule.filter(s => s.sat === 'occupied' || s.sun === 'occupied');
                let occ = 0;
                inst.fullSchedule.forEach(s => {
                    if (s.sat === 'occupied') occ++;
                    if (s.sun === 'occupied') occ++;
                });
                inst.occupied = occ;
                inst.capacity = occ;
                inst.empty = 0;
                inst.rate = occ > 0 ? "100.0" : "0.0";
                inst.slotsRows = [];
            }
        } else if (typeof SDIPdfParser !== 'undefined') {
            inst.slotsRows = SDIPdfParser.generateEmptySlotsRows(inst.fullSchedule, inst.minSlot, inst.maxSlot);
        }

        this.syncStateWithServer(`اعتماد الحصة ${slotNum} للمدرب (${inst.shortName || inst.name}) وتسجيلها كـ (مشغول - Fixed)`);
        this.refresh();
        this.showToast(isAr 
            ? `✅ تم اعتماد الحصة ${slotNum} للمدرب (${inst.shortName || inst.name}) وتسجيلها كـ (مشغول - Fixed) بنجاح.` 
            : `✅ Slot ${slotNum} for instructor (${inst.shortName || inst.name}) recorded as (Occupied - Fixed) successfully.`);
    }


    /* ================= تصدير المقارنة كـ Excel ================= */
    exportComparisonExcel() {
        if (!this.dayPlanData) {
            alert("لا توجد بيانات خطة يومية للتصدير.");
            return;
        }
        const comparison = SDIComparisonEngine.compare(this.instructors, this.dayPlanData, this.comparisonDayKey);
        SDIComparisonEngine.exportComparisonToExcel(comparison);
    }

    /* ================= طباعة تقرير المقارنة كـ PDF ================= */
    printComparisonReport() {
        this.switchTab('comparison');
        setTimeout(() => window.print(), 300);
    }

    /* ================= تحميل عينة خطة اليوم الرسمية ================= */
    loadDefaultDayPlanSample() {
        if (typeof DEFAULT_DAY_PLAN_DATA !== 'undefined') {
            this.dayPlanData = JSON.parse(JSON.stringify(DEFAULT_DAY_PLAN_DATA));
            this.dayPlanFileName = this.dayPlanData.fileName;
            this.dayPlanFileTime = "⚡ تم التحميل الفوري";
            localStorage.setItem('sdi_day_plan_data', JSON.stringify(this.dayPlanData));
            localStorage.setItem('sdi_day_plan_filename', this.dayPlanFileName);
            localStorage.setItem('sdi_day_plan_filetime', this.dayPlanFileTime);
            // تطبيق واعتماد الحصص فورياً في الجدول التفاعلي بحيث تسجل الحصص الإضافية كـ (مشغول - Fixed)
            this.applyPlanToSchedule('all', true);

            this.syncStateWithServer("تحميل عينة خطة اليوم المعتمدة وتثبيت الحصص اليدوية (مشغول - Fixed)");
            this.refresh();
            this.showToast(this.lang === 'ar' 
                ? "✅ تم تحميل خطة اليوم وتسجيل الحصص اليدوية كـ (مشغول - Fixed) في المحرر التفاعلي!" 
                : "✅ Loaded official Day Plan and recorded extra slots as (Occupied - Fixed) in interactive editor!");
        }
    }

    /* ================= معالجة رفع ملف أو عدة ملفات لخطة اليوم في نفس الوقت ================= */
    async handleUploadedDayPlanFile(filesInput) {
        if (!filesInput) return;
        const files = (filesInput instanceof File) 
            ? [filesInput] 
            : (Array.isArray(filesInput) ? filesInput : Array.from(filesInput));
        if (files.length === 0) return;

        const isMultiple = files.length > 1;
        const primaryFile = files[0];
        const displayFileName = isMultiple 
            ? `${files.length} ملفات (${files.map(f => f.name).join(' + ')})` 
            : primaryFile.name;

        const loadingModal = document.getElementById('parsing-loading-modal');
        if (loadingModal) {
            document.getElementById('parsing-loading-title').innerText = 
                (this.lang === 'ar') 
                    ? (isMultiple ? `جاري تحليل ${files.length} ملفات لخطة اليوم (Day Plan)...` : 'جاري تحليل ملف خطة اليوم (Day Plan)...')
                    : (isMultiple ? `Parsing ${files.length} Day Plan files...` : 'Parsing Instructor Day Plan...');
            document.getElementById('parsing-loading-desc').innerText = 
                (this.lang === 'ar') 
                    ? `الملفات: ${files.map(f => f.name).join(', ')} (مطابقة الحصص، رصد الحصص الزائدة والساحة/الشارع فورياً)` 
                    : `Files: ${files.map(f => f.name).join(', ')} (Extracting slots, extra manual bookings, and Yard/Road)`;
            loadingModal.style.display = 'flex';
        }

        try {
            let parsedDayPlan;
            if (isMultiple) {
                parsedDayPlan = await SDIDayPlanParser.parseMultipleFiles(files);
            } else {
                const fileName = primaryFile.name.toLowerCase();
                if (fileName.endsWith('.pdf')) {
                    parsedDayPlan = await SDIDayPlanParser.parsePdfFile(primaryFile);
                } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                    parsedDayPlan = await SDIDayPlanParser.parseExcelFile(primaryFile);
                } else {
                    throw new Error("يرجى اختيار ملف PDF أو Excel (.xlsx, .xls, .csv).");
                }
            }

            this.dayPlanData = parsedDayPlan;
            this.dayPlanFileName = displayFileName;
            const now = new Date();
            const timeStr = now.toLocaleTimeString(this.lang === 'ar' ? 'ar-AE' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.dayPlanFileTime = `⚡ ${this.lang === 'ar' ? 'تم التحليل اللحظي:' : 'Real-Time Parsed:'} ${timeStr}`;

            localStorage.setItem('sdi_day_plan_data', JSON.stringify(this.dayPlanData));
            localStorage.setItem('sdi_day_plan_filename', this.dayPlanFileName);
            localStorage.setItem('sdi_day_plan_filetime', this.dayPlanFileTime);

            // اعتماد الحصص وتسجيل الحصص الإضافية يدوياً كـ (مشغول - Fixed) في المحرر التفاعلي
            this.applyPlanToSchedule('all', true);

            const syncDesc = isMultiple
                ? `رفع ${files.length} ملفات خطة اليوم وتثبيت الحصص الإضافية (${parsedDayPlan.instructors.length} مدرب)`
                : `رفع خطة اليوم "${primaryFile.name}" وتثبيت الحصص الإضافية (مشغول - Fixed) (${parsedDayPlan.instructors.length} مدرب)`;
            this.syncStateWithServer(syncDesc);

            this.switchTab('comparison');
            this.refresh();

            if (loadingModal) loadingModal.style.display = 'none';

            const comparison = SDIComparisonEngine.compare(this.instructors, this.dayPlanData);
            const extraCount = comparison.stats?.manualExtraSessions || 0;
            const msg = (this.lang === 'ar')
                ? `🎉 تم تحليل خطة اليوم (${displayFileName}) بنجاح! تم رصد ${parsedDayPlan.stats.totalSessions} حصة (${parsedDayPlan.stats.yardSessions} ساحة / ${parsedDayPlan.stats.roadSessions} شارع)، و ${extraCount} حصة زائدة مضافة يدوياً.`
                : `🎉 Day Plan (${displayFileName}) parsed! Found ${parsedDayPlan.stats.totalSessions} sessions (${parsedDayPlan.stats.yardSessions} Yard / ${parsedDayPlan.stats.roadSessions} Road), and ${extraCount} manual extra sessions.`;
            this.showToast(msg);

            if (parsedDayPlan.hasWarnings && parsedDayPlan.warnings?.length > 0) {
                setTimeout(() => {
                    const warnMsg = (this.lang === 'ar')
                        ? `⚠️ تنبيه رسمي: تم رصد ${parsedDayPlan.warnings.length} مخالفة لتجاوز حد الحصتين للمتدرب، وتم حظر واستبعاد الحصص الزائدة تلقائياً وفق لوائح المعهد.`
                        : `⚠️ Policy Warning: Detected ${parsedDayPlan.warnings.length} student limit violations. Excess sessions blocked automatically.`;
                    this.showToast(warnMsg);
                }, 2200);
            }
        } catch (err) {
            if (loadingModal) loadingModal.style.display = 'none';
            console.error(err);
            alert((this.lang === 'ar' ? 'خطأ أثناء تحليل ملف خطة اليوم: ' : 'Error parsing Day Plan: ') + err.message);
        }
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
        const comparison = document.getElementById('view-comparison');

        if (r1) r1.style.display = (tabId === 'report1') ? 'block' : 'none';
        if (r2) r2.style.display = (tabId === 'report2') ? 'block' : 'none';
        if (interactive) interactive.style.display = (tabId === 'interactive') ? 'block' : 'none';
        if (coding) coding.style.display = (tabId === 'coding') ? 'block' : 'none';
        if (comparison) comparison.style.display = (tabId === 'comparison') ? 'block' : 'none';

        if (tabId === 'comparison') {
            this.renderComparisonView();
        }
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
            ["شاحنة ثقيلة (HTFM)", stats.categories.HT.occ, stats.categories.HT.emp, stats.categories.HT.rate + "%"],
            ["باص ثقيل (HBFM)", (stats.categories.HB || stats.categories.LB) ? (stats.categories.HB || stats.categories.LB).occ : 0, (stats.categories.HB || stats.categories.LB) ? (stats.categories.HB || stats.categories.LB).emp : 0, ((stats.categories.HB || stats.categories.LB) ? (stats.categories.HB || stats.categories.LB).rate : "0.0") + "%"]
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
        // 1. الاستماع لرفع ملف جدول الإتاحة (Availability)
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

        // 2. الاستماع لرفع ملف أو عدة ملفات لخطة اليوم (Instructor Day Plan)
        const dayPlanInput = document.getElementById('dayplan-file-input');
        if (dayPlanInput) {
            dayPlanInput.addEventListener('click', (e) => {
                e.target.value = '';
            });
            dayPlanInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    const files = Array.from(e.target.files);
                    e.target.value = '';
                    this.handleUploadedDayPlanFile(files);
                }
            });
        }

        // 3. دعم السحب والإفلات الكامل (Drag & Drop) في أي مكان بالمتصفح مع توجيه ذكي
        const dropOverlay = document.getElementById('drag-drop-overlay');
        let dragCounter = 0;

        if (dropOverlay) {
            dropOverlay.addEventListener('click', (e) => {
                if (e.target === dropOverlay || e.target.classList.contains('modal-close-btn')) {
                    dropOverlay.style.display = 'none';
                    dragCounter = 0;
                }
            });
        }

        window.addEventListener('dragenter', (e) => {
            // فقط ملفات النظام
            if (e.dataTransfer && e.dataTransfer.types && (Array.from(e.dataTransfer.types).includes('Files') || e.dataTransfer.types.includes('Files'))) {
                e.preventDefault();
                dragCounter++;
                if (dropOverlay) dropOverlay.style.display = 'flex';
            }
        });

        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0 || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                dragCounter = 0;
                if (dropOverlay) dropOverlay.style.display = 'none';
            }
        });

        window.addEventListener('dragover', (e) => {
            if (e.dataTransfer && e.dataTransfer.types && (Array.from(e.dataTransfer.types).includes('Files') || e.dataTransfer.types.includes('Files'))) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            if (dropOverlay) dropOverlay.style.display = 'none';

            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFiles = Array.from(e.dataTransfer.files);
                
                // فصل ملفات خطة اليوم عن ملفات جدول الإتاحة
                const dayPlanFiles = [];
                const scheduleFiles = [];

                droppedFiles.forEach(f => {
                    const lower = f.name.toLowerCase();
                    const isExplicitSchedule = lower.includes('avail') || lower.includes('إتاحة') || lower.includes('جدول');
                    const isExplicitDayPlan = lower.includes('day') || lower.includes('plan') || lower.includes('خطة') || lower.includes('يوم');
                    
                    if (isExplicitDayPlan || (!isExplicitSchedule && this.activeView === 'comparison')) {
                        dayPlanFiles.push(f);
                    } else {
                        scheduleFiles.push(f);
                    }
                });

                if (dayPlanFiles.length > 0) {
                    this.handleUploadedDayPlanFile(dayPlanFiles);
                }
                if (scheduleFiles.length > 0) {
                    this.handleUploadedFile(scheduleFiles[0]);
                }
            }
        });

        // زر Escape لإلغاء أي نافذة أو طبقة منبثقة فوراً
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (dropOverlay) { dropOverlay.style.display = 'none'; dragCounter = 0; }
                const loadingModal = document.getElementById('parsing-loading-modal');
                if (loadingModal) loadingModal.style.display = 'none';
                try { this.closeSlotModal?.(); } catch (err) {}
                try { this.closeInstructorModal?.(); } catch (err) {}
                try { this.closeResetModal?.(); } catch (err) {}
                try { this.closeNetworkShareModal?.(); } catch (err) {}
            }
        });
    }
}

let app;
function initApp() {
    try {
        if (!window.app) {
            window.app = new SDIReportApp();
            app = window.app;
            console.log('✅ [SDI System] Application initialized successfully.');
        }
    } catch (err) {
        console.error('❌ [SDI System] Initialization error:', err);
        try {
            console.warn('[SDI System] Recovering with clean defaults...');
            localStorage.removeItem('sdi_instructors_custom');
            localStorage.removeItem('sdi_day_plan_data');
            window.app = new SDIReportApp();
            app = window.app;
        } catch (retryErr) {
            console.error('[SDI System] Critical recovery failed:', retryErr);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
