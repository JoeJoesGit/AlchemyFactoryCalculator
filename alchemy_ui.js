/* ==========================================================================
   ALCHEMY CALCULATOR UI CONTROLLER
   Handles events, inputs, sliders, and DOM updates.
   ========================================================================== */

let DB = null;
const APP_VERSION = "v98"; // UI Version
const OLD_STORAGE_KEY = "alchemy_factory_save_v1"; // Deprecated key
const SETTINGS_KEY = "alchemy_settings_v1";        // User Prefs (Belt level, etc)
const CUSTOM_DB_KEY = "alchemy_custom_db_v1";      // Custom Recipe Data

// NEW: Hardcoded Factory Defaults (Moved out of alchemy_db.js)
const DEFAULT_SETTINGS = {
    lvlBelt: 0,
    lvlSpeed: 0,
    lvlAlchemy: 0,
    lvlFuel: 0,
    lvlFert: 0,
    defaultFuel: "Plank",
    defaultFert: "Basic Fertilizer",
    preferredRecipes: {},
    activeRecyclers: {} // Now stores { "ItemName": true }
};

let isSelfFuel = false;
let isSelfFert = false;
let allItemsList = [];
let currentFocus = -1;

// DB Editor State
let currentDbSelection = null;
let dbFlatList = [];
let currentFilter = 'all';

function init() {
    initHeader(); // Set title and version

    // 1. CLEANUP OLD DATA
    if (localStorage.getItem(OLD_STORAGE_KEY)) {
        console.log("Detected legacy save data. Wiping for v96 architecture migration.");
        localStorage.removeItem(OLD_STORAGE_KEY);
    }

    // 2. LOAD DATABASE (Reference vs Custom)
    const officialDB = window.ALCHEMY_DB; // From alchemy_db.js
    const customDBStr = localStorage.getItem(CUSTOM_DB_KEY);

    if (customDBStr) {
        try {
            const customDB = JSON.parse(customDBStr);
            DB = customDB;

            // CHECK FOR UPDATES
            const offTime = officialDB.timestamp || "1970-01-01";
            const custTime = customDB.timestamp || "1970-01-01";

            if (offTime > custTime) {
                showUpdateNotification();
            } else {
                console.log("Custom DB is up to date (or newer) than Official.");
            }

        } catch (e) {
            console.error("Failed to load custom DB, reverting to official.", e);
            DB = JSON.parse(JSON.stringify(officialDB));
        }
    } else {
        // Standard User: Load Official
        DB = JSON.parse(JSON.stringify(officialDB));
    }

    // 3. LOAD SETTINGS (Overlay)
    // Apply user preferences on top of the loaded DB
    const savedSettings = localStorage.getItem(SETTINGS_KEY);

    // Initialize structure if missing
    if (!DB.items) DB.items = {};

    // UPDATED: Use DEFAULT_SETTINGS if DB has no settings
    if (!DB.settings) {
        DB.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    } else {
        // Fallback: Ensure missing keys in DB.settings are filled by Defaults
        DB.settings = { ...DEFAULT_SETTINGS, ...DB.settings };
    }

    // Ensure preferredRecipes object exists
    if (!DB.settings.preferredRecipes) DB.settings.preferredRecipes = {};

    if (savedSettings) {
        try {
            const userSettings = JSON.parse(savedSettings);
            // Overlay known settings fields
            ['lvlBelt', 'lvlSpeed', 'lvlAlchemy', 'lvlFuel', 'lvlFert', 'defaultFuel', 'defaultFert', 'preferredRecipes', 'activeRecyclers'].forEach(key => {
                if (userSettings[key] !== undefined) {
                    DB.settings[key] = userSettings[key];
                }
            });
        } catch (e) {
            console.error("Error loading settings", e);
        }
    }

    // Global variables sync
    if (DB.settings.activeRecyclers) {
        activeRecyclers = DB.settings.activeRecyclers;
    }

    // 4. UI INITIALIZATION
    const urlParams = new URLSearchParams(window.location.search);
    const urlItem = urlParams.get('item');
    const urlRate = urlParams.get('rate');

    prepareComboboxData();
    populateSelects();
    loadSettingsToUI();
    renderSlider();
    createDataList();

    if (urlItem && urlRate) {
        document.getElementById('targetItemInput').value = decodeURIComponent(urlItem);
        document.getElementById('targetRate').disabled = false;
        document.getElementById('targetRate').value = urlRate;
    } else {
        updateFromSlider();
    }

    // Default raw editor text
    document.getElementById('json-editor').value = `window.ALCHEMY_DB = ${JSON.stringify(DB, null, 4)};`;

    calculate();
}

function initHeader() {
    document.title = `Alchemy Factory Planner - ${APP_VERSION}`;
    const verEls = document.querySelectorAll('.app-version');
    verEls.forEach(el => el.innerText = APP_VERSION);
    const clLinks = document.querySelectorAll('.changelog-link');
    clLinks.forEach(el => {
        if (el.tagName === 'A') {
            el.href = "CHANGELOG.md";
            el.target = "_blank";
        } else {
            el.onclick = () => window.open("CHANGELOG.md", "_blank");
        }
    });
}

function showUpdateNotification() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'flex';
}

function hideUpdateNotification() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
}

/* ==========================================================================
   SECTION: DATA MANAGEMENT (Persist & Reset)
   ========================================================================== */

