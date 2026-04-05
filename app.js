// ==================== State ====================
let plan = {
    "1-1": [], "1-2": [],
    "2-1": [], "2-2": [],
    "3-1": [], "3-2": [],
    "4-1": [], "4-2": [],
};

let customCourses = [];
let activePrograms = [];    // array of keys into PROGRAM_PRESETS
let presetCourses = [];     // merged courses from all active programs
let draggedCourse = null;
let draggedProgram = null;

const CREDIT_CAP = 288;
const MATH_MAJOR_CREDITS = 96;
const CC_CREDITS = 36;
const LANG_CREDITS = 18;

// ==================== Init ====================
document.addEventListener("DOMContentLoaded", () => {
    loadFromStorage();
    rebuildPresetCourses();
    renderProgramPool();
    renderMyDegree();
    renderCoursePool();
    renderAllSemesters();
    updateDashboard();
    setupEventListeners();
});

// ==================== Program Drag & Drop ====================
function renderProgramPool() {
    const container = document.getElementById("available-programs");
    container.innerHTML = "";

    for (const [key, preset] of Object.entries(PROGRAM_PRESETS)) {
        if (key === "custom") continue;
        const isPlaced = activePrograms.includes(key);
        const card = document.createElement("div");
        const typeClass = preset.type === "double" ? "type-major" : "type-minor";
        card.className = `program-card ${typeClass}${isPlaced ? " placed" : ""}`;
        card.setAttribute("data-key", key);
        card.draggable = !isPlaced;

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        card.innerHTML = `
            <span class="p-icon">${preset.type === "double" ? "\uD83C\uDF93" : "\uD83D\uDCDA"}</span>
            <div class="p-info">
                <span class="p-name">${preset.name}</span>
                <span class="p-meta">${typeLabel} &middot; ${preset.credits} cr</span>
            </div>
        `;

        card.addEventListener("dragstart", (e) => {
            draggedProgram = key;
            e.dataTransfer.effectAllowed = "copy";
            card.style.opacity = "0.5";
        });
        card.addEventListener("dragend", () => {
            card.style.opacity = "1";
            draggedProgram = null;
        });

        container.appendChild(card);
    }
}

function renderMyDegree() {
    const zone = document.getElementById("my-programs");
    // Remove all non-fixed tags
    zone.querySelectorAll(".program-tag:not(.fixed)").forEach(el => el.remove());

    const noteEl = document.getElementById("overlap-note");
    const notes = [];

    for (const key of activePrograms) {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) continue;

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        const icon = preset.type === "double" ? "\uD83C\uDF93" : "\uD83D\uDCDA";

        const tag = document.createElement("div");
        tag.className = "program-tag";
        tag.setAttribute("data-key", key);
        tag.innerHTML = `
            <span class="program-tag-icon">${icon}</span>
            <div class="program-tag-info">
                <strong>${preset.name}</strong>
                <span>${typeLabel} &middot; ${preset.credits} cr</span>
            </div>
            <button class="remove-program" title="Remove">&times;</button>
        `;
        tag.querySelector(".remove-program").addEventListener("click", () => {
            removeProgram(key);
        });
        zone.appendChild(tag);

        if (preset.overlapNote) {
            notes.push(preset.overlapNote);
        }
    }

    // Show overlap notes
    if (notes.length > 0) {
        noteEl.style.display = "block";
        noteEl.textContent = notes.join(" | ");
    } else {
        noteEl.style.display = "none";
    }
}

function rebuildPresetCourses() {
    const seen = new Set();
    presetCourses = [];
    for (const key of activePrograms) {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) continue;
        for (const c of preset.courses) {
            if (!seen.has(c.code)) {
                seen.add(c.code);
                presetCourses.push({ ...c, programKey: key });
            }
        }
    }
}

function addProgram(key) {
    if (activePrograms.includes(key)) return;

    const preset = PROGRAM_PRESETS[key];
    if (!preset) return;

    activePrograms.push(key);
    rebuildPresetCourses();

    renderProgramPool();
    renderMyDegree();
    renderCoursePool();
    updateDashboard();
    checkWarnings();
    saveToStorage();
}

