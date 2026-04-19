// ==================== State ====================
let plan = {
    "1-1": [], "1-2": [],
    "2-1": [], "2-2": [],
    "3-1": [], "3-2": [],
    "4-1": [], "4-2": [],
};

let customCourses = [];
let activePrograms = [];
let presetCourses = [];
let draggedCourse = null;
let draggedProgram = null;
let advancedStanding = false;  // AS: reduces free-elec by 18 and CC by 12 (total 30 credits off)

// Multi-facet filter state
let activeFilters = {
    depts: new Set(),       // e.g. {'MATH', 'COMP'}
    levels: new Set(),      // e.g. {1, 2, 3, 4, 7}
    sems: new Set(),        // e.g. {1, 2, 3}
    notPlaced: false,
};
let sortKey = "code";
let searchQuery = "";

const CREDIT_CAP = 288;
const MATH_MAJOR_CREDITS = 96;
const LANG_CREDITS = 18;
const AILT_CREDITS = 6;

// Advanced Standing reductions
const AS_FREE_ELEC_REDUCTION = 18;
const AS_CC_REDUCTION = 12;

// Derived credit targets (functions so they respect advanced standing)
function getMinCredits() { return advancedStanding ? 240 - AS_FREE_ELEC_REDUCTION - AS_CC_REDUCTION : 240; }
function getCcCredits()  { return advancedStanding ? 36 - AS_CC_REDUCTION : 36; }

// ==================== Init ====================
document.addEventListener("DOMContentLoaded", () => {
    loadFromStorage();
    rebuildPresetCourses();
    renderProgramPool();
    renderMyDegree();
    renderDeptChips();
    renderCoursePool();
    renderAllSemesters();
    // Sync AS toggle with saved state
    document.getElementById("advanced-standing-toggle").checked = advancedStanding;
    updateDashboard();
    setupEventListeners();
    maybeShowWelcome();
});

// ==================== Utilities ====================
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const esc = escapeHtml(text);
    const rx = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return esc.replace(rx, '<mark>$1</mark>');
}

function getDept(code) {
    const m = code.match(/^[A-Z]+/);
    return m ? m[0] : "";
}