function persist() {
    // We now ONLY save settings to the settings key.
    const settingsObj = {
        lvlBelt: parseInt(document.getElementById('lvlBelt').value) || 0,
        lvlSpeed: parseInt(document.getElementById('lvlSpeed').value) || 0,
        lvlAlchemy: parseInt(document.getElementById('lvlAlchemy').value) || 0,
        lvlFuel: parseInt(document.getElementById('lvlFuel').value) || 0,
        lvlFert: parseInt(document.getElementById('lvlFert').value) || 0,
        defaultFuel: DB.settings.defaultFuel,
        defaultFert: DB.settings.defaultFert,
        preferredRecipes: DB.settings.preferredRecipes,
        activeRecyclers: activeRecyclers
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsObj));

    // Note: We also update the in-memory DB object so calculations work immediately
    DB.settings = { ...DB.settings, ...settingsObj };
}

function applyChanges() {
    const txt = generateDbString();
    localStorage.setItem(CUSTOM_DB_KEY, JSON.stringify(DB));
    localStorage.setItem("alchemy_source_v1", txt);

    initDbEditor();
    alert("Custom Database Saved! You are now using a local version.");
}

function resetFactory() {
    if (confirm("FULL RESET: This will wipe your Settings AND your Custom Database. Continue?")) {
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem(CUSTOM_DB_KEY);
        localStorage.removeItem("alchemy_source_v1");
        location.reload();
    }
}

function resetSettings() {
    if (confirm("Reset Upgrade Levels and Logistics preferences to default? (Recipes will stay)")) {
        localStorage.removeItem(SETTINGS_KEY);
        location.reload();
    }
}

function resetRecipes() {
    if (confirm("Discard custom recipes and revert to the Official Database?")) {
        localStorage.removeItem(CUSTOM_DB_KEY);
        localStorage.removeItem("alchemy_source_v1");
        location.reload();
    }
}

/* ==========================================================================
   SECTION: SLIDER LOGIC
   ========================================================================== */
function renderSlider() {
    if (typeof BELT_FRACTIONS === 'undefined') return;
    const slider = document.getElementById('beltSlider');
    const ticksContainer = document.getElementById('sliderTicks');
    const thumbWidth = 14;

    slider.max = BELT_FRACTIONS.length - 1;
    slider.value = BELT_FRACTIONS.length - 1;

    ticksContainer.innerHTML = '';

    BELT_FRACTIONS.forEach((frac, idx) => {
        const pct = (idx / (BELT_FRACTIONS.length - 1));
        const leftPos = `calc(${pct * 100}% + (${(thumbWidth / 2) - (thumbWidth * pct) + 2}px))`;
        const tick = document.createElement('div');
        tick.className = `tick-mark ${frac.label ? 'labeled' : ''}`;
        tick.style.left = leftPos;

        let labelHtml = '';
        if (frac.label) {
            if (frac.label === "Full") {
                labelHtml = `<div class="vertical-frac full-label">Full</div>`;
            } else if (frac.label.includes("/")) {
                const [n, d] = frac.label.split("/");
                labelHtml = `<div class="vertical-frac"><span class="num">${n}</span><span class="sep"></span><span class="den">${d}</span></div>`;
            } else {
                labelHtml = `<div class="vertical-frac">${frac.label}</div>`;
            }
        }

        tick.innerHTML = `<div class="tick-line"></div>${labelHtml}`;
        ticksContainer.appendChild(tick);
    });
}

function updateFromSlider() {
    if (typeof BELT_FRACTIONS === 'undefined') return;
    const sliderIndex = parseInt(document.getElementById('beltSlider').value);
    const fraction = BELT_FRACTIONS[sliderIndex];
    const lvlBelt = parseInt(document.getElementById('lvlBelt').value) || 0;
    const currentSpeed = getBeltSpeed(lvlBelt);
    const rate = calculateRateFromFraction(fraction, currentSpeed);
    document.getElementById('targetRate').value = parseFloat(rate.toFixed(2));
    calculate();
}

/* ==========================================================================
   SECTION: DB EDITOR LOGIC (ENHANCED)
   ========================================================================== */
function switchTab(tabName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + tabName).classList.add('active');
    const btnIndex = tabName === 'calc' ? 0 : 1;
    document.querySelectorAll('.tab-btn')[btnIndex].classList.add('active');

    if (tabName === 'db') {
        initDbEditor();
    }
}

function initDbEditor() {
    dbFlatList = [];

    // Items
    Object.keys(DB.items).forEach(key => {
        dbFlatList.push({ type: 'item', key: key, name: key, ...DB.items[key] });
    });

    // Recipes
    DB.recipes.forEach(r => {
        dbFlatList.push({ type: 'recipe', key: r.id, name: r.id, machine: r.machine, ...r });
    });

    // Machines
    if (DB.machines) {
        Object.keys(DB.machines).forEach(key => {
            dbFlatList.push({ type: 'machine', key: key, name: key, ...DB.machines[key] });
        });
    }

    // Sort alpha
    dbFlatList.sort((a, b) => a.name.localeCompare(b.name));

    filterDbList();
}

function setDbFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.filter-btn');
    if (filter === 'all') btns[0].classList.add('active');
    if (filter === 'item') btns[1].classList.add('active');
    if (filter === 'recipe') btns[2].classList.add('active');
    if (filter === 'machine') btns[3].classList.add('active');

    filterDbList();
}

