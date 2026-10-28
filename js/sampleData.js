/**
 * قواعد البيانات والتكويد الرسمي لمعهد الشارقة للسياقة (SDI)
 * Sharjah Driving Institute LLC
 * 
 * فترات العمل المعتمدة:
 * 1. المركبة الخفيفة (LM): مدة الحصة 40 دقيقة
 *    - 10 حصص تدريبية فقط لكل مدرب في كل شيفت
 *    - الفترة الأولى: الحصص 1 إلى 10
 *    - الفترة الثانية: الحصص 11 إلى 20
 * 2. الشاحنة الثقيلة والباصات الصغيرة (HT & LB): مدة الحصة 30 دقيقة
 *    - 12 حصة تدريبية لكل مدرب في كل شيفت
 *    - الفترة الأولى: الحصص 1 إلى 12
 *    - الفترة الثانية: الحصص 13 إلى 24
 * 3. الدراجة النارية (MC): مدة الحصة 30 دقيقة
 *    - 13 حصة يومياً (فترة العمل تبدأ من الحصة رقم 6 إلى الحصة رقم 17/18)
 * 4. مساعد المدرب والمشرف: جدول مرن بدون حد حصص (الحصص المنفذة فقط)
 * 
 * تطوير: م/ محمود محمد
 */

const LM_TIME_SLOTS = [
    {
        "id": 1,
        "time": "06:20 - 07:00",
        "shift": "S1"
    },
    {
        "id": 2,
        "time": "07:00 - 07:40",
        "shift": "S1"
    },
    {
        "id": 3,
        "time": "07:40 - 08:20",
        "shift": "S1"
    },
    {
        "id": 4,
        "time": "08:20 - 09:00",
        "shift": "S1"
    },
    {
        "id": 5,
        "time": "09:15 - 09:55",
        "shift": "S1"
    },
    {
        "id": 6,
        "time": "09:55 - 10:35",
        "shift": "S1"
    },
    {
        "id": 7,
        "time": "10:35 - 11:15",
        "shift": "S1"
    },
    {
        "id": 8,
        "time": "11:30 - 12:10",
        "shift": "S1"
    },
    {
        "id": 9,
        "time": "12:10 - 12:50",
        "shift": "S1"
    },
    {
        "id": 10,
        "time": "12:50 - 13:30",
        "shift": "S1"
    },
    {
        "id": 11,
        "time": "13:45 - 14:25",
        "shift": "S2"
    },
    {
        "id": 12,
        "time": "14:25 - 15:05",
        "shift": "S2"
    },
    {
        "id": 13,
        "time": "15:05 - 15:45",
        "shift": "S2"
    },
    {
        "id": 14,
        "time": "16:00 - 16:40",
        "shift": "S2"
    },
    {
        "id": 15,
        "time": "16:40 - 17:20",
        "shift": "S2"
    },
    {
        "id": 16,
        "time": "17:20 - 18:00",
        "shift": "S2"
    },
    {
        "id": 17,
        "time": "18:15 - 18:55",
        "shift": "S2"
    },
    {
        "id": 18,
        "time": "18:55 - 19:35",
        "shift": "S2"
    },
    {
        "id": 19,
        "time": "19:35 - 20:15",
        "shift": "S2"
    },
    {
        "id": 20,
        "time": "20:15 - 20:55",
        "shift": "S2"
    }
];

const HT_TIME_SLOTS = [
    {
        "id": 1,
        "time": "06:00 - 06:30",
        "shift": "S1"
    },
    {
        "id": 2,
        "time": "06:30 - 07:00",
        "shift": "S1"
    },
    {
        "id": 3,
        "time": "07:00 - 07:30",
        "shift": "S1"
    },
    {
        "id": 4,
        "time": "07:30 - 08:00",
        "shift": "S1"
    },
    {
        "id": 5,
        "time": "08:00 - 08:30",
        "shift": "S1"
    },
    {
        "id": 6,
        "time": "08:30 - 09:00",
        "shift": "S1"
    },
    {
        "id": 7,
        "time": "09:15 - 09:45",
        "shift": "S1"
    },
    {
        "id": 8,
        "time": "09:45 - 10:15",
        "shift": "S1"
    },
    {
        "id": 9,
        "time": "10:15 - 10:45",
        "shift": "S1"
    },
    {
        "id": 10,
        "time": "10:45 - 11:15",
        "shift": "S1"
    },
    {
        "id": 11,
        "time": "11:15 - 11:45",
        "shift": "S1"
    },
    {
        "id": 12,
        "time": "11:45 - 12:15",
        "shift": "S1"
    },
    {
        "id": 13,
        "time": "12:45 - 13:15",
        "shift": "S2"
    },
    {
        "id": 14,
        "time": "13:15 - 13:45",
        "shift": "S2"
    },
    {
        "id": 15,
        "time": "13:45 - 14:15",
        "shift": "S2"
    },
    {
        "id": 16,
        "time": "14:15 - 14:45",
        "shift": "S2"
    },
    {
        "id": 17,
        "time": "14:45 - 15:15",
        "shift": "S2"
    },
    {
        "id": 18,
        "time": "15:15 - 15:45",
        "shift": "S2"
    },
    {
        "id": 19,
        "time": "16:00 - 16:30",
        "shift": "S2"
    },
    {
        "id": 20,
        "time": "16:30 - 17:00",
        "shift": "S2"
    },
    {
        "id": 21,
        "time": "17:00 - 17:30",
        "shift": "S2"
    },
    {
        "id": 22,
        "time": "17:30 - 18:00",
        "shift": "S2"
    },
    {
        "id": 23,
        "time": "18:00 - 18:30",
        "shift": "S2"
    },
    {
        "id": 24,
        "time": "18:30 - 19:00",
        "shift": "S2"
    }
];

