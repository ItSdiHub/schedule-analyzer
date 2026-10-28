/**
 * معالج ملفات الـ PDF الرسمية لمعهد الشارقة للسياقة (SDI)
 * Sharjah Driving Institute LLC - Instructor Availability PDF Parser
 * مبني على مكتبة PDF.js مع فرز بصري فائق الدقة (Visual Coordinate Stream Reconstruction)
 * 
 * المطور: م/ محمود محمد
 */

const SDIPdfParser = {
    /**
     * قراءة واستخراج البيانات من ملف PDF المرفوع
     */
    async parsePdfFile(file) {
        const lib = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
        if (!lib) {
            throw new Error("مكتبة قراءة الـ PDF (pdf.min.js) غير متوفرة.");
        }

        // ضبط مسار الـ worker للمتصفح
        try {
            if (typeof window !== 'undefined' && lib.GlobalWorkerOptions) {
                lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
            }
        } catch (e) {
            console.warn("PDF worker configuration note:", e);
        }

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = lib.getDocument({
            data: arrayBuffer,
            cMapUrl: 'vendor/',
            cMapPacked: true
        });
        const pdfDoc = await loadingTask.promise;

        const instructorsMap = {};
        let lastActiveInstId = null;
        let lastActiveInstName = null;

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // 1. تصفية العناصر النصية وترتيبها بصرياً (من الأعلى إلى الأسفل Y ثم من اليسار إلى اليمين X)
            const items = textContent.items.filter(it => it.str && it.str.trim().length > 0);
            items.sort((a, b) => {
                const yDiff = b.transform[5] - a.transform[5];
                if (Math.abs(yDiff) > 4) return yDiff; // فرق السطر الرأسي
                return a.transform[4] - b.transform[4]; // نفس السطر: اليسار إلى اليمين
            });

            // 2. إعادة تجميع الأسطر المرئية المتناسقة
            const lines = [];
            let currentLine = [];
            let currentY = null;

            for (const item of items) {
                if (currentY === null || Math.abs(item.transform[5] - currentY) > 4) {
                    if (currentLine.length > 0) {
                        lines.push(currentLine.map(it => it.str.trim()).join(' '));
                    }
                    currentLine = [item];
                    currentY = item.transform[5];
                } else {
                    currentLine.push(item);
                }
            }
            if (currentLine.length > 0) {
                lines.push(currentLine.map(it => it.str.trim()).join(' '));
            }

            // 3. استخراج المدرب والطلاب من الأسطر المرئية
            let pageInstId = null;
            let pageInstName = null;
            const pageStudents = [];

            for (const line of lines) {
                // الكشف عن رأس بيانات المدرب:
                // يدعم الإنجليزية والعربية ومختلف صيغ الـ ID
                const instMatch = line.match(/(?:Instructor|المدرب)\s*(?:ID|Code|No)?\s*[:\-]?\s*(\d{4,8})\s*(?:ALL\s*-\s*)?(.*)/i);
                if (instMatch) {
                    pageInstId = instMatch[1].trim();
                    let name = instMatch[2].trim().replace(/^(?:ALL\s*-\s*|-|\:)/i, '').trim();
                    pageInstName = name || `مدرب ${pageInstId}`;
                    lastActiveInstId = pageInstId;
                    lastActiveInstName = pageInstName;
                    continue;
                }

                // الكشف عن صف الطالب مع الحصة والتوقيت
                // يدعم [06:20-07:00] و (06:20-07:00) ومسافات إضافية
                const slotTimeMatch = line.match(/(\d{1,2})\s*[\[\(]\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*[\]\)]/);
                if (slotTimeMatch) {
                    const slotNum = parseInt(slotTimeMatch[1], 10);
                    const timeStr = `${slotTimeMatch[2]}-${slotTimeMatch[3]}`;

                    // أيام التدريب
                    const daysMatch = line.match(/\b(SAT-MON-WED|SUN-TUE-THU|SAT-THU|FRI-SAT|SAT-FRI|DAILY)\b/i);
                    const days = daysMatch ? daysMatch[1].toUpperCase() : 'SAT-THU';

                    // نوع الدورة
                    const courseMatch = line.match(/\b(LM[FA]M?\d*\w*|MC[FA]?M?\d*\w*|HT[FA]?M?\d*\w*)\b/i);
                    const course = courseMatch ? courseMatch[1].toUpperCase() : 'LMFM30R';

                    // رقم ملف الطالب
                    const idMatch = line.match(/\b(2[4-9]\d{6,7}|\d{7,8})\b/);
                    const stId = idMatch ? idMatch[1] : '';

                    // اسم الطالب
                    let stName = '';
                    if (idMatch && courseMatch) {
                        const idIdx = line.indexOf(stId);
                        const courseIdx = line.indexOf(courseMatch[0]);
                        if (idIdx !== -1 && courseIdx > idIdx) {
                            stName = line.slice(idIdx + stId.length, courseIdx).trim();
                        }
                    }

                    pageStudents.push({
                        id: stId,
                        name: stName,
                        course: course,
                        days: days,
                        slot: slotNum,
                        time: timeStr
                    });
                }
            }

            // في حال لم يتم التقاط المدرب في حلقة الأسطر، ابحث عنه في النص الخام للصفحة
            if (!pageInstId) {
                const fullPageText = items.map(it => it.str).join(' ');
                const rawInstMatch = fullPageText.match(/(?:Instructor|المدرب)\s*[:\-]?\s*(\d{4,8})/i);
                if (rawInstMatch) {
                    pageInstId = rawInstMatch[1].trim();
                    const nameMatch = fullPageText.match(/ALL\s*-\s*([A-Za-z\s]+?)(?=\s+Instructor|\s+Student|\s+Total|$)/i);
                    pageInstName = nameMatch ? nameMatch[1].trim() : `مدرب ${pageInstId}`;
                    lastActiveInstId = pageInstId;
                    lastActiveInstName = pageInstName;
                } else if (lastActiveInstId && pageStudents.length > 0) {
                    // صفحة تابعة لنفس المدرب السابق
                    pageInstId = lastActiveInstId;
                    pageInstName = lastActiveInstName;
                }
            }

            // تسجيل المدرب والطلاب المستخرجين في الصفحة
            if (pageInstId) {
                if (!instructorsMap[pageInstId]) {
                    instructorsMap[pageInstId] = {
                        id: pageInstId,
                        name: pageInstName || `مدرب ${pageInstId}`,
                        shortName: (pageInstName || `مدرب ${pageInstId}`).split(' ').slice(0, 2).join(' '),
                        students: []
                    };
                }
                instructorsMap[pageInstId].students.push(...pageStudents);
            }
        }

        const parsedInstructors = Object.values(instructorsMap);
        if (parsedInstructors.length === 0) {
            throw new Error("لم يتم العثور على جداول تدريب معتمدة في ملف الـ PDF. يرجى التأكد من اختيار ملف Instructor Availability الصادر من المعهد.");
        }

        // تحويل البيانات المستخرجة إلى هيكل المدربين الرسمي المعتمد للمعهد
        return this.buildOfficialInstructorsFromParsed(parsedInstructors);
    },

    /**
     * تحويل الطلاب المستخرجين إلى كائنات المدربين مع التكويد الذكي وحساب الحصص الفارغة
     */
    buildOfficialInstructorsFromParsed(parsedList) {
        return parsedList.map((p, index) => {
            const studentsList = Array.isArray(p.students) ? p.students : (Array.isArray(p.scheduleSlots) ? p.scheduleSlots.map(s => ({ slot: s.slotNumber || s.slot, days: (s.satStatus === 'occupied' && s.sunStatus === 'occupied') ? 'SAT-THU' : (s.satStatus === 'occupied' ? 'SAT-MON-WED' : (s.sunStatus === 'occupied' ? 'SUN-TUE-THU' : '')) })) : []);

            // 1. تحديد الفئة من كود الدورة (LMFM, LMFA, MC, HT, LB) أو من الملاك المعتمد
            let category = "LMFM";
            let vehicleType = "خفيفة (LM)";
            let minSlot = 1;
            let maxSlot = 10;

            const rosterEntry = (typeof SDIMasterRoster !== 'undefined') ? SDIMasterRoster.lookup(p.id || p.instructorId, p.name || p.instructorName) : null;
            const isFem = (p.gender === 'female') || (rosterEntry ? (rosterEntry.gender === 'female') : false);
            const isAst = rosterEntry ? (rosterEntry.role === 'assistant' || rosterEntry.shift === 'AST' || (typeof SDIMasterRoster !== 'undefined' && SDIMasterRoster.isAssistant && SDIMasterRoster.isAssistant(rosterEntry))) : false;
            const isSup = rosterEntry ? (rosterEntry.role === 'supervisor' || rosterEntry.shift === 'SUP' || (typeof SDIMasterRoster !== 'undefined' && SDIMasterRoster.isSupervisor && SDIMasterRoster.isSupervisor(rosterEntry))) : false;
            const isFlex = isAst || isSup;

            const firstCourse = studentsList[0]?.course || p.courses?.[0] || p.course || "";
            if (/^LMFA/i.test(firstCourse)) {
                category = "LMFA";
                vehicleType = "خفيفة أوتوماتيك (LMFA)";
            } else if (/^MC/i.test(firstCourse)) {
                category = "MC";
                vehicleType = "دراجة نارية (MC)";
                minSlot = 6;
                maxSlot = 17;
            } else if (/^(HB|HBFM|HBFA|LB|LBFM|LBFA)/i.test(firstCourse) || /bus/i.test(firstCourse)) {
                category = "HB";
                vehicleType = "باص ثقيل (HBFM)";
                minSlot = 1;
                maxSlot = 12;
            } else if (/^HT/i.test(firstCourse)) {
                category = "HT";
                vehicleType = "شاحنة ثقيلة (HT)";
                minSlot = 1;
                maxSlot = 12;
            }

            // 2. تحديد الفترة (الوردية) والتكويد الذكي
            let shift = "S1"; // الفترة الأولى
            let shiftName = "الفترة الأولى (1 - 10)";
            let shiftCode = `${category}-S1`;

            if (isFlex) {
                shift = isAst ? "AST" : "SUP";
                shiftName = isAst ? "مساعد مدرب - جدول مرن (تكليف مباشر)" : "مشرف (Supervisor) - تكليف عند الحاجة";
                shiftCode = `${shift}-${category}`;
                minSlot = 1;
                maxSlot = (category === "HT" || category === "HB" || category === "LB" || category === "MC") ? (category === "MC" ? 26 : 24) : 20;
            } else if (category === "MC") {
                // خوارزمية التوقع الذكية لحساب ورديات الدراجة النارية:
                // - إذا كانت الحصص تبدأ من 6 أو تتراوح بين 6 و 17/18: وردية واحدة ثابتة بالفرع (FIX: 6 إلى 17)
                // - إذا كانت الحصص تبدأ من 1 أو أقل من/تساوي 13: وردية أولى صباحية بالمركز الرئيسي (S1: 1 إلى 13)
                // - إذا كانت الحصص تبدأ من 14 أو أكثر: وردية ثانية مسائية بالمركز الرئيسي (S2: 14 إلى 26)
                const mcSlots = studentsList.map(s => s.slot).filter(s => typeof s === 'number' && !isNaN(s));
                if (mcSlots.length > 0) {
                    const minDetected = Math.min(...mcSlots);
                    const maxDetected = Math.max(...mcSlots);
                    if (minDetected >= 6 && maxDetected <= 18) {
                        shift = "FIX";
                        shiftName = "فترة ثابتة بالفرع (6 - 17) [12 حصة]";
                        shiftCode = "MC-FIX";
                        minSlot = 6;
                        maxSlot = 17;
                    } else if (minDetected <= 5 || (minDetected === 1 && maxDetected <= 13) || maxDetected <= 13) {
                        shift = "S1";
                        shiftName = "الفترة الأولى صباحي (1 - 13) [13 حصة]";
                        shiftCode = "MC-S1";
                        minSlot = 1;
                        maxSlot = 13;
                    } else if (minDetected >= 14 || maxDetected > 18) {
                        shift = "S2";
                        shiftName = "الفترة الثانية مسائي (14 - 26) [13 حصة]";
                        shiftCode = "MC-S2";
                        minSlot = 14;
                        maxSlot = 26;
                    } else {
                        shift = rosterEntry?.shift || "FIX";
                        if (shift === "S1") { minSlot = 1; maxSlot = 13; shiftCode = "MC-S1"; shiftName = "الفترة الأولى صباحي (1 - 13) [13 حصة]"; }
                        else if (shift === "S2") { minSlot = 14; maxSlot = 26; shiftCode = "MC-S2"; shiftName = "الفترة الثانية مسائي (14 - 26) [13 حصة]"; }
                        else { shift = "FIX"; minSlot = 6; maxSlot = 17; shiftCode = "MC-FIX"; shiftName = "فترة ثابتة بالفرع (6 - 17) [12 حصة]"; }
                    }
                } else {
                    shift = rosterEntry?.shift || "FIX";
                    if (shift === "S1") { minSlot = 1; maxSlot = 13; shiftCode = "MC-S1"; shiftName = "الفترة الأولى صباحي (1 - 13) [13 حصة]"; }
                    else if (shift === "S2") { minSlot = 14; maxSlot = 26; shiftCode = "MC-S2"; shiftName = "الفترة الثانية مسائي (14 - 26) [13 حصة]"; }
                    else { shift = "FIX"; minSlot = 6; maxSlot = 17; shiftCode = "MC-FIX"; shiftName = "فترة ثابتة بالفرع (6 - 17) [12 حصة]"; }
                }
            } else if (category === "HT" || category === "HB" || category === "LB") {
                const maxSlotEncountered = studentsList.length > 0 ? Math.max(...studentsList.map(s => s.slot)) : 1;
                const isHB = (category === "HB" || category === "LB");
                const codePrefix = isHB ? "HBFM" : "HTFM";
                const nameAr = isHB ? "باص ثقيل (HBFM)" : "شاحنة ثقيلة (HTFM)";
                if (maxSlotEncountered > 12) {
                    shift = "S2";
                    shiftName = `الفترة الثانية (13 - 24) [12 حصة]`;
                    shiftCode = `${codePrefix}-S2`;
                    minSlot = 13;
                    maxSlot = 24;
                } else {
                    shift = "S1";
                    shiftName = `الفترة الأولى (1 - 12) [12 حصة]`;
                    shiftCode = `${codePrefix}-S1`;
                    minSlot = 1;
                    maxSlot = 12;
                }
            } else {
                // مركبة خفيفة (LMFA / LMFM)
                const hasEvening = studentsList.some(s => s.slot >= 11);
                const hasMorning = studentsList.some(s => s.slot <= 10);
                const isS2 = (hasEvening && !hasMorning) || (studentsList.length > 0 && Math.max(...studentsList.map(s => s.slot)) > 10) || (rosterEntry && rosterEntry.shift === 'S2');

                if (isFem) {
                    // جدول السيدات المعتمد: 9 حصص يومياً (18 حصة معتمدة في الويك إند: 1-9 صباحاً أو 11-19 مساءً)
                    if (isS2) {
                        shift = "S2";
                        shiftName = "الفترة المسائية سيدات (11 - 19) [9 حصص]";
                        shiftCode = `${category}-S2-F`;
                        minSlot = 11;
                        maxSlot = 19;
                    } else {
                        shift = "S1";
                        shiftName = "الفترة الصباحية سيدات (1 - 9) [9 حصص]";
                        shiftCode = `${category}-S1-F`;
                        minSlot = 1;
                        maxSlot = 9;
                    }
                } else {
                    // جدول الذكور: 10 حصص يومياً (20 حصة معتمدة في الويك إند: 1-10 صباحاً أو 11-20 مساءً)
                    if (isS2) {
                        shift = "S2";
                        shiftName = "الفترة الثانية (11 - 20) [10 حصص]";
                        shiftCode = `${category}-S2`;
                        minSlot = 11;
                        maxSlot = 20;
                    } else {
                        shift = "S1";
                        shiftName = "الفترة الأولى (1 - 10) [10 حصص]";
                        shiftCode = `${category}-S1`;
                        minSlot = 1;
                        maxSlot = 10;
                    }
                }
            }

            // 3. بناء الجدول الكامل لجميع الحصص
            const fullSchedule = [];
            const startSlot = (category === "MC") ? 1 : (((category === "HT" || category === "HB" || category === "LB") && shift === "S2") ? 13 : 1);
            const endSlot = (category === "MC") ? 26 : ((category === "HT" || category === "HB" || category === "LB") ? 24 : 20);

            for (let s = startSlot; s <= endSlot; s++) {
                fullSchedule.push({
                    slot: s,
                    sat: "empty",
                    sun: "empty",
                    origSat: "empty",
                    origSun: "empty"
                });
            }

            // 4. إسقاط حجوزات الطلاب مع تفاصيل الطالب
            studentsList.forEach(st => {
                const sObj = fullSchedule.find(s => s.slot === st.slot);
                if (sObj) {
                    const studentDetails = {
                        studentName: st.name || st.studentName || '',
                        studentId: st.id || st.studentId || '',
                        course: st.course || category,
                        location: st.location || (/Y/i.test(st.course || '') ? 'Y' : 'R'),
                        isDouble: !!st.isDouble,
                        classType: st.classType || 'R',
                        isDoublePart1: !!st.isDoublePart1,
                        isDoublePart2: !!st.isDoublePart2,
                        time: st.time || '',
                        isFixed: false
                    };

                    if (st.days === "SAT-MON-WED") {
                        sObj.sat = "occupied";
                        sObj.origSat = "occupied";
                        sObj.satDetails = Object.assign({}, studentDetails);
                    } else if (st.days === "SUN-TUE-THU") {
                        sObj.sun = "occupied";
                        sObj.origSun = "occupied";
                        sObj.sunDetails = Object.assign({}, studentDetails);
                    } else if (st.days === "SAT-THU" || st.days === "DAILY" || st.days === "SAT-FRI" || st.days === "FRI-SAT") {
                        sObj.sat = "occupied";
                        sObj.origSat = "occupied";
                        sObj.sun = "occupied";
                        sObj.origSun = "occupied";
                        sObj.satDetails = Object.assign({}, studentDetails);
                        sObj.sunDetails = Object.assign({}, studentDetails);
                    }
                }
            });

            // 5. حساب الإشغال والحصص الفارغة ضمن فترة عمل وردية المدرب
            let occCount = 0;
            let empCount = 0;
            let cap = 0;
            let rate = 0.0;

            if (isFlex) {
                fullSchedule.forEach(s => {
                    if (s.sat === "occupied") occCount++;
                    if (s.sun === "occupied") occCount++;
                });
                cap = occCount;
                empCount = 0;
                rate = occCount > 0 ? 100.0 : 0.0;
            } else {
                const shiftSlots = fullSchedule.filter(s => s.slot >= minSlot && s.slot <= maxSlot);
                shiftSlots.forEach(s => {
                    if (s.sat === "occupied") occCount++; else empCount++;
                    if (s.sun === "occupied") occCount++; else empCount++;
                });
                cap = occCount + empCount;
                rate = cap > 0 ? parseFloat(((occCount / cap) * 100).toFixed(1)) : 0.0;
            }

            // 6. توليد صفوف الحصص الفارغة للتقرير الثاني
            const slotsRows = SDIPdfParser.generateEmptySlotsRows(fullSchedule, category, shift, isFem ? 'female' : 'male');

            return {
                id: p.id,
                name: p.name,
                shortName: p.shortName,
                gender: isFem ? 'female' : 'male',
                role: isFlex ? (isAst ? 'assistant' : 'supervisor') : 'instructor',
                isSupervisor: isSup,
                isAssistant: isAst,
                isFlexible: isFlex,
                category: category,
                vehicleType: vehicleType,
                shift: shift,
                shiftName: shiftName,
                shiftCode: shiftCode,
                capacity: cap,
                occupied: occCount,
                empty: empCount,
                rate: rate,
                minSlot: minSlot,
                maxSlot: maxSlot,
                note: "",
                reportPage: Math.floor(index / 2) + 1,
                slotsRows: slotsRows,
                fullSchedule: fullSchedule,
                students: studentsList
            };
        });
    },

    generateEmptySlotsRows(schedule, category = "LMFM", shift = "S1", gender = "male") {
        let isFem = (gender === "female");

        if (typeof category === 'number') {
            const numMin = category;
            const numMax = shift;
            if (numMin >= 11) {
                shift = 'S2';
                category = 'LMFM';
            } else if (numMin === 6 && numMax === 17) {
                category = 'MC';
                shift = 'FIX';
            } else {
                shift = 'S1';
                category = 'LMFM';
            }
        }

        if (shift === 'SUP' || shift === 'AST') {
            // المشرف ومساعد المدرب: جدول مرن وليس لديه أي حصص فارغة
            return [];
        }

        if (!schedule) return [];
        let list = [];
        if (Array.isArray(schedule)) {
            list = schedule;
        } else if (typeof schedule === 'object' && (schedule['sat-mon-wed'] || schedule['sun-tue-thu'])) {
            const slotsMap = new Map();
            (schedule['sat-mon-wed'] || []).forEach(s => {
                slotsMap.set(s.slot, { slot: s.slot, sat: s.occupied ? 'occupied' : 'empty', sun: 'empty' });
            });
            (schedule['sun-tue-thu'] || []).forEach(s => {
                if (slotsMap.has(s.slot)) {
                    slotsMap.get(s.slot).sun = s.occupied ? 'occupied' : 'empty';
                } else {
                    slotsMap.set(s.slot, { slot: s.slot, sat: 'empty', sun: s.occupied ? 'occupied' : 'empty' });
                }
            });
            list = Array.from(slotsMap.values()).sort((a, b) => a.slot - b.slot);
        } else {
            return [];
        }

        const rows = [];

        let minSlot = 1;
        let maxSlot = 10;

        if (category === "MC") {
            if (shift === "S1") {
                minSlot = 1;
                maxSlot = 13;
            } else if (shift === "S2") {
                minSlot = 14;
                maxSlot = 26;
            } else {
                minSlot = 6;
                maxSlot = 17;
            }
        } else if (category === "HT" || category === "HB" || category === "LB") {
            if (shift === "S2") {
                minSlot = 13;
                maxSlot = 24;
            } else {
                minSlot = 1;
                maxSlot = 12;
            }
        } else {
            // مركبة خفيفة (LMFA / LMFM)
            if (isFem) {
                // جدول السيدات: 9 حصص يومياً (1 إلى 9 صباحاً أو 11 إلى 19 مساءً)
                if (shift === "S2") {
                    minSlot = 11;
                    maxSlot = 19;
                } else {
                    minSlot = 1;
                    maxSlot = 9;
                }
            } else {
                // جدول الذكور: 10 حصص يومياً (1 إلى 10 صباحاً أو 11 إلى 20 مساءً)
                if (shift === "S2") {
                    minSlot = 11;
                    maxSlot = 20;
                } else {
                    minSlot = 1;
                    maxSlot = 10;
                }
            }
        }

        list.filter(s => s.slot >= minSlot && s.slot <= maxSlot).forEach(s => {
            if (s.sat === "empty" || s.sun === "empty") {
                rows.push({
                    slotDisplay: String(s.slot),
                    sat: s.sat === "occupied" ? "مشغولة" : "خالية",
                    sun: s.sun === "occupied" ? "مشغولة" : "خالية"
                });
            }
        });

        return rows;
    }
};

if (typeof window !== 'undefined') {
    window.SDIPdfParser = SDIPdfParser;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SDIPdfParser };
}