function filterDbList() {
    const term = document.getElementById('db-search-input').value.toLowerCase();
    const listEl = document.getElementById('db-list');
    listEl.innerHTML = '';

    const matches = dbFlatList.filter(x => {
        if (currentFilter !== 'all' && x.type !== currentFilter) return false;
        return x.name.toLowerCase().includes(term) || (x.machine && x.machine.toLowerCase().includes(term));
    });

    matches.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'db-list-item';
        if (currentDbSelection && currentDbSelection.key === obj.key && currentDbSelection.type === obj.type) {
            div.classList.add('selected');
        }

        let typeLabel = obj.type === 'item' ? 'Item' : (obj.type === 'recipe' ? 'Recipe' : 'Machine');
        let subText = "";

        if (obj.type === 'item') subText = obj.category || '';
        if (obj.type === 'recipe') subText = obj.machine;

        if (obj.type === 'machine') {
            if (obj.tier !== undefined) {
                subText = `Tier: ${obj.tier}`;
            } else {
                subText = "Tier: ?";
            }
        }

        div.innerHTML = `<span>${obj.name} <span class="db-subtext">(${subText})</span></span> <span class="db-type-tag ${obj.type}">${typeLabel}</span>`;
        div.onclick = () => selectDbObject(obj.type, obj.key);
        listEl.appendChild(div);
    });
}

function selectDbObject(type, key) {
    currentDbSelection = { type, key };
    document.getElementById('db-editor-title').innerText = key;

    // Show Report Button
    const reportBtn = document.getElementById('btn-report-issue');
    reportBtn.style.display = 'inline-block';
    reportBtn.innerText = `Report Issue: ${key}`;

    // Hide Raw Editor if open
    document.getElementById('full-source-wrapper').style.display = 'none';
    document.getElementById('visual-editor-wrapper').style.display = 'block';
    document.getElementById('btn-raw-mode').style.display = 'inline-block';

    filterDbList(); // Re-render to show selection highlight
    renderDbForm();
    updateSnippetView();
}

function updateSnippetView() {
    if (!currentDbSelection) return;
    const { type, key } = currentDbSelection;
    let data = null;
    if (type === 'item') data = DB.items[key];
    else if (type === 'machine') data = DB.machines[key];
    else data = DB.recipes.find(r => r.id === key);

    const snippet = document.getElementById('json-snippet');
    document.getElementById('snippet-container').style.display = 'block';

    if (type === 'recipe') {
        snippet.value = JSON.stringify(data, null, 4);
    } else {
        snippet.value = `"${key}": ${JSON.stringify(data, null, 4)}`;
    }
}

function renderDbForm() {
    if (!currentDbSelection) return;
    const container = document.getElementById('db-form-container');
    container.innerHTML = '';

    const { type, key } = currentDbSelection;
    let data = null;

    if (type === 'item') {
        data = DB.items[key];
        let formHtml = `<div class="db-form">`;
        formHtml += createInput('Category', 'text', data.category, 'category');
        formHtml += createInput('Buy Price (G)', 'number', data.buyPrice, 'buyPrice');
        formHtml += createInput('Sell Price (G)', 'number', data.sellPrice, 'sellPrice');
        formHtml += createInput('Heat Value (P)', 'number', data.heat, 'heat');
        formHtml += createInput('Nutrient Cost', 'number', data.nutrientCost, 'nutrientCost');
        formHtml += createInput('Nutrient Value', 'number', data.nutrientValue, 'nutrientValue');
        formHtml += createInput('Max Fertility', 'number', data.maxFertility, 'maxFertility');
        formHtml += `</div>`;
        container.innerHTML = formHtml;

    } else if (type === 'recipe') {
        data = DB.recipes.find(r => r.id === key);
        let formHtml = `<div class="db-form">`;
        formHtml += createInput('Machine', 'text', data.machine, 'machine');
        formHtml += createInput('Base Time (sec)', 'number', data.baseTime, 'baseTime');
        formHtml += `<div class="form-group full-width"><label>Inputs</label><div class="dynamic-list" id="list-inputs"></div></div>`;
        formHtml += `<div class="form-group full-width"><label>Outputs</label><div class="dynamic-list" id="list-outputs"></div></div>`;
        formHtml += `</div>`;
        container.innerHTML = formHtml;
        renderDynamicList('inputs', data.inputs);
        renderDynamicList('outputs', data.outputs);

    } else if (type === 'machine') {
        data = DB.machines[key];
        let formHtml = `<div class="db-form">`;

        // --- NEW MACHINE FIELDS ---
        formHtml += createInput('Research Tier', 'number', data.tier, 'tier');
        formHtml += createInput('Slots for Stacking', 'number', data.slots, 'slots');
        formHtml += createInput('Slots Required', 'number', data.slotsRequired, 'slotsRequired');
        formHtml += createInput('Parent (if module)', 'text', data.parent, 'parent');

        // Size and IO
        formHtml += `<div class="form-group full-width" style="display:flex; gap:10px;">
                        <div style="flex:1">${createInput('Size X', 'number', data.sizeX, 'sizeX')}</div>
                        <div style="flex:1">${createInput('Size Y', 'number', data.sizeY, 'sizeY')}</div>
                        <div style="flex:1">${createInput('Size Z', 'number', data.sizeZ, 'sizeZ')}</div>
                     </div>`;

        formHtml += `<div class="form-group full-width" style="display:flex; gap:10px;">
                        <div style="flex:1">${createInput('Input Count', 'number', data.inputCount, 'inputCount')}</div>
                        <div style="flex:1">${createInput('Output Count', 'number', data.outputCount, 'outputCount')}</div>
                     </div>`;

        // Heat Toggles
        formHtml += createToggleInput('Heat Cost', data.heatCost, 'heatCost');
        formHtml += createToggleInput('Heat Gen (Self)', data.heatSelf, 'heatSelf');

        // Build Cost List
        formHtml += `<div class="form-group full-width"><label>Build Cost</label><div class="dynamic-list" id="list-buildCost"></div></div>`;
        formHtml += `</div>`;
        container.innerHTML = formHtml;
        renderDynamicList('buildCost', data.buildCost);
    }
}