function removeProgram(key) {
    const preset = PROGRAM_PRESETS[key];
    if (!preset) return;

    // Remove this program's courses from plan (only if not shared with another active program)
    const otherCodes = new Set();
    for (const k of activePrograms) {
        if (k === key) continue;
        const p = PROGRAM_PRESETS[k];
        if (p) p.courses.forEach(c => otherCodes.add(c.code));
    }
    const removeCodes = new Set(preset.courses.map(c => c.code).filter(code => !otherCodes.has(code)));
    // Also don't remove if the code exists in COURSES or customCourses
    const baseCodes = new Set([...COURSES.map(c => c.code), ...customCourses.map(c => c.code)]);
    for (const semId of Object.keys(plan)) {
        plan[semId] = plan[semId].filter(code => !removeCodes.has(code) || baseCodes.has(code));
    }

    activePrograms = activePrograms.filter(k => k !== key);
    rebuildPresetCourses();

    renderProgramPool();
    renderMyDegree();
    renderCoursePool();
    renderAllSemesters();
    updateDashboard();
    checkWarnings();
    saveToStorage();
}

// ==================== Rendering ====================
function getAllCourses() {
    // Deduplicate: base courses take priority, then preset, then custom
    const seen = new Set();
    const result = [];
    for (const c of COURSES) { seen.add(c.code); result.push(c); }
    for (const c of presetCourses) { if (!seen.has(c.code)) { seen.add(c.code); result.push(c); } }
    for (const c of customCourses) { if (!seen.has(c.code)) { seen.add(c.code); result.push(c); } }
    return result;
}

function getPlacedCodes() {
    const codes = new Set();
    for (const sem of Object.values(plan)) {
        for (const code of sem) codes.add(code);
    }
    return codes;
}

function renderCoursePool() {
    const list = document.getElementById("course-list");
    const filter = document.getElementById("category-filter").value;
    const search = document.getElementById("search-input").value.toLowerCase();
    const placed = getPlacedCodes();

    list.innerHTML = "";
    const courses = getAllCourses().filter(c => {
        if (filter !== "all" && c.category !== filter) return false;
        if (search && !c.code.toLowerCase().includes(search) && !c.name.toLowerCase().includes(search)) return false;
        if (activePrograms.length === 0 && c.category === "second-major") return false;
        return true;
    });

    for (const course of courses) {
        const card = createCourseCard(course, placed.has(course.code));
        list.appendChild(card);
    }
}

function createCourseCard(course, isPlaced, inSemester = false) {
    const card = document.createElement("div");
    card.className = "course-card" + (isPlaced && !inSemester ? " placed" : "");
    card.setAttribute("data-category", course.category);
    card.setAttribute("data-code", course.code);
    card.draggable = !isPlaced || inSemester;

    let html = `
        <div class="code">${course.code}</div>
        <div class="name">${course.name}</div>
        <span class="credits-badge">${course.credits} cr</span>
    `;

    if (course.prerequisites.length > 0) {
        html += `<div class="prereq-info">Prereq: ${course.prerequisites.join(", ")}</div>`;
    }

    if (inSemester) {
        html += `<button class="remove-btn" title="Remove">&times;</button>`;
    }

    card.innerHTML = html;

    card.addEventListener("dragstart", (e) => {
        draggedCourse = { code: course.code, fromSemester: inSemester ? card.closest(".semester").dataset.semester : null };
        e.dataTransfer.effectAllowed = "move";
        card.style.opacity = "0.5";
    });

    card.addEventListener("dragend", () => {
        card.style.opacity = "1";
        draggedCourse = null;
    });

    if (inSemester) {
        card.querySelector(".remove-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            const sem = card.closest(".semester").dataset.semester;
            plan[sem] = plan[sem].filter(c => c !== course.code);
            renderAllSemesters();
            renderCoursePool();
            updateDashboard();
            checkWarnings();
            saveToStorage();
        });
    }

    return card;
}