function getLevel(code) {
    const m = code.match(/(\d)/);
    return m ? parseInt(m[1], 10) : 0;
}

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
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", isPlaced ? "-1" : "0");
        card.setAttribute("aria-label", `${preset.name} ${preset.type === "double" ? "Second Major" : "Minor"}, ${preset.credits} credits`);
        card.draggable = !isPlaced;

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        const initial = preset.name.charAt(0);

        card.innerHTML = `
            <span class="p-icon" aria-hidden="true">${initial}</span>
            <span class="p-name">${escapeHtml(preset.name)}</span>
            <span class="p-meta">${typeLabel} · ${preset.credits} cr</span>
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
        // Keyboard accessibility
        card.addEventListener("keydown", (e) => {
            if ((e.key === "Enter" || e.key === " ") && !isPlaced) {
                e.preventDefault();
                addProgram(key);
            }
        });
        // Click to add (mobile-friendly)
        card.addEventListener("click", () => {
            if (!isPlaced) addProgram(key);
        });

        container.appendChild(card);
    }
}

function renderMyDegree() {
    const zone = document.getElementById("my-programs");
    zone.querySelectorAll(".program-tag:not(.fixed)").forEach(el => el.remove());

    const noteEl = document.getElementById("overlap-note");
    const notes = [];

    for (const key of activePrograms) {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) continue;

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        const initial = preset.name.charAt(0);

        const tag = document.createElement("div");
        tag.className = "program-tag";
        tag.setAttribute("data-key", key);
        tag.innerHTML = `
            <span class="program-tag-icon" aria-hidden="true">${initial}</span>
            <div class="program-tag-info">
                <strong>${escapeHtml(preset.name)}</strong>
                <span>${typeLabel} · ${preset.credits} cr</span>
            </div>
            <button class="remove-program" title="Remove program" aria-label="Remove ${preset.name}">&times;</button>
        `;
        tag.querySelector(".remove-program").addEventListener("click", () => removeProgram(key));
        zone.appendChild(tag);

        if (preset.overlapNote) notes.push(preset.overlapNote);
    }

    if (notes.length > 0) {
        noteEl.style.display = "block";
        noteEl.innerHTML = notes.map(n => `<div>⚠ ${escapeHtml(n)}</div>`).join("");
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
    renderDeptChips();
    renderCoursePool();
    updateDashboard();
    checkWarnings();
    saveToStorage();
}

function removeProgram(key) {
    const preset = PROGRAM_PRESETS[key];
    if (!preset) return;
    const otherCodes = new Set();
    for (const k of activePrograms) {
        if (k === key) continue;
        const p = PROGRAM_PRESETS[k];
        if (p) p.courses.forEach(c => otherCodes.add(c.code));
    }
    const removeCodes = new Set(preset.courses.map(c => c.code).filter(code => !otherCodes.has(code)));
    const baseCodes = new Set([...COURSES.map(c => c.code), ...customCourses.map(c => c.code)]);
    for (const semId of Object.keys(plan)) {
        plan[semId] = plan[semId].filter(code => !removeCodes.has(code) || baseCodes.has(code));
    }
    activePrograms = activePrograms.filter(k => k !== key);
    rebuildPresetCourses();
    renderProgramPool();
    renderMyDegree();
    renderDeptChips();
    renderCoursePool();
    renderAllSemesters();
    updateDashboard();
    checkWarnings();
    saveToStorage();
}

// ==================== Data helpers ====================
function getAllCourses() {
    const seen = new Set();
    const result = [];
    for (const c of presetCourses) { seen.add(c.code); result.push(c); }
    for (const c of COURSES) { if (!seen.has(c.code)) { seen.add(c.code); result.push(c); } }
    for (const c of customCourses) { if (!seen.has(c.code)) { seen.add(c.code); result.push(c); } }
    return result;
}

function getPlacedCodes() {
    const codes = new Set();
    for (const sem of Object.values(plan)) for (const code of sem) codes.add(code);
    return codes;
}

// ==================== Chips ====================
function renderDeptChips() {
    const container = document.getElementById("dept-chips");
    container.innerHTML = "";

    const depts = new Set();
    for (const c of getAllCourses()) {
        const d = getDept(c.code);
        if (d && d.length >= 3) depts.add(d);
    }
    // Preferred order: MATH first, then common ones
    const preferredOrder = ["MATH", "COMP", "PHYS", "SDST", "ECON", "FINA", "ACCT", "ELEC", "ENGG", "SCNC"];
    const sortedDepts = [...depts].sort((a, b) => {
        const ai = preferredOrder.indexOf(a);
        const bi = preferredOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    for (const d of sortedDepts) {
        const btn = document.createElement("button");
        btn.className = "chip" + (activeFilters.depts.has(d) ? " active" : "");
        btn.textContent = d;
        btn.setAttribute("data-filter-type", "dept");
        btn.setAttribute("data-filter-value", d);
        btn.setAttribute("aria-pressed", activeFilters.depts.has(d));
        btn.addEventListener("click", () => {
            if (activeFilters.depts.has(d)) activeFilters.depts.delete(d);
            else activeFilters.depts.add(d);
            renderDeptChips();
            renderCoursePool();
        });
        container.appendChild(btn);
    }
}

function setupFilterChipListeners() {
    const chips = document.querySelectorAll("#filter-chips .chip[data-filter-type]");
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            const type = chip.getAttribute("data-filter-type");
            const value = chip.getAttribute("data-filter-value");
            if (type === "level") {
                const v = parseInt(value, 10);
                if (activeFilters.levels.has(v)) activeFilters.levels.delete(v);
                else activeFilters.levels.add(v);
            } else if (type === "sem") {
                const v = parseInt(value, 10);
                if (activeFilters.sems.has(v)) activeFilters.sems.delete(v);
                else activeFilters.sems.add(v);
            } else if (type === "state" && value === "not-placed") {
                activeFilters.notPlaced = !activeFilters.notPlaced;
            }
            updateFilterChipStates();
            renderCoursePool();
        });
    });

    document.getElementById("clear-filters").addEventListener("click", () => {
        activeFilters.depts.clear();
        activeFilters.levels.clear();
        activeFilters.sems.clear();
        activeFilters.notPlaced = false;
        searchQuery = "";
        document.getElementById("search-input").value = "";
        renderDeptChips();
        updateFilterChipStates();
        renderCoursePool();
    });
}

function updateFilterChipStates() {
    document.querySelectorAll("#filter-chips .chip[data-filter-type]").forEach(chip => {
        const type = chip.getAttribute("data-filter-type");
        const value = chip.getAttribute("data-filter-value");
        let isActive = false;
        if (type === "level") isActive = activeFilters.levels.has(parseInt(value, 10));
        else if (type === "sem") isActive = activeFilters.sems.has(parseInt(value, 10));
        else if (type === "state" && value === "not-placed") isActive = activeFilters.notPlaced;
        chip.classList.toggle("active", isActive);
        chip.setAttribute("aria-pressed", isActive);
    });
}

// ==================== Course Pool Render ====================
function matchesFilters(course, placed) {
    // Dept filter
    if (activeFilters.depts.size > 0) {
        if (!activeFilters.depts.has(getDept(course.code))) return false;
    }
    // Level filter
    if (activeFilters.levels.size > 0) {
        if (!activeFilters.levels.has(getLevel(course.code))) return false;
    }
    // Sem filter
    if (activeFilters.sems.size > 0) {
        const semVal = COURSE_SEMESTERS[course.code];
        if (!semVal || !activeFilters.sems.has(semVal)) return false;
    }
    // Not-placed filter
    if (activeFilters.notPlaced && placed.has(course.code)) return false;
    // Hide second-major courses when no programs active
    if (activePrograms.length === 0 && course.category === "second-major") return false;
    // Search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!course.code.toLowerCase().includes(q) && !course.name.toLowerCase().includes(q)) return false;
    }
    return true;
}

function renderCoursePool() {
    const list = document.getElementById("course-list");
    const placed = getPlacedCodes();
    list.innerHTML = "";

    const all = getAllCourses();
    let filtered = all.filter(c => matchesFilters(c, placed));

    // Sort
    filtered.sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name);
        if (sortKey === "credits") return b.credits - a.credits || a.code.localeCompare(b.code);
        if (sortKey === "level") return getLevel(a.code) - getLevel(b.code) || a.code.localeCompare(b.code);
        return a.code.localeCompare(b.code);
    });

    // Count badge
    document.getElementById("course-count").textContent = `${filtered.length}/${all.length}`;

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "course-list-empty";
        empty.innerHTML = `
            <div>No courses match your filters</div>
            <button id="inline-clear-filters">Clear filters</button>
        `;
        empty.querySelector("#inline-clear-filters").addEventListener("click", () => {
            document.getElementById("clear-filters").click();
        });
        list.appendChild(empty);
        return;
    }

    for (const course of filtered) {
        const card = createCourseCard(course, placed.has(course.code));
        list.appendChild(card);
    }
}

// ==================== Course Card ====================
function createCourseCard(course, isPlaced, inSemester = false) {
    const card = document.createElement("div");
    card.className = "course-card" + (isPlaced && !inSemester ? " placed" : "");
    card.setAttribute("data-category", course.category);
    card.setAttribute("data-code", course.code);
    card.setAttribute("role", "listitem");
    card.draggable = !isPlaced || inSemester;

    const semVal = COURSE_SEMESTERS[course.code];
    const semLabel = semVal === 1 ? "Sem 1" : semVal === 2 ? "Sem 2" : semVal === 3 ? "Both" : "";
    const semBadge = semLabel ? `<span class="sem-badge sem-${semVal}">${semLabel}</span>` : "";

    const codeHtml = highlight(course.code, searchQuery);
    const nameHtml = highlight(course.name, searchQuery);
    const prereqHtml = course.prerequisites.length > 0
        ? `<div class="prereq-info"><strong>Prereq:</strong> ${course.prerequisites.map(p => escapeHtml(p)).join(", ")}</div>`
        : "";

    let html = `
        <div class="card-header">
            <div class="code">${codeHtml}</div>
        </div>
        <div class="name">${nameHtml}</div>
        <div class="card-footer">
            <span class="credits-badge">${course.credits} cr</span>
            ${semBadge}
        </div>
        ${prereqHtml}
    `;

    if (inSemester) {
        html += `<button class="remove-btn" title="Remove from semester" aria-label="Remove ${course.code}">&times;</button>`;
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

    if (!inSemester && !isPlaced) {
        // Tap-to-add (mobile-friendly)
        card.addEventListener("click", (e) => {
            // Only on small screens OR double click; but we'll use it universally as backup
            if (window.innerWidth <= 640) {
                e.stopPropagation();
                openPlaceModal(course);
            }
        });
    }

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

// ==================== Semester Render ====================
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
        if (!checkPrereqMet(code, semId)) card.classList.add("prereq-warning");
        container.appendChild(card);
        totalCredits += course.credits;
    }

    creditsSpan.textContent = totalCredits;
    const creditsDiv = container.closest(".semester").querySelector(".semester-credits");
    creditsDiv.classList.toggle("overload", totalCredits > 30);
}

function renderAllSemesters() {
    for (const semId of Object.keys(plan)) renderSemester(semId);
}

// ==================== Place Modal (tap-to-add) ====================
function openPlaceModal(course) {
    const modal = document.getElementById("place-modal");
    const title = document.getElementById("place-modal-title");
    const sub = document.getElementById("place-modal-sub");
    const grid = document.getElementById("place-grid");

    title.textContent = `Add ${course.code}`;
    sub.textContent = `${course.name} · ${course.credits} credits`;
    grid.innerHTML = "";

    const semVal = COURSE_SEMESTERS[course.code];

    for (let y = 1; y <= 4; y++) {
        const yLabel = document.createElement("div");
        yLabel.className = "place-grid-year-label";
        yLabel.textContent = `Year ${y}`;
        grid.appendChild(yLabel);

        for (let s = 1; s <= 2; s++) {
            const semId = `${y}-${s}`;
            const btn = document.createElement("button");
            const disabled = plan[semId].includes(course.code);
            const notOffered = semVal && semVal !== 3 && semVal !== s;
            btn.innerHTML = `Sem ${s}<small>${disabled ? "already added" : notOffered ? "not offered" : `Year ${y}`}</small>`;
            if (disabled) {
                btn.disabled = true;
                btn.style.opacity = "0.4";
            }
            if (notOffered && !disabled) {
                btn.style.borderColor = "var(--warning)";
                btn.style.color = "var(--warning)";
            }
            btn.addEventListener("click", () => {
                if (disabled) return;
                plan[semId].push(course.code);
                modal.style.display = "none";
                renderAllSemesters();
                renderCoursePool();
                updateDashboard();
                checkWarnings();
                saveToStorage();
            });
            grid.appendChild(btn);
        }
    }

    modal.style.display = "flex";
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
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
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
            if (draggedProgram) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            sem.classList.add("drag-over");
        });
        sem.addEventListener("dragleave", () => sem.classList.remove("drag-over"));
        sem.addEventListener("drop", (e) => {
            e.preventDefault();
            sem.classList.remove("drag-over");
            if (!draggedCourse) return;
            const targetSem = sem.dataset.semester;
            const { code, fromSemester } = draggedCourse;
            if (fromSemester) plan[fromSemester] = plan[fromSemester].filter(c => c !== code);
            if (!plan[targetSem].includes(code)) plan[targetSem].push(code);
            renderAllSemesters();
            renderCoursePool();
            updateDashboard();
            checkWarnings();
            saveToStorage();
        });
    });

    // Filter chip listeners
    setupFilterChipListeners();

    // Search (debounced)
    let searchTimer = null;
    document.getElementById("search-input").addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = e.target.value.trim();
            renderCoursePool();
        }, 150);
    });

    // Sort
    document.getElementById("sort-select").addEventListener("change", (e) => {
        sortKey = e.target.value;
        renderCoursePool();
    });

    // Buttons
    document.getElementById("check-graduation").addEventListener("click", checkGraduation);
    document.getElementById("save-btn").addEventListener("click", () => {
        saveToStorage();
        showToast("Plan saved to this browser");
    });
    document.getElementById("load-btn").addEventListener("click", loadPlanFromFile);
    document.getElementById("export-btn").addEventListener("click", exportPlan);
    document.getElementById("clear-btn").addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire plan?")) {
            for (const key of Object.keys(plan)) plan[key] = [];
            customCourses = [];
            activePrograms = [];
            presetCourses = [];
            advancedStanding = false;
            document.getElementById("advanced-standing-toggle").checked = false;
            renderProgramPool();
            renderMyDegree();
            renderDeptChips();
            renderCoursePool();
            renderAllSemesters();
            updateDashboard();
            checkWarnings();
            saveToStorage();
            const grad = document.getElementById("graduation-result");
            grad.style.display = "none";
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

    // Place modal
    document.getElementById("place-cancel").addEventListener("click", () => {
        document.getElementById("place-modal").style.display = "none";
    });

    // Help modal
    document.getElementById("help-btn").addEventListener("click", () => {
        document.getElementById("help-modal").style.display = "flex";
    });
    document.getElementById("help-close").addEventListener("click", () => {
        document.getElementById("help-modal").style.display = "none";
    });

    // Close modals on backdrop click
    document.querySelectorAll(".modal").forEach(modal => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none";
        });
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal").forEach(m => m.style.display = "none");
            document.getElementById("course-pool").classList.remove("mobile-open");
        }
    });

    // Welcome banner dismiss
    document.getElementById("welcome-dismiss").addEventListener("click", () => {
        document.getElementById("welcome-banner").style.display = "none";
        localStorage.setItem("hku-welcome-dismissed", "1");
    });

    // Advanced Standing toggle
    document.getElementById("advanced-standing-toggle").addEventListener("change", (e) => {
        advancedStanding = e.target.checked;
        updateDashboard();
        checkWarnings();
        saveToStorage();
        showToast(advancedStanding ? "Advanced Standing enabled (−30 credits)" : "Advanced Standing disabled");
    });

    // Mobile FAB
    document.getElementById("mobile-fab").addEventListener("click", () => {
        document.getElementById("course-pool").classList.add("mobile-open");
    });
    document.getElementById("course-pool-close").addEventListener("click", () => {
        document.getElementById("course-pool").classList.remove("mobile-open");
    });
}

function showToast(msg) {
    let toast = document.getElementById("__toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "__toast";
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%;
            transform: translateX(-50%);
            background: var(--gray-900); color: white;
            padding: 10px 18px; border-radius: 10px;
            font-size: 13px; font-weight: 500;
            box-shadow: 0 10px 25px rgba(15,23,42,0.2);
            z-index: 2000; opacity: 0;
            transition: opacity 0.2s, transform 0.2s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, -4px)";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%)";
    }, 2000);
}

function maybeShowWelcome() {
    if (localStorage.getItem("hku-welcome-dismissed")) return;
    const anyData = activePrograms.length > 0 || Object.values(plan).some(v => v.length > 0);
    if (anyData) return;
    document.getElementById("welcome-banner").style.display = "flex";
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
    if (grandTotal > CREDIT_CAP) warnings.push(`Total credits (${grandTotal}) exceed BSc cap of ${CREDIT_CAP}`);

    for (const [semId, codes] of Object.entries(plan)) {
        let semCredits = 0;
        for (const code of codes) {
            const c = allCourses.find(x => x.code === code);
            if (c) semCredits += c.credits;
        }
        if (semCredits > 30) warnings.push(`Semester ${semId}: ${semCredits} credits exceeds 30-credit cap`);
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
        list.innerHTML = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
    } else {
        panel.style.display = "none";
    }
}

// ==================== Dashboard ====================
function setCardStatus(cardId, value, target) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.remove("complete", "overload", "inprogress");
    if (value > target) card.classList.add("overload");
    else if (value >= target && target > 0) card.classList.add("complete");
    else if (value > 0) card.classList.add("inprogress");
}

function updateDashboard() {
    const allCourses = getAllCourses();
    const placed = getPlacedCodes();

    let total = 0, major = 0, cc = 0, lang = 0, ailt = 0;

    for (const code of placed) {
        const course = allCourses.find(c => c.code === code);
        if (!course) continue;
        total += course.credits;
        if (["math-core", "math-adv-core", "math-elec-a", "math-elec-b", "math-capstone", "science"].includes(course.category)) {
            major += course.credits;
        }
        if (course.category === "common-core") cc += course.credits;
        if (course.category === "language") lang += course.credits;
        if (course.category === "ai-literacy") ailt += course.credits;
    }

    document.getElementById("total-credits").textContent = total;
    document.getElementById("major-credits").textContent = major;
    document.getElementById("cc-credits").textContent = cc;
    document.getElementById("lang-credits").textContent = lang;
    document.getElementById("ailt-credits").textContent = ailt;

    const minC = getMinCredits();
    const ccTarget = getCcCredits();

    document.getElementById("total-credits-bar").style.width = Math.min(100, (total / minC) * 100) + "%";
    document.getElementById("major-credits-bar").style.width = Math.min(100, (major / MATH_MAJOR_CREDITS) * 100) + "%";
    document.getElementById("cc-credits-bar").style.width = Math.min(100, (cc / ccTarget) * 100) + "%";
    document.getElementById("lang-credits-bar").style.width = Math.min(100, (lang / LANG_CREDITS) * 100) + "%";
    document.getElementById("ailt-credits-bar").style.width = Math.min(100, (ailt / AILT_CREDITS) * 100) + "%";

    // Update denom text for total + cc to reflect advanced standing
    const totalDenom = document.querySelector("#card-total .denom");
    if (totalDenom) totalDenom.textContent = `/ ${minC} min${advancedStanding ? " (AS)" : ""}`;
    const ccDenom = document.querySelector("#card-cc .denom");
    if (ccDenom) ccDenom.textContent = `/ ${ccTarget}${advancedStanding ? " (AS)" : ""}`;

    setCardStatus("card-total", total, minC);
    if (total > CREDIT_CAP) document.getElementById("card-total").classList.add("overload");
    setCardStatus("card-major", major, MATH_MAJOR_CREDITS);
    setCardStatus("card-cc", cc, ccTarget);
    setCardStatus("card-lang", lang, LANG_CREDITS);
    setCardStatus("card-ailt", ailt, AILT_CREDITS);

    // Program cards
    const container = document.getElementById("program-cards-container");
    container.innerHTML = "";

    activePrograms.forEach((key, idx) => {
        const preset = PROGRAM_PRESETS[key];
        if (!preset) return;

        const programCourseCodes = new Set(preset.courses.map(c => c.code));
        let progCredits = 0;
        for (const code of placed) {
            if (programCourseCodes.has(code)) {
                const c = allCourses.find(x => x.code === code);
                if (c) progCredits += c.credits;
            }
        }

        const typeLabel = preset.type === "double" ? "2nd Major" : "Minor";
        const cardId = `card-prog-${key}`;
        const pct = Math.min(100, (progCredits / preset.credits) * 100);

        const card = document.createElement("div");
        card.className = "progress-card";
        card.id = cardId;
        card.innerHTML = `
            <h3>${escapeHtml(preset.name)} · ${typeLabel} <span class="status-dot"></span></h3>
            <div class="progress-bar"><div class="progress-fill" style="background: var(--cat-program); width:${pct}%"></div></div>
            <div class="progress-numbers">
                <span class="num">${progCredits}</span>
                <span class="denom">/ ${preset.credits}</span>
            </div>
        `;
        container.appendChild(card);
        setCardStatus(cardId, progCredits, preset.credits);
    });
}

// ==================== Graduation Check ====================
function checkGraduation() {
    const allCourses = getAllCourses();
    const placed = getPlacedCodes();
    const sections = [];
    let failCount = 0;
    let totalChecks = 0;

    function buildSection(title, checks) {
        sections.push({ title, checks });
        for (const c of checks) { totalChecks++; if (!c.ok) failCount++; }
    }

    // --- Overall ---
    let totalCredits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (c) totalCredits += c.credits;
    }
    const minC = getMinCredits();
    const overallChecks = [
        { label: `Minimum credits: ${totalCredits} / ${minC}${advancedStanding ? " (Advanced Standing)" : ""}`, ok: totalCredits >= minC },
        { label: `Credit cap: ${totalCredits} / ${CREDIT_CAP}`, ok: totalCredits <= CREDIT_CAP },
    ];
    if (advancedStanding) {
        overallChecks.push({ label: `Advanced Standing applied: −${AS_FREE_ELEC_REDUCTION} free elective, −${AS_CC_REDUCTION} Common Core`, ok: true });
    }
    buildSection("Overall", overallChecks);

    // --- Math Major ---
    const mathCore = ["MATH1013", "MATH2012", "MATH2101", "MATH2102", "MATH2211", "MATH2241"];
    const listACodes = allCourses.filter(c => c.category === "math-elec-a").map(c => c.code);
    const elecCodes = allCourses.filter(c => c.category === "math-elec-a" || c.category === "math-elec-b").map(c => c.code);
    const capstoneCodes = allCourses.filter(c => c.category === "math-capstone").map(c => c.code);

    let listACredits = 0, elecCredits = 0, math4Credits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (!c) continue;
        if (listACodes.includes(code)) listACredits += c.credits;
        if (elecCodes.includes(code)) elecCredits += c.credits;
        if ((code.startsWith("MATH4") || code.startsWith("MATH7")) && (c.category === "math-elec-a" || c.category === "math-elec-b")) {
            math4Credits += c.credits;
        }
    }

    buildSection("Mathematics Major", [
        { label: "Science Foundation (SCNC1111 + SCNC1112)", ok: ["SCNC1111", "SCNC1112"].every(c => placed.has(c)) },
        { label: `Math Core (${mathCore.length} courses)`, ok: mathCore.every(c => placed.has(c)) },
        { label: "Advanced Core: MATH3401 Analysis I", ok: placed.has("MATH3401") },
        { label: `List A Electives: ${listACredits} / 12 credits`, ok: listACredits >= 12 },
        { label: `Advanced Electives Total: ${elecCredits} / 36 credits`, ok: elecCredits >= 36 },
        { label: `MATH4XXX/7XXX Courses: ${math4Credits} / 12 credits`, ok: math4Credits >= 12 },
        { label: "Capstone Course", ok: capstoneCodes.some(c => placed.has(c)) },
    ]);

    // --- University Requirements ---
    let ccCredits = 0, langCredits = 0, ailtCredits = 0;
    for (const code of placed) {
        const c = allCourses.find(x => x.code === code);
        if (!c) continue;
        if (c.category === "common-core") ccCredits += c.credits;
        if (c.category === "language") langCredits += c.credits;
        if (c.category === "ai-literacy") ailtCredits += c.credits;
    }

    const ccTargetG = getCcCredits();
    buildSection("University Requirements", [
        { label: `Common Core: ${ccCredits} / ${ccTargetG} credits${advancedStanding ? " (AS reduced)" : ""}`, ok: ccCredits >= ccTargetG },
        { label: `Language: ${langCredits} / ${LANG_CREDITS} credits`, ok: langCredits >= LANG_CREDITS },
        { label: `AI Literacy: ${ailtCredits} / ${AILT_CREDITS} credits`, ok: ailtCredits >= AILT_CREDITS },
    ]);

    // --- Active Programs ---
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
        buildSection(`${preset.name} (${typeLabel})`, [
            { label: `Program credits: ${progCredits} / ${preset.credits}`, ok: progCredits >= preset.credits },
        ]);
    }

    // --- Prerequisites ---
    let prereqViolations = 0;
    for (const [semId, codes] of Object.entries(plan)) {
        for (const code of codes) {
            if (!checkPrereqMet(code, semId)) prereqViolations++;
        }
    }
    buildSection("Prerequisites", [
        { label: `No prerequisite violations`, ok: prereqViolations === 0 },
    ]);

    // Render
    const div = document.getElementById("graduation-result");
    div.style.display = "block";
    const allPass = failCount === 0;

    const banner = allPass
        ? `<div class="grad-banner pass">
               <div class="grad-icon">✓</div>
               <div class="grad-text">
                   Ready to graduate!
                   <small>All ${totalChecks} requirements met</small>
               </div>
           </div>`
        : `<div class="grad-banner fail">
               <div class="grad-icon">!</div>
               <div class="grad-text">
                   ${failCount} requirement${failCount !== 1 ? 's' : ''} remaining
                   <small>${totalChecks - failCount} of ${totalChecks} met</small>
               </div>
           </div>`;

    const sectionsHtml = sections.map(sec => `
        <div class="grad-section">
            <h4>${escapeHtml(sec.title)}</h4>
            <div class="grad-checks">
                ${sec.checks.map(c => `
                    <div class="grad-check ${c.ok ? 'ok' : 'no'}">
                        <span class="grad-check-icon">${c.ok ? '✓' : '✗'}</span>
                        <span class="grad-check-label">${escapeHtml(c.label)}</span>
                    </div>
                `).join("")}
            </div>
        </div>
    `).join("");

    div.innerHTML = banner + sectionsHtml;
    div.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ==================== Custom Course ====================
function addCustomCourse() {
    const code = document.getElementById("custom-code").value.trim().toUpperCase();
    const name = document.getElementById("custom-name").value.trim();
    const credits = parseInt(document.getElementById("custom-credits").value);
    const category = document.getElementById("custom-category").value;

    if (!code || !name) { alert("Please enter both a course code and name"); return; }
    if (getAllCourses().some(c => c.code === code)) { alert("Course code already exists"); return; }

    customCourses.push({ code, name, credits, category, prerequisites: [] });
    document.getElementById("custom-modal").style.display = "none";
    document.getElementById("custom-code").value = "";
    document.getElementById("custom-name").value = "";
    document.getElementById("custom-credits").value = "6";
    renderDeptChips();
    renderCoursePool();
    saveToStorage();
}

// ==================== Persistence ====================
function saveToStorage() {
    localStorage.setItem("hku-plan", JSON.stringify(plan));
    localStorage.setItem("hku-custom", JSON.stringify(customCourses));
    localStorage.setItem("hku-active-programs", JSON.stringify(activePrograms));
    localStorage.setItem("hku-preset-courses", JSON.stringify(presetCourses));
    localStorage.setItem("hku-advanced-standing", advancedStanding ? "1" : "0");
}

function loadFromStorage() {
    try {
        const p = localStorage.getItem("hku-plan");
        if (p) { const parsed = JSON.parse(p); for (const k of Object.keys(plan)) { if (parsed[k]) plan[k] = parsed[k]; } }
        const c = localStorage.getItem("hku-custom");
        if (c) customCourses = JSON.parse(c);
        const ap = localStorage.getItem("hku-active-programs");
        if (ap) activePrograms = JSON.parse(ap);
        else {
            const a = localStorage.getItem("hku-active-program");
            if (a) {
                const old = JSON.parse(a);
                activePrograms = old ? [old] : [];
                localStorage.removeItem("hku-active-program");
            }
        }
        const pc = localStorage.getItem("hku-preset-courses");
        if (pc) presetCourses = JSON.parse(pc);
        advancedStanding = localStorage.getItem("hku-advanced-standing") === "1";
    } catch (e) { /* ignore */ }
}

function exportPlan() {
    const allCourses = getAllCourses();
    let text = "HKU Course Plan\n" + "=".repeat(40) + "\n";

    if (activePrograms.length > 0) {
        const labels = activePrograms.map(key => {
            const p = PROGRAM_PRESETS[key];
            return p ? `${p.type === "double" ? "2nd Major" : "Minor"}: ${p.name}` : key;
        });
        text += `Programs: Mathematics (Major) + ${labels.join(" + ")}\n`;
    } else {
        text += "Program: Mathematics (Major)\n";
    }
    if (advancedStanding) {
        text += `Advanced Standing: Yes (−${AS_CC_REDUCTION} CC, −${AS_FREE_ELEC_REDUCTION} Free Elective, min ${getMinCredits()} cr)\n`;
    }
    text += "\n";

    let grandTotal = 0;
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
            grandTotal += t;
        }
        text += "\n";
    }
    text += `Grand Total: ${grandTotal} credits\n`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hku_course_plan.txt"; a.click();
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
                if (data.advancedStanding !== undefined) {
                    advancedStanding = !!data.advancedStanding;
                    document.getElementById("advanced-standing-toggle").checked = advancedStanding;
                }
                rebuildPresetCourses();
                renderProgramPool(); renderMyDegree();
                renderDeptChips();
                renderAllSemesters(); renderCoursePool();
                updateDashboard(); checkWarnings(); saveToStorage();
                showToast("Plan loaded");
            } catch (err) { alert("Invalid file format"); }
        };
        reader.readAsText(file);
    });
    input.click();
}