const HB_TIME_SLOTS = HT_TIME_SLOTS;
const LB_TIME_SLOTS = HT_TIME_SLOTS;

const MC_TIME_SLOTS = [
    { id: 1,  time: "06:00 - 06:30", shift: "S1" },
    { id: 2,  time: "06:30 - 07:00", shift: "S1" },
    { id: 3,  time: "07:00 - 07:30", shift: "S1" },
    { id: 4,  time: "07:30 - 08:00", shift: "S1" },
    { id: 5,  time: "08:00 - 08:30", shift: "S1" },
    { id: 6,  time: "08:30 - 09:00", shift: "FIX" },
    { id: 7,  time: "09:15 - 09:45", shift: "FIX" },
    { id: 8,  time: "09:45 - 10:15", shift: "FIX" },
    { id: 9,  time: "10:15 - 10:45", shift: "FIX" },
    { id: 10, time: "10:45 - 11:15", shift: "FIX" },
    { id: 11, time: "11:15 - 11:45", shift: "FIX" },
    { id: 12, time: "11:45 - 12:15", shift: "FIX" },
    { id: 13, time: "12:15 - 12:45", shift: "FIX" },
    { id: 14, time: "13:00 - 13:30", shift: "S2" },
    { id: 15, time: "13:30 - 14:00", shift: "S2" },
    { id: 16, time: "14:15 - 14:45", shift: "S2" },
    { id: 17, time: "14:45 - 15:15", shift: "S2" },
    { id: 18, time: "15:15 - 15:45", shift: "S2" },
    { id: 19, time: "16:00 - 16:30", shift: "S2" },
    { id: 20, time: "16:30 - 17:00", shift: "S2" },
    { id: 21, time: "17:00 - 17:30", shift: "S2" },
    { id: 22, time: "17:30 - 18:00", shift: "S2" },
    { id: 23, time: "18:00 - 18:30", shift: "S2" },
    { id: 24, time: "18:30 - 19:00", shift: "S2" },
    { id: 25, time: "19:00 - 19:30", shift: "S2" },
    { id: 26, time: "19:30 - 20:00", shift: "S2" }
];

const SDI_CATEGORIES = {
    "LMFM": {
        "code": "LMFM",
        "name": "مركبة خفيفة - جير عادي",
        "nameEn": "Light Motor Manual",
        "duration": 40,
        "color": "#2563eb"
    },
    "LMFA": {
        "code": "LMFA",
        "name": "مركبة خفيفة - أوتوماتيك",
        "nameEn": "Light Motor Auto",
        "duration": 40,
        "color": "#7c3aed"
    },
    "MC": {
        "code": "MC",
        "name": "دراجة نارية",
        "nameEn": "Motorcycle",
        "duration": 30,
        "color": "#059669"
    },
    "HT": {
        "code": "HT",
        "name": "شاحنة ثقيلة (HTFM)",
        "nameEn": "Heavy Truck",
        "duration": 30,
        "color": "#d97706"
    },
    "HB": {
        "code": "HB",
        "name": "باص ثقيل (HBFM)",
        "nameEn": "Heavy Bus",
        "duration": 30,
        "color": "#0891b2"
    },
    "LB": {
        "code": "HB",
        "name": "باص ثقيل (HBFM)",
        "nameEn": "Heavy Bus",
        "duration": 30,
        "color": "#0891b2"
    }
};