function createInput(label, type, val, prop) {
    let value = val !== undefined ? val : '';
    return `
        <div class="form-group">
            <label>${label}</label>
            <input type="${type}" value="${value}" oninput="updateDbProperty('${prop}', this.value, '${type}')">
        </div>
    `;
}

function createToggleInput(label, val, prop) {
    const isEnabled = (val !== undefined && val !== 0);
    const value = isEnabled ? val : 0;

    return `
        <div class="form-group">
            <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" style="width:auto;" ${isEnabled ? 'checked' : ''} onchange="toggleField('${prop}', this.checked)">
                ${label}
            </label>
            <input type="number" id="input-${prop}" value="${value}" ${isEnabled ? '' : 'disabled'} oninput="updateDbProperty('${prop}', this.value, 'number')">
        </div>
    `;
}

function toggleField(prop, checked) {
    const input = document.getElementById(`input-${prop}`);
    if (checked) {
        input.disabled = false;
        if (input.value === "") input.value = 0;
        updateDbProperty(prop, input.value, 'number');
    } else {
        input.disabled = true;
        updateDbProperty(prop, 0, 'number');
    }
}

function updateDbProperty(prop, val, type) {
    if (!currentDbSelection) return;
    let finalVal = val;
    if (type === 'number') finalVal = val === '' ? undefined : parseFloat(val);

    if ((prop === 'heatCost' || prop === 'heatSelf') && finalVal === 0) finalVal = undefined;

    if (currentDbSelection.type === 'item') {
        if (finalVal === undefined) delete DB.items[currentDbSelection.key][prop];
        else DB.items[currentDbSelection.key][prop] = finalVal;
    } else if (currentDbSelection.type === 'machine') {
        if (finalVal === undefined) delete DB.machines[currentDbSelection.key][prop];
        else DB.machines[currentDbSelection.key][prop] = finalVal;
    } else {
        const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
        if (recipe) {
            if (finalVal === undefined) delete recipe[prop];
            else recipe[prop] = finalVal;
        }
    }
    updateSnippetView();
}

// === NEW DYNAMIC LIST WITH COMBOBOXES ===

function renderDynamicList(field, obj) {
    const container = document.getElementById(`list-${field}`);
    container.innerHTML = '';

    if (obj) {
        Object.keys(obj).forEach(item => {
            const row = document.createElement('div');
            row.className = 'dynamic-row';

            // Custom Combobox + Number Input + Remove Button
            row.innerHTML = `
                <div class="combobox-container" style="flex:1; margin-right:10px;">
                    <div class="input-wrapper" style="width:100%; display:flex; align-items:center; position:relative;">
                        <input type="text" value="${item}" class="real-input" style="flex-grow:1;"
                            placeholder="Item Name"
                            onfocus="filterRowCombo(this)"
                            oninput="filterRowCombo(this)"
                            onblur="setTimeout(() => this.closest('.combobox-container').querySelector('.combobox-list').style.display='none', 200)"
                            onchange="validateAndSetKey('${field}', '${item}', this)"
                        >
                        <div class="combo-arrow" onclick="toggleRowCombo(this)" style="cursor:pointer; padding:0 8px;">▼</div>
                    </div>
                    <div class="combobox-list" style="display:none;"></div>
                </div>
                <input type="number" value="${obj[item]}" placeholder="Qty" style="width:70px;" oninput="updateDynamicVal('${field}', '${item}', this.value)">
                <button class="btn-remove" onclick="removeDynamicItem('${field}', '${item}')">×</button>
            `;
            container.appendChild(row);
        });
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.innerText = '+ Add Item';
    addBtn.onclick = () => addDynamicItem(field);
    container.appendChild(addBtn);
}

// Helpers for the Dynamic Comboboxes
function toggleRowCombo(arrowBtn) {
    const wrapper = arrowBtn.closest('.input-wrapper');
    const list = wrapper.nextElementSibling; // The .combobox-list div
    const input = wrapper.querySelector('input');

    if (list.style.display === 'block') {
        list.style.display = 'none';
    } else {
        list.style.display = 'block';
        input.focus();
        filterRowCombo(input);
    }
}

function filterRowCombo(input) {
    const filter = input.value.toLowerCase();
    const container = input.closest('.combobox-container');
    const list = container.querySelector('.combobox-list');

    list.innerHTML = '';
    list.style.display = 'block';

    let matches = allItemsList.filter(i => i.name.toLowerCase().includes(filter));

    // Sort smart: Starts With first
    matches.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(filter);
        const bStarts = b.name.toLowerCase().startsWith(filter);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
    });

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'combo-item';
        empty.innerText = "No matches";
        empty.style.color = "#999";
        list.appendChild(empty);
    }

    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.innerHTML = `<span>${match.name}</span> <span class="combo-cat">${match.category}</span>`;
        // Pass current value (item key) to replace
        // Note: We need the field name and old key. 
        // We can grab the old key from the input's default value or attribute? 
        // Actually, the validate function handles the key swap.
        // We just set the value and trigger change.
        div.onclick = () => selectRowItem(input, match.name);
        list.appendChild(div);
    });
}

function selectRowItem(input, newName) {
    input.value = newName;
    // Hide list
    const list = input.closest('.combobox-container').querySelector('.combobox-list');
    list.style.display = 'none';
    // Trigger the change event logic manually since we set value via JS
    // The onchange handler in HTML is: validateAndSetKey(field, oldKey, input)
    // We need to parse that string or just trigger event.
    input.dispatchEvent(new Event('change'));
}

function validateAndSetKey(field, oldKey, inputElem) {
    const newKey = inputElem.value;
    // Check against DB items
    if (!DB.items[newKey] && newKey !== "New Item") {
        alert("Invalid Item! Please select a valid item from the list.");
        inputElem.value = oldKey; // Revert
        return;
    }
    updateDynamicKey(field, oldKey, newKey);
}

