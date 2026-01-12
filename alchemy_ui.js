/* ==========================================================================
   ALCHEMY CALCULATOR UI CONTROLLER
   Handles events, inputs, sliders, and DOM updates.
   ========================================================================== */

let DB = null;
const VERSION = 'v102'; // UI Version
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
    activeRecyclers: {}, // Now stores { "ItemName": true }
    sectionStates: {}   // Stores { "Section Title": isCollapsedBoolean }
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
            ['lvlBelt', 'lvlSpeed', 'lvlAlchemy', 'lvlFuel', 'lvlFert', 'defaultFuel', 'defaultFert', 'preferredRecipes', 'activeRecyclers', 'sectionStates'].forEach(key => {
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
    if (DB.settings.sectionStates) {
        window.sectionStates = DB.settings.sectionStates;
    }

    // 4. UI INITIALIZATION
    // 4. UI INITIALIZATION
    // Decode HTML entities in URL (fixes issues like &amp; from external sites)
    const rawSearch = window.location.search;
    const decodeHTML = (str) => {
        try {
            const doc = new DOMParser().parseFromString(str, "text/html");
            return doc.documentElement.textContent;
        } catch (e) {
            console.warn("URL Parsing Error", e);
            return str;
        }
    };
    const cleanSearch = decodeHTML(rawSearch);
    const urlParams = new URLSearchParams(cleanSearch);

    prepareComboboxData();
    populateSelects();
    loadSettingsToUI();
    renderSlider();
    // createDataList(); // Removed: Undefined function handling legacy datalists

    // Helper for CI params
    const getParam = (k) => {
        const key = Array.from(urlParams.keys()).find(key => key.toLowerCase() === k.toLowerCase());
        return key ? urlParams.get(key) : null;
    };

    // 5. URL PARAMETER HANDLING
    const urlCode = getParam('code');

    if (urlCode) {
        // NEW: Load from Code (Supersedes other params)
        importStateToUI(urlCode);
    } else {
        // LEGACY: Individual Params
        const urlUpgrades = getParam('setupgrades');
        const urlHeat = getParam('heat');
        const urlFert = getParam('fert');
        const urlItem = getParam('item');
        const urlRate = getParam('rate');
        const urlLoad = getParam('load');

        if (urlUpgrades) {
            const parts = urlUpgrades.split(',');
            // Map: [0]Belt, [2]Speed, [3]Alchemy, [4]Fuel, [5]Fert
            if (parts[0]) document.getElementById('lvlBelt').value = parseInt(parts[0]) || 0;
            if (parts[2]) document.getElementById('lvlSpeed').value = parseInt(parts[2]) || 0;
            if (parts[3]) document.getElementById('lvlAlchemy').value = parseInt(parts[3]) || 0;
            if (parts[4]) document.getElementById('lvlFuel').value = parseInt(parts[4]) || 0;
            if (parts[5]) document.getElementById('lvlFert').value = parseInt(parts[5]) || 0;
        }

        if (urlHeat) {
            const sel = document.getElementById('fuelSelect');
            const val = findOption(sel, urlHeat);
            if (val) sel.value = val;
            else console.warn(`Legacy URL: Could not find match for heat=${urlHeat}`);
        }

        if (urlFert) {
            const sel = document.getElementById('fertSelect');
            const val = findOption(sel, urlFert);
            if (val) sel.value = val;
            else console.warn(`Legacy URL: Could not find match for fert=${urlFert}`);
        }

        if (urlItem) {
            const rawItem = decodeURIComponent(urlItem).trim();
            let targetName = rawItem;

            // Try to find a valid item in DB.items or Recipes
            const matchExact = allItemsList.find(i => i.name.toLowerCase() === rawItem.toLowerCase());

            if (matchExact) {
                targetName = matchExact.name;
            } else {
                // Fallback: Starts With
                const matchStart = allItemsList.find(i => i.name.toLowerCase().startsWith(rawItem.toLowerCase()));
                if (matchStart) {
                    targetName = matchStart.name;
                }
            }

            document.getElementById('targetItemInput').value = targetName;
            document.getElementById('targetRate').disabled = false;

            if (urlRate) {
                document.getElementById('targetRate').value = urlRate;
            } else if (urlLoad) {
                const loadVal = parseFloat(urlLoad);
                if (!isNaN(loadVal)) {
                    const lvlBelt = parseInt(document.getElementById('lvlBelt').value) || 0;
                    const speed = getBeltSpeed(lvlBelt);
                    const calcRate = speed * loadVal;
                    document.getElementById('targetRate').value = calcRate.toFixed(2);
                } else {
                    updateFromSlider();
                }
            } else {
                updateFromSlider();
            }
        } else {
            updateFromSlider();
        }
    }

    // Default raw editor text
    document.getElementById('json-editor').value = `window.ALCHEMY_DB = ${JSON.stringify(DB, null, 4)};`;

    calculate();
}

function initHeader() {
    document.title = `Alchemy Factory Planner - ${VERSION}`;
    const verEls = document.querySelectorAll('.app-version');
    verEls.forEach(el => el.innerText = VERSION);
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
        activeRecyclers: activeRecyclers,
        sectionStates: window.sectionStates
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

    const viewEl = document.getElementById('view-' + tabName);
    if (viewEl) viewEl.classList.add('active');

    const tabIndex = { 'calc': 0, 'db': 1, 'code': 2 }[tabName];
    if (tabIndex !== undefined) {
        document.querySelectorAll('.tab-btn')[tabIndex].classList.add('active');
    }

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
        // Main Entry
        dbFlatList.push({ type: 'recipe', key: r.id, name: r.id, machine: r.machine, ...r });

        // Virtual Entries for Byproducts
        if (r.outputs) {
            Object.keys(r.outputs).forEach(outKey => {
                if (outKey !== r.id) {
                    dbFlatList.push({
                        type: 'recipe',
                        key: r.id,          // Points to Parent
                        name: outKey,       // Shows as Byproduct Name
                        machine: r.machine,
                        virtualParent: r.id // Flag for UI
                    });
                }
            });
        }
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
        div.onclick = () => selectDbObject(obj.type, obj.key, obj.name);
        listEl.appendChild(div);
    });
}