function renderSemester(semId) {
    const container = document.getElementById(`sem-${semId}`);
    const creditsSpan = container.closest(".semester").querySelector(".semester-credits span");
    container.innerHTML = "";

    let totalCredits = 0;
    const allCourses = getAllCourses();

    for (const code of plan[semId]) {
        const course = allCourses.find(c => c.code === code);
        if (!course) continue;
        const card = createCourseCard(course, true, true);

        if (!checkPrereqMet(code, semId)) {
            card.classList.add("prereq-warning");
        }

        container.appendChild(card);
        totalCredits += course.credits;
    }

    creditsSpan.textContent = totalCredits;
    const creditsDiv = container.closest(".semester").querySelector(".semester-credits");
    creditsDiv.classList.toggle("overload", totalCredits > 30);
}

function renderAllSemesters() {
    for (const semId of Object.keys(plan)) {
        renderSemester(semId);
    }
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    // Program drop zone
    const dropZone = document.getElementById("my-programs");
    dropZone.addEventListener("dragover", (e) => {
        if (!draggedProgram) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (draggedProgram) {
            addProgram(draggedProgram);
            draggedProgram = null;
        }
    });

    // Semester drop zones
    document.querySelectorAll(".semester").forEach(sem => {
        sem.addEventListener("dragover", (e) => {
            if (draggedProgram) return; // don't accept programs in semester
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            sem.classList.add("drag-over");
        });
        sem.addEventListener("dragleave", () => {
            sem.classList.remove("drag-over");
        });
        sem.addEventListener("drop", (e) => {
            e.preventDefault();
            sem.classList.remove("drag-over");
            if (!draggedCourse) return;
            const targetSem = sem.dataset.semester;
            const { code, fromSemester } = draggedCourse;

            if (fromSemester) {
                plan[fromSemester] = plan[fromSemester].filter(c => c !== code);
            }
            if (!plan[targetSem].includes(code)) {
                plan[targetSem].push(code);
            }

            renderAllSemesters();
            renderCoursePool();
            updateDashboard();
            checkWarnings();
            saveToStorage();
        });
    });

    // Filter events
    document.getElementById("category-filter").addEventListener("change", renderCoursePool);
    document.getElementById("search-input").addEventListener("input", renderCoursePool);

    // Buttons
    document.getElementById("check-graduation").addEventListener("click", checkGraduation);
    document.getElementById("save-btn").addEventListener("click", () => {
        saveToStorage();
        alert("Plan saved!");
    });
    document.getElementById("load-btn").addEventListener("click", loadPlanFromFile);
    document.getElementById("export-btn").addEventListener("click", exportPlan);
    document.getElementById("clear-btn").addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire plan?")) {
            for (const key of Object.keys(plan)) plan[key] = [];
            customCourses = [];
            activePrograms = [];
            presetCourses = [];
            renderProgramPool();
            renderMyDegree();
            renderCoursePool();
            renderAllSemesters();
            updateDashboard();
            checkWarnings();
            saveToStorage();
        }
    });

    // Custom course modal
    document.getElementById("add-custom-btn").addEventListener("click", () => {
        document.getElementById("custom-modal").style.display = "flex";
    });
    document.getElementById("custom-cancel").addEventListener("click", () => {
        document.getElementById("custom-modal").style.display = "none";
    });
    document.getElementById("custom-save").addEventListener("click", addCustomCourse);
}

// ==================== Prerequisites ====================
function getSemesterOrder(semId) {
    const [year, sem] = semId.split("-").map(Number);
    return (year - 1) * 2 + sem;
}