function updateDynamicVal(field, key, val) {
    let targetObj = null;
    if (currentDbSelection.type === 'recipe') targetObj = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (currentDbSelection.type === 'machine') targetObj = DB.machines[currentDbSelection.key];

    if (targetObj && targetObj[field]) {
        targetObj[field][key] = parseFloat(val) || 0;
        updateSnippetView();
    }
}

function updateDynamicKey(field, oldKey, newKey) {
    let targetObj = null;
    if (currentDbSelection.type === 'recipe') targetObj = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (currentDbSelection.type === 'machine') targetObj = DB.machines[currentDbSelection.key];

    if (targetObj && targetObj[field]) {
        const val = targetObj[field][oldKey];
        delete targetObj[field][oldKey];
        targetObj[field][newKey] = val;
        renderDynamicList(field, targetObj[field]);
        updateSnippetView();
    }
}

function removeDynamicItem(field, key) {
    let targetObj = null;
    if (currentDbSelection.type === 'recipe') targetObj = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (currentDbSelection.type === 'machine') targetObj = DB.machines[currentDbSelection.key];

    if (targetObj && targetObj[field]) {
        delete targetObj[field][key];
        renderDynamicList(field, targetObj[field]);
        updateSnippetView();
    }
}

function addDynamicItem(field) {
    let targetObj = null;
    if (currentDbSelection.type === 'recipe') targetObj = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (currentDbSelection.type === 'machine') targetObj = DB.machines[currentDbSelection.key];

    if (targetObj) {
        if (!targetObj[field]) targetObj[field] = {};
        // Find unique name
        let name = "New Item";
        let counter = 1;
        while (targetObj[field][name]) { name = "New Item " + counter++; }

        targetObj[field][name] = 1;
        renderDynamicList(field, targetObj[field]);
        updateSnippetView();
    }
}

// --- FULL SOURCE EDITING ---
function toggleFullSourceMode() {
    const visualWrapper = document.getElementById('visual-editor-wrapper');
    const sourceWrapper = document.getElementById('full-source-wrapper');
    const btnRaw = document.getElementById('btn-raw-mode');
    const btnReport = document.getElementById('btn-report-issue');
    const title = document.getElementById('db-editor-title');

    if (sourceWrapper.style.display === 'none') {
        // Switch to Source
        visualWrapper.style.display = 'none';
        sourceWrapper.style.display = 'flex';
        btnRaw.style.display = 'none'; // Hide button inside logic, show cancel instead
        btnReport.style.display = 'none';
        title.innerText = "Editing Full Database Source";

        // Populate text area
        document.getElementById('json-editor').value = `window.ALCHEMY_DB = ${JSON.stringify(DB, null, 4)};`;
        currentDbSelection = null; // Clear selection visual
        filterDbList(); // Remove highlighting
    } else {
        // Cancel/Back
        sourceWrapper.style.display = 'none';
        visualWrapper.style.display = 'block';
        btnRaw.style.display = 'inline-block';
        title.innerText = "Select an Item...";
        document.getElementById('db-form-container').innerHTML = `<div style="color:#666; font-style:italic; text-align:center; margin-top:50px;">Select an item from the sidebar to edit.</div>`;
        document.getElementById('snippet-container').style.display = 'none';
    }
}

function saveFullSource() {
    const txt = document.getElementById('json-editor').value;
    try {
        if (txt.includes("window.ALCHEMY_DB")) {
            eval(txt);
            DB = window.ALCHEMY_DB;

            // Save to CUSTOM DB KEY since user modified source
            applyChanges();
            toggleFullSourceMode();
        } else {
            throw new Error("Missing 'window.ALCHEMY_DB =' assignment.");
        }
    } catch (e) { alert("Syntax Error: " + e.message); }
}

function generateDbString() {
    return `window.ALCHEMY_DB = ${JSON.stringify(DB, null, 4)};`;
}

/* ==========================================================================
   SECTION: GITHUB REPORTING
   ========================================================================== */
function reportGithubIssue() {
    if (!currentDbSelection) return;

    const { type, key } = currentDbSelection;
    let dataStr = "";

    if (type === 'item') dataStr = JSON.stringify(DB.items[key], null, 4);
    else if (type === 'machine') dataStr = JSON.stringify(DB.machines[key], null, 4);
    else dataStr = JSON.stringify(DB.recipes.find(r => r.id === key), null, 4);

    const title = encodeURIComponent(`[Data Error] ${key}`);
    const body = encodeURIComponent(`I found an issue with **${key}** (${type}).\n\n**Current Data:**\n\`\`\`json\n${dataStr}\n\`\`\`\n\n**Suggested Correction:**\n(Please describe what is wrong and what the correct values should be)`);

    const url = `https://github.com/JoeJoesGit/AlchemyFactoryCalculator/issues/new?title=${title}&body=${body}`;
    window.open(url, '_blank');
}

/* ==========================================================================
   SECTION: DATA MANAGEMENT (Save/Export)
   ========================================================================== */