function selectDbObject(type, key, clickedName) {
    currentDbSelection = { type, key, clickedName };
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

        // VIRTUAL RECIPE BANNER
        if (currentDbSelection.clickedName && currentDbSelection.clickedName !== key) {
            formHtml += `
            <div style="background:var(--bg-panel); border-left:4px solid #fbc02d; padding:10px; margin-bottom:15px; color:#ddd;">
                <strong>Note:</strong> You selected <em>${currentDbSelection.clickedName}</em>.<br>
                This allows you to edit the parent recipe: <strong>${key}</strong>.
            </div>`;
        }

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
    const params = new URLSearchParams();
    params.set('item', item);
    params.set('rate', rate.toFixed(2));

    const lvlBelt = document.getElementById('lvlBelt').value || 0;
    const lvlSpeed = document.getElementById('lvlSpeed').value || 0;
    const lvlAlchemy = document.getElementById('lvlAlchemy').value || 0;
    const lvlFuel = document.getElementById('lvlFuel').value || 0;
    const lvlFert = document.getElementById('lvlFert').value || 0;

    // Map: [0]Logistics, [1]Throw, [2]Factory, [3]Alchemy, [4]Fuel, [5]Fert
    const upgrades = [lvlBelt, 0, lvlSpeed, lvlAlchemy, lvlFuel, lvlFert, 0, 0, 0, 0];
    params.set('setupgrades', upgrades.join(','));

    const heat = document.getElementById('fuelSelect').value;
    const fert = document.getElementById('fertSelect').value;
    if (heat) params.set('heat', heat);
    if (fert) params.set('fert', fert);

    window.open(`index.html?${params.toString()}`, '_blank');
}
// --- HIGHLIGHTING HELPERS ---
function highlightNodes(selector) {
    // Clear previous
    document.querySelectorAll('.highlight-node').forEach(el => el.classList.remove('highlight-node'));
    // Select
    if (!selector) return;
    const targets = document.querySelectorAll(selector);
    targets.forEach(el => el.classList.add('highlight-node'));
}

