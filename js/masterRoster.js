/**
 * سجل الملاك التدريبي المعتمد وقواعد الفئات والورديات - معهد الشارقة للسياقة (SDI)
 * Sharjah Driving Institute LLC - Master Instructors Roster & Shift Rules
 * 
 * القواعد المعتمدة وفق توجيهات الإدارة:
 * 1. المركبات الخفيفة (عادي وأوتوماتيك LMFM & LMFA):
 *    - 10 حصص تدريبية فقط لكل مدرب في كل شيفت (الصباحي: 1-10 | المسائي: 11-20).
 *    - مدة الحصة 40 دقيقة. السعة المعتمدة للشيفت الواحد 10 حصص (والسعة الكلية 20 حصة لجدول يومي السبت والأحد).
 *    - تطبق قاعدة الـ 10 حصص للشيفت على جميع المدربين (ذكور وإناث).
 * 
 * 2. الشاحنات الثقيلة والباصات الصغيرة (HT & LB):
 *    - 12 حصة تدريبية لكل مدرب في كل شيفت (الصباحي: 1-12 | المسائي: 13-24).
 *    - مدة الحصة 30 دقيقة. السعة المعتمدة للشيفت الواحد 12 حصة (والسعة الكلية 24 حصة لجدول يومي السبت والأحد).
 * 
 * 3. الدراجة النارية (MC):
 *    - 13 حصة تدريبية يومياً (فترة العمل تبدأ من الحصة رقم 6 إلى الحصة رقم 17).
 *    - مدة الحصة 30 دقيقة. السعة الكلية 26 حصة لجدول يومي السبت والأحد.
 * 
 * 4. مساعد المدرب والمشرف (الجدول المرن - تكليف مباشر):
 *    - ليس لديه جدول تدريب نظامي ثابت (جدوله خالي تماماً من خانات الحصص الفارغة).
 *    - لا يُسجل له عدد محدد أو حد أقصى من الحصص، بل الحصص التي يقوم بتدريبها فعلياً هي العدد الذي يُسجل له فقط.
 *    - إذا درّب حصتين يُسجل له حصتان، وإذا درّب 3 يُسجل له 3، ولا يُسجل له باقي حصص فارغة.
 *    - السعة = الحصص المنفذة فعلياً، والحصص الخالية صفر دائماً (empty = 0)، ومعدل الإشغال 100%.
 * 
 * تطوير: م/ محمود محمد
 */

