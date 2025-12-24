/* ==========================================================================
   ALCHEMY CALCULATOR UI CONTROLLER
   Handles events, inputs, sliders, and DOM updates.
   ========================================================================== */

let DB = null;
const STORAGE_KEY = "alchemy_factory_save_v1";
const SOURCE_KEY = "alchemy_source_v1";

let isSelfFuel = false;
let isSelfFert = false;
let allItemsList = [];
let currentFocus = -1;

// DB Editor State
let currentDbSelection = null; // { type: 'item'|'recipe', key: 'id' }
let isSourceView = false;
let dbFlatList = []; // Cache for search

function init() {
    const localData = localStorage.getItem(STORAGE_KEY);
    const urlParams = new URLSearchParams(window.location.search);
    const urlItem = urlParams.get('item');
    const urlRate = urlParams.get('rate');

    if (window.ALCHEMY_DB) {
        let localVersion = 0;
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                localVersion = parsed.version || 0;
            } catch(e) {}
        }
        
        const fileVersion = window.ALCHEMY_DB.version || 0;
        
        if (fileVersion > localVersion) {
            console.log(`Auto-Updating DB: v${localVersion} -> v${fileVersion}`);
            const oldSettings = (JSON.parse(localData || '{}')).settings || {};
            DB = JSON.parse(JSON.stringify(window.ALCHEMY_DB));
            if(oldSettings.beltLevel !== undefined) DB.settings = oldSettings;
            persist();
        } else if (localData) {
            try { 
                DB = JSON.parse(localData); 
                if (!DB.recipes || !DB.recipes[0].id) throw new Error("Invalid DB");
            } catch(e) {
                DB = JSON.parse(JSON.stringify(window.ALCHEMY_DB));
                persist();
            }
        } else {
            DB = JSON.parse(JSON.stringify(window.ALCHEMY_DB));
            persist();
        }
    } else {
        if(localData) {
            try { DB = JSON.parse(localData); } catch(e) { alert("Database Error"); }
        } else {
            alert("Error: alchemy_db.js not found!");
            DB = { items: {}, recipes: [], machines: {}, settings: {} };
        }
    }
    
    if(!DB.items) DB.items = {};
    if(!DB.settings) DB.settings = {};
    if(!DB.settings.preferredRecipes) DB.settings.preferredRecipes = {};
    
    if(DB.settings.activeRecyclers) {
        activeRecyclers = DB.settings.activeRecyclers;
    }

    prepareComboboxData();
    populateSelects(); 
    loadSettingsToUI();
    renderSlider(); 
    
    if (urlItem && urlRate) {
        document.getElementById('targetItemInput').value = decodeURIComponent(urlItem);
        document.getElementById('targetRate').disabled = false;
        document.getElementById('targetRate').value = urlRate;
    } else {
        updateFromSlider(); 
    }
    
    // We do NOT load source text into textarea immediately anymore.
    // It is generated on demand in toggleSourceView()
    
    calculate();
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
        const leftPos = `calc(${pct * 100}% + (${(thumbWidth/2) - (thumbWidth * pct) + 2}px))`;
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
   SECTION: DB EDITOR LOGIC (NEW)
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
    // Flatten DB for sidebar list
    dbFlatList = [];
    
    // Items
    Object.keys(DB.items).forEach(key => {
        dbFlatList.push({ type: 'item', key: key, name: key, ...DB.items[key] });
    });

    // Recipes
    DB.recipes.forEach(r => {
        dbFlatList.push({ type: 'recipe', key: r.id, name: r.id, machine: r.machine, ...r });
    });

    // Sort alpha
    dbFlatList.sort((a,b) => a.name.localeCompare(b.name));

    filterDbList();
}