function checkPrereqMet(courseCode, semId) {
    const allCourses = getAllCourses();
    const course = allCourses.find(c => c.code === courseCode);
    if (!course || course.prerequisites.length === 0) return true;

    const currentOrder = getSemesterOrder(semId);
    for (const prereq of course.prerequisites) {
        let found = false;
        for (const [sid, codes] of Object.entries(plan)) {
            if (getSemesterOrder(sid) < currentOrder && codes.includes(prereq)) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    return true;
}

function checkWarnings() {
    const warnings = [];
    const allCourses = getAllCourses();

    let grandTotal = 0;
    for (const codes of Object.values(plan)) {
        for (const code of codes) {
            const c = allCourses.find(x => x.code === code);
            if (c) grandTotal += c.credits;
        }
    }
    if (grandTotal > CREDIT_CAP) {
        warnings.push(`Total credits (${grandTotal}) exceed BSc cap of ${CREDIT_CAP}`);
    }

    for (const [semId, codes] of Object.entries(plan)) {
        let semCredits = 0;
        for (const code of codes) {
            const c = allCourses.find(x => x.code === code);
            if (c) semCredits += c.credits;
        }
        if (semCredits > 30) {
            warnings.push(`Semester ${semId}: credits exceed 30 (${semCredits} credits)`);
        }
        for (const code of codes) {
            if (!checkPrereqMet(code, semId)) {
                const course = allCourses.find(c => c.code === code);
                warnings.push(`${code} (${course.name}): prerequisites not met in prior semesters`);
            }
        }
    }

    const panel = document.getElementById("warnings-panel");
    const list = document.getElementById("warnings-list");
    if (warnings.length > 0) {
        panel.style.display = "block";
        list.innerHTML = warnings.map(w => `<li>${w}</li>`).join("");
    } else {
        panel.style.display = "none";
    }
}

// ==================== Dashboard ====================
function updateDashboard() {
    const allCourses = getAllCourses();
    const placed = getPlacedCodes();

    let total = 0, major = 0, cc = 0, lang = 0;

    for (const code of placed) {
        const course = allCourses.find(c => c.code === code);
        if (!course) continue;
        total += course.credits;

        if (["math-core", "math-adv-core", "math-elec-a", "math-elec-b", "math-capstone", "science"].includes(course.category)) {
            major += course.credits;
        }
        if (course.category === "common-core") cc += course.credits;
        if (course.category === "language") lang += course.credits;
    }

    document.getElementById("total-credits").textContent = total;
    document.getElementById("major-credits").textContent = major;
    document.getElementById("cc-credits").textContent = cc;
    document.getElementById("lang-credits").textContent = lang;

    document.getElementById("total-credits-bar").style.width = Math.min(100, (total / 240) * 100) + "%";
    document.getElementById("major-credits-bar").style.width = Math.min(100, (major / MATH_MAJOR_CREDITS) * 100) + "%";
    document.getElementById("cc-credits-bar").style.width = Math.min(100, (cc / CC_CREDITS) * 100) + "%";
    document.getElementById("lang-credits-bar").style.width = Math.min(100, (lang / LANG_CREDITS) * 100) + "%";

    // Dynamic program progress cards
    const container = document.getElementById("program-cards-container");
    container.innerHTML = "";

    const colors = ["#8e44ad", "#e67e22", "#16a085", "#c0392b", "#2980b9"];
    activePrograms.forEach((key, idx) => {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) return;

        // Count credits for this program
        const programCourseCodes = new Set(preset.courses.map(c => c.code));
        let progCredits = 0;
        for (const code of placed) {
            if (programCourseCodes.has(code)) {
                const c = allCourses.find(x => x.code === code);
                if (c) progCredits += c.credits;
            }
        }

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        const color = colors[idx % colors.length];
        const card = document.createElement("div");
        card.className = "progress-card";
        card.innerHTML = `
            <h3>${typeLabel}: ${preset.name}</h3>
            <div class="progress-bar"><div class="progress-fill" style="background:${color}; width:${Math.min(100, (progCredits / preset.credits) * 100)}%"></div></div>
            ${progCredits} / ${preset.credits}
        `;
        container.appendChild(card);
    });
}

// ==================== Graduation Check ====================
function checkGraduation() {
    const allCourses = getAllCourses();
    const placed = getPlacedCodes();
    const results = [];
    let allPass = true;

    function addCheck(label, ok) {
        if (!ok) allPass = false;
        results.push({ label, ok });
    }

    let totalCredits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (c) totalCredits += c.credits;
    }
    addCheck(`Total Credits: ${totalCredits} / 240 minimum`, totalCredits >= 240);
    addCheck(`Credit Cap: ${totalCredits} / ${CREDIT_CAP} maximum`, totalCredits <= CREDIT_CAP);

    addCheck(`Science Foundation (SCNC1111, SCNC1112)`, ["SCNC1111", "SCNC1112"].every(c => placed.has(c)));

    const mathCore = ["MATH1013", "MATH2012", "MATH2101", "MATH2102", "MATH2211", "MATH2241"];
    addCheck(`Math Core Courses (${mathCore.length} courses)`, mathCore.every(c => placed.has(c)));

    addCheck(`Advanced Core: MATH3401 Analysis I`, placed.has("MATH3401"));

    const listACodes = allCourses.filter(c => c.category === "math-elec-a").map(c => c.code);
    let listACredits = 0;
    for (const code of placed) {
        if (listACodes.includes(code)) listACredits += allCourses.find(x => x.code === code).credits;
    }
    addCheck(`List A Electives: ${listACredits} / 12 credits`, listACredits >= 12);

    const elecCodes = allCourses.filter(c => c.category === "math-elec-a" || c.category === "math-elec-b").map(c => c.code);
    let elecCredits = 0;
    for (const code of placed) {
        if (elecCodes.includes(code)) elecCredits += allCourses.find(x => x.code === code).credits;
    }
    addCheck(`Advanced Electives Total: ${elecCredits} / 36 credits`, elecCredits >= 36);

    let math4Credits = 0;
    for (const code of placed) {
        if ((code.startsWith("MATH4") || code.startsWith("MATH7"))) {
            const c = allCourses.find(x => x.code === code);
            if (c && (c.category === "math-elec-a" || c.category === "math-elec-b")) math4Credits += c.credits;
        }
    }
    addCheck(`MATH4XXX/7XXX Courses: ${math4Credits} / 12 credits`, math4Credits >= 12);

    const capstoneCodes = allCourses.filter(c => c.category === "math-capstone").map(c => c.code);
    addCheck(`Capstone Course`, capstoneCodes.some(c => placed.has(c)));

    let ccCredits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (c && c.category === "common-core") ccCredits += c.credits;
    }
    addCheck(`Common Core: ${ccCredits} / ${CC_CREDITS} credits`, ccCredits >= CC_CREDITS);

    let langCredits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (c && c.category === "language") langCredits += c.credits;
    }
    addCheck(`Language Courses: ${langCredits} / ${LANG_CREDITS} credits`, langCredits >= LANG_CREDITS);

    // Check each active program
    for (const key of activePrograms) {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) continue;
        const programCourseCodes = new Set(preset.courses.map(c => c.code));
        let progCredits = 0;
        for (const code of placed) {
            if (programCourseCodes.has(code)) {
                const c = allCourses.find(x => x.code === code);
                if (c) progCredits += c.credits;
            }
        }
        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        addCheck(`${preset.name} (${typeLabel}): ${progCredits} / ${preset.credits} credits`, progCredits >= preset.credits);
    }

    let prereqViolations = 0;
    for (const [semId, codes] of Object.entries(plan)) {
        for (const code of codes) {
            if (!checkPrereqMet(code, semId)) prereqViolations++;
        }
    }
    addCheck(`Prerequisite Check (${prereqViolations} violation${prereqViolations !== 1 ? "s" : ""})`, prereqViolations === 0);

    const div = document.getElementById("graduation-result");
    div.style.display = "block";
    div.innerHTML = `
        <h3 style="margin-bottom: 12px;">${allPass
            ? '<span class="pass">All graduation requirements met!</span>'
            : '<span class="fail">Some graduation requirements are not yet met</span>'
        }</h3>
        <ul>
            ${results.map(r => `<li><span class="${r.ok ? "pass" : "fail"}">${r.ok ? "\u2713" : "\u2717"}</span> ${r.label}</li>`).join("")}
        </ul>
    `;
}