const OFFICIAL_INSTRUCTORS = [
    {
        "id": "102671",
        "name": "Maqsood Ali Kachkol Amir",
        "shortName": "Maqsood Ali",
        "category": "LMFM",
        "vehicleType": "خفيفة (LM)",
        "shift": "S1",
        "shiftName": "الفترة الأولى (1 - 10)",
        "shiftCode": "LMFM-S1",
        "capacity": 20,
        "occupied": 11,
        "empty": 9,
        "rate": 55,
        "minSlot": 1,
        "maxSlot": 10,
        "note": "",
        "reportPage": 1,
        "slotsRows": [
            {
                "slotDisplay": "1",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "4",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "5",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "6",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "7",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "8",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "10",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 1,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 2,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 3,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 4,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 5,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 6,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 7,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 9,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 10,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "104259",
        "name": "Umar Zada Muhammad",
        "shortName": "Umar Zada",
        "category": "LMFM",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFM-S2",
        "capacity": 20,
        "occupied": 10,
        "empty": 10,
        "rate": 50,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 1,
        "slotsRows": [
            {
                "slotDisplay": "12",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "13",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "16",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "17",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "18",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "19",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "20",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 13,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 14,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 15,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 16,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 18,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "105382",
        "name": "Loai Awad Mohamed Sidahmed",
        "shortName": "Loai Awad",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFA-S2",
        "capacity": 20,
        "occupied": 8,
        "empty": 12,
        "rate": 40,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "ملاحظة: يتضمن حصص مزدوجة",
        "reportPage": 2,
        "slotsRows": [
            {
                "slotDisplay": "11",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "12",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "14",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "15",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "16",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "17",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "20",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 13,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 14,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 15,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 16,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 18,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "106286",
        "name": "Mohammed Yasime Kunnathiyil",
        "shortName": "Mohammed Yasime",
        "category": "LMFM",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFM-S2",
        "capacity": 20,
        "occupied": 16,
        "empty": 4,
        "rate": 80,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 2,
        "slotsRows": [
            {
                "slotDisplay": "13",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "14",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "19",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 13,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 14,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 15,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 16,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 18,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 20,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    },
    {
        "id": "180105",
        "name": "MUHAMMAD NASER SANAULLAH KHAN",
        "shortName": "Muhammad Naser",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S1",
        "shiftName": "الفترة الأولى (1 - 10)",
        "shiftCode": "LMFA-S1",
        "capacity": 20,
        "occupied": 15,
        "empty": 5,
        "rate": 75,
        "minSlot": 1,
        "maxSlot": 10,
        "note": "",
        "reportPage": 3,
        "slotsRows": [
            {
                "slotDisplay": "5",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "6",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "10",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 1,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 2,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 3,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 4,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 5,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 6,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 7,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 9,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 10,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "190209",
        "name": "ABDUL LATHEEF THRIKKANDIYOORIL",
        "shortName": "Abdul Latheef",
        "category": "LMFM",
        "vehicleType": "خفيفة (LM)",
        "shift": "S1",
        "shiftName": "الفترة الأولى (1 - 10)",
        "shiftCode": "LMFM-S1",
        "capacity": 20,
        "occupied": 17,
        "empty": 3,
        "rate": 85,
        "minSlot": 1,
        "maxSlot": 10,
        "note": "",
        "reportPage": 3,
        "slotsRows": [
            {
                "slotDisplay": "2",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "7",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "9",
                "sat": "مشغولة",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 1,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 2,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 3,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 4,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 5,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 6,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 7,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 9,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 10,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    },
    {
        "id": "200260",
        "name": "SAIDALAVI PATHAYA PURAKKAL",
        "shortName": "Saidalavi Pathaya",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFA-S2",
        "capacity": 20,
        "occupied": 16,
        "empty": 4,
        "rate": 80,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 4,
        "slotsRows": [
            {
                "slotDisplay": "14",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "17",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "20",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 13,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 14,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 15,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 16,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 18,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "200291",
        "name": "SULIMAN ALMAHDI ALFAKI",
        "shortName": "Suliman Almahdi",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S1",
        "shiftName": "الفترة الأولى (1 - 10)",
        "shiftCode": "LMFA-S1",
        "capacity": 20,
        "occupied": 11,
        "empty": 9,
        "rate": 55,
        "minSlot": 1,
        "maxSlot": 10,
        "note": "ملاحظة: يتضمن حصص مزدوجة",
        "reportPage": 4,
        "slotsRows": [
            {
                "slotDisplay": "4",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "5",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "6",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "8",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "10",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 1,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 2,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 3,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 4,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 5,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 6,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 7,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 9,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 10,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "200299",
        "name": "UMMER KUNNAKKATTU THODI",
        "shortName": "Ummer Kunnakkattu",
        "category": "MC",
        "vehicleType": "دراجة نارية (MC)",
        "shift": "FIX",
        "shiftName": "فترة ثابتة (6 - 17)",
        "shiftCode": "MC-FIX",
        "capacity": 24,
        "occupied": 15,
        "empty": 9,
        "rate": 62.5,
        "minSlot": 6,
        "maxSlot": 17,
        "note": "",
        "reportPage": 5,
        "slotsRows": [
            {
                "slotDisplay": "7",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "8",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "9",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "10",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "11",
                "sat": "خالية",
                "sun": "مشغولة"
            },
            {
                "slotDisplay": "13",
                "sat": "مشغولة",
                "sun": "خالية"
            },
            {
                "slotDisplay": "14",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "16",
                "sat": "خالية",
                "sun": "مشغولة"
            }
        ],
        "fullSchedule": [
            {
                "slot": 6,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 7,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 9,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 10,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 11,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 13,
                "sat": "occupied",
                "sun": "empty"
            },
            {
                "slot": 14,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 15,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 16,
                "sat": "empty",
                "sun": "occupied"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    },
    {
        "id": "102463",
        "name": "Muhammad Junaid Taj Parwar",
        "shortName": "Muhammad Junaid",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFA-S2",
        "capacity": 20,
        "occupied": 12,
        "empty": 8,
        "rate": 60,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 5,
        "slotsRows": [
            {
                "slotDisplay": "12",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "14",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "16",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "18",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 13,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 14,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 15,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 16,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 17,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 18,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 19,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    },
    {
        "id": "105528",
        "name": "Faizal Nisham Palakkal",
        "shortName": "Faizal Nisham",
        "category": "LMFM",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFM-S2",
        "capacity": 20,
        "occupied": 12,
        "empty": 8,
        "rate": 60,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 6,
        "slotsRows": [
            {
                "slotDisplay": "13",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "15",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "17",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "20",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 13,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 14,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 15,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 16,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 17,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 18,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "empty",
                "sun": "empty"
            }
        ]
    },
    {
        "id": "106284",
        "name": "Ahmed Mohamed Ahmed Ali",
        "shortName": "Ahmed Mohamed",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S2",
        "shiftName": "الفترة الثانية (11 - 20)",
        "shiftCode": "LMFA-S2",
        "capacity": 20,
        "occupied": 14,
        "empty": 6,
        "rate": 70,
        "minSlot": 11,
        "maxSlot": 20,
        "note": "",
        "reportPage": 6,
        "slotsRows": [
            {
                "slotDisplay": "12",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "15",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "17",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 11,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 12,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 13,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 14,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 15,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 16,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 17,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 18,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 19,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 20,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    },
    {
        "id": "200283",
        "name": "Mohammed Aref Ahmed Omar",
        "shortName": "Mohammed Aref",
        "category": "LMFA",
        "vehicleType": "خفيفة (LM)",
        "shift": "S1",
        "shiftName": "الفترة الأولى (1 - 10)",
        "shiftCode": "LMFA-S1",
        "capacity": 20,
        "occupied": 16,
        "empty": 4,
        "rate": 80,
        "minSlot": 1,
        "maxSlot": 10,
        "note": "",
        "reportPage": 7,
        "slotsRows": [
            {
                "slotDisplay": "6",
                "sat": "خالية",
                "sun": "خالية"
            },
            {
                "slotDisplay": "9",
                "sat": "خالية",
                "sun": "خالية"
            }
        ],
        "fullSchedule": [
            {
                "slot": 1,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 2,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 3,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 4,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 5,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 6,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 7,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 8,
                "sat": "occupied",
                "sun": "occupied"
            },
            {
                "slot": 9,
                "sat": "empty",
                "sun": "empty"
            },
            {
                "slot": 10,
                "sat": "occupied",
                "sun": "occupied"
            }
        ]
    }
];

if (typeof window !== 'undefined') {
    window.LM_TIME_SLOTS = LM_TIME_SLOTS;
    window.HT_TIME_SLOTS = HT_TIME_SLOTS;
    window.HB_TIME_SLOTS = HB_TIME_SLOTS;
    window.LB_TIME_SLOTS = LB_TIME_SLOTS;
    window.MC_TIME_SLOTS = MC_TIME_SLOTS;
    window.SDI_CATEGORIES = SDI_CATEGORIES;
    window.OFFICIAL_INSTRUCTORS = OFFICIAL_INSTRUCTORS;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LM_TIME_SLOTS, HT_TIME_SLOTS, HB_TIME_SLOTS, LB_TIME_SLOTS, MC_TIME_SLOTS, SDI_CATEGORIES, OFFICIAL_INSTRUCTORS };
}