const DEFAULT_MASTER_ROSTER = [
    // --- 1. المشرفون ومساعدو المدربين (Supervisors & Assistant Instructors) - جدول مرن بدون حصص فارغة ---
    {
        id: "100101",
        name: "Tariq Al Shamsi",
        shortName: "Tariq Al Shamsi",
        gender: "male",
        role: "supervisor",
        category: "LMFA",
        shift: "SUP",
        shiftCode: "SUP-LMFA",
        approvedCapacity: "مرن / تكليف طارئ",
        dailySlotsLimit: "الحصص المنفذة فقط"
    },
    {
        id: "100102",
        name: "Ibrahim Al Hammadi",
        shortName: "Ibrahim Al Hammadi",
        gender: "male",
        role: "supervisor",
        category: "LMFM",
        shift: "SUP",
        shiftCode: "SUP-LMFM",
        approvedCapacity: "مرن / تكليف طارئ",
        dailySlotsLimit: "الحصص المنفذة فقط"
    },
    {
        id: "180040",
        name: "ASHRAF ALI ASHIQ HUSSAIN",
        shortName: "ASHRAF ALI",
        gender: "male",
        role: "supervisor",
        category: "LMFM",
        shift: "SUP",
        shiftCode: "SUP-LMFM",
        approvedCapacity: "مرن / تكليف طارئ",
        dailySlotsLimit: "الحصص المنفذة فقط"
    },
    {
        id: "100201",
        name: "Hassan Al Blooshi",
        shortName: "Hassan Al Blooshi",
        gender: "male",
        role: "assistant",
        category: "LMFA",
        shift: "AST",
        shiftCode: "AST-LMFA",
        approvedCapacity: "مرن / مساعد مدرب",
        dailySlotsLimit: "الحصص المنفذة فقط"
    },

    // --- 2. مدربات المركبات الخفيفة (10 حصص لكل شيفت) ---
    {
        id: "205101",
        name: "Fatima Al Ali",
        shortName: "Fatima Al Ali",
        gender: "female",
        role: "instructor",
        category: "LMFA",
        shift: "S1",
        shiftCode: "LMFA-S1-F",
        approvedCapacity: 18,
        dailySlotsLimit: 9
    },
    {
        id: "205102",
        name: "Maryam Ahmed Hassan",
        shortName: "Maryam Ahmed",
        gender: "female",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2-F",
        approvedCapacity: 18,
        dailySlotsLimit: 9
    },
    {
        id: "205103",
        name: "Aisha Salem Al Nuaimi",
        shortName: "Aisha Salem",
        gender: "female",
        role: "instructor",
        category: "LMFM",
        shift: "S1",
        shiftCode: "LMFM-S1-F",
        approvedCapacity: 18,
        dailySlotsLimit: 9
    },
    {
        id: "205104",
        name: "Khawla Mohammed Al Zarooni",
        shortName: "Khawla Mohammed",
        gender: "female",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2-F",
        approvedCapacity: 18,
        dailySlotsLimit: 9
    },

    // --- 3. مدربو الشاحنات الثقيلة والباصات الثقيلة (12 حصة لكل شيفت | مدة الحصة 30 دقيقة) ---
    {
        id: "102404",
        name: "Rooh Ullah Noor Muhammad",
        shortName: "Rooh Ullah",
        gender: "male",
        role: "instructor",
        category: "HT",
        shift: "S2",
        shiftCode: "HTFM-S2",
        approvedCapacity: 24,
        dailySlotsLimit: 12
    },
    {
        id: "190207",
        name: "WALI MUHAMMAD NAWAB KHAN",
        shortName: "WALI MUHAMMAD",
        gender: "male",
        role: "instructor",
        category: "HT",
        shift: "S1",
        shiftCode: "HTFM-S1",
        approvedCapacity: 24,
        dailySlotsLimit: 12
    },
    {
        id: "103101",
        name: "Saeed Salem Al Naqbi",
        shortName: "Saeed Salem",
        gender: "male",
        role: "instructor",
        category: "HB",
        shift: "S1",
        shiftCode: "HBFM-S1",
        approvedCapacity: 24,
        dailySlotsLimit: 12
    },

    // --- 4. مدربو الدراجة النارية (فترة العمل 6 إلى 17 | 12 حصة بالفرع أو 13 حصة بالإدارة | مدة الحصة 30 دقيقة) ---
    {
        id: "200275",
        name: "KUNHUMUHAMMED KATTILA VALAPPIL",
        shortName: "KUNHUMUHAMMED",
        gender: "male",
        role: "instructor",
        category: "MC",
        shift: "FIX",
        shiftCode: "MC-FIX",
        approvedCapacity: 24,
        dailySlotsLimit: 12
    },
    {
        id: "200299",
        name: "UMMER KUNNAKKATTU THODI",
        shortName: "UMMER KUNNAKKATTU",
        gender: "male",
        role: "instructor",
        category: "MC",
        shift: "FIX",
        shiftCode: "MC-FIX",
        approvedCapacity: 24,
        dailySlotsLimit: 12
    },

    // --- 5. مدربو المركبات الخفيفة الذكور (10 حصص لكل شيفت | مدة الحصة 40 دقيقة) ---
    {
        id: "102414",
        name: "Muhammad Ayaz Qadir Khan",
        shortName: "Muhammad Ayaz",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S1",
        shiftCode: "LMFM-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "102463",
        name: "Muhammad Junaid Taj Parwar",
        shortName: "Muhammad Junaid",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "102671",
        name: "Maqsood Ali Kachkol Amir",
        shortName: "Maqsood Ali",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S1",
        shiftCode: "LMFM-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "104259",
        name: "Umar Zada Muhammad",
        shortName: "Umar Zada",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S2",
        shiftCode: "LMFM-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "105382",
        name: "Loai Awad Mohamed Sidahmed",
        shortName: "Loai Awad",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "105526",
        name: "Musa Khan Akbar Khan",
        shortName: "Musa Khan",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S2",
        shiftCode: "LMFM-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "105528",
        name: "Faizal Nisham Palakkal",
        shortName: "Faizal Nisham",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S2",
        shiftCode: "LMFM-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "106284",
        name: "Ahmed Mohamed Ahmed Ali",
        shortName: "Ahmed Mohamed",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "106286",
        name: "Mohammed Yasime Kunnathiyil",
        shortName: "Mohammed Yasime",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S2",
        shiftCode: "LMFM-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "180105",
        name: "MUHAMMAD NASER SANAULLAH KHAN",
        shortName: "MUHAMMAD NASER",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S1",
        shiftCode: "LMFA-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "190209",
        name: "ABDUL LATHEEF THRIKKANDIYOORIL",
        shortName: "ABDUL LATHEEF",
        gender: "male",
        role: "instructor",
        category: "LMFM",
        shift: "S1",
        shiftCode: "LMFM-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "200260",
        name: "SAIDALAVI PATHAYA PURAKKAL",
        shortName: "SAIDALAVI PATHAYA",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S2",
        shiftCode: "LMFA-S2",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "200283",
        name: "Mohammed Aref Ahmed Omar",
        shortName: "Mohammed Aref",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S1",
        shiftCode: "LMFA-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    },
    {
        id: "200291",
        name: "SULIMAN ALMAHDI ALFAKI",
        shortName: "SULIMAN ALMAHDI",
        gender: "male",
        role: "instructor",
        category: "LMFA",
        shift: "S1",
        shiftCode: "LMFA-S1",
        approvedCapacity: 20,
        dailySlotsLimit: 10
    }
];

const SDIMasterRoster = {
    _storageKey: 'sdi_master_roster',

    /**
     * جلب سجل الملاك التدريبي الكامل من التخزين المحلي أو الافتراضي
     */
    getRoster() {
        if (typeof localStorage !== 'undefined') {
            try {
                const stored = localStorage.getItem(this._storageKey);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('[SDIMasterRoster] Failed to load stored roster:', e);
            }
        }
        return JSON.parse(JSON.stringify(DEFAULT_MASTER_ROSTER));
    },

    /**
     * حفظ السجل في التخزين المحلي
     */
    saveRoster(roster) {
        if (typeof localStorage !== 'undefined' && Array.isArray(roster)) {
            try {
                localStorage.setItem(this._storageKey, JSON.stringify(roster));
            } catch (e) {
                console.error('[SDIMasterRoster] Failed to save roster:', e);
            }
        }
    },

    /**
     * البحث عن مدرب في السجل بالرقم الوظيفي أو الاسم
     */
    find(idOrName) {
        if (!idOrName) return null;
        const needle = String(idOrName).trim().toLowerCase();
        const roster = this.getRoster();
        return roster.find(item => 
            String(item.id).trim().toLowerCase() === needle ||
            String(item.name).trim().toLowerCase() === needle ||
            String(item.shortName || '').trim().toLowerCase() === needle
        ) || null;
    },

    /**
     * البحث عن مدرب بالرقم الوظيفي أو الاسم معاً
     */
    lookup(id, name) {
        if (id) {
            const byId = this.find(id);
            if (byId) return byId;
        }
        if (name) {
            const byName = this.find(name);
            if (byName) return byName;
        }
        return null;
    },

    /**
     * فحص هل المدرب أنثى / سيدة
     */
    isFemale(instructor) {
        if (!instructor) return false;
        if (instructor.gender === 'female') return true;
        const entry = this.find(instructor.id || instructor.instructorId || instructor.name || instructor.instructorName);
        return entry ? entry.gender === 'female' : false;
    },

    /**
     * فحص هل الشخص مشرف (Supervisor)
     */
    isSupervisor(instructor) {
        if (!instructor) return false;
        if (instructor.isSupervisor || instructor.role === 'supervisor' || instructor.shift === 'SUP') return true;
        const entry = this.find(instructor.id || instructor.instructorId || instructor.name || instructor.instructorName);
        return entry ? (entry.role === 'supervisor' || entry.shift === 'SUP') : false;
    },

    /**
     * فحص هل الشخص مساعد مدرب (Assistant Instructor)
     */
    isAssistant(instructor) {
        if (!instructor) return false;
        if (instructor.isAssistant || instructor.role === 'assistant' || instructor.shift === 'AST' || 
            /مساعد/i.test(instructor.role || '') || /assistant/i.test(instructor.role || '')) return true;
        const entry = this.find(instructor.id || instructor.instructorId || instructor.name || instructor.instructorName);
        return entry ? (entry.role === 'assistant' || entry.shift === 'AST' || /مساعد/i.test(entry.role || '') || /assistant/i.test(entry.role || '')) : false;
    },

    /**
     * فحص هل الشخص ذو دور مرن (مشرف أو مساعد مدرب) - كلاهما ليس له جدول ثابت
     */
    isFlexibleRole(instructor) {
        return this.isSupervisor(instructor) || this.isAssistant(instructor);
    },

    /**
     * استخراج حدود فترات العمل والسعة المعتمدة للمدرب بناءً على صفته وجنسه وفئته
     */
    getShiftRules(instructorOrCat, optShift, optGender) {
        let instructor = instructorOrCat;
        if (typeof instructorOrCat === 'string') {
            instructor = { category: instructorOrCat, shift: optShift || 'S1', gender: optGender || 'male' };
        } else if (!instructor) {
            instructor = { category: 'LMFM', shift: 'S1', role: 'instructor', gender: 'male' };
        }
        const isSup = this.isSupervisor(instructor);
        const isAst = this.isAssistant(instructor);
        const isFlex = isSup || isAst;
        const isFem = this.isFemale(instructor);
        const cat = instructor.category || 'LMFM';
        const shift = instructor.shift || 'S1';

        // 1. مساعد المدرب والمشرف (جدول مرن بدون حد حصص - الحصص المنفذة فقط)
        if (isFlex) {
            const roleNameAr = isAst ? 'مساعد مدرب' : 'مشرف';
            const roleNameEn = isAst ? 'Assistant Trainer' : 'Supervisor';
            const shiftCodePrefix = isAst ? 'AST' : 'SUP';
            const shiftCode = `${shiftCodePrefix}-${cat}`;
            return {
                isSupervisor: isSup,
                isAssistant: isAst,
                isFlexible: true,
                isFemale: isFem,
                role: isAst ? 'assistant' : 'supervisor',
                gender: instructor.gender || (isFem ? 'female' : 'male'),
                category: cat,
                shift: shiftCodePrefix,
                shiftCode: shiftCode,
                shiftNameAr: isAst ? 'مساعد مدرب - جدول مرن (تكليف مباشر)' : 'مشرف - جدول مرن (تكليف مباشر)',
                shiftNameEn: isAst ? 'Assistant Trainer - Flexible Schedule' : 'Supervisor - Flexible Schedule',
                minSlot: 1,
                maxSlot: (cat === 'HT' || cat === 'HB' || cat === 'LB' || cat === 'MC') ? (cat === 'MC' ? 26 : 24) : 20,
                dailyLimit: null,
                capacity: 'dynamic', // السعة = الحصص المسندة فعلياً
                duration: (cat === 'HT' || cat === 'HB' || cat === 'LB' || cat === 'MC') ? 30 : 40,
                ruleSummaryAr: `🤝 ${roleNameAr}: جدول مرن بدون حد حصص مسبق. لا يُسجل له إلا الحصص التي يقوم بتدريبها فعلياً (إن درّب حصتين تُسجل حصتان، وإن درّب 3 تُسجل 3)، وبدون أي حصص فارغة (empty = 0).`,
                ruleSummaryEn: `🤝 ${roleNameEn}: Flexible schedule. Only actually conducted sessions are recorded, with zero empty slots.`
            };
        }

        // 2. الدراجة النارية (MC): 13 حصة لكل شيفت | مدة الحصة 30 دقيقة | سعة 26 حصة
        // - بالمركز الرئيسي / الإدارة العليا: شيفتان (S1: 1 إلى 13 صباحي | S2: 14 إلى 26 مسائي)
        // - بالفروع: شيفت واحد ثابت يبدأ من 6 إلى 17 (FIX)
        if (cat === 'MC') {
            const isS1 = (shift === 'S1');
            const isS2 = (shift === 'S2');
            const isFix = !isS1 && !isS2; // افتراضي الفرع أو FIX

            let minS = 6;
            let maxS = 17;
            let shCode = 'MC-FIX';
            let nameAr = 'فترة ثابتة بالفرع (6 - 17) [12 حصة]';
            let nameEn = 'Fixed Branch Shift (6 - 17) [12 slots]';
            let sumAr = '🏍️ دراجة نارية - فترة واحدة بالفرع: 12 حصة يومياً (الحصص 6 إلى 17 | مدة الحصة 30 دقيقة) | السعة الكلية 24 حصة.';
            let sumEn = '🏍️ Motorcycle Branch Fixed: 12 slots daily (Slots 6 to 17 | 30 mins) | 24 capacity.';

            if (isS1) {
                minS = 1;
                maxS = 13;
                shCode = 'MC-S1';
                nameAr = 'الفترة الصباحية - المركز الرئيسي (1 - 13) [13 حصة]';
                nameEn = 'Morning Shift (1 - 13) [13 slots]';
                sumAr = '🏍️ دراجة نارية - فترة صباحية: 13 حصة يومياً (الحصص 1 إلى 13 | مدة الحصة 30 دقيقة) | السعة الكلية 26 حصة.';
                sumEn = '🏍️ Motorcycle Morning: 13 slots daily (Slots 1 to 13 | 30 mins) | 26 capacity.';
            } else if (isS2) {
                minS = 14;
                maxS = 26;
                shCode = 'MC-S2';
                nameAr = 'الفترة المسائية - المركز الرئيسي (14 - 26) [13 حصة]';
                nameEn = 'Evening Shift (14 - 26) [13 slots]';
                sumAr = '🏍️ دراجة نارية - فترة مسائية: 13 حصة يومياً (الحصص 14 إلى 26 | مدة الحصة 30 دقيقة) | السعة الكلية 26 حصة.';
                sumEn = '🏍️ Motorcycle Evening: 13 slots daily (Slots 14 to 26 | 30 mins) | 26 capacity.';
            }

            const dailyLimit = maxS - minS + 1;
            const capacity = dailyLimit * 2;

            return {
                isSupervisor: false,
                isAssistant: false,
                isFlexible: false,
                isFemale: isFem,
                role: 'instructor',
                gender: instructor.gender || (isFem ? 'female' : 'male'),
                category: 'MC',
                shift: isS1 ? 'S1' : (isS2 ? 'S2' : 'FIX'),
                shiftCode: shCode,
                shiftNameAr: nameAr,
                shiftNameEn: nameEn,
                minSlot: minS,
                maxSlot: maxS,
                dailyLimit,
                capacity,
                duration: 30,
                ruleSummaryAr: sumAr,
                ruleSummaryEn: sumEn
            };
        }

        // 3. الشاحنات الثقيلة والباصات الثقيلة (HT & HB / HBFM): 12 حصة يومياً لكل وردية | مدة الحصة 30 دقيقة | سعة 24 حصة
        if (cat === 'HT' || cat === 'HB' || cat === 'LB') {
            const isS2 = (shift === 'S2');
            const isHB = (cat === 'HB' || cat === 'LB');
            const codePrefix = isHB ? 'HBFM' : 'HTFM';
            const nameAr = isHB ? 'باص ثقيل (HBFM)' : 'شاحنة ثقيلة (HTFM)';
            const nameEn = isHB ? 'Heavy Bus' : 'Heavy Truck';
            return {
                isSupervisor: false,
                isAssistant: false,
                isFlexible: false,
                isFemale: isFem,
                role: 'instructor',
                gender: instructor.gender || (isFem ? 'female' : 'male'),
                category: isHB ? 'HB' : 'HT',
                shift: isS2 ? 'S2' : 'S1',
                shiftCode: isS2 ? `${codePrefix}-S2` : `${codePrefix}-S1`,
                shiftNameAr: isS2 ? `الفترة المسائية (13 - 24) [12 حصة]` : `الفترة الأولى (1 - 12) [12 حصة]`,
                shiftNameEn: isS2 ? `${nameEn} Evening Shift (13 - 24) [12 slots]` : `${nameEn} Morning Shift (1 - 12) [12 slots]`,
                minSlot: isS2 ? 13 : 1,
                maxSlot: isS2 ? 24 : 12,
                dailyLimit: 12,
                capacity: 24,
                duration: 30,
                ruleSummaryAr: isS2 
                    ? `🚛 ${nameAr} مسائي: 12 حصة يومياً (الحصص 13 إلى 24 | مدة الحصة 30 دقيقة) | السعة 24 حصة.`
                    : `🚛 ${nameAr} صباحي: 12 حصة يومياً (الحصص 1 إلى 12 | مدة الحصة 30 دقيقة) | السعة 24 حصة.`,
                ruleSummaryEn: isS2 ? `${nameEn} Evening (13-24 | 12 slots daily | 30 mins)` : `${nameEn} Morning (1-12 | 12 slots daily | 30 mins)`
            };
        }

        // 4. المركبات الخفيفة (LMFA / LMFM):
        // - السيدات: 9 حصص يومياً (18 حصة معتمدة لكل مدربة: 9 صباحاً 1-9، 9 مساءً 11-19)
        // - الذكور: 10 حصص يومياً (20 حصة معتمدة لكل مدرب: 10 صباحاً 1-10، 10 مساءً 11-20)
        const isS2 = (shift === 'S2');
        if (isFem) {
            return {
                isSupervisor: false,
                isAssistant: false,
                isFlexible: false,
                isFemale: true,
                role: 'instructor',
                gender: 'female',
                category: cat,
                shift: isS2 ? 'S2' : 'S1',
                shiftCode: `${cat}-${isS2 ? 'S2' : 'S1'}-F`,
                shiftNameAr: isS2 ? 'الفترة المسائية سيدات (11 - 19) [9 حصص]' : 'الفترة الصباحية سيدات (1 - 9) [9 حصص]',
                shiftNameEn: isS2 ? 'Female Evening Shift (11 - 19) [9 slots]' : 'Female Morning Shift (1 - 9) [9 slots]',
                minSlot: isS2 ? 11 : 1,
                maxSlot: isS2 ? 19 : 9,
                dailyLimit: 9,
                capacity: 18,
                duration: 40,
                ruleSummaryAr: isS2
                    ? '🚗 مركبة خفيفة (سيدات) - فترة مسائية: 9 حصص يومياً (الحصص 11 إلى 19 | مدة الحصة 40 دقيقة) | السعة الكلية 18 حصة.'
                    : '🚗 مركبة خفيفة (سيدات) - فترة صباحية: 9 حصص يومياً (الحصص 1 إلى 9 | مدة الحصة 40 دقيقة) | السعة الكلية 18 حصة.',
                ruleSummaryEn: isS2 ? 'Female Light Vehicle Evening (11-19 | 9 slots daily | 18 capacity)' : 'Female Light Vehicle Morning (1-9 | 9 slots daily | 18 capacity)'
            };
        }

        return {
            isSupervisor: false,
            isAssistant: false,
            isFlexible: false,
            isFemale: false,
            role: 'instructor',
            gender: 'male',
            category: cat,
            shift: isS2 ? 'S2' : 'S1',
            shiftCode: `${cat}-${isS2 ? 'S2' : 'S1'}`,
            shiftNameAr: isS2 ? 'الفترة المسائية (11 - 20) [10 حصص]' : 'الفترة الصباحية (1 - 10) [10 حصص]',
            shiftNameEn: isS2 ? 'Evening Shift (11 - 20) [10 slots]' : 'Morning Shift (1 - 10) [10 slots]',
            minSlot: isS2 ? 11 : 1,
            maxSlot: isS2 ? 20 : 10,
            dailyLimit: 10,
            capacity: 20,
            duration: 40,
            ruleSummaryAr: isS2
                ? '🚗 مركبة خفيفة (ذكور) - فترة مسائية: 10 حصص يومياً (الحصص 11 إلى 20 | مدة الحصة 40 دقيقة) | السعة الكلية 20 حصة.'
                : '🚗 مركبة خفيفة (ذكور) - فترة صباحية: 10 حصص يومياً (الحصص 1 إلى 10 | مدة الحصة 40 دقيقة) | السعة الكلية 20 حصة.',
            ruleSummaryEn: isS2 ? 'Light Vehicle Evening (11-20 | 10 slots daily | 20 capacity)' : 'Light Vehicle Morning (1-10 | 10 slots daily | 20 capacity)'
        };
    },

    /**
     * تحديث بيانات مدرب أو إضافته إلى السجل المركزي
     */
    registerOrUpdate(instructorData) {
        if (!instructorData || !instructorData.id) return null;
        const roster = this.getRoster();
        const idStr = String(instructorData.id).trim();
        const existingIdx = roster.findIndex(item => String(item.id).trim() === idStr);

        const rules = this.getShiftRules(instructorData);
        const record = {
            id: idStr,
            name: instructorData.name || `مدرب ${idStr}`,
            shortName: instructorData.shortName || (instructorData.name ? instructorData.name.split(' ').slice(0, 2).join(' ') : `مدرب ${idStr}`),
            gender: instructorData.gender || rules.gender,
            role: instructorData.role || rules.role,
            category: instructorData.category || rules.category,
            shift: instructorData.shift || rules.shift,
            shiftCode: rules.shiftCode,
            approvedCapacity: rules.capacity,
            dailySlotsLimit: rules.dailyLimit
        };

        if (existingIdx !== -1) {
            roster[existingIdx] = { ...roster[existingIdx], ...record };
        } else {
            roster.push(record);
        }

        this.saveRoster(roster);
        return record;
    },

    /**
     * إزالة وتطهير كافة الحصص الفارغة لمساعدي المدربين والمشرفين (Supervisors & Assistant Instructors)
     * - مساعد المدرب والمشرف ليس لديه جدول تدريب نظامي ثابت (جدوله مرن وخالي من خانات الحصص الفارغة).
     * - لا تحسب له إلا الحصص التي يقوم بتدريبها فعلياً والمسجلة بالنظام فقط.
     * - السعة تساوي عدد الحصص المنفذة فعلياً (1 حصة -> سعة 1، 2 حصة -> سعة 2، 3 حصص -> سعة 3، 0 حصة -> سعة 0).
     * - الحصص الخالية صفر دائماً (empty = 0).
     */
    pruneSupervisorSchedule(instructor) {
        if (!instructor) return instructor;
        const isAst = this.isAssistant(instructor);
        const isSup = this.isSupervisor(instructor);
        if (!isAst && !isSup) return instructor;

        instructor.isSupervisor = isSup;
        instructor.isAssistant = isAst;
        instructor.role = isAst ? 'assistant' : 'supervisor';
        instructor.shift = isAst ? 'AST' : 'SUP';
        instructor.shiftCode = `${instructor.shift}-${instructor.category || 'LMFM'}`;
        instructor.shiftName = isAst ? 'مساعد مدرب - جدول مرن (تكليف مباشر)' : 'مشرف (Supervisor) - تكليف عند الحاجة';

        // 1. تصفية الجدول الكامل لحذف كافة الحصص الخالية غير المشغولة
        if (Array.isArray(instructor.fullSchedule)) {
            // إبقاء الحصص التي تحتوي على حصة مشغولة على الأقل
            instructor.fullSchedule = instructor.fullSchedule.filter(s => s && (s.sat === 'occupied' || s.sun === 'occupied'));
            instructor.fullSchedule.forEach(s => {
                if (s.sat !== 'occupied') { s.sat = 'none'; s.origSat = 'none'; }
                if (s.sun !== 'occupied') { s.sun = 'none'; s.origSun = 'none'; }
            });
        } else {
            instructor.fullSchedule = [];
        }

        // 2. حساب الحصص المشغولة والسعة
        let occ = 0;
        instructor.fullSchedule.forEach(s => {
            if (s.sat === 'occupied') occ++;
            if (s.sun === 'occupied') occ++;
        });

        instructor.occupied = occ;
        instructor.capacity = occ;
        instructor.empty = 0; // ممنوع أي حصص فارغة (جدول مرن خالي من الحصص وليس له خانات فارغة)
        instructor.rate = occ > 0 ? "100.0" : "0.0";
        instructor.slotsRows = []; // لا تظهر له أي حصص فارغة في تقرير الحصص الفارغة

        return instructor;
    }
};

if (typeof window !== 'undefined') {
    window.DEFAULT_MASTER_ROSTER = DEFAULT_MASTER_ROSTER;
    window.SDIMasterRoster = SDIMasterRoster;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULT_MASTER_ROSTER, SDIMasterRoster };
}