// ==================== Custom Course ====================
function addCustomCourse() {
    const code = document.getElementById("custom-code").value.trim().toUpperCase();
    const name = document.getElementById("custom-name").value.trim();
    const credits = parseInt(document.getElementById("custom-credits").value);
    const category = document.getElementById("custom-category").value;

    if (!code || !name) { alert("Please enter a course code and name"); return; }
    if (getAllCourses().some(c => c.code === code)) { alert("Course code already exists"); return; }

    customCourses.push({ code, name, credits, category, prerequisites: [] });
    document.getElementById("custom-modal").style.display = "none";
    document.getElementById("custom-code").value = "";
    document.getElementById("custom-name").value = "";
    document.getElementById("custom-credits").value = "6";
    renderCoursePool();
    saveToStorage();
}

// ==================== Persistence ====================
function saveToStorage() {
    localStorage.setItem("hku-plan", JSON.stringify(plan));
    localStorage.setItem("hku-custom", JSON.stringify(customCourses));
    localStorage.setItem("hku-active-programs", JSON.stringify(activePrograms));
    localStorage.setItem("hku-preset-courses", JSON.stringify(presetCourses));
}

function loadFromStorage() {
    try {
        const p = localStorage.getItem("hku-plan");
        if (p) { const parsed = JSON.parse(p); for (const k of Object.keys(plan)) { if (parsed[k]) plan[k] = parsed[k]; } }
        const c = localStorage.getItem("hku-custom");
        if (c) customCourses = JSON.parse(c);

        // Support both old single-program and new multi-program format
        const ap = localStorage.getItem("hku-active-programs");
        if (ap) {
            activePrograms = JSON.parse(ap);
        } else {
            // Migrate from old single-program format
            const a = localStorage.getItem("hku-active-program");
            if (a) {
                const old = JSON.parse(a);
                activePrograms = old ? [old] : [];
                localStorage.removeItem("hku-active-program");
            }
        }

        const pc = localStorage.getItem("hku-preset-courses");
        if (pc) presetCourses = JSON.parse(pc);
    } catch (e) { /* ignore */ }
}

