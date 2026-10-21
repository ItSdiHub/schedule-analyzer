/**
 * معالج ملفات خطة اليوم للمدربين (Instructor Day Plan Parser)
 * معهد الشارقة للسياقة (Sharjah Driving Institute - SDI)
 * 
 * يدعم كلاً من:
 * 1. ملفات PDF الرسمية المعتمدة
 * 2. ملفات Excel (.xlsx, .xls, .csv)
 * 
 * الميزات:
 * - استخراج بيانات المدرب، التاريخ، والحصص اليومية.
 * - دعم مكان التدريب: Y (Yard / ساحة الباركنج) و R (Road / الشارع).
 * - دعم الحصص المزدوجة: كورس ينتهي بـ D (Double) يعطى الطالب حصتين متتاليتين تلقائياً (Slot S و Slot S+1).
 * - استخراج أرقام القيود وأسماء الطلاب وتوقيت الحصص.
 * 
 * تطوير: م/ محمود محمد
 */

const SDIDayPlanParser = {
    /**
     * معالجة ملف خطة اليوم بصيغة PDF
     */
    async parsePdfFile(file) {
        const lib = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
        if (!lib) {
            throw new Error("مكتبة قراءة الـ PDF غير محملة.");
        }

        try {
            if (typeof window !== 'undefined' && lib.GlobalWorkerOptions) {
                lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
            }
        } catch (e) {
            console.warn("PDF worker note:", e);
        }

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = lib.getDocument({
            data: arrayBuffer,
            cMapUrl: 'vendor/',
            cMapPacked: true
        });
        const pdfDoc = await loadingTask.promise;

        const instructorsPlans = [];
        const parsedWarnings = [];
        let currentInstructor = null;

        for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const content = await page.getTextContent();
            const items = content.items.filter(it => it.str && it.str.trim().length > 0);

            if (items.length === 0) continue;

            // 1. استخراج التاريخ
            const dateItem = items.find(it => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(it.str.trim()));
            const planDate = dateItem ? dateItem.str.trim() : '';

            // 2. استخراج بيانات المشرف / Staff
            const staffIdItem = items.find(it => it.transform[4] < 120 && /^[A-Z]{4,8}$/.test(it.str.trim()) && it.str.trim() !== 'ALL');
            const supervisorId = staffIdItem ? staffIdItem.str.trim() : '';

            // 3. استخراج بيانات المدرب (الرقم والاسم)
            const headerItems = items.filter(it => it.transform[4] < 140);
            let instId = '';
            let instName = '';

            const idItem = headerItems.find(it => /^\d{5,7}$/.test(it.str.trim()));
            if (idItem) {
                instId = idItem.str.trim();
                const nameItem = headerItems.find(it => 
                    Math.abs(it.transform[4] - idItem.transform[4]) < 5 && 
                    it.transform[5] > idItem.transform[5] && 
                    !/^\d+$/.test(it.str.trim()) && 
                    !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(it.str.trim())
                );
                if (nameItem) {
                    instName = nameItem.str.trim();
                } else {
                    const words = headerItems
                        .filter(it => !/^\d+$/.test(it.str.trim()) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(it.str.trim()) && it.str.trim() !== 'ALL' && it.str.trim().length > 2)
                        .map(it => it.str.trim());
                    if (words.length > 0) instName = words.join(' ');
                }
            }

            // 4. تجميع صفوف الحصص (مصفوفة عمودية حسب الإحداثي X)
            const rowItems = items.filter(it => it.transform[4] >= 145);
            const rowClusters = [];
            rowItems.sort((a, b) => a.transform[4] - b.transform[4]);

            rowItems.forEach(it => {
                let cluster = rowClusters.find(c => Math.abs(c.x - it.transform[4]) < 5.5);
                if (!cluster) {
                    cluster = { x: it.transform[4], items: [] };
                    rowClusters.push(cluster);
                }
                cluster.items.push(it);
            });

            const parsedSessions = [];

            rowClusters.forEach(cluster => {
                cluster.items.sort((a, b) => a.transform[5] - b.transform[5]);

                // رقم الحصة
                const rowSlot = cluster.items.find(it => /^\d{1,2}$/.test(it.str.trim()) && it.transform[5] < 185);
                // توقيت الحصة
                const rowTime = cluster.items.find(it => /^\d{2}:\d{2}$/.test(it.str.trim()));
                // كود الدورة
                const rowCourse = cluster.items.find(it => /^(LM[A-Z]{1,3}\d+[RD]|MC[A-Z]*\d*[RD]|HT[A-Z]*\d*[RD])/i.test(it.str.trim()));
                // مكان التدريب: Y (Yard / ساحة) أو R (Road / شارع)
                const rowLocation = cluster.items.find(it => /^[YR]$/i.test(it.str.trim()) && it.transform[5] > 480 && it.transform[5] < 540);
                // رقم قيد / ملف الطالب
                const rowStudentId = cluster.items.find(it => /^\d{7,9}$/.test(it.str.trim()));

                // اسم الطالب (الواقع بين التوقيت وكود الدورة)
                const nameParts = cluster.items.filter(it => it.transform[5] > 220 && it.transform[5] < 415).map(it => it.str.trim());
                const studentName = nameParts.join(' ');

                if (rowSlot || rowTime) {
                    const slotNum = rowSlot ? parseInt(rowSlot.str.trim(), 10) : null;
                    const courseCode = rowCourse ? rowCourse.str.trim().toUpperCase() : 'LMFA30R';
                    
                    // فحص الحصة المزدوجة: إذا انتهى كود الدورة بحرف D
                    const isDouble = /D$/i.test(courseCode);
                    const loc = rowLocation ? rowLocation.str.trim().toUpperCase() : 'R';

                    if (slotNum) {
                        const isMc = /^MC/i.test(courseCode);
                        const cleanStudentName = studentName || 'طالب مسجل';
                        const cleanStudentId = rowStudentId ? rowStudentId.str.trim() : '';

                        const existing = parsedSessions.find(s => s.slot === slotNum);
                        if (existing) {
                            // إذا كانت هذه الحصة قد أُنشئت كحصة تابعة (Part 2) لنفس المتدرب، نحدث بياناتها دون تكرار أو تدبيل إضافي
                            if (existing.isDoublePart2 && (existing.studentId === cleanStudentId || existing.studentName.includes(cleanStudentName))) {
                                existing.time = rowTime ? rowTime.str.trim() : existing.time;
                                existing.course = courseCode;
                                existing.location = loc;
                                return;
                            }

                            // قاعدة الدراجة النارية: مسموح بدمج طالبين في نفس الحصة أثناء تدريب الساحة (Yard - Y) فقط
                            if (isMc && existing.location === 'Y' && loc === 'Y') {
                                existing.hasDualStudents = true;
                                existing.student2Name = cleanStudentName;
                                existing.student2Id = cleanStudentId;
                                existing.student2Course = courseCode;
                                return;
                            } else if (isMc && (existing.location === 'R' || loc === 'R')) {
                                existing.hasRoadDualConflict = true;
                            }
                        }

                        // قاعدة الحصص المزدوجة والحد الأقصى: ممنوع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً
                        const currentStudentSlots = parsedSessions.filter(s => 
                            (cleanStudentId && s.studentId === cleanStudentId) ||
                            (cleanStudentName && s.studentName && s.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim() === cleanStudentName)
                        );

                        if (currentStudentSlots.length >= 2) {
                            // المتدرب وصل بالفعل إلى الحد الأقصى المعتمد (حصتان يومياً) - يمنع إعطاؤه أي حصة إضافية ويجب تحذير المستخدم
                            parsedWarnings.push({
                                type: 'STUDENT_LIMIT_EXCEEDED',
                                studentName: cleanStudentName,
                                studentId: cleanStudentId,
                                slot: slotNum,
                                instructorId: instId,
                                instructorName: instName,
                                course: courseCode,
                                messageAr: `⚠️ خطأ وتنبيه رسمي: تم رصد محاولة إعطاء المتدرب (${cleanStudentName} - #${cleanStudentId || 'بدون كود'}) حصة إضافية (حصة ${slotNum}) رغم وصوله للحد الأقصى المعتمد (حصتان فقط يومياً). تم استبعاد الحصة الزائدة وفق لوائح معهد الشارقة للسياقة.`,
                                messageEn: `⚠️ Policy Warning: Blocked extra class (Slot ${slotNum}) for student (${cleanStudentName} - #${cleanStudentId || 'N/A'}) who already reached 2 sessions.`
                            });
                            return;
                        }

                        parsedSessions.push({
                            slot: slotNum,
                            time: rowTime ? rowTime.str.trim() : '',
                            studentName: cleanStudentName,
                            studentId: cleanStudentId,
                            course: courseCode,
                            location: loc, // 'Y' (Yard) or 'R' (Road)
                            isDouble: isDouble,
                            classType: isDouble ? 'D' : 'R',
                            isDoublePart1: isDouble,
                            isDoublePart2: false,
                            hasDualStudents: false
                        });

                        // تطبيق قاعدة الحصة المزدوجة (D):
                        // الحصة المزدوجة تعني حصتين متتاليتين فقط لنفس المتدرب (S و S+1)
                        // إذا كان لدى الطالب 0 حصص سابقة: يُعطى S و S+1 (حصتان فقط)
                        // إذا كان لدى الطالب حصة سابقة واحدة بالفعل: يمنع إعطاؤه S+1 لأن ذلك يجعله 3 حصص وهو خطأ جسيم
                        if (isDouble && currentStudentSlots.length === 0) {
                            const nextSlot = slotNum + 1;
                            const existingNext = parsedSessions.find(s => s.slot === nextSlot);
                            if (!existingNext) {
                                parsedSessions.push({
                                    slot: nextSlot,
                                    time: SDIDayPlanParser.getTimeForSlot(nextSlot, courseCode),
                                    studentName: `(حصة مزدوجة تابعة) ${cleanStudentName}`,
                                    studentId: cleanStudentId,
                                    course: courseCode,
                                    location: loc,
                                    isDouble: true,
                                    classType: 'D',
                                    isDoublePart1: false,
                                    isDoublePart2: true,
                                    parentSlot: slotNum,
                                    hasDualStudents: false
                                });
                            } else if (existingNext.studentId === cleanStudentId || existingNext.studentName.includes(cleanStudentName)) {
                                existingNext.isDouble = true;
                                existingNext.classType = 'D';
                                existingNext.isDoublePart1 = false;
                                existingNext.isDoublePart2 = true;
                                existingNext.parentSlot = slotNum;
                            }
                        } else if (isDouble && currentStudentSlots.length === 1) {
                            // تنبيه: الطالب لديه حصة واحدة سابقة والحصة المسجلة الآن D، فيُمنح حصة slotNum فقط ليصل لحصتين ويُمنع من الحصة الثالثة
                            parsedWarnings.push({
                                type: 'DOUBLE_EXCEEDED_LIMIT',
                                studentName: cleanStudentName,
                                studentId: cleanStudentId,
                                slot: slotNum,
                                instructorId: instId,
                                instructorName: instName,
                                course: courseCode,
                                messageAr: `⚠️ خطأ وتنبيه رسمي: الحصة ${slotNum} مسجلة كحصة مزدوجة (D) للمتدرب (${cleanStudentName}) ولكن لديه حصة أخرى مسجلة. وفقاً لقاعدة (2 حصة فقط للشخص)، تم الاكتفاء بحصة ${slotNum} ومنع إضافة حصة تابعة تجنباً لإعطائه 3 حصص.`,
                                messageEn: `⚠️ Policy Warning: Slot ${slotNum} is Double (D) for student (${cleanStudentName}) with an existing slot. Capped at 2 slots; Part 2 blocked.`
                            });
                        }
                    }
                }
            });

            // التعامل الذكي مع الصفحات:
            // 1. إذا وجد رقم مدرب معتمد (instId): ننشئ أو ندمج مع المدرب
            if (instId) {
                let existingPlan = instructorsPlans.find(i => i.instructorId === instId);
                if (existingPlan) {
                    // دمج الحصص مع نفس المدرب في الصفحة السابقة
                    parsedSessions.forEach(newS => {
                        const sIdx = existingPlan.sessions.findIndex(s => s.slot === newS.slot);
                        if (sIdx !== -1) {
                            if (newS.hasDualStudents || newS.student2Name) {
                                existingPlan.sessions[sIdx].hasDualStudents = true;
                                existingPlan.sessions[sIdx].student2Name = newS.student2Name;
                                existingPlan.sessions[sIdx].student2Id = newS.student2Id;
                            }
                        } else {
                            existingPlan.sessions.push(newS);
                        }
                    });
                    existingPlan.sessions.sort((a, b) => a.slot - b.slot);
                    currentInstructor = existingPlan;
                } else {
                    const newPlan = {
                        instructorId: instId,
                        instructorName: instName || `مدرب ${instId}`,
                        shortName: (instName || `مدرب ${instId}`).split(' ').slice(0, 2).join(' '),
                        supervisorId: supervisorId,
                        date: planDate,
                        page: p,
                        sessions: parsedSessions
                    };
                    instructorsPlans.push(newPlan);
                    currentInstructor = newPlan;
                }
            } else if (parsedSessions.length > 0 && currentInstructor) {
                // 2. صفحة استكمال بدون ترويسة مدرب (مثل استكمال حصص المدرب روح الله نور كالحصة 23 و 24):
                // يتم إلحاق هذه الحصص تلقائياً بالمدرب في الصفحة السابقة كما وجه المستخدم بدقة
                parsedSessions.forEach(newS => {
                    const sIdx = currentInstructor.sessions.findIndex(s => s.slot === newS.slot);
                    if (sIdx !== -1) {
                        if (newS.hasDualStudents || newS.student2Name) {
                            currentInstructor.sessions[sIdx].hasDualStudents = true;
                            currentInstructor.sessions[sIdx].student2Name = newS.student2Name;
                            currentInstructor.sessions[sIdx].student2Id = newS.student2Id;
                        }
                    } else {
                        currentInstructor.sessions.push(newS);
                    }
                });
                currentInstructor.sessions.sort((a, b) => a.slot - b.slot);
            } else {
                // 3. صفحة فارغة أو بدون ترويسة مدرب ولا حصص: يتم تجاهلها تماماً وتفادي اختراع أي مدرب شبح
                // لا ننشئ أي مدرب بدون اسم أو رقم معتمد نهائياً
            }
        }

        return SDIDayPlanParser.finalizeDayPlan(instructorsPlans, file.name, parsedWarnings);
    },

    /**
     * معالجة ملف خطة اليوم بصيغة Excel أو CSV
     */
    async parseExcelFile(file) {
        if (typeof XLSX === 'undefined') {
            throw new Error("مكتبة قراءة الإكسل (SheetJS) غير محملة.");
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (!rows || rows.length < 2) {
                        throw new Error("ملف الإكسل فارغ أو لا يحتوي على صفوف كافية.");
                    }

                    const instructorsMap = {};
                    const parsedWarnings = [];
                    const header = rows[0].map(h => String(h || '').trim());

                    // تحديد الفهارس
                    let idIdx = header.findIndex(h => /رقم.*المدرب|instructor.*id|inst.*id|code/i.test(h));
                    let nameIdx = header.findIndex(h => /اسم.*المدرب|instructor.*name|instructor/i.test(h));
                    let slotIdx = header.findIndex(h => /رقم.*الحصة|حصة|slot/i.test(h));
                    let timeIdx = header.findIndex(h => /توقيت|وقت|time/i.test(h));
                    let studentIdx = header.findIndex(h => /اسم.*الطالب|طالب|student.*name|student/i.test(h));
                    let regIdx = header.findIndex(h => /رقم.*القيد|رقم.*الملف|student.*id|reg.*no|file.*no/i.test(h));
                    let courseIdx = header.findIndex(h => /دورة|كورس|course|category/i.test(h));
                    let locIdx = header.findIndex(h => /مكان|نوع.*التدريب|location|stage|yard|road|y\/r/i.test(h));
                    let dateIdx = header.findIndex(h => /تاريخ|date/i.test(h));

                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        const instId = String(row[idIdx !== -1 ? idIdx : 0] || '').trim();
                        if (!instId) continue;

                        const instName = String(row[nameIdx !== -1 ? nameIdx : 1] || `مدرب ${instId}`).trim();
                        const slotNum = parseInt(row[slotIdx !== -1 ? slotIdx : 2], 10);
                        if (isNaN(slotNum)) continue;

                        const timeVal = String(row[timeIdx !== -1 ? timeIdx : 3] || '').trim();
                        const studentName = String(row[studentIdx !== -1 ? studentIdx : 4] || 'طالب').trim();
                        const courseVal = String(row[courseIdx !== -1 ? courseIdx : 5] || 'LMFA30R').trim().toUpperCase();
                        let locVal = String(row[locIdx !== -1 ? locIdx : 6] || 'R').trim().toUpperCase();
                        if (/ساحة|باركنج|yard/i.test(locVal)) locVal = 'Y';
                        else if (/شارع|طريق|road/i.test(locVal)) locVal = 'R';
                        else if (locVal !== 'Y' && locVal !== 'R') locVal = 'R';

                        const regVal = String(row[regIdx !== -1 ? regIdx : 7] || '').trim();
                        const dateVal = String(row[dateIdx !== -1 ? dateIdx : 8] || '').trim();

                        const isDouble = /D$/i.test(courseVal);

                        if (!instructorsMap[instId]) {
                            instructorsMap[instId] = {
                                instructorId: instId,
                                instructorName: instName,
                                shortName: instName.split(' ').slice(0, 2).join(' '),
                                date: dateVal,
                                sessions: []
                            };
                        }

                        const isMc = /^MC/i.test(courseVal);
                        const cleanStudentName = studentName || 'طالب';
                        const cleanStudentId = regVal || '';

                        const existing = instructorsMap[instId].sessions.find(s => s.slot === slotNum);
                        if (existing) {
                            if (existing.isDoublePart2 && (existing.studentId === cleanStudentId || existing.studentName.includes(cleanStudentName))) {
                                existing.time = timeVal || existing.time;
                                existing.course = courseVal;
                                existing.location = locVal;
                                continue;
                            }

                            if (isMc && existing.location === 'Y' && locVal === 'Y') {
                                existing.hasDualStudents = true;
                                existing.student2Name = cleanStudentName;
                                existing.student2Id = cleanStudentId;
                                existing.student2Course = courseVal;
                                continue;
                            } else if (isMc && (existing.location === 'R' || locVal === 'R')) {
                                existing.hasRoadDualConflict = true;
                            }
                        }

                        // قاعدة الحصص المزدوجة والحد الأقصى: ممنوع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً
                        const currentStudentSlots = instructorsMap[instId].sessions.filter(s => 
                            (cleanStudentId && s.studentId === cleanStudentId) ||
                            (cleanStudentName && s.studentName && s.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim() === cleanStudentName)
                        );

                        if (currentStudentSlots.length >= 2) {
                            parsedWarnings.push({
                                type: 'STUDENT_LIMIT_EXCEEDED',
                                studentName: cleanStudentName,
                                studentId: cleanStudentId,
                                slot: slotNum,
                                instructorId: instId,
                                course: courseVal,
                                messageAr: `⚠️ خطأ وتنبيه رسمي: تم رصد محاولة إعطاء المتدرب (${cleanStudentName} - #${cleanStudentId || 'بدون كود'}) حصة إضافية (حصة ${slotNum}) رغم وصوله للحد الأقصى المعتمد (حصتان يومياً). تم استبعاد الحصة الزائدة وفق لوائح معهد الشارقة للسياقة.`,
                                messageEn: `⚠️ Policy Warning: Blocked extra class (Slot ${slotNum}) for student (${cleanStudentName} - #${cleanStudentId || 'N/A'}) who already reached 2 sessions.`
                            });
                            continue;
                        }

                        instructorsMap[instId].sessions.push({
                            slot: slotNum,
                            time: timeVal,
                            studentName: cleanStudentName,
                            studentId: cleanStudentId,
                            course: courseVal,
                            location: locVal,
                            isDouble: isDouble,
                            classType: isDouble ? 'D' : 'R',
                            isDoublePart1: isDouble,
                            isDoublePart2: false,
                            hasDualStudents: false
                        });

                        // تطبيق قاعدة الحصة المزدوجة (D): حصتان فقط لنفس المتدرب
                        if (isDouble && currentStudentSlots.length === 0) {
                            const nextSlot = slotNum + 1;
                            const existingNext = instructorsMap[instId].sessions.find(s => s.slot === nextSlot);
                            if (!existingNext) {
                                instructorsMap[instId].sessions.push({
                                    slot: nextSlot,
                                    time: SDIDayPlanParser.getTimeForSlot(nextSlot, courseVal),
                                    studentName: `(حصة مزدوجة تابعة) ${cleanStudentName}`,
                                    studentId: cleanStudentId,
                                    course: courseVal,
                                    location: locVal,
                                    isDouble: true,
                                    classType: 'D',
                                    isDoublePart1: false,
                                    isDoublePart2: true,
                                    parentSlot: slotNum,
                                    hasDualStudents: false
                                });
                            } else if (existingNext.studentId === cleanStudentId || existingNext.studentName.includes(cleanStudentName)) {
                                existingNext.isDouble = true;
                                existingNext.classType = 'D';
                                existingNext.isDoublePart1 = false;
                                existingNext.isDoublePart2 = true;
                                existingNext.parentSlot = slotNum;
                            }
                        } else if (isDouble && currentStudentSlots.length === 1) {
                            parsedWarnings.push({
                                type: 'DOUBLE_EXCEEDED_LIMIT',
                                studentName: cleanStudentName,
                                studentId: cleanStudentId,
                                slot: slotNum,
                                instructorId: instId,
                                course: courseVal,
                                messageAr: `⚠️ خطأ وتنبيه رسمي: الحصة ${slotNum} مسجلة كحصة مزدوجة (D) للمتدرب (${cleanStudentName}) ولكن لديه حصة أخرى مسجلة. وفقاً لقاعدة (2 حصة فقط للشخص)، تم الاكتفاء بحصة ${slotNum} ومنع إضافة حصة تابعة تجنباً لإعطائه 3 حصص.`,
                                messageEn: `⚠️ Policy Warning: Slot ${slotNum} is Double (D) for student (${cleanStudentName}) with an existing slot. Capped at 2 slots; Part 2 blocked.`
                            });
                        }
                    }

                    const list = Object.values(instructorsMap);
                    resolve(SDIDayPlanParser.finalizeDayPlan(list, file.name, parsedWarnings));
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = () => reject(new Error("فشل في قراءة ملف الإكسل."));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * إكمال وحساب الإحصائيات العامة لخطة اليوم
     */
    finalizeDayPlan(instructorsPlans, fileName, initialWarnings = []) {
        // تصفية أي مدربين أشباح أو بدون اسم أو بدون رقم وظيفي معتمد
        const validPlans = (instructorsPlans || []).filter(plan => {
            if (!plan) return false;
            if (!plan.instructorId || String(plan.instructorId).startsWith('INST_')) return false;
            if (!plan.instructorName || plan.instructorName.includes('undefined')) return false;
            if (!Array.isArray(plan.sessions) || plan.sessions.length === 0) return false;
            return true;
        });

        if (validPlans.length === 0) {
            throw new Error("لم يتم العثور على أي حصص أو مدربين معتمدين في ملف خطة اليوم المرفوع.");
        }
        instructorsPlans = validPlans;

        const globalWarnings = [...(initialWarnings || [])];
        const globalStudentSlotsMap = new Map();

        // 1. فحص وتطبيق قاعدة الحد الأقصى للمتدرب (حصتان فقط يومياً) عبر الخطة بأكملها وكافة المدربين
        instructorsPlans.forEach(plan => {
            // أولاً فحص وتطبيق الحد الأقصى داخل جدول المدرب نفسه
            plan.sessions = SDIDayPlanParser.enforceStudentDailyLimit(plan.sessions, globalWarnings, plan);

            // ثانياً فحص التكرار وتجاوز الحد الأقصى عبر المدربين الآخرين
            const verifiedSessions = [];
            plan.sessions.forEach(s => {
                const rawName = s.studentName ? s.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim() : '';
                const stKey = (s.studentId && s.studentId.trim()) ? s.studentId.trim() : rawName;

                if (stKey) {
                    const existingCount = globalStudentSlotsMap.get(stKey) || 0;
                    if (existingCount >= 2) {
                        // المتدرب وصل بالفعل إلى الحد الأقصى المعتمد (حصتان يومياً)
                        globalWarnings.push({
                            type: 'STUDENT_LIMIT_EXCEEDED',
                            studentName: rawName || stKey,
                            studentId: s.studentId || '',
                            slot: s.slot,
                            instructorId: plan.instructorId,
                            instructorName: plan.shortName || plan.instructorName,
                            messageAr: `⚠️ خطأ وتنبيه رسمي: تم استبعاد الحصة ${s.slot} للمتدرب (${rawName || stKey}) لدى المدرب (${plan.shortName || plan.instructorName})؛ لتجاوز الحد الأقصى المعتمد (حصتان فقط للمتدرب يومياً وفق لوائح المعهد).`,
                            messageEn: `⚠️ Policy Warning: Blocked extra session (Slot ${s.slot}) for student (${rawName || stKey}) with instructor (${plan.shortName || plan.instructorName}) exceeding 2 daily sessions limit.`
                        });
                        return; // لا تضف الحصة
                    }
                    globalStudentSlotsMap.set(stKey, existingCount + 1);
                }
                verifiedSessions.push(s);
            });
            plan.sessions = verifiedSessions;

            // استيراد بيانات الملاك التدريبي المعتمد وقواعد المشرف
            if (typeof SDIMasterRoster !== 'undefined') {
                const isSup = SDIMasterRoster.isSupervisor(plan);
                const rosterEntry = SDIMasterRoster.find(plan.instructorId || plan.instructorName);
                if (rosterEntry) {
                    plan.gender = rosterEntry.gender;
                    plan.role = rosterEntry.role;
                    plan.isSupervisor = (rosterEntry.role === 'supervisor' || rosterEntry.shift === 'SUP' || isSup);
                    plan.shiftCode = rosterEntry.shiftCode;
                } else if (isSup) {
                    plan.isSupervisor = true;
                    plan.role = 'supervisor';
                    plan.shift = 'SUP';
                    const cat = plan.sessions[0]?.course?.startsWith('LMFA') ? 'LMFA' : (plan.sessions[0]?.course?.startsWith('MC') ? 'MC' : (plan.sessions[0]?.course?.startsWith('HT') ? 'HT' : 'LMFM'));
                    plan.shiftCode = `SUP-${cat}`;
                }
            }

            // ترتيب الحصص
            plan.sessions.sort((a, b) => a.slot - b.slot);

            // إحصائيات المدرب
            plan.yardCount = plan.sessions.filter(s => s.location === 'Y').length;
            plan.roadCount = plan.sessions.filter(s => s.location === 'R').length;
            plan.doubleCount = plan.sessions.filter(s => s.isDouble).length;
            plan.totalCount = plan.sessions.length;
        });

        let totalSessions = 0;
        let totalYardSessions = 0;
        let totalRoadSessions = 0;
        let totalDoubleSessions = 0;
        let totalRegularSessions = 0;

        instructorsPlans.forEach(plan => {
            plan.sessions.forEach(s => {
                totalSessions++;
                if (s.location === 'Y') totalYardSessions++;
                else totalRoadSessions++;

                if (s.isDouble) totalDoubleSessions++;
                else totalRegularSessions++;
            });
        });

        const defaultDate = instructorsPlans[0]?.date || new Date().toLocaleDateString('ar-AE');

        // إزالة أي تحذيرات مكررة بنفس رقم الحصة والمتدرب
        const uniqueWarnings = [];
        const seenWarnKeys = new Set();
        globalWarnings.forEach(w => {
            const key = `${w.type}_${w.studentId || w.studentName}_${w.slot}_${w.instructorId || ''}`;
            if (!seenWarnKeys.has(key)) {
                seenWarnKeys.add(key);
                uniqueWarnings.push(w);
            }
        });

        return {
            success: true,
            fileName: fileName,
            date: defaultDate,
            instructors: instructorsPlans,
            warnings: uniqueWarnings,
            hasWarnings: uniqueWarnings.length > 0,
            stats: {
                totalInstructors: instructorsPlans.length,
                totalSessions: totalSessions,
                yardSessions: totalYardSessions,
                roadSessions: totalRoadSessions,
                doubleSessions: totalDoubleSessions,
                regularSessions: totalRegularSessions,
                yardPercentage: totalSessions > 0 ? ((totalYardSessions / totalSessions) * 100).toFixed(1) : "0.0",
                roadPercentage: totalSessions > 0 ? ((totalRoadSessions / totalSessions) * 100).toFixed(1) : "0.0"
            }
        };
    },
    /**
     * معالجة مجموعة من ملفات خطة اليوم ودمجها معاً في خطة موحدة
     * تتيح رفع عدة ملفات PDF أو Excel في نفس الوقت وتوحيد الحصص
     * @param {Array<File>|FileList} files
     */
    async parseMultipleFiles(files) {
        const fileList = Array.from(files || []);
        if (fileList.length === 0) {
            throw new Error("لم يتم تحديد أي ملفات للمعالجة.");
        }

        if (fileList.length === 1) {
            const f = fileList[0];
            const lower = f.name.toLowerCase();
            if (lower.endsWith('.pdf')) return await this.parsePdfFile(f);
            return await this.parseExcelFile(f);
        }

        const parsedResults = [];
        const fileNames = [];

        for (const f of fileList) {
            const lower = f.name.toLowerCase();
            try {
                let res;
                if (lower.endsWith('.pdf')) {
                    res = await this.parsePdfFile(f);
                } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
                    res = await this.parseExcelFile(f);
                } else {
                    continue; // تخطي الملفات غير المدعومة
                }
                if (res && res.instructors && res.instructors.length > 0) {
                    parsedResults.push(res);
                    fileNames.push(f.name);
                }
            } catch (err) {
                console.warn(`[SDIDayPlanParser] تعذر تحليل الملف "${f.name}":`, err);
            }
        }

        if (parsedResults.length === 0) {
            throw new Error("فشل استخراج أي بيانات صالحة من الملفات المرفوعة.");
        }

        // دمج المدربين من كافة الملفات المرفوعة
        const mergedInstructorsMap = {};
        let defaultDate = parsedResults[0]?.date || '';

        parsedResults.forEach(res => {
            if (res.date && !defaultDate) defaultDate = res.date;
            (res.instructors || []).forEach(inst => {
                const key = String(inst.instructorId).trim();
                if (!mergedInstructorsMap[key]) {
                    mergedInstructorsMap[key] = {
                        ...inst,
                        sessions: [...inst.sessions]
                    };
                } else {
                    const existing = mergedInstructorsMap[key];
                    if (!existing.instructorName && inst.instructorName) existing.instructorName = inst.instructorName;
                    if (!existing.supervisorId && inst.supervisorId) existing.supervisorId = inst.supervisorId;
                    if (!existing.category && inst.category) existing.category = inst.category;
                    if (!existing.trainingCategory && inst.trainingCategory) existing.trainingCategory = inst.trainingCategory;
                    // دمج الحصص بدون تكرار
                    inst.sessions.forEach(newS => {
                        const sIdx = existing.sessions.findIndex(s => s.slot === newS.slot);
                        if (sIdx !== -1) {
                            if (newS.hasDualStudents || newS.student2Name) {
                                existing.sessions[sIdx].hasDualStudents = true;
                                existing.sessions[sIdx].student2Name = newS.student2Name;
                                existing.sessions[sIdx].student2Id = newS.student2Id;
                                existing.sessions[sIdx].student2Course = newS.student2Course;
                            }
                        } else {
                            existing.sessions.push(newS);
                        }
                    });
                    existing.sessions.sort((a, b) => a.slot - b.slot);
                }
            });
        });

        const mergedList = Object.values(mergedInstructorsMap);
        mergedList.forEach(inst => {
            if (!inst.date && defaultDate) inst.date = defaultDate;
        });
        const combinedTitle = `${fileNames.length} ملفات: ${fileNames.join(' + ')}`;
        const finalPlan = this.finalizeDayPlan(mergedList, combinedTitle);
        if (defaultDate) finalPlan.date = defaultDate;
        return finalPlan;
    },

    /**
     * تدقيق وتطهير الحصص وضمان قاعدة الحصص المزدوجة:
     * - الحصة المزدوجة حصتان متتاليتان فقط لنفس المتدرب (S و S+1).
     * - ممنوع إعطاء أكثر من حصتين (2 حصة) للمتدرب الواحد يومياً.
     * - منع أي تكرار أو تسلسل غير مقصود لحصص تالية.
     */
    enforceStudentDailyLimit(sessions, warningsOut = null, planContext = null) {
        if (!Array.isArray(sessions) || sessions.length === 0) return [];
        
        // 1. إزالة أي تكرار لنفس رقم الحصة
        const slotMap = new Map();
        sessions.forEach(s => {
            if (!slotMap.has(s.slot)) {
                slotMap.set(s.slot, { ...s });
            } else {
                const existing = slotMap.get(s.slot);
                if (s.hasDualStudents || s.student2Name) {
                    existing.hasDualStudents = true;
                    existing.student2Name = s.student2Name;
                    existing.student2Id = s.student2Id;
                    existing.student2Course = s.student2Course;
                }
            }
        });

        const uniqueSessions = Array.from(slotMap.values()).sort((a, b) => a.slot - b.slot);

        // 2. فحص وتطبيق الحد الأقصى للمتدرب (حصتان فقط يومياً)
        const studentCountMap = new Map();
        const verifiedSessions = [];

        for (const s of uniqueSessions) {
            const rawName = s.studentName ? s.studentName.replace(/\(حصة مزدوجة تابعة\)\s*/g, '').trim() : '';
            const stKey = (s.studentId && s.studentId.trim()) ? s.studentId.trim() : rawName;
            
            if (stKey) {
                const curCount = studentCountMap.get(stKey) || 0;
                if (curCount >= 2) {
                    // المتدرب وصل بالفعل إلى الحد الأقصى المعتمد (حصتان يومياً)
                    if (warningsOut && Array.isArray(warningsOut)) {
                        warningsOut.push({
                            type: 'STUDENT_LIMIT_EXCEEDED',
                            studentName: rawName || stKey,
                            studentId: s.studentId || '',
                            slot: s.slot,
                            instructorId: planContext?.instructorId || '',
                            instructorName: planContext?.shortName || planContext?.instructorName || '',
                            messageAr: `⚠️ خطأ وتنبيه رسمي: تم استبعاد الحصة ${s.slot} للمتدرب (${rawName || stKey})؛ تجاوز الحد الأقصى (حصتان يومياً فقط).`,
                            messageEn: `⚠️ Policy Warning: Excluded slot ${s.slot} for student (${rawName || stKey}); exceeded 2 daily classes limit.`
                        });
                    }
                    continue;
                }
                studentCountMap.set(stKey, curCount + 1);
            }
            verifiedSessions.push(s);
        }

        return verifiedSessions;
    },

    /**
     * حساب التوقيت التقديري للحصة عند التكرار المزدوج
     */
    getTimeForSlot(slotNum, courseCode) {
        if (/^MC/i.test(courseCode) && typeof MC_TIME_SLOTS !== 'undefined') {
            const found = MC_TIME_SLOTS.find(t => t.id === slotNum);
            return found ? found.time : "";
        }
        if (/^HT/i.test(courseCode) && typeof HT_TIME_SLOTS !== 'undefined') {
            const found = HT_TIME_SLOTS.find(t => t.id === slotNum);
            return found ? found.time : "";
        }
        if (typeof LM_TIME_SLOTS !== 'undefined') {
            const found = LM_TIME_SLOTS.find(t => t.id === slotNum);
            return found ? found.time : "";
        }
        return "";
    }
};

if (typeof window !== 'undefined') {
    window.SDIDayPlanParser = SDIDayPlanParser;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SDIDayPlanParser };
}
