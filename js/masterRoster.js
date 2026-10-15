/**
 * سجل الملاك التدريبي المعتمد وقواعد الفئات والورديات - معهد الشارقة للسياقة (SDI)
 * Sharjah Driving Institute LLC - Master Instructors Roster & Shift Rules
 * 
 * القواعد المعتمدة وفق توجيهات الإدارة:
 * 1. المدربات السيدات: 18 حصة في المجموع الكلي (9 حصص يومياً خلال كل شفت: 1-9 للصباحي أو 11-19 للمسائي).
 * 2. المشرفون (Supervisors): ليس لهم جدول تدريبي رسمي ثابت (تكليف عند الحاجة والطارئ فقط)،
 *    لذا عندما تسجل لهم أي حصة تكون نسبة إشغالهم نظرياً 100% دائماً والسعة = عدد الحصص المسندة ولا توجد حصص خالية.
 * 3. المدربون الرسميون الذكور: 10 حصص يومياً (1-10 للصباحي أو 11-20 للمسائي) والسعة الكلية 20 حصة.
 * 4. الشاحنة الثقيلة (HT): 12 حصة يومياً (1-12 أو 13-24) والسعة الكلية 24 حصة.
 * 5. الدراجة النارية (MC): فترة ثابتة (6-17) 12 حصة يومياً والسعة الكلية 24 حصة.
 * 
 * تطوير: م/ محمود محمد
 */