function filterDbList() {
    const term = document.getElementById('db-search-input').value.toLowerCase();
    const listEl = document.getElementById('db-list');
    listEl.innerHTML = '';

    const matches = dbFlatList.filter(x => x.name.toLowerCase().includes(term) || (x.machine && x.machine.toLowerCase().includes(term)));

    matches.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'db-list-item';
        if (currentDbSelection && currentDbSelection.key === obj.key && currentDbSelection.type === obj.type) {
            div.classList.add('selected');
        }
        
        let typeLabel = obj.type === 'item' ? 'Item' : 'Recipe';
        let subText = obj.type === 'item' ? (obj.category || '') : obj.machine;
        
        div.innerHTML = `<span>${obj.name} <span style="color:#666; font-size:0.8em">(${subText})</span></span> <span class="db-type-tag ${obj.type}">${typeLabel}</span>`;
        div.onclick = () => selectDbObject(obj.type, obj.key);
        listEl.appendChild(div);
    });
}

function selectDbObject(type, key) {
    currentDbSelection = { type, key };
    document.getElementById('db-editor-title').innerText = key;
    document.getElementById('btn-report-issue').style.display = 'inline-block';
    document.getElementById('btn-report-issue').innerText = `Report Issue: ${key}`;
    document.getElementById('btn-report-issue').style.background = '#d32f2f';
    
    filterDbList(); // Re-render to show selection highlight
    renderDbForm();
}