function updateConstructionList(machineStats, furnaceSlotDemand, activeSeedDemand = {}) {
    const buildList = document.getElementById('construction-list'); buildList.innerHTML = '';
    const totalMatsContainer = document.getElementById('total-mats-container'); totalMatsContainer.innerHTML = '';
    const sortedMachines = Object.keys(machineStats).sort();
    let totalConstructionMaterials = {};

    sortedMachines.forEach(m => {
        const statsObj = machineStats[m];
        let totalMax = 0;
        let totalMin = 0;
        let subItems = [];

        // Aggregate
        Object.keys(statsObj).forEach(item => {
            const data = statsObj[item];
            totalMax += data.nodeSumInt;
            const minForThisItem = Math.ceil(data.rawFloat - 0.0001);
            totalMin += minForThisItem;
            subItems.push({ item: item, count: minForThisItem });
        });

        // Add to Global Material Total
        const machineDef = DB.machines[m] || {};
        const buildCost = machineDef.buildCost;
        if (buildCost) {
            Object.keys(buildCost).forEach(mat => {
                if (!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
                totalConstructionMaterials[mat] += buildCost[mat] * totalMin;
            });
        }

        if (totalMax <= 0) return;

        // Header
        let label = (totalMax === totalMin) ? `${totalMax}` : `<span style="font-size:0.9em">Min ${totalMin}, Max ${totalMax}</span>`;

        // Highlighting Logic for Header
        // Sanitize machine name for selector
        const machAttr = m.replace(/'/g, "");
        const headerHover = `onmouseover="highlightNodes('[data-machine=\\'${machAttr}\\']')" onmouseout="highlightNodes(null)"`;

        const li = document.createElement('li'); li.className = 'build-group';

        let subListHtml = `<ul class="build-sublist">`;
        subItems.sort((a, b) => b.count - a.count).forEach(sub => {
            const itemAttr = sub.item.replace(/'/g, "");
            // Highlight specific machine+item
            const rowHover = `onmouseover="highlightNodes('[data-machine=\\'${machAttr}\\'][data-item=\\'${itemAttr}\\']')" onmouseout="highlightNodes(null)"`;
            subListHtml += `<li class="build-subitem" ${rowHover}><span>${sub.item}</span> <span class="build-val">${sub.count}</span></li>`;
        });
        subListHtml += `</ul>`;

        li.innerHTML = `<div class="build-header" onclick="toggleBuildGroup(this.parentNode)" ${headerHover}><span><span class="build-arrow">▶</span> ${m}</span> <span class="build-count">${label}</span></div>${subListHtml}`;
        buildList.appendChild(li);
    });

    // --- FURNACE HANDLING ---
    // furnaceSlotDemand is now { ParentName: { ChildMachine: totalSlots } } OR { ParentName: totalSlots (Legacy fallback) }
    // We iterate generic parent names found in the global demand object
    Object.keys(furnaceSlotDemand).forEach(parentName => {
        const demandData = furnaceSlotDemand[parentName];
        if (!demandData) return;

        let totalSlots = 0;
        let breakdown = [];

        if (typeof demandData === 'object') {
            Object.keys(demandData).forEach(childMach => {
                let slots = demandData[childMach];
                totalSlots += slots;
                breakdown.push({ machine: childMach, slots: slots });
            });
        } else {
            totalSlots = demandData; // Legacy/Fallback
        }

        const parentDef = DB.machines[parentName];
        const capacity = parentDef ? (parentDef.slots || 3) : 3;
        const totalFurnacesCalc = Math.ceil((totalSlots - 0.0001) / capacity);

        if (totalFurnacesCalc > 0) {
            // Add to Global Material Total
            const buildCost = parentDef ? parentDef.buildCost : {};
            if (buildCost) {
                Object.keys(buildCost).forEach(mat => {
                    if (!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
                    totalConstructionMaterials[mat] += buildCost[mat] * totalFurnacesCalc;
                });
            }

            const li = document.createElement('li'); li.className = 'build-group';

            // Header Highlight: Highlight ALL children
            // We construct a selector that targets data-machine="Child1" OR data-machine="Child2"
            // Wait, standard machines highlight THEMSELVES. 
            // Furnaces support OTHER machines.
            // If we hover "Stone Furnace", we want to highlight "Crucibles", "Athanors", etc.

            let childSelectors = breakdown.map(b => `[data-machine='${b.machine.replace(/'/g, "")}']`).join(',');
            // If empty (shouldn't be), fallback
            if (!childSelectors) childSelectors = ".nothing";

            // Escape quotes for the inline attribute
            const headerHover = `onmouseover="highlightNodes(\`${childSelectors}\`)" onmouseout="highlightNodes(null)"`;

            let subListHtml = `<ul class="build-sublist">`;
            breakdown.sort((a, b) => b.slots - a.slots).forEach(sub => {
                const machineFurnaces = Math.ceil((sub.slots - 0.0001) / capacity);
                const subSelector = `[data-machine='${sub.machine.replace(/'/g, "")}']`;
                const rowHover = `onmouseover="highlightNodes(\`${subSelector}\`)" onmouseout="highlightNodes(null)"`;
                subListHtml += `<li class="build-subitem" ${rowHover}><span>${sub.machine}</span> <span class="build-val">${machineFurnaces}</span></li>`;
            });
            subListHtml += `</ul>`;

            li.innerHTML = `<div class="build-header" style="border-top:1px dashed #555" onclick="toggleBuildGroup(this.parentNode)" ${headerHover}><span><span class="build-arrow">▶</span> ${parentName} (Min)</span> <span class="build-count" style="color:var(--warn)">${totalFurnacesCalc}</span></div>${subListHtml}`;
            buildList.appendChild(li);
        }
    });

    // --- SEED HANDLING ---
    const seedKeys = Object.keys(activeSeedDemand).sort();
    if (seedKeys.length > 0) {
        let totalSeeds = 0;
        let seedListHtml = `<ul class="build-sublist">`;

        seedKeys.forEach(seedName => {
            const count = activeSeedDemand[seedName];
            totalSeeds += count;

            // Add to Global Material Total
            if (!totalConstructionMaterials[seedName]) totalConstructionMaterials[seedName] = 0;
            totalConstructionMaterials[seedName] += count;

            // Hover: Highlight Nurseries that use this seed?
            // "Sage Seed" uses "Sage" recipe? Or just highlight logic is hard to map back without linkage.
            // For now, no specific highlight or highlight all Nurseries.
            const rowHover = `onmouseover="highlightNodes('[data-machine=\\'Nursery\\']')" onmouseout="highlightNodes(null)"`;

            seedListHtml += `<li class="build-subitem" ${rowHover}><span>${seedName}</span> <span class="build-val">${count}</span></li>`;
        });
        seedListHtml += `</ul>`;

        const li = document.createElement('li'); li.className = 'build-group';
        // Header Highlight: Highlight all Nurseries
        const headerHover = `onmouseover="highlightNodes('[data-machine=\\'Nursery\\']')" onmouseout="highlightNodes(null)"`;

        li.innerHTML = `<div class="build-header" style="border-top:1px dashed #555" onclick="toggleBuildGroup(this.parentNode)" ${headerHover}><span><span class="build-arrow">▶</span> Required Seeds</span> <span class="build-count" style="color:var(--bio)">${totalSeeds}</span></div>${seedListHtml}`;
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
function formatCurrency(copperVal) {
    if (!copperVal) return `<span class="curr-c">0c</span>`;
    // 1 Gold = 100 Silver = 100,000 Copper
    // 1 Silver = 1000 Copper
    const val = Math.abs(Math.floor(copperVal));
    const gold = Math.floor(val / 100000);
    const remGold = val % 100000;
    const silver = Math.floor(remGold / 1000);
    const copper = remGold % 1000;

    let html = "";
    if (gold > 0) html += `<span class="curr-g">${gold}g</span> `;
    if (silver > 0) html += `<span class="curr-s">${silver}s</span> `;
    if (copper > 0 || html === "") html += `<span class="curr-c">${copper}c</span>`;

    return html.trim() + (copperVal < 0 ? " (Loss)" : "");
}

function updateSummaryBox(p, heat, bio, cost, grossRate, actualFuelNeed, actualFertNeed) {
    const targetItemDef = DB.items[p.targetItem] || {};
    let internalHeat = p.selfFeed ? heat : 0;
    let externalHeat = !p.selfFeed ? heat : 0;
    let internalBio = p.selfFert ? bio : 0;
    let externalBio = !p.selfFert ? bio : 0;
    const isLiquid = targetItemDef.category === "Liquid" || targetItemDef.category === "Gas";
    let profitHtml = "";
    if (targetItemDef.sellPrice) {
        const revenuePerMin = p.targetRate * targetItemDef.sellPrice;
        const profit = revenuePerMin - cost;
        // Use formatCurrency for profit
        profitHtml = `<div class="stat-block"><span class="stat-label">Projected Profit</span><span class="stat-value gold-profit" style="font-size:1.5em; margin-top:6px;">${formatCurrency(profit)} /m</span></div>`;
    } else {
        // Use formatCurrency for cost
        profitHtml = `<div class="stat-block"><span class="stat-label">Total Raw Cost</span><span class="stat-value gold-cost" style="font-size:1.5em; margin-top:6px;">${formatCurrency(cost)} /m</span></div>`;
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

    // Share Box HTML (Integrated)
    const hasTarget = !!p.targetItem;
    const btnState = hasTarget ? "" : "disabled style='opacity:0.5; cursor:not-allowed;'";
    const shareHtml = `
        <div class="share-row" style="grid-column: 1 / -1; display:flex; gap:10px; align-items:center; margin-top:10px; padding-top:10px; border-top:1px dashed #444;">
             <input type="text" id="share-code-display" readonly value="${hasTarget ? 'Generating...' : 'Select an item to generate code'}" onclick="this.select()" class="code-display-input" style="font-size:0.8em; color:#666;" title="Production Chain code for current state of calculator. Can be used to share with others to replicate this production chain precisely">
             <button class="icon-btn" onclick="copyCodeToClipboard()" ${btnState} title="Copy Production Chain Code to clipboard">📋 Code</button>
             <button class="icon-btn" onclick="copyLinkToClipboard()" ${btnState} title="Copy a direct link (URL) to the clipboard that included the Production Chain Code">🔗 Link</button>
             <button class="icon-btn" onclick="openImportModal()" title="Import a Production Chain Code or URL with code to display.">📥 Import</button>
        </div>
    `;

    // Belt Usage Logic
    const beltUsageHtml = isLiquid
        ? `<span class="stat-value" style="font-size:1.1em; color:#aaa;">N/A</span><span class="stat-sub">Liquid/Gas</span>`
        : `<span class="stat-value" style="font-size:1.1em; color:${p.targetRate > p.beltSpeed ? '#ff5252' : '#aaa'};">${(p.targetRate / p.beltSpeed * 100).toFixed(0)}%</span><span class="stat-sub">Cap: ${p.beltSpeed}/m</span>`;

    document.getElementById('summary-container').innerHTML = `
        <div class="summary-box">
            <div class="stat-block"><span class="stat-label">Net Output</span><span class="stat-value ${p.targetRate >= 0 ? 'net-positive' : 'net-warning'}" style="font-size:1.5em">${formatVal(p.targetRate)} / min</span>${deductionText.length > 0 ? `<span class=\"stat-sub\" style=\"font-size:0.75em\">${deductionText.join('<br>')}</span>` : ''}</div>
            <div class="stat-block"><span class="stat-label">Internal Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${formatVal(internalHeat)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(internalBio)} V/s</span></div>
            <div class="stat-block"><span class="stat-label">External Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${formatVal(externalHeat)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(externalBio)} V/s</span></div>
            ${profitHtml}
            <div class="stat-block"><span class="stat-label">Belt Usage (Net)</span>${beltUsageHtml}</div>
            ${shareHtml}
        </div>`;

    // Trigger Code Generation Async
    exportStateFromUI().then(code => {
        const el = document.getElementById('share-code-display');
        if (el) {
            el.value = code;
            el.style.color = 'var(--info)';
        }
    }).catch(err => console.warn("Auto-gen code failed", err));
}
function toggleBuildGroup(header) { header.classList.toggle('expanded'); }
function toggleNode(arrowElement) { const node = arrowElement.closest('.node'); if (node) node.classList.toggle('collapsed'); }
function toggleRecycle(itemName) {
    if (activeRecyclers[itemName]) { delete activeRecyclers[itemName]; }
    else { activeRecyclers[itemName] = true; }
    persist(); calculate();
}
window.sectionStates = {};
function toggleSection(headerOrIcon) {
    const panel = headerOrIcon.closest('.panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');

    // Save state
    const titleEl = panel.querySelector('h3');
    if (titleEl) {
        const key = titleEl.innerText.split('(')[0].trim();
        sectionStates[key] = panel.classList.contains('collapsed');
        persist();
    }
}

function restoreStaticSectionStates() {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
        const titleEl = panel.querySelector('h3');
        if (titleEl) {
            const key = titleEl.innerText.split('(')[0].trim();
            // Only apply if state exists (undefined means use HTML default)
            const savedState = window.sectionStates[key];
            if (typeof savedState !== 'undefined') {
                if (savedState) panel.classList.add('collapsed');
                else panel.classList.remove('collapsed');
            }
        }
    });
}

function createCollapsibleSection(title, contentElement, extraClass = "") {
    const panel = document.createElement('div');
    const baseTitle = title.split('(')[0].trim();
    // Check persisted state
    const isCollapsed = window.sectionStates[baseTitle];
    panel.className = `panel ${extraClass} ${isCollapsed ? 'collapsed' : ''}`;

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.onclick = function () { toggleSection(this); };
    header.innerHTML = `<h3>${title}</h3><span class="toggle-icon">▼</span>`;

    const content = document.createElement('div');
    content.className = 'panel-content';
    if (contentElement) content.appendChild(contentElement);

    panel.appendChild(header);
    panel.appendChild(content);
    return panel;
}

function updateUpgradeSummary() {
    const belt = document.getElementById('lvlBelt').value;
    const speed = document.getElementById('lvlSpeed').value;
    const alc = document.getElementById('lvlAlchemy').value;
    const fuel = document.getElementById('lvlFuel').value;
    const fert = document.getElementById('lvlFert').value;

    const summaryEl = document.getElementById('upgradeSummary');
    if (summaryEl) {
        summaryEl.innerText = `Belt:${belt} Speed:${speed} Alc:${alc} Fuel:${fuel} Fert:${fert}`;
    }
}

window.onload = function () {
    init();
    restoreStaticSectionStates();
    updateUpgradeSummary();
};

/* ==========================================================================
   SECTION: IMPORT / EXPORT / SERIALIZATION
   ========================================================================== */

// --- FUZZY OPTION MATCHER (Fixes URL bugs) ---
function findOption(selectElement, val) {
    if (!val) return null;
    const clean = v => v.toLowerCase().trim();
    const search = clean(val);

    // 1. Precise Match
    for (let opt of selectElement.options) {
        if (clean(opt.value) === search) return opt.value;
    }

    // 2. Space/Plus/Underscore Swap Match
    // e.g. "Charcoal Powder" vs "Charcoal+Powder"
    const normalize = s => s.replace(/[\+\_\-]/g, ' ');
    const searchNorm = normalize(search);

    for (let opt of selectElement.options) {
        if (normalize(clean(opt.value)) === searchNorm) return opt.value;
    }

    return null;
}

// --- STATE GATHERING (Optimized) ---
function exportStateFromUI() {
    const k = CODE_KEYS; // Alias for brevity

    // 1. Gather State in Compact Form
    const s = {};
    s[k.v] = 1;

    // A. Target
    const tItem = document.getElementById('targetItemInput').value;
    const tRate = document.getElementById('targetRate').value;

    s[k.target] = {};
    // Use ID if available, else name
    if (DB.items[tItem]) {
        s[k.target][k.item] = DB.items[tItem].id;
    } else {
        s[k.target][k.item] = tItem;
    }
    s[k.target][k.rate] = parseFloat(tRate) || 0;

    // B. Settings
    s[k.settings] = {};
    const set = s[k.settings];

    // Fuel/Fert (Convert to ID if possible)
    const fuelVal = document.getElementById('fuelSelect').value;
    set[k.fuel] = (DB.items[fuelVal]) ? DB.items[fuelVal].id : fuelVal;

    const fertVal = document.getElementById('fertSelect').value;
    set[k.fert] = (DB.items[fertVal]) ? DB.items[fertVal].id : fertVal; // 'e'

    // Booleans -> 1/0
    set[k.selfFeed] = document.getElementById('selfFeed').checked ? 1 : 0;
    set[k.selfFert] = document.getElementById('selfFert').checked ? 1 : 0;
    set[k.showMax] = document.getElementById('showMaxCap').checked ? 1 : 0;

    // C. Upgrades (Array)
    s[k.upgrades] = [
        parseInt(document.getElementById('lvlBelt').value) || 0,
        parseInt(document.getElementById('lvlSpeed').value) || 0,
        parseInt(document.getElementById('lvlAlchemy').value) || 0,
        parseInt(document.getElementById('lvlFuel').value) || 0,
        parseInt(document.getElementById('lvlFert').value) || 0
    ];

    // D. Lists
    s[k.lists] = {};
    const lst = s[k.lists];

    // Preferred: { ItemName: RecipeID } -> { ItemID: RecipeID }
    const prefRaw = DB.settings.preferredRecipes || {};
    lst[k.preferred] = {};
    for (let key in prefRaw) {
        const itemID = DB.items[key] ? DB.items[key].id : key;
        lst[k.preferred][itemID] = prefRaw[key];
    }

    // Recyclers: [ItemName] -> [ItemID]
    const recRaw = Object.keys(activeRecyclers || {});
    lst[k.recyclers] = recRaw.map(name => (DB.items[name] ? DB.items[name].id : name));

    // Externals: [Path] -> [PackedPath] ("ItemA|ItemB" -> "12|34")
    const extRaw = Object.keys(externalOverrides || {});
    lst[k.externals] = extRaw.map(path => {
        return path.split('|').map(seg => {
            // Check if segment is a known item
            return (DB.items[seg] ? DB.items[seg].id : seg);
        }).join('|');
    });

    // 2. Stringify & Compress
    const jsonStr = JSON.stringify(s); // Standard stringify (removes whitespace)
    return compressData(jsonStr);
}

// --- COMPRESSION HELPERS (Async) ---
async function compressData(str) {
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
    const response = await new Response(stream);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    // Convert to Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 = window.btoa(binary);
    // URL-Safe Base64: + -> -, / -> _, = -> . (or just keep = but encode it? usually strip or keep)
    // We will just swap chars to make it URL path safe without encoding
    return b64.replace(/\+/g, '-').replace(/\//g, '_');
}

async function decompressData(safeB64) {
    // Reverse URL-Safe: - -> +, _ -> /
    const b64 = safeB64.replace(/-/g, '+').replace(/_/g, '/');
    try {
        const binary = window.atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const response = await new Response(stream);
        return await response.text();
    } catch (e) {
        console.error("Decompression Failed", e);
        throw e;
    }
}


// --- IMPORT LOGIC ---
async function importStateToUI(inputStr) {
    if (!inputStr) return;

    // 1. Sanitize Input
    let code = inputStr.trim();
    // Helper to extract code param from URL
    try {
        if (code.includes("code=")) {
            // It could be a full URL
            if (code.startsWith("http") || code.includes("?")) {
                const urlObj = new URL(code, window.location.origin); // safe relative parsing
                const p = new URLSearchParams(urlObj.search);
                if (p.has('code')) code = p.get('code');
            } else {
                // Just a query string?
                const p = new URLSearchParams(code);
                if (p.has('code')) code = p.get('code');
            }
        }
    } catch (e) {
        // Fallback: If URL parsing fails, assume it's just the code string if it looks like one
        console.warn("URL Parsing failed, attempting raw string usage", e);
    }

    // 2. Decompress
    let state = null;
    try {
        const jsonStr = await decompressData(code);
        state = JSON.parse(jsonStr);
    } catch (e) {
        alert("The provided Production Chain Code is invalid or corrupted. Loading default session.");
        console.error("Import Error", e);
        return; // Stop processing
    }

    if (!state || typeof state !== 'object') {
        alert("Invalid Code Structure.");
        return;
    }

    // --- NORMALIZATION (Compact -> Verbose) ---
    // If we detect aliased keys, we expand them to the standard format
    // so the rest of the logic works unchanged.
    const k = CODE_KEYS;
    const reg = ITEM_REGISTRY;

    // Helper: Resolve Item (ID or Name) -> Name
    const resolve = (val) => {
        if (typeof val === 'number') {
            return reg[val - 1] || "Unknown"; // IDs are 1-based, Registry is 0-based
        }
        return val; // Already a string
    };

    if (state[k.target] || state[k.settings]) {
        console.log("Detected Compact Code Format. Normalizing...");

        // Target
        if (state[k.target]) {
            state.target = {
                item: resolve(state[k.target][k.item]),
                rate: state[k.target][k.rate]
            };
        }

        // Settings
        if (state[k.settings]) {
            const s = state[k.settings];
            state.settings = {
                fuel: resolve(s[k.fuel]),
                fert: resolve(s[k.fert]),
                selfFeed: !!s[k.selfFeed], // 1 -> true
                selfFert: !!s[k.selfFert],
                showMax: !!s[k.showMax]
            };
        }

        // Upgrades
        if (state[k.upgrades]) {
            state.upgrades = state[k.upgrades];
        }

        // Lists
        if (state[k.lists]) {
            const l = state[k.lists];
            state.lists = {};

            // Preferred: { ID: Recipe } -> { Name: Recipe }
            if (l[k.preferred]) {
                state.lists.preferred = {};
                for (let key in l[k.preferred]) {
                    state.lists.preferred[resolve(parseInt(key) || key)] = l[k.preferred][key];
                }
            }

            // Recyclers: [ID] -> [Name]
            if (l[k.recyclers]) {
                state.lists.recyclers = l[k.recyclers].map(resolve);
            }

            // Externals: [PackedPath] -> [Path]
            if (l[k.externals]) {
                state.lists.externals = l[k.externals].map(packed => {
                    if (typeof packed !== 'string') return resolve(packed);
                    return packed.split('|').map(seg => {
                        // seg might be "75" (ID) or "Something" (Name)
                        const id = parseInt(seg);
                        if (!isNaN(id) && reg[id - 1]) return reg[id - 1];
                        return seg;
                    }).join('|');
                });
            }
        }
    }

    console.log("Importing State:", state);

    // 3. SAFE IMPORT SEQUENCE
    // Step A: Suppress Reset
    window.suppressReset = true;

    try {
        // Step B: Apply Settings
        if (state.upgrades) {
            const u = state.upgrades;
            document.getElementById('lvlBelt').value = u[0] || 0;
            document.getElementById('lvlSpeed').value = u[1] || 0;
            document.getElementById('lvlAlchemy').value = u[2] || 0;
            document.getElementById('lvlFuel').value = u[3] || 0;
            document.getElementById('lvlFert').value = u[4] || 0;
        }

        if (state.settings) {
            const s = state.settings;
            // Fuzzy Find Selections
            const fSel = document.getElementById('fuelSelect');
            const matchFuel = findOption(fSel, s.fuel);
            if (matchFuel) fSel.value = matchFuel;
            else if (s.fuel) console.warn("Import: Could not find fuel", s.fuel);

            const fertSel = document.getElementById('fertSelect');
            const matchFert = findOption(fertSel, s.fert);
            if (matchFert) fertSel.value = matchFert;

            // Toggles
            document.getElementById('selfFeed').checked = !!s.selfFeed;
            document.getElementById('selfFert').checked = !!s.selfFert;
            document.getElementById('showMaxCap').checked = !!s.showMax;

            // Update Toggle Button UI (Trigger the visual update functions manually or mimic specific parts)
            // Existing functions: toggleFuel(), toggleFert() toggle logic. 
            // We need to set state directly, so we just update the buttons' classes.
            updateToggleButtonUI('btnSelfFuel', s.selfFeed, "Self-Fuel");
            updateToggleButtonUI('btnSelfFert', s.selfFert, "Self-Fert");
        }

        // Step C: Apply Preferred Recipes
        if (state.lists && state.lists.preferred) {
            DB.settings.preferredRecipes = { ...state.lists.preferred };
        }

        // Step D: Target Item
        // We set this to get the base tree, but we suppress the reset so it doesn't wipe defaults
        if (state.target && state.target.item) {
            const tItem = state.target.item;
            const match = allItemsList.find(i => i.name.toLowerCase() === tItem.toLowerCase());
            if (match) {
                document.getElementById('targetItemInput').value = match.name;
                document.getElementById('targetRate').value = state.target.rate || 60;
                document.getElementById('targetRate').disabled = false;

                // If the target changed, calculate() would normally fire and reset lists.
                // safe-guard: manually update lastTargetItem so calculate() thinks nothing changed?
                // No, we use window.suppressReset which we already set to true.
            }
        }

        // Step E: Recyclers
        // Clear global first, then populate
        activeRecyclers = {};
        if (state.lists && state.lists.recyclers) {
            state.lists.recyclers.forEach(r => activeRecyclers[r] = true);
        }

        // Step F: Externals
        externalOverrides = {};
        if (state.lists && state.lists.externals) {
            state.lists.externals.forEach(e => externalOverrides[e] = true);
        }

    } catch (e) {
        console.error("Error applying state:", e);
        alert("An error occurred while applying the code. Some settings may be partial.");
    } finally {
        // Step G: Release Reset Block
        // We keep it suppressed for the FINAL calculation to avoid the logic inside calculate() 
        // from thinking "Hey, the input value is different from lastTargetItem, better reset!"
        // Actually, calculate() reads the DOM. If we updated the DOM, calculate() sees the new value.
        // If lastTargetItem !== new value, it resets.
        // So we MUST update `lastTargetItem` manually to match the new DOM value *before* unsuppressing.

        // Update the tracker so the next calculate doesn't trigger a reset
        if (typeof window.lastTargetItem !== 'undefined') {
            window.lastTargetItem = document.getElementById('targetItemInput').value;
        }

        window.suppressReset = false;
    }

    // Step H: Final Calc
    calculate();
}

function updateToggleButtonUI(btnId, isChecked, labelPrefix) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isChecked) {
        btn.innerText = `${labelPrefix}: ON`;
        btn.classList.remove('btn-inactive-red');
        btn.classList.add('btn-active-green');
    } else {
        btn.innerText = `${labelPrefix}: OFF`;
        btn.classList.remove('btn-active-green');
        btn.classList.add('btn-inactive-red');
    }
}

// --- UI EVENT HANDLERS ---
function openImportModal() {
    document.getElementById('import-modal').style.display = 'flex';
    document.getElementById('import-code-input').value = "";
    document.getElementById('import-code-input').focus();
}

async function handleImportSubmit() {
    const code = document.getElementById('import-code-input').value;
    if (!code) return;
    closeModal('import-modal');
    await importStateToUI(code);
}

async function copyCodeToClipboard() {
    // Code is already in the input box, just copy it
    const display = document.getElementById('share-code-display');
    if (!display || display.value === "Generating...") {
        // Fallback or force gen
        const code = await exportStateFromUI();
        await navigator.clipboard.writeText(code);
    } else {
        await navigator.clipboard.writeText(display.value);
    }
    alert("Code copied!");
}

async function copyLinkToClipboard() {
    // Generate fresh to be safe
    try {
        const code = await exportStateFromUI();
        const url = `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(code)}`;
        await navigator.clipboard.writeText(url);
        alert("Link copied!");
    } catch (e) {
        console.error(e);
        alert("Failed to generate link.");
    }
}

/* ==========================================================================
   SECTION: INSPECTOR / DEBUGGER LOGIC
   ========================================================================== */

function importCurrentCodeForInspection() {
    exportStateFromUI().then(code => {
        document.getElementById('inspector-input').value = code;
        inspectCode();
    }).catch(err => {
        console.error("Failed to generate code for inspection", err);
        alert("Error generating code: " + err.message);
    });
}

async function inspectCode() {
    const rawInput = document.getElementById('inspector-input').value.trim();
    const outRaw = document.getElementById('inspector-output-raw');
    const outTrans = document.getElementById('inspector-output-trans');
    const errBox = document.getElementById('inspector-error');

    outRaw.textContent = "Processing...";
    outTrans.textContent = "Processing...";
    errBox.textContent = "";

    try {
        // 1. EXTRACT CODE
        let code = rawInput;

        // Helper: Decode HTML entities
        const decodeHTML = (str) => {
            const doc = new DOMParser().parseFromString(str, "text/html");
            return doc.documentElement.textContent;
        };

        // Remove surrounding URL parts if present
        if (code.includes('?') || code.includes('&')) {
            // Try to parse as URL
            try {
                let search = code;
                if (code.includes('?')) {
                    search = code.split('?')[1];
                }
                // Decode HTML entities to handle &amp;
                search = decodeHTML(search);

                const p = new URLSearchParams(search);
                if (p.has('code')) {
                    code = p.get('code');
                }
            } catch (e) {
                console.warn("Soft URL parse failed, using raw input");
            }
        }

        // 2. URL-SAFE BASE64 CLEANUP
        // + -> -, / -> _ replacement used in app
        // App generates: .replace(/\+/g, '-').replace(/\//g, '_')
        // We need to REVERSE that: - -> +, _ -> /
        code = code.replace(/-/g, '+').replace(/_/g, '/');

        // 3. DECOMPRESS
        let jsonStr = "";
        try {
            const binary = atob(code);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
            const response = await new Response(stream);
            jsonStr = await response.text();
        } catch (e) {
            throw new Error("Decompression Failed. Invalid Base64 or Gzip data.");
        }

        // 4. PARSE RAW JSON
        const state = JSON.parse(jsonStr);
        outRaw.textContent = JSON.stringify(state, null, 2);

        // 5. TRANSLATE TO VERBOSE
        const translated = translateState(state);
        outTrans.textContent = JSON.stringify(translated, null, 2);

    } catch (e) {
        errBox.textContent = "Error: " + e.message;
        outRaw.textContent = "---";
        outTrans.textContent = "---";
        console.error(e);
    }
}

function translateState(state) {
    // Logic ported from alchemy_ui.js importStateToUI
    // Creates a DEEP COPY to return
    const k = CODE_KEYS; // From alchemy_constants.js
    const reg = ITEM_REGISTRY; // From alchemy_constants.js

    const resolve = (val) => {
        if (typeof val === 'number') {
            // IDs are 1-based, Registry is 0-based
            return reg[val - 1] || `Unknown_ID_${val}`;
        }
        return val;
    };

    // Detect Version
    const verboseState = { v: state[k.v] || state.v || 1 };

    // Check if Compact
    if (state[k.target] || state[k.settings]) {
        // --- TARGET ---
        if (state[k.target]) {
            verboseState.target = {
                item: resolve(state[k.target][k.item]),
                rate: state[k.target][k.rate]
            };
        }

        // --- SETTINGS ---
        if (state[k.settings]) {
            const s = state[k.settings];
            verboseState.settings = {
                fuel: resolve(s[k.fuel]),
                fert: resolve(s[k.fert]),
                selfFeed: s[k.selfFeed] === 1,
                selfFert: s[k.selfFert] === 1,
                showMax: s[k.showMax] === 1
            };
        }

        // --- UPGRADES ---
        if (state[k.upgrades]) {
            verboseState.upgrades = state[k.upgrades]; // Array is same format
        }

        // --- LISTS ---
        if (state[k.lists]) {
            const l = state[k.lists];
            verboseState.lists = {
                preferred: {},
                recyclers: [],
                externals: []
            };

            // Preferred
            if (l[k.preferred]) {
                for (let key in l[k.preferred]) {
                    // Key is Item ID (or Name), Value is RecipeID
                    // Need to parse key if it's an ID
                    // JSON object keys are ALWAYS strings. "75": "Recipe"
                    const itemKey = isNaN(key) ? key : resolve(parseInt(key));
                    verboseState.lists.preferred[itemKey] = l[k.preferred][key];
                }
            }

            // Recyclers
            if (l[k.recyclers]) {
                verboseState.lists.recyclers = l[k.recyclers].map(resolve);
            }

            // Externals
            if (l[k.externals]) {
                verboseState.lists.externals = l[k.externals].map(packed => {
                    if (typeof packed !== 'string') return resolve(packed);
                    return packed.split('|').map(seg => {
                        const id = parseInt(seg);
                        if (!isNaN(id) && reg[id - 1]) return reg[id - 1];
                        return seg;
                    }).join('|');
                });
            }
        }
    } else {
        // Fallback: It's likely already verbose or old format
        return state;
    }

    return verboseState;
}