const DEFAULT_MASTER_ROSTER = [
    // --- 1. المشرفون (Supervisors) - تكليف طارئ عند الحاجة (إشغال 100% - بدون جدول ثابت) ---
    {
        id: "100101",
        name: "Tariq Al Shamsi",
        shortName: "Tariq Al Shamsi",
        gender: "male",
        role: "supervisor",
        category: "LMFA",
        shift: "SUP",
        shiftCode: "SUP-LMFA",
        approvedCapacity: "طارئ / عند الحاجة",
        dailySlotsLimit: "تكليف مباشر"
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
        approvedCapacity: "طارئ / عند الحاجة",
        dailySlotsLimit: "تكليف مباشر"
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
        approvedCapacity: "طارئ / عند الحاجة",
        dailySlotsLimit: "تكليف مباشر"
    },

    // --- 2. المدربات السيدات (Female Instructors) - 18 حصة إجمالياً (9 حصص يومياً) ---
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

    // --- 3. المدربون الرسميون (الذكور) - 20 حصة للمركبة، 24 للشاحنة والدراجة ---
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
     * استخراج حدود فترات العمل والسعة المعتمدة للمدرب بناءً على صفته وجنسه وفئته
     */
    getShiftRules(instructor) {
        if (!instructor) {
            instructor = { category: 'LMFM', shift: 'S1', role: 'instructor', gender: 'male' };
        }
        const isSup = this.isSupervisor(instructor);
        const isFem = this.isFemale(instructor);
        const cat = instructor.category || 'LMFM';
        const shift = instructor.shift || 'S1';

        if (isSup) {
            return {
                isSupervisor: true,
                isFemale: isFem,
                role: 'supervisor',
                gender: instructor.gender || 'male',
                category: cat,
                shift: 'SUP',
                shiftCode: `SUP-${cat}`,
                shiftNameAr: 'مشرف (Supervisor) - تكليف عند الحاجة',
                shiftNameEn: 'Supervisor - Ad-hoc Sessions',
                minSlot: 1,
                maxSlot: cat === 'HT' ? 24 : 20,
                dailyLimit: null,
                capacity: 'dynamic', // السعة = الحصص المسندة
                ruleSummaryAr: '👔 مشرف: ليس على جدول التدريب الرسمي. السعة تساوي الحصص المسندة ونسبة الإشغال 100% نظرياً وبدون أي حصص خالية.',
                ruleSummaryEn: '👔 Supervisor: No fixed schedule. Capacity equals assigned slots, occupancy 100% with zero empty slots.'
            };
        }

        if (cat === 'MC') {
            return {
                isSupervisor: false,
                isFemale: isFem,
                role: 'instructor',
                gender: instructor.gender || (isFem ? 'female' : 'male'),
                category: 'MC',
                shift: 'FIX',
                shiftCode: 'MC-FIX',
                shiftNameAr: 'فترة ثابتة (6 - 17)',
                shiftNameEn: 'Fixed Shift (6 - 17)',
                minSlot: 6,
                maxSlot: 17,
                dailyLimit: 12,
                capacity: 24,
                ruleSummaryAr: '🏍️ دراجة نارية: 12 حصة يومياً (الحصص 6 إلى 17) | السعة الكلية 24 حصة.',
                ruleSummaryEn: '🏍️ Motorcycle: 12 slots daily (6 to 17) | 24 slots total capacity.'
            };
        }

        if (cat === 'HT') {
            const isS2 = (shift === 'S2');
            return {
                isSupervisor: false,
                isFemale: isFem,
                role: 'instructor',
                gender: instructor.gender || (isFem ? 'female' : 'male'),
                category: 'HT',
                shift: isS2 ? 'S2' : 'S1',
                shiftCode: isS2 ? 'HTFM-S2' : 'HTFM-S1',
                shiftNameAr: isS2 ? 'الفترة الثانية (13 - 24)' : 'الفترة الأولى (1 - 12)',
                shiftNameEn: isS2 ? 'Evening Shift (13 - 24)' : 'Morning Shift (1 - 12)',
                minSlot: isS2 ? 13 : 1,
                maxSlot: isS2 ? 24 : 12,
                dailyLimit: 12,
                capacity: 24,
                ruleSummaryAr: isS2 
                    ? '🚛 شاحنة ثقيلة مسائي: 12 حصة يومياً (الحصص 13 إلى 24) | السعة 24 حصة.'
                    : '🚛 شاحنة ثقيلة صباحي: 12 حصة يومياً (الحصص 1 إلى 12) | السعة 24 حصة.',
                ruleSummaryEn: isS2 ? 'Heavy Truck Evening (13 to 24)' : 'Heavy Truck Morning (1 to 12)'
            };
        }

        // المركبة الخفيفة (LMFA / LMFM)
        if (isFem) {
            // قاعدة المدربات السيدات المعتمدة: 18 حصة إجمالاً و 9 حصص يومياً
            const isS2 = (shift === 'S2');
            return {
                isSupervisor: false,
                isFemale: true,
                role: 'instructor',
                gender: 'female',
                category: cat,
                shift: isS2 ? 'S2' : 'S1',
                shiftCode: `${cat}-${isS2 ? 'S2' : 'S1'}-F`,
                shiftNameAr: isS2 ? 'الفترة المسائية للسيدات (11 - 19) [9 حصص]' : 'الفترة الصباحية للسيدات (1 - 9) [9 حصص]',
                shiftNameEn: isS2 ? 'Female Evening Shift (11 - 19) [9 slots]' : 'Female Morning Shift (1 - 9) [9 slots]',
                minSlot: isS2 ? 11 : 1,
                maxSlot: isS2 ? 19 : 9,
                dailyLimit: 9,
                capacity: 18,
                ruleSummaryAr: isS2
                    ? '👩 مدربة سيدة - فترة مسائية: 9 حصص يومياً (الحصص 11 إلى 19) | السعة الكلية المعتمدة 18 حصة.'
                    : '👩 مدربة سيدة - فترة صباحية: 9 حصص يومياً (الحصص 1 إلى 9) | السعة الكلية المعتمدة 18 حصة.',
                ruleSummaryEn: isS2 ? 'Female Instructor Evening (11-19 | 9 slots daily | 18 capacity)' : 'Female Instructor Morning (1-9 | 9 slots daily | 18 capacity)'
            };
        }

        // المدربون الذكور الافتراضيون (10 حصص يومياً | 20 حصة إجمالاً)
        const isS2 = (shift === 'S2');
        return {
            isSupervisor: false,
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
            ruleSummaryAr: isS2
                ? '👨 مدرب رسمي - فترة مسائية: 10 حصص يومياً (الحصص 11 إلى 20) | السعة الكلية المعتمدة 20 حصة.'
                : '👨 مدرب رسمي - فترة صباحية: 10 حصص يومياً (الحصص 1 إلى 10) | السعة الكلية المعتمدة 20 حصة.',
            ruleSummaryEn: isS2 ? 'Male Instructor Evening (11-20 | 10 slots daily | 20 capacity)' : 'Male Instructor Morning (1-10 | 10 slots daily | 20 capacity)'
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
     * إزالة وتطهير كافة الحصص الفارغة للمشرفين (Supervisors)
     * - المشرف ليس لديه جدول تدريب نظامي (لا حصص فارغة تؤثر على معدل الإشغال أو الداشبورد).
     * - الإبقاء حصراً على الحصص المشغولة المسندة إليه.
     * - تصفير الحصص الفارغة تماماً (empty = 0) ومعدل الإشغال 100%.
     */
    pruneSupervisorSchedule(instructor) {
        if (!instructor) return instructor;
        if (!this.isSupervisor(instructor)) return instructor;

        instructor.isSupervisor = true;
        instructor.role = 'supervisor';
        instructor.shift = 'SUP';
        instructor.shiftCode = `SUP-${instructor.category || 'LMFM'}`;
        instructor.shiftName = 'مشرف (Supervisor) - تكليف عند الحاجة';

        // 1. تصفية الجدول الكامل لحذف كافة الحصص الخالية غير المشغولة
        if (Array.isArray(instructor.fullSchedule)) {
            // إبقاء الحصص التي تحتوي على حصة مشغولة على الأقل
            instructor.fullSchedule = instructor.fullSchedule.filter(s => s.sat === 'occupied' || s.sun === 'occupied');
            instructor.fullSchedule.forEach(s => {
                if (s.sat !== 'occupied') { s.sat = 'none'; s.origSat = 'none'; }
                if (s.sun !== 'occupied') { s.sun = 'none'; s.origSun = 'none'; }
            });
        }

        // 2. حساب الحصص المشغولة والسعة
        let occ = 0;
        (instructor.fullSchedule || []).forEach(s => {
            if (s.sat === 'occupied') occ++;
            if (s.sun === 'occupied') occ++;
        });

        instructor.occupied = occ;
        instructor.capacity = occ;
        instructor.empty = 0; // ممنوع أي حصص فارغة للمشرف
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