function exportData() {
    const txt = generateDbString();
    const blob = new Blob([txt], { type: "text/javascript" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "alchemy_db.js"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function saveSettings() {
    persist();
    alert("Settings Saved!");
}

/* ==========================================================================
   SECTION: COMBOBOX & INPUTS (Existing Logic Preserved)
   ========================================================================== */
function prepareComboboxData() {
    const allItems = new Set(Object.keys(DB.items || {}));
    if (DB.recipes) DB.recipes.forEach(r => Object.keys(r.outputs).forEach(k => allItems.add(k)));
    allItemsList = Array.from(allItems).sort().map(name => {
        return { name: name, category: (DB.items[name] ? DB.items[name].category : "Other") };
    });
}
function toggleCombobox() {
    const list = document.getElementById('combobox-list');
    const input = document.getElementById('targetItemInput');
    if (list.style.display === 'block') { closeCombobox(); } else { input.focus(); filterCombobox(); }
}
function updateComboIcon() {
    const input = document.getElementById('targetItemInput');
    const icon = document.getElementById('combo-btn');
    if (input.value.trim().length > 0) { icon.innerText = "✖"; icon.style.color = "#ff5252"; } else { icon.innerText = "▼"; icon.style.color = "#888"; }
}
function handleComboIconClick(e) {
    e.stopPropagation();
    const input = document.getElementById('targetItemInput');
    if (input.value.trim().length > 0) { input.value = ""; filterCombobox(); updateComboIcon(); input.focus(); } else { toggleCombobox(); }
}
function closeCombobox() { document.getElementById('combobox-list').style.display = 'none'; currentFocus = -1; }
function closeComboboxDelayed() { setTimeout(() => closeCombobox(), 200); }
function filterCombobox() {
    const input = document.getElementById('targetItemInput');
    const filter = input.value.toLowerCase();
    const list = document.getElementById('combobox-list');
    const ghost = document.getElementById('ghost-text');
    list.innerHTML = ''; list.style.display = 'block';
    updateComboIcon();
    let matches = allItemsList.filter(item => item.name.toLowerCase().includes(filter));
    matches.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(filter);
        const bStarts = b.name.toLowerCase().startsWith(filter);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
    });
    matches.forEach((item) => {
        const div = document.createElement('div'); div.className = 'combo-item';
        div.innerHTML = `<span>${item.name}</span> <span class="combo-cat">${item.category}</span>`;
        div.onclick = function () { selectItem(item.name); };
        list.appendChild(div);
    });
    if (filter.length > 0 && matches.length > 0) {
        const topMatch = matches[0].name;
        if (topMatch.toLowerCase().startsWith(filter)) {
            const ghostSuffix = topMatch.substring(filter.length);
            ghost.innerText = input.value + ghostSuffix;
        } else { ghost.innerText = ""; }
    } else { ghost.innerText = ""; }
}
function handleComboKey(e) {
    const list = document.getElementById('combobox-list');
    const items = list.getElementsByClassName('combo-item');
    const input = document.getElementById('targetItemInput');
    const ghost = document.getElementById('ghost-text');
    if (e.key === 'ArrowDown') { currentFocus++; if (currentFocus >= items.length) currentFocus = 0; setActive(items); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { currentFocus--; if (currentFocus < 0) currentFocus = items.length - 1; setActive(items); e.preventDefault(); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFocus > -1 && items.length > 0) { items[currentFocus].click(); }
        else if (ghost.innerText.length > input.value.length) { selectItem(ghost.innerText); }
        else if (items.length > 0) { items[0].click(); }
        else { closeCombobox(); calculate(); }
    } else if (e.key === 'Tab') { if (ghost.innerText.length > input.value.length) { e.preventDefault(); selectItem(ghost.innerText); } else { closeCombobox(); } }
}
function setActive(items) {
    if (!items) return;
    for (let i = 0; i < items.length; i++) { items[i].classList.remove('selected'); }
    if (currentFocus >= 0 && currentFocus < items.length) {
        items[currentFocus].classList.add('selected'); items[currentFocus].scrollIntoView({ block: 'nearest' });
        const name = items[currentFocus].getElementsByTagName('span')[0].innerText;
        document.getElementById('targetItemInput').value = name;
        document.getElementById('ghost-text').innerText = "";
        updateComboIcon();
    }
}
function selectItem(name) {
    const input = document.getElementById('targetItemInput'); input.value = name;
    document.getElementById('ghost-text').innerText = ""; closeCombobox(); updateComboIcon(); updateFromSlider();
}
function loadSettingsToUI() {
    if (DB.settings) {
        ['lvlBelt', 'lvlSpeed', 'lvlAlchemy', 'lvlFuel', 'lvlFert'].forEach(k => { if (DB.settings[k] !== undefined) document.getElementById(k).value = DB.settings[k]; });
        if (DB.settings.defaultFuel) document.getElementById('fuelSelect').value = DB.settings.defaultFuel;
        if (DB.settings.defaultFert) document.getElementById('fertSelect').value = DB.settings.defaultFert;
    }
    updateDefaultButtonState();
}
function populateSelects() {
    const fuelSel = document.getElementById('fuelSelect'); const fertSel = document.getElementById('fertSelect');
    fuelSel.innerHTML = ''; fertSel.innerHTML = '';
    const fuels = []; const ferts = [];
    const allItems = new Set(Object.keys(DB.items || {}));
    if (DB.recipes) DB.recipes.forEach(r => Object.keys(r.outputs).forEach(k => allItems.add(k)));
    allItems.forEach(itemName => {
        const itemDef = DB.items[itemName] || {};
        if (itemDef.heat) fuels.push({ name: itemName, heat: itemDef.heat });
        if (itemDef.nutrientValue) ferts.push({ name: itemName, val: itemDef.nutrientValue });
    });
    fuels.sort((a, b) => b.heat - a.heat).forEach(f => { fuelSel.appendChild(new Option(`${f.name} (${f.heat} P)`, f.name)); });
    ferts.sort((a, b) => b.val - a.val).forEach(f => { fertSel.appendChild(new Option(`${f.name} (${f.val} V)`, f.name)); });
}
function toggleFuel() {
    const btn = document.getElementById('btnSelfFuel'); const chk = document.getElementById('selfFeed');
    chk.checked = !chk.checked;
    if (chk.checked) { btn.innerText = "Self-Fuel: ON"; btn.classList.remove('btn-inactive-red'); btn.classList.add('btn-active-green'); }
    else { btn.innerText = "Self-Fuel: OFF"; btn.classList.remove('btn-active-green'); btn.classList.add('btn-inactive-red'); }
    calculate();
}
function toggleFert() {
    const btn = document.getElementById('btnSelfFert'); const chk = document.getElementById('selfFert');
    chk.checked = !chk.checked;
    if (chk.checked) { btn.innerText = "Self-Fert: ON"; btn.classList.remove('btn-inactive-red'); btn.classList.add('btn-active-green'); }
    else { btn.innerText = "Self-Fert: OFF"; btn.classList.remove('btn-active-green'); btn.classList.add('btn-inactive-red'); }
    calculate();
}
function setDefaultFuel() { const c = document.getElementById('fuelSelect').value; DB.settings.defaultFuel = c; persist(); updateDefaultButtonState(); alert("Default Fuel Saved: " + c); }
function setDefaultFert() { const c = document.getElementById('fertSelect').value; DB.settings.defaultFert = c; persist(); updateDefaultButtonState(); alert("Default Fertilizer Saved: " + c); }
function updateDefaultButtonState() {
    const curFuel = document.getElementById('fuelSelect').value; const defFuel = DB.settings.defaultFuel;
    const btnFuel = document.getElementById('btnDefFuel');
    if (curFuel === defFuel) { btnFuel.disabled = true; btnFuel.innerText = "Current Default"; } else { btnFuel.disabled = false; btnFuel.innerText = "Make Default"; }
    const curFert = document.getElementById('fertSelect').value; const defFert = DB.settings.defaultFert;
    const btnFert = document.getElementById('btnDefFert');
    if (curFert === defFert) { btnFert.disabled = true; btnFert.innerText = "Current Default"; } else { btnFert.disabled = false; btnFert.innerText = "Make Default"; }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function adjustInput(id, delta) { const el = document.getElementById(id); let val = parseInt(el.value) || 0; el.value = Math.max(0, val + delta); }
function adjustRate(delta) {
    const el = document.getElementById('targetRate');
    if (el.disabled) return;
    let val = parseFloat(el.value) || 0;
    el.value = (Math.round((val + delta) * 10) / 10).toFixed(1);
    calculate();
}
function openRecipeModal(item, domElement) {
    const candidates = getRecipesFor(item);
    const list = document.getElementById('recipe-list');
    list.innerHTML = '';
    document.getElementById('recipe-modal-title').innerText = `Select Recipe for ${item}`;
    const currentId = (getActiveRecipe(item) || {}).id;
    let ancestors = [];
    if (domElement && domElement.dataset.ancestors) {
        try { ancestors = JSON.parse(domElement.dataset.ancestors); } catch (e) { }
    }
    candidates.forEach(r => {
        const div = document.createElement('div');
        div.className = `recipe-option ${r.id === currentId ? 'active' : ''}`;
        let isLoop = false; let conflict = "";
        if (r.inputs) { for (let inp in r.inputs) { if (inp === item || ancestors.includes(inp)) { isLoop = true; conflict = inp; break; } } }
        if (!isLoop && r.outputs) { for (let out in r.outputs) { if (out !== item && ancestors.includes(out)) { isLoop = true; conflict = out; break; } } }
        let inputs = []; Object.keys(r.inputs).forEach(key => { inputs.push(`${r.inputs[key]}x ${key}`); });
        let outputs = []; Object.keys(r.outputs).forEach(key => { outputs.push(`${r.outputs[key]}x ${key}`); });
        let content = `
            <div class="recipe-header"><strong>${r.machine}</strong> <span style="font-size:0.9em; opacity:0.8;">(${r.baseTime}s)</span>${r.id === currentId ? '✅' : ''}</div>
            <div class="recipe-details">Input: ${inputs.join(', ')}<br>Yields: ${outputs.join(', ')}</div>
        `;
        if (isLoop) {
            div.classList.add("disabled");
            content += `<div class="loop-warning">⚠️ Creates Infinite Loop with ${conflict}</div>`;
            div.onclick = () => alert(`Cannot select this recipe. It creates a recursive loop because it depends on or outputs ${conflict}, which is already being produced in this chain.`);
        } else {
            div.onclick = () => { DB.settings.preferredRecipes[item] = r.id; persist(); closeModal('recipe-modal'); calculate(); };
        }
        div.innerHTML = content;
        list.appendChild(div);
    });
    document.getElementById('recipe-modal').style.display = 'flex';
}
function openDrillDown(item, rate) {
    const url = `index.html?item=${encodeURIComponent(item)}&rate=${rate.toFixed(2)}`;
    window.open(url, '_blank');
}
function updateConstructionList(maxCounts, minCounts, furnaces) {
    const buildList = document.getElementById('construction-list'); buildList.innerHTML = '';
    const totalMatsContainer = document.getElementById('total-mats-container'); totalMatsContainer.innerHTML = '';
    const sortedMachines = Object.keys(maxCounts).sort();
    let totalConstructionMaterials = {};
    sortedMachines.forEach(m => {
        const countMax = maxCounts[m];
        const countMin = Math.ceil(minCounts[m]);
        if (countMax <= 0) return;
        let label = (countMax === countMin) ? `${countMax}` : `<span style="font-size:0.9em">Min ${countMin}, Max ${countMax}</span>`;
        const li = document.createElement('li'); li.className = 'build-group';
        const machineDef = DB.machines[m] || {};
        const buildCost = machineDef.buildCost;
        let subListHtml = '';
        if (buildCost) {
            subListHtml = `<ul class="build-sublist">`;
            Object.keys(buildCost).forEach(mat => {
                const totalQty = buildCost[mat] * countMin;
                subListHtml += `<li class="build-subitem"><span>${mat}</span> <span class="build-val">${totalQty}</span></li>`;
                if (!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
                totalConstructionMaterials[mat] += totalQty;
            });
            subListHtml += `</ul>`;
        } else {
            subListHtml = `<ul class="build-sublist"><li class="build-subitem" style="color:#666;">No build data</li></ul>`;
        }
        li.innerHTML = `<div class="build-header" onclick="toggleBuildGroup(this.parentNode)"><span><span class="build-arrow">▶</span> ${m}</span> <span class="build-count">${label}</span></div>${subListHtml}`;
        buildList.appendChild(li);
    });
    if (furnaces > 0) {
        const li = document.createElement('li'); li.className = 'build-group';
        const mName = "Stone Furnace"; const count = furnaces;
        const machineDef = DB.machines[mName] || {}; const buildCost = machineDef.buildCost;
        let subListHtml = '';
        if (buildCost) {
            subListHtml = `<ul class="build-sublist">`;
            Object.keys(buildCost).forEach(mat => {
                const totalQty = buildCost[mat] * count;
                subListHtml += `<li class="build-subitem"><span>${mat}</span> <span class="build-val">${totalQty}</span></li>`;
                if (!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
                totalConstructionMaterials[mat] += totalQty;
            });
            subListHtml += `</ul>`;
        }
        li.innerHTML = `<div class="build-header" style="border-top:1px dashed #555" onclick="toggleBuildGroup(this.parentNode)"><span><span class="build-arrow">▶</span> Stone Furnace (Min)</span> <span class="build-count" style="color:var(--warn)">${count}</span></div>${subListHtml}`;
        buildList.appendChild(li);
    }
    if (Object.keys(totalConstructionMaterials).length > 0) {
        let totalHtml = `<div class="total-mats-header">Total Materials Required (Minimum)</div>`;
        Object.keys(totalConstructionMaterials).sort().forEach(mat => {
            totalHtml += `<div class="total-mat-item"><span>${mat}</span> <strong>${totalConstructionMaterials[mat]}</strong></div>`;
        });
        totalMatsContainer.innerHTML = totalHtml;
    }
}
function updateSummaryBox(p, heat, bio, cost, grossRate, actualFuelNeed, actualFertNeed) {
    const targetItemDef = DB.items[p.targetItem] || {};
    let internalHeat = p.selfFeed ? heat : 0;
    let externalHeat = !p.selfFeed ? heat : 0;
    let internalBio = p.selfFert ? bio : 0;
    let externalBio = !p.selfFert ? bio : 0;
    let profitHtml = "";
    if (targetItemDef.sellPrice) {
        const revenuePerMin = p.targetRate * targetItemDef.sellPrice;
        const profit = revenuePerMin - cost;
        profitHtml = `<div class="stat-block"><span class="stat-label">Projected Profit</span><span class="stat-value ${profit >= 0 ? 'gold-profit' : 'gold-cost'}">${Math.floor(profit).toLocaleString()} G/m</span></div>`;
    } else {
        profitHtml = `<div class="stat-block"><span class="stat-label">Total Raw Cost</span><span class="stat-value gold-cost">${Math.ceil(cost).toLocaleString()} G/m</span></div>`;
    }
    let deductionText = [];
    if (p.selfFeed && p.targetItem === p.selectedFuel) {
        let gross = p.targetRate + actualFuelNeed;
        deductionText.push(`Gross: ${gross.toFixed(2)}`);
        deductionText.push(`Use: ${actualFuelNeed.toFixed(2)}`);
    }
    if (p.selfFert && p.targetItem === p.selectedFert) {
        let gross = p.targetRate + actualFertNeed;
        deductionText.push(`Gross: ${gross.toFixed(2)}`);
        deductionText.push(`Use: ${actualFertNeed.toFixed(2)}`);
    }
    document.getElementById('summary-container').innerHTML = `
        <div class="summary-box">
            <div class="stat-block"><span class="stat-label">Net Output</span><span class="stat-value ${p.targetRate >= 0 ? 'net-positive' : 'net-warning'}">${p.targetRate.toFixed(1)} / min</span>${deductionText.length > 0 ? `<span class=\"stat-sub\" style=\"font-size:0.75em\">${deductionText.join('<br>')}</span>` : ''}</div>
            <div class="stat-block"><span class="stat-label">Internal Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${internalHeat.toFixed(1)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(internalBio)} V/s</span></div>
            <div class="stat-block"><span class="stat-label">External Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${externalHeat.toFixed(1)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(externalBio)} V/s</span></div>
            ${profitHtml}
            <div class="stat-block"><span class="stat-label">Belt Usage (Net)</span><span class="stat-value" style="font-size:1.1em; color:${p.targetRate > p.beltSpeed ? '#ff5252' : '#aaa'};">${(p.targetRate / p.beltSpeed * 100).toFixed(0)}%</span><span class="stat-sub">Cap: ${p.beltSpeed}/m</span></div>
        </div>`;
}
function toggleBuildGroup(header) { header.classList.toggle('expanded'); }
function toggleNode(arrowElement) { const node = arrowElement.closest('.node'); if (node) node.classList.toggle('collapsed'); }
function toggleRecycle(itemName) {
    if (activeRecyclers[itemName]) { delete activeRecyclers[itemName]; }
    else { activeRecyclers[itemName] = true; }
    persist(); calculate();
}
window.onload = init;