function renderDbForm() {
    if (!currentDbSelection) return;
    const container = document.getElementById('db-form-container');
    container.innerHTML = '';
    
    // Switch off source view if on
    if(isSourceView) toggleSourceView();

    const { type, key } = currentDbSelection;
    let data = null;

    if (type === 'item') {
        data = DB.items[key];
        // Generate Item Form
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
        // Generate Recipe Form
        let formHtml = `<div class="db-form">`;
        formHtml += createInput('Machine', 'text', data.machine, 'machine');
        formHtml += createInput('Base Time (sec)', 'number', data.baseTime, 'baseTime');
        
        // Inputs List
        formHtml += `<div class="form-group full-width"><label>Inputs</label><div class="dynamic-list" id="list-inputs"></div></div>`;
        // Outputs List
        formHtml += `<div class="form-group full-width"><label>Outputs</label><div class="dynamic-list" id="list-outputs"></div></div>`;
        
        formHtml += `</div>`;
        container.innerHTML = formHtml;

        // Render Dynamic Lists
        renderDynamicList('inputs', data.inputs);
        renderDynamicList('outputs', data.outputs);
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

function updateDbProperty(prop, val, type) {
    if (!currentDbSelection) return;
    let finalVal = val;
    if (type === 'number') finalVal = val === '' ? undefined : parseFloat(val);

    if (currentDbSelection.type === 'item') {
        if (finalVal === undefined) delete DB.items[currentDbSelection.key][prop];
        else DB.items[currentDbSelection.key][prop] = finalVal;
    } else {
        const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
        if (recipe) {
             if (finalVal === undefined) delete recipe[prop];
             else recipe[prop] = finalVal;
        }
    }
}

function renderDynamicList(field, obj) {
    const container = document.getElementById(`list-${field}`);
    container.innerHTML = '';
    
    if (obj) {
        Object.keys(obj).forEach(item => {
            const row = document.createElement('div');
            row.className = 'dynamic-row';
            row.innerHTML = `
                <input type="text" value="${item}" placeholder="Item Name" onchange="updateDynamicKey('${field}', '${item}', this.value)">
                <input type="number" value="${obj[item]}" placeholder="Qty" oninput="updateDynamicVal('${field}', '${item}', this.value)">
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

function updateDynamicVal(field, key, val) {
    const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (recipe && recipe[field]) {
        recipe[field][key] = parseFloat(val) || 0;
    }
}

function updateDynamicKey(field, oldKey, newKey) {
    const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (recipe && recipe[field]) {
        const val = recipe[field][oldKey];
        delete recipe[field][oldKey];
        recipe[field][newKey] = val;
        renderDynamicList(field, recipe[field]);
    }
}

function removeDynamicItem(field, key) {
    const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (recipe && recipe[field]) {
        delete recipe[field][key];
        renderDynamicList(field, recipe[field]);
    }
}

function addDynamicItem(field) {
    const recipe = DB.recipes.find(r => r.id === currentDbSelection.key);
    if (recipe) {
        if (!recipe[field]) recipe[field] = {};
        recipe[field]["New Item"] = 1;
        renderDynamicList(field, recipe[field]);
    }
}

function toggleSourceView() {
    isSourceView = !isSourceView;
    const btn = document.getElementById('btn-source-toggle');
    const area = document.getElementById('db-editor-area');
    const textArea = document.getElementById('json-editor');

    if (isSourceView) {
        btn.classList.add('active');
        btn.innerText = "Hide Source";
        area.classList.add('source-active');
        // Generate Source
        textArea.value = generateDbString();
    } else {
        btn.classList.remove('active');
        btn.innerText = "View Source JSON";
        area.classList.remove('source-active');
        // If they edited the text area manually, try to parse it back
        try {
            const txt = textArea.value;
            // Simple validation before eval
            if (txt.includes("window.ALCHEMY_DB")) {
                 eval(txt);
                 DB = window.ALCHEMY_DB;
                 initDbEditor(); // Refresh visuals
            }
        } catch(e) { console.error("Could not parse source view edits"); }
    }
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
    else dataStr = JSON.stringify(DB.recipes.find(r => r.id === key), null, 4);
    
    const title = encodeURIComponent(`[Data Error] ${key}`);
    const body = encodeURIComponent(`I found an issue with **${key}** (${type}).\n\n**Current Data:**\n\`\`\`json\n${dataStr}\n\`\`\`\n\n**Suggested Correction:**\n(Please describe what is wrong and what the correct values should be)`);
    
    const url = `https://github.com/JoeJoesGit/AlchemyFactoryCalculator/issues/new?title=${title}&body=${body}`;
    window.open(url, '_blank');
}

/* ==========================================================================
   SECTION: DATA MANAGEMENT (Save/Export)
   ========================================================================== */
function applyChanges() {
    // Save to local storage
    if (isSourceView) {
        const txt = document.getElementById('json-editor').value;
        try { 
            eval(txt); 
            DB = window.ALCHEMY_DB; 
            localStorage.setItem(SOURCE_KEY, txt);
            persist();
            alert("Applied!"); 
            initDbEditor();
        } catch(e) { alert("Syntax Error: " + e.message); }
    } else {
        const txt = generateDbString();
        localStorage.setItem(SOURCE_KEY, txt);
        persist();
        alert("Changes Saved Locally!");
    }
}

function exportData() {
    const txt = isSourceView ? document.getElementById('json-editor').value : generateDbString(); 
    const blob = new Blob([txt], { type: "text/javascript" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "alchemy_db.js"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function persist() { 
    DB.settings.activeRecyclers = activeRecyclers;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); 
}

/* ==========================================================================
   SECTION: COMBOBOX & INPUTS (Existing Logic Preserved)
   ========================================================================== */
function prepareComboboxData() {
    const allItems = new Set(Object.keys(DB.items || {}));
    if(DB.recipes) DB.recipes.forEach(r => Object.keys(r.outputs).forEach(k => allItems.add(k)));
    allItemsList = Array.from(allItems).sort().map(name => {
        return { name: name, category: (DB.items[name] ? DB.items[name].category : "Other") };
    });
}
function toggleCombobox() {
    const list = document.getElementById('combobox-list');
    const input = document.getElementById('targetItemInput');
    if(list.style.display === 'block') { closeCombobox(); } else { input.focus(); filterCombobox(); }
}
function updateComboIcon() {
    const input = document.getElementById('targetItemInput');
    const icon = document.getElementById('combo-btn');
    if(input.value.trim().length > 0) { icon.innerText = "✖"; icon.style.color = "#ff5252"; } else { icon.innerText = "▼"; icon.style.color = "#888"; }
}
function handleComboIconClick(e) {
    e.stopPropagation();
    const input = document.getElementById('targetItemInput');
    if(input.value.trim().length > 0) { input.value = ""; filterCombobox(); updateComboIcon(); input.focus(); } else { toggleCombobox(); }
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
        div.onclick = function() { selectItem(item.name); };
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
        ['lvlBelt','lvlSpeed','lvlAlchemy','lvlFuel','lvlFert'].forEach(k => { if(DB.settings[k] !== undefined) document.getElementById(k).value = DB.settings[k]; });
        if(DB.settings.defaultFuel) document.getElementById('fuelSelect').value = DB.settings.defaultFuel; 
        if(DB.settings.defaultFert) document.getElementById('fertSelect').value = DB.settings.defaultFert; 
    }
    updateDefaultButtonState();
}
function populateSelects() {
    const fuelSel = document.getElementById('fuelSelect'); const fertSel = document.getElementById('fertSelect');
    fuelSel.innerHTML = ''; fertSel.innerHTML = '';
    const fuels = []; const ferts = [];
    const allItems = new Set(Object.keys(DB.items || {}));
    if(DB.recipes) DB.recipes.forEach(r => Object.keys(r.outputs).forEach(k => allItems.add(k)));
    allItems.forEach(itemName => {
        const itemDef = DB.items[itemName] || {};
        if(itemDef.heat) fuels.push({ name: itemName, heat: itemDef.heat });
        if(itemDef.nutrientValue) ferts.push({ name: itemName, val: itemDef.nutrientValue });
    });
    fuels.sort((a,b) => b.heat - a.heat).forEach(f => { fuelSel.appendChild(new Option(`${f.name} (${f.heat} P)`, f.name)); });
    ferts.sort((a,b) => b.val - a.val).forEach(f => { fertSel.appendChild(new Option(`${f.name} (${f.val} V)`, f.name)); });
}
function toggleFuel() {
    const btn = document.getElementById('btnSelfFuel'); const chk = document.getElementById('selfFeed');
    chk.checked = !chk.checked;
    if(chk.checked) { btn.innerText = "Self-Fuel: ON"; btn.classList.remove('btn-inactive-red'); btn.classList.add('btn-active-green'); } 
    else { btn.innerText = "Self-Fuel: OFF"; btn.classList.remove('btn-active-green'); btn.classList.add('btn-inactive-red'); }
    calculate();
}
function toggleFert() {
    const btn = document.getElementById('btnSelfFert'); const chk = document.getElementById('selfFert');
    chk.checked = !chk.checked;
    if(chk.checked) { btn.innerText = "Self-Fert: ON"; btn.classList.remove('btn-inactive-red'); btn.classList.add('btn-active-green'); } 
    else { btn.innerText = "Self-Fert: OFF"; btn.classList.remove('btn-active-green'); btn.classList.add('btn-inactive-red'); }
    calculate();
}
function setDefaultFuel() { const c = document.getElementById('fuelSelect').value; DB.settings.defaultFuel = c; persist(); updateDefaultButtonState(); alert("Default Fuel Saved: " + c); }
function setDefaultFert() { const c = document.getElementById('fertSelect').value; DB.settings.defaultFert = c; persist(); updateDefaultButtonState(); alert("Default Fertilizer Saved: " + c); }
function updateDefaultButtonState() {
    const curFuel = document.getElementById('fuelSelect').value; const defFuel = DB.settings.defaultFuel;
    const btnFuel = document.getElementById('btnDefFuel');
    if(curFuel === defFuel) { btnFuel.disabled = true; btnFuel.innerText = "Current Default"; } else { btnFuel.disabled = false; btnFuel.innerText = "Make Default"; }
    const curFert = document.getElementById('fertSelect').value; const defFert = DB.settings.defaultFert;
    const btnFert = document.getElementById('btnDefFert');
    if(curFert === defFert) { btnFert.disabled = true; btnFert.innerText = "Current Default"; } else { btnFert.disabled = false; btnFert.innerText = "Make Default"; }
}
function saveSettings() { ['lvlBelt','lvlSpeed','lvlAlchemy','lvlFuel','lvlFert'].forEach(k => { DB.settings[k] = parseInt(document.getElementById(k).value) || 0; }); persist(); alert("Settings Saved!"); }
function resetToDefault() { if(confirm("Factory Reset?")) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SOURCE_KEY); location.reload(); } }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function showChangelog() { document.getElementById('changelog-modal').style.display = 'flex'; }
function adjustInput(id, delta) { const el = document.getElementById(id); let val = parseInt(el.value) || 0; el.value = Math.max(0, val + delta); }
function adjustRate(delta) { 
    const el = document.getElementById('targetRate'); 
    if(el.disabled) return; 
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
        try { ancestors = JSON.parse(domElement.dataset.ancestors); } catch(e) {}
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
        if(countMax <= 0) return;
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
                if(!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
                totalConstructionMaterials[mat] += totalQty;
            });
            subListHtml += `</ul>`;
        } else {
            subListHtml = `<ul class="build-sublist"><li class="build-subitem" style="color:#666;">No build data</li></ul>`;
        }
        li.innerHTML = `<div class="build-header" onclick="toggleBuildGroup(this.parentNode)"><span><span class="build-arrow">▶</span> ${m}</span> <span class="build-count">${label}</span></div>${subListHtml}`;
        buildList.appendChild(li);
    });
    if(furnaces > 0) {
        const li = document.createElement('li'); li.className = 'build-group';
        const mName = "Stone Furnace"; const count = furnaces;
        const machineDef = DB.machines[mName] || {}; const buildCost = machineDef.buildCost;
        let subListHtml = '';
        if (buildCost) {
            subListHtml = `<ul class="build-sublist">`;
            Object.keys(buildCost).forEach(mat => {
                const totalQty = buildCost[mat] * count;
                subListHtml += `<li class="build-subitem"><span>${mat}</span> <span class="build-val">${totalQty}</span></li>`;
                if(!totalConstructionMaterials[mat]) totalConstructionMaterials[mat] = 0;
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
        deductionText.push(`Gross: ${gross.toFixed(1)}`); 
        deductionText.push(`Use: ${actualFuelNeed.toFixed(1)}`); 
    }
    if (p.selfFert && p.targetItem === p.selectedFert) { 
        let gross = p.targetRate + actualFertNeed;
        deductionText.push(`Gross: ${gross.toFixed(1)}`); 
        deductionText.push(`Use: ${actualFertNeed.toFixed(1)}`); 
    }
    document.getElementById('summary-container').innerHTML = `
        <div class="summary-box">
            <div class="stat-block"><span class="stat-label">Net Output</span><span class="stat-value ${p.targetRate >= 0 ? 'net-positive' : 'net-warning'}">${p.targetRate.toFixed(1)} / min</span>${deductionText.length > 0 ? `<span class="stat-sub" style="font-size:0.75em">${deductionText.join('<br>')}</span>` : ''}</div>
            <div class="stat-block"><span class="stat-label">Internal Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${internalHeat.toFixed(1)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(internalBio)} V/s</span></div>
            <div class="stat-block"><span class="stat-label">External Load</span><span class="stat-value" style="font-size:0.9em; color:var(--fuel);">Heat: ${externalHeat.toFixed(1)} P/s</span><span class="stat-value" style="font-size:0.9em; color:var(--bio);">Nutr: ${formatVal(externalBio)} V/s</span></div>
            ${profitHtml}
            <div class="stat-block"><span class="stat-label">Belt Usage (Net)</span><span class="stat-value" style="font-size:1.1em; color:${p.targetRate > p.beltSpeed ? '#ff5252' : '#aaa'};">${(p.targetRate/p.beltSpeed * 100).toFixed(0)}%</span><span class="stat-sub">Cap: ${p.beltSpeed}/m</span></div>
        </div>`;
}
function toggleBuildGroup(header) { header.classList.toggle('expanded'); }
function toggleNode(arrowElement) { const node = arrowElement.closest('.node'); if (node) node.classList.toggle('collapsed'); }
function toggleRecycle(pathKey) {
    if (activeRecyclers[pathKey]) { delete activeRecyclers[pathKey]; } 
    else { activeRecyclers[pathKey] = true; }
    persist(); calculate();
}
window.onload = init;