function exportPlan() {
    const allCourses = getAllCourses();
    let text = "HKU Mathematics Course Plan\n" + "=".repeat(40) + "\n";

    if (activePrograms.length > 0) {
        const labels = activePrograms.map(key => {
            const p = PROGRAM_PRESETS[key];
            return p ? `${p.type === "double" ? "2nd Major" : "Minor"}: ${p.name}` : key;
        });
        text += `Programs: Mathematics (Major) + ${labels.join(" + ")}\n`;
    }
    text += "\n";

    for (const [semId, codes] of Object.entries(plan)) {
        const [year, sem] = semId.split("-");
        text += `Year ${year} — Semester ${sem}\n` + "-".repeat(30) + "\n";
        if (codes.length === 0) { text += "  (empty)\n"; }
        else {
            let t = 0;
            for (const code of codes) {
                const c = allCourses.find(x => x.code === code);
                if (c) { text += `  ${c.code}  ${c.name}  (${c.credits} cr)\n`; t += c.credits; }
            }
            text += `  Total: ${t} credits\n`;
        }
        text += "\n";
    }

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hku_math_course_plan.txt"; a.click();
    URL.revokeObjectURL(url);
}

function loadPlanFromFile() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.plan) { for (const k of Object.keys(plan)) { plan[k] = data.plan[k] || []; } }
                if (data.customCourses) customCourses = data.customCourses;
                if (data.activePrograms !== undefined) activePrograms = data.activePrograms;
                else if (data.activeProgram !== undefined) activePrograms = data.activeProgram ? [data.activeProgram] : [];
                if (data.presetCourses) presetCourses = data.presetCourses;
                rebuildPresetCourses();
                renderProgramPool(); renderMyDegree();
                renderAllSemesters(); renderCoursePool();
                updateDashboard(); checkWarnings(); saveToStorage();
                alert("Plan loaded!");
            } catch (err) { alert("Invalid file format"); }
        };
        reader.readAsText(file);
    });
    input.click();
}
