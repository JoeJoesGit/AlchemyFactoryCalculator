/* ==========================================================================
   ALCHEMY CALCULATOR CORE ENGINE
   Handles recursion, math, and tree node generation.
   ========================================================================== */

let rowCounter = 0;
window.globalByproducts = {};
window.activeRecyclers = {}; // { "ItemName": true }
window.externalOverrides = {}; // { "pathKey": true }
window.globalUserExternalInputs = {}; // { "ItemName": totalRate }
window.activeSeedDemand = {}; // { "ItemName": count }
window.globalRecycledDemand = {}; // { "ItemName": totalRateRequested }
window.lastTargetItem = "";
window.suppressReset = false; // Flag to prevent wiping settings during Import

/* ==========================================================================
   SECTION: HELPER MATH FUNCTIONS
   ========================================================================== */
function getBeltSpeed(lvl) { let s = 60; if (lvl > 0) s += Math.min(lvl, 12) * 15; if (lvl > 12) s += (lvl - 12) * 3; return s; }
function getSpeedMult(lvl) { let m = 1.0; m += Math.min(lvl, 12) * 0.25; if (lvl > 12) m += (lvl - 12) * 0.05; return m; }
function getAlchemyMult(lvl) { if (lvl <= 0) return 1.0; let p = 0; for (let i = 1; i <= lvl; i++) { if (i <= 2) p += 6; else if (i <= 8) p += 8; else p += 10; } return 1.0 + (p / 100); }

function getRecipesFor(item) { if (!DB.recipes) return []; return DB.recipes.filter(r => r.outputs[item]); }
function getActiveRecipe(item) {
    const candidates = getRecipesFor(item);
    if (candidates.length === 0) return null; if (candidates.length === 1) return candidates[0];
    const prefId = DB.settings.preferredRecipes[item];
    if (prefId) { const found = candidates.find(r => r.id === prefId); if (found) return found; }
    return candidates[0];
}

function getProductionHeatCost(item, speedMult, alchemyMult) {
    let cost = 0; const recipe = getActiveRecipe(item);
    if (recipe && recipe.outputs[item]) {
        let batchYield = recipe.outputs[item];
        if (recipe.machine === "Extractor" || recipe.machine === "Alembic" || recipe.machine === "Advanced Alembic") batchYield *= alchemyMult;
        if (DB.machines[recipe.machine] && DB.machines[recipe.machine].heatCost) {
            const mach = DB.machines[recipe.machine]; const parent = DB.machines[mach.parent];
            const slotsReq = mach.slotsRequired || 1; const pSlots = mach.parentSlots || parent.slots || 3;
            const heatPs = (mach.heatCost * speedMult) + (parent.heatSelf / (pSlots / slotsReq));
            cost += heatPs * ((recipe.baseTime / speedMult) / batchYield);
        }
        Object.keys(recipe.inputs).forEach(k => {
            cost += getProductionHeatCost(k, speedMult, alchemyMult) * (recipe.inputs[k] / batchYield);
        });
    }
    return cost;
}

function getProductionFertCost(item, fertVal, fertSpeed, speedMult, alchemyMult) {
    let cost = 0; const itemDef = DB.items[item] || {};
    if (itemDef.category === "Herbs" && itemDef.nutrientCost) cost += itemDef.nutrientCost;
    const recipe = getActiveRecipe(item);
    if (recipe && recipe.outputs[item]) {
        let batchYield = recipe.outputs[item];
        if (recipe.machine === "Extractor" || recipe.machine === "Alembic" || recipe.machine === "Advanced Alembic") batchYield *= alchemyMult;
        Object.keys(recipe.inputs).forEach(k => {
            cost += getProductionFertCost(k, fertVal, fertSpeed, speedMult, alchemyMult) * (recipe.inputs[k] / batchYield);
        });
    }
    return cost;
}

function formatVal(val) {
    if (val === undefined || val === null) return "0.00";
    if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'b';
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'm';
    if (val >= 10000) return (val / 1000).toFixed(2) + 'k';
    return val.toFixed(2);
}

function getDepthColor(item, depth) {
    // Cycle through 5 distinct colors for visual depth
    const colors = ['#4a9eff', '#5cffab', '#ffcf5c', '#ff5c5c', '#c45cff'];
    return colors[depth % colors.length];
}

/* ==========================================================================
   SECTION: UI HELPER FUNCTIONS
   ========================================================================== */
function tooltipRow(labelKey, value, style) {
    const styleAttr = style ? ` style="${style}"` : '';
    return `<div class="tooltip-row"><span>${I18n.t(labelKey)}:</span> <span class="tooltip-val"${styleAttr}>${value}</span></div>`;
}

function renderItem(name) {
    return `${renderIcon(name)} ${I18n.t(name)}`;
}

function getItemTooltipHtml(item) {
    const def = DB.items[item] || {};
    let rows = "";

    // Category
    if (def.category) {
        const cat = Array.isArray(def.category) ? def.category.join(", ") : def.category;
        rows += tooltipRow("Category", cat);
    }

    // Heat
    if (def.heat) {
        rows += tooltipRow("Heat Value", `${def.heat} P`, "color:var(--fuel)");
    }

    // Nutrient
    if (def.nutrientValue) {
        rows += tooltipRow("Nutrient Val", `${def.nutrientValue} V`, "color:var(--bio)");
    }
    if (def.nutrientCost) {
        rows += tooltipRow("Nutrient Cost", `${def.nutrientCost} V`, "color:var(--bio)");
    }
    if (def.maxFertility) {
        rows += tooltipRow("Max Fertility", def.maxFertility, "color:var(--bio)");
    }

    // Prices
    if (def.buyPrice) {
        rows += tooltipRow("Buy Price", `${formatVal(def.buyPrice)}g`);
    }
    if (def.sellPrice) {
        rows += tooltipRow("Sell Price", `${formatVal(def.sellPrice)}g`);
    }

    return `
        <div class="tooltip-box">
            <div class="tooltip-header">${I18n.t("Click to open new chain")}</div>
            ${rows}
        </div>
    `;
}

/* ==========================================================================
   SECTION: CALCULATION ENGINE
   ========================================================================== */
function calculate() {
    try {
        if (!DB || !DB.recipes) return;

        // 1. Gather Inputs
        let rawInput = document.getElementById('targetItemInput').value;
        "use strict";
        rawInput = rawInput.trim();
        let targetItem = Object.keys(DB.items).find(k => k.toLowerCase() === rawInput.toLowerCase()) || rawInput;
        let targetRate = parseFloat(document.getElementById('targetRate').value) || 0;

        // --- MACHINE MODE OVERRIDE ---
        // If in Machine Mode, the "Source of Truth" is the Machine Count Input.
        // We must RECALCULATE targetRate based on current upgrades (which may have just changed).
        if (window.goalMode === 'machine') {
            const count = parseFloat(document.getElementById('machineCountInput').value) || 0;
            if (count > 0 && typeof getSingleMachineStats === 'function') {
                const stats = getSingleMachineStats(targetItem);
                if (stats && stats.throughput > 0) {
                    targetRate = count * stats.throughput;
                    // Update the displayed Rate box to match
                    document.getElementById('targetRate').value = parseFloat(targetRate.toFixed(2));
                }
            }
        }

        // --- RESET LOGIC ---
        // Modified for Safe Import: Suppress reset if global flag is set
        if (!window.suppressReset && targetItem !== lastTargetItem) {
            console.log(`Target change detected: ${lastTargetItem} -> ${targetItem}. Resetting overrides.`);
            activeRecyclers = {};
            externalOverrides = {};
            lastTargetItem = targetItem;
        }

        // Clear aggregation for this run
        globalUserExternalInputs = {};
        activeSeedDemand = {};

        // Settings
        const selectedFuel = document.getElementById('fuelSelect').value; const selfFeed = document.getElementById('selfFeed').checked;
        const selectedFert = document.getElementById('fertSelect').value; const selfFert = document.getElementById('selfFert').checked;
        const showMax = document.getElementById('showMaxCap').checked;
        const lvlSpeed = parseInt(document.getElementById('lvlSpeed').value) || 0;
        const lvlBelt = parseInt(document.getElementById('lvlBelt').value) || 0;
        const lvlFuel = parseInt(document.getElementById('lvlFuel').value) || 0;
        const lvlAlchemy = parseInt(document.getElementById('lvlAlchemy').value) || 0;
        const lvlFert = parseInt(document.getElementById('lvlFert').value) || 0;

        const params = {
            targetItem, targetRate, selectedFuel, selfFeed, selectedFert, selfFert, showMax,
            lvlSpeed, lvlBelt, lvlFuel, lvlAlchemy, lvlFert,
            speedMult: getSpeedMult(lvlSpeed),
            alchemyMult: getAlchemyMult(lvlAlchemy),
            fuelMult: 1 + (lvlFuel * 0.10),
            fertMult: 1 + (lvlFert * 0.10),
            beltSpeed: getBeltSpeed(lvlBelt)
        };

        // --- UPDATE SMART LABEL ---
        if (typeof getSmartLabel === 'function') {
            const lbl = getSmartLabel(targetRate, params.beltSpeed);
            document.getElementById('rateLabel').innerText = I18n.t("Rate (Items/Min): {label}", {label: lbl});
        }

        // --- EMPTY STATE HANDLING ---
        if (!targetItem || !DB.items[targetItem]) {
            if (typeof updateSummaryBox === 'function') {
                updateSummaryBox(params, 0, 0, 0, 0, 0, 0);
            }

            document.getElementById('tree').innerHTML = `
                <div style="text-align:center; padding:40px; color:#666; font-style:italic;">
                    <h3>${I18n.t("Select an Item to get started...")}</h3>
                    <p>${I18n.t("Use the search box above to choose a production target.")}</p>
                </div>`;

            document.getElementById('construction-list').innerHTML = '';
            document.getElementById('total-mats-container').innerText = '';
            return;
        }

        // --- PASS 1: GHOST CALCULATION (Discovery) ---
        globalByproducts = {};
        calculatePass(params, true);

        // --- PASS 2: RENDER (Final) ---
        rowCounter = 0;
        document.getElementById('tree').innerHTML = '';
        calculatePass(params, false);

    } catch (e) { console.error(e); }
}

function calculatePass(p, isGhost) {
    // Re-calc basic inputs
    const fuelDef = DB.items[p.selectedFuel] || {};
    let netFuelEnergy = (fuelDef.heat || 10) * p.fuelMult; const grossFuelEnergy = netFuelEnergy;
    if (p.selfFeed) { netFuelEnergy -= getProductionHeatCost(p.selectedFuel, p.speedMult, p.alchemyMult); }
    if (netFuelEnergy <= 0) netFuelEnergy = 0.1;

    const fertDef = DB.items[p.selectedFert] || { nutrientValue: 144, maxFertility: 12 };
    let netFertVal = fertDef.nutrientValue * p.fertMult; const grossFertVal = netFertVal;
    if (p.selfFert) { netFertVal -= getProductionFertCost(p.selectedFert, netFertVal, fertDef.maxFertility, p.speedMult, p.alchemyMult); }
    if (netFertVal <= 0) netFertVal = 0.1;

    let globalFuelDemandItems = 0; let globalFertDemandItems = 0; let globalHeatLoad = 0; let globalBioLoad = 0; let globalCostPerMin = 0;
    let totalByproducts = {};

    // Tracking specific generation per-pass for stabilization
    let trackGeneration = false;
    let iterationGenerated = {};

    // --- AGGREGATION STRUCTURES ---
    let machineStats = {};
    let furnaceSlotDemand = {};

    function addMachineCount(machineName, outputItem, countMax, countRaw) {
        if (!machineStats[machineName]) machineStats[machineName] = {};
        if (!machineStats[machineName][outputItem]) machineStats[machineName][outputItem] = { rawFloat: 0, nodeSumInt: 0 };
        machineStats[machineName][outputItem].rawFloat += countRaw;
        machineStats[machineName][outputItem].nodeSumInt += countMax;
    }

    // =========================================================================
    // PHASE 1: SIMULATION & STABILIZATION
    // =========================================================================

    let stableFuelDemand = 0;
    let stableFertDemand = 0;
    let stableByproducts = {};

    let recyclingMap = {}; // Stores precise recycling decisions: "path" -> amount
    let currentPassStock = {}; // The fixed inventory available for this pass (Start of Tick)

    let isAbsorbedFuel = (p.selfFeed && p.targetItem === p.selectedFuel);
    let isAbsorbedFert = (p.selfFert && p.targetItem === p.selectedFert);

    if (!isGhost) {
        // Reset globals for simulation
        globalByproducts = {};
        globalFuelDemandItems = 0; globalFertDemandItems = 0; globalHeatLoad = 0; globalBioLoad = 0; globalCostPerMin = 0;

        // 1. Base Snapshot: Run Primary Chain (Measurement Mode = true)
        buildNode(p.targetItem, p.targetRate, false, [], true, true);
        let baseSnapshot = { ...globalByproducts };

        // Default stable state
        stableByproducts = { ...baseSnapshot };

        // 2. Stabilization Loop
        // Trigger if we have Self-Loops OR Active Recycling (to resolve order-of-ops)
        const hasRecycling = Object.keys(activeRecyclers).length > 0;
        if (p.selfFeed || p.selfFert || hasRecycling) {
            // FIX: Initialize lastPassGenerated with the base run's output
            // This represents the "Start of Tick" inventory for the first iteration
            let lastPassGenerated = { ...baseSnapshot };

            // We do NOT need seedByproducts anymore because we re-simulate everything in the loop

            // History buffer for Adaptive Damping
            let stockHistory = {};
            let unstableKeys = {};
            // window.debugTrace = []; // REMOVED: Do not clear trace here!

            for (let i = 0; i < 25; i++) {
                // Setup Environment: 
                // Stock = What was produced last pass.
                // Accumulator = Starts at 0 for this pass.
                currentPassStock = { ...lastPassGenerated };
                globalByproducts = {};

                trackGeneration = true;
                iterationGenerated = {};

                // Reset Demand Counters
                globalFuelDemandItems = 0; globalFertDemandItems = 0;

                let prevFuel = stableFuelDemand;
                let prevFert = stableFertDemand;

                // Simulate
                if (isAbsorbedFuel) {
                    buildNode(p.targetItem, p.targetRate + prevFuel, false, [], true, false);
                } else if (isAbsorbedFert) {
                    buildNode(p.targetItem, p.targetRate + prevFert, false, [], true, false);
                } else {
                    buildNode(p.targetItem, p.targetRate, false, [], true, false);
                }

                if (!isAbsorbedFuel && p.selfFeed && prevFuel > 0) {
                    buildNode(p.selectedFuel, prevFuel, true, [], true, false);
                }
                if (!isAbsorbedFert && p.selfFert && prevFert > 0) {
                    buildNode(p.selectedFert, prevFert, true, [], true, false);
                }

                // ADAPTIVE DAMPING LOGIC
                // Resolve Next Iteration's Input (lastPassGenerated) based on this Iteration's Output (iterationGenerated)
                let nextPassGenerated = {};
                let hasOscillation = false;

                const allKeys = new Set([...Object.keys(lastPassGenerated), ...Object.keys(iterationGenerated)]);

                allKeys.forEach(k => {
                    const oldVal = lastPassGenerated[k] || 0;
                    const newVal = iterationGenerated[k] || 0;

                    // Update History
                    if (!stockHistory[k]) stockHistory[k] = [];
                    stockHistory[k].push(newVal);
                    if (stockHistory[k].length > 4) stockHistory[k].shift();

                    // Check for Oscillation (Flip-Flop)
                    if (!unstableKeys[k] && stockHistory[k].length >= 3) {
                        const hist = stockHistory[k];
                        const d1 = hist[hist.length - 1] - hist[hist.length - 2];
                        const d2 = hist[hist.length - 2] - hist[hist.length - 3];

                        // If direction passes zero (Pos->Neg or Neg->Pos) and magnitude is significant > 0.05
                        if (d1 * d2 < 0 && Math.abs(d1) > 0.05) {
                            unstableKeys[k] = true;
                        }
                    }


                    // --- HEAVY DAMPING SCALAR ---
                    // Analysis shows High-Gain loops (Slope -4) are unstable at 0.5 average.
                    // We need a lower learning rate (Alpha ~ 0.2) to converge.
                    // next = old * 0.8 + new * 0.2

                    if (unstableKeys[k]) {
                        // Use 0.2 update rate (Heavy Damping) to handle high-ratio loops
                        nextPassGenerated[k] = (oldVal * 0.8) + (newVal * 0.2);
                        hasOscillation = true;
                    } else {
                        nextPassGenerated[k] = newVal;
                    }
                });

                lastPassGenerated = { ...nextPassGenerated };

                let nextFuel = globalFuelDemandItems;
                let nextFert = globalFertDemandItems;

                // Convergence Check: Fuel/Fert stable AND no active oscillation
                // FIX: Ensure we run at least 5 iterations to detect oscillation patterns (history length 4)
                if (i > 4 && !hasOscillation && Math.abs(nextFuel - prevFuel) < 0.01 && Math.abs(nextFert - prevFert) < 0.01) {
                    stableFuelDemand = nextFuel;
                    stableFertDemand = nextFert;
                    break;
                }
                stableFuelDemand = nextFuel;
                stableFertDemand = nextFert;
            }

            // Capture Final State (One last measurement pass at stable rate, MIRRORING SIMULATION LOGIC)
            // CRITICAL FIX: Stock is stable, Accumulator is new.
            currentPassStock = { ...lastPassGenerated };
            globalByproducts = {};

            // Re-run the exact simulation step to capture the final stable state
            if (isAbsorbedFuel) {
                buildNode(p.targetItem, p.targetRate + stableFuelDemand, false, [], true, true);
            } else if (isAbsorbedFert) {
                buildNode(p.targetItem, p.targetRate + stableFertDemand, false, [], true, true);
            } else {
                buildNode(p.targetItem, p.targetRate, false, [], true, true);
            }

            if (!isAbsorbedFuel && p.selfFeed && stableFuelDemand > 0) {
                buildNode(p.selectedFuel, stableFuelDemand, true, [], true, true);
            }
            if (!isAbsorbedFert && p.selfFert && stableFertDemand > 0) {
                buildNode(p.selectedFert, stableFertDemand, true, [], true, true);
            }

            stableByproducts = { ...globalByproducts };
            // Clean tiny floating point errors
            Object.keys(stableByproducts).forEach(k => {
                if (Math.abs(stableByproducts[k]) < 0.001) delete stableByproducts[k];
            });
        }
    }

    // =========================================================================
    // PHASE 2: RESET & PREPARE FOR RENDER
    // =========================================================================

    let primaryRenderRate = p.targetRate;
    let absorbedFuel = false;
    let absorbedFert = false;

    if (!isGhost) {
        // Reset Globals
        globalFuelDemandItems = 0;
        globalFertDemandItems = 0;
        globalHeatLoad = 0;
        globalBioLoad = 0;
        globalCostPerMin = 0;

        // FIX: Start with EMPTY globalByproducts for the Render Pass.
        // We accumulate production live. 'stableByproducts' tracks the "Remaining" counts for display.
        globalByproducts = {};  // Was: { ...stableByproducts };

        if (p.selfFeed && p.targetItem === p.selectedFuel) {
            primaryRenderRate += stableFuelDemand;
            absorbedFuel = true;
        }
        if (p.selfFert && p.targetItem === p.selectedFert) {
            primaryRenderRate += stableFertDemand;
            absorbedFert = true;
        }

        trackGeneration = false;
    }

    const treeContainer = document.getElementById('tree');
    const reqContainer = document.getElementById('requirements-area');
    if (reqContainer) reqContainer.innerHTML = '';

    // Recursive Builder
    function buildNode(item, rate, isInternalModule, ancestors = [], forceGhost = false, isMeasurement = false, depth = 0) {
        // --- RECURSION SAFETY GUARD ---
        if (depth > 100) {
            console.error(`Recursion Limit Exceeded for item: ${item}`);
            // If in ghost mode, we just stop. If rendering, we show Error Node.
            if (forceGhost || isGhost) return null;

            const errDiv = document.createElement('div');
            errDiv.className = 'node error-node';
            errDiv.innerHTML = `
                <div class="node-content" style="border-left: 4px solid red; background: rgba(255,0,0,0.1);">
                    <span class="qty">${I18n.t("ERROR")}</span>
                    <strong>${item}</strong>
                    <div class="details" style="color:red;">${I18n.t("Wrapper Recursion Limit Hit (>100)")}</div>
                    <div class="details">${I18n.t("Check for infinite loops in recipes.")}</div>
                </div>`;
            return errDiv;
        }

        const effectiveGhost = isGhost || forceGhost;

        // RECYCLING CHECK
        let deduction = 0;

        // NEW: Unique Path Key for Stabilization Mapping
        const pathKey = ancestors.join("|") + "|" + item;
        let canRecycle = false;

        if (effectiveGhost) {
            // --- SIMULATION PHASE ---
            const availableStock = currentPassStock[item] || 0;

            if (activeRecyclers[item]) {
                canRecycle = true;
                // TRACK DEMAND for Solver (Accumulate in Ghost Phase)
                window.globalRecycledDemand[item] = (window.globalRecycledDemand[item] || 0) + rate;

                // Apply Deduction
                if (availableStock > 0.000001) {
                    deduction = Math.min(rate, availableStock);
                    currentPassStock[item] -= deduction;
                    globalByproducts[item] = (globalByproducts[item] || 0) - deduction;
                }
            } else if (availableStock > 0.01) {
                // Auto-detection for UI button
                canRecycle = true;
            }

            recyclingMap[pathKey] = deduction;

        } else {
            // --- RENDER PHASE ---
            // Use the decision from the last simulation pass
            deduction = recyclingMap[pathKey] || 0;

            if (activeRecyclers[item]) {
                canRecycle = true;
                // Note: We don't track demand here, strictly speaking, as the solver is done.
            } else if ((stableByproducts[item] || 0) > 0.01) {
                canRecycle = true;
            }
        }

        const netRate = Math.max(0, rate - deduction);
        const itemDef = DB.items[item] || {};
        let ingredientChildren = [];
        let currentPath = [...ancestors, item];
        let myRowID = 0;

        if (!effectiveGhost) { rowCounter++; myRowID = rowCounter; }

        let outputTag = ""; let machineTag = ""; let heatTag = ""; let swapBtn = "";
        let bioTag = ""; let costTag = ""; let detailsTag = ""; let recycleTag = ""; let capTag = "";
        let machinesNeeded = 0; let hasChildren = false;

        let isFuel = (item === p.selectedFuel); let isFert = (item === p.selectedFert);
        if (isFuel) { outputTag = `<span class="output-tag">${I18n.t("Output:")} ${formatVal((rate * (fuelDef.heat || 10) * p.fuelMult) / 60)} P/s</span>`; }
        else if (isFert) { outputTag = `<span class="output-tag">${I18n.t("Output:")} ${formatVal((rate * fertDef.nutrientValue * p.fertMult) / 60)} V/s</span>`; }

        // --- EXTERNAL INPUT OVERRIDE LOGIC ---
        // If this specific row is marked as External, stop recursion and aggregate.
        // NOTE: We do NOT deduct 'deduction' (recycling) if it's external? 
        // Logic: Recycled amount comes from internal byproducts. If we Externalize, we imply we import the 'net' need.
        // So we should use 'netRate' (Rate - Available Byproducts).

        const isExternal = externalOverrides[pathKey];
        if (isExternal) {
            // Aggregate ONLY during Render Phase (to avoid counting Ghost/Stabilization passes)
            if (!effectiveGhost) {
                if (!globalUserExternalInputs[item]) globalUserExternalInputs[item] = 0;
                globalUserExternalInputs[item] += netRate;
            }
        }

        // --- RECYCLE UI ---
        let recycleBtnHtml = "";
        if (canRecycle && !effectiveGhost) {
            const isRecycling = activeRecyclers[item];
            const btnClass = isRecycling ? "btn-recycle-on" : "btn-recycle-off";
            const iconClass = isRecycling ? "recycle-icon-white" : "recycle-icon-green";
            const btnText = isRecycling ? I18n.t("Recycling") : I18n.t("Not Recycling");
            // Just the button, no wrapper div yet
            recycleBtnHtml = `<button class="split-btn ${btnClass}" onclick="toggleRecycle('${item}'); event.stopPropagation();"><span class="${iconClass}">♻</span> ${btnText}</button>`;
        }

        // --- EXTERNAL TOGGLE UI ---
        // Generate SVG Buttons for Internal/External Toggle
        let extBtnHtml = "";
        if (depth > 0) {
            // Icons based on user request: 
            // Internal: Circular Arrow (Undo/Loop) - White
            // External: Arrow into Circle (Import) - Red

            const btnClass = isExternal ? "btn-toggle-round btn-toggle-ext toggle-ext-btn" : "btn-toggle-round btn-toggle-int toggle-ext-btn";

            // Custom SVG paths
            const svgIcon = isExternal
                ? `<svg viewBox="0 0 24 24"><path d="m 9.0471027,6.8244883 v 2.667737 H 2.4899735 a 2.4979603,2.4979603 0 0 0 -2.50185681,2.5018577 2.4979603,2.4979603 0 0 0 2.50185681,2.492099 h 6.5571292 v 2.669689 L 18.072914,11.99018 Z M 12.026132,-2.7091033e-8 C 8.8467133,-2.7091033e-8 5.7920934,1.2627157 3.5439055,3.5109039 a 1.4987782,1.4987782 0 0 0 0,2.1168687 1.4987782,1.4987782 0 0 0 2.116869,0 c 1.6868507,-1.6868515 3.9797882,-2.633178 6.3653575,-2.633178 4.984242,0 8.991159,4.0142933 8.991159,8.9985354 0,4.984242 -4.006917,8.99116 -8.991159,8.99116 -2.3855693,0 -4.6785068,-0.946327 -6.3653575,-2.633178 a 1.4987782,1.4987782 0 0 0 -2.116869,0 1.4987782,1.4987782 0 0 0 0,2.116868 c 2.2481879,2.248188 5.3028078,3.510905 8.4822265,3.510905 6.604241,0 11.985754,-5.381513 11.985754,-11.985755 C 24.011885,5.388888 18.630373,-2.7091033e-8 12.026132,-2.7091033e-8 Z" fill="currentColor"></path></svg>`
                : `<svg viewBox="0 0 24 24"><path d="m 10.513672,0.00390625 -0.0625,9.66210935 H 7.1230469 l 4.8183591,8.3457034 4.81836,-8.3457034 h -3.308594 l 0.04102,-6.3652343 c 1.819848,0.3134317 3.553388,1.0162788 4.876953,2.3398437 3.527281,3.5272817 3.527282,9.201233 0,12.728516 -3.527281,3.527281 -9.2012342,3.527281 -12.728516,0 -3.5272818,-3.527282 -3.5272818,-9.2012343 0,-12.728516 L 6.7011719,4.5800781 4.5800781,2.4589844 3.5195313,3.5195313 c -4.6737286,4.6737283 -4.6737286,12.2969747 0,16.9707027 4.6737285,4.673729 12.2969757,4.673729 16.9707027,0 4.673728,-4.673729 4.673729,-12.2969745 0,-16.9707027 C 18.240206,1.2695026 15.185928,0.00390625 12.003906,0.00390625 Z" fill="currentColor"></path></svg>`;

            const tooltipHeader = isExternal ? I18n.t("Status: External Input") : I18n.t("Status: Internal Production");
            const tooltipDesc = isExternal
                ? I18n.t("This item is currently supplied externally (imported). Click to switch to Internal Production.")
                : I18n.t("This item is currently produced within this chain. Click to switch to External Input (stop producing recursively).");

            extBtnHtml = `
                <button class="${btnClass}" onclick="toggleExternal('${pathKey}'); event.stopPropagation();">
                    ${svgIcon}
                    <div class="tooltip-box">
                        <div class="tooltip-header">${tooltipHeader}</div>
                        <div style="color:#ccc;">${tooltipDesc}</div>
                    </div>
                </button>`;
        }

        if (isExternal) {
            // STOP RECURSION
            // Render Leaf Node
            if (effectiveGhost) return document.createElement('div'); // Return empty node for phantom pass

            const div = document.createElement('div');
            div.className = 'node';
            div.setAttribute('data-machine', 'External Supply');
            div.setAttribute('data-item', item);
            div.setAttribute('data-depth', depth % 20); // Use modulo for color cycling safety

            div.innerHTML = `
                    <div class="node-content">
                        <span class="tree-arrow" style="visibility:hidden">▶</span>
                        <span class="row-id">${myRowID})</span>
                        <span class="qty">${formatVal(netRate)}/m</span>
                        <strong>${item}</strong>
                        <span class="details" style="color:#2196f3; margin-left:10px;">${I18n.t("(External Input)")}</span>
                        <div class="push-right" style="display:flex; align-items:center;">${recycleBtnHtml}${extBtnHtml}</div>
                    </div>
                `;
            return div;
        }

        // Logic branching based on Item Type
        // (Legacy Herb block removed in favor of unified logic below)
        if (false) {
            // no-op to cleanly replace the old block geometry if needed, 
            // but actually we just want to fall through to getActiveRecipe.
        }
        else {
            const recipe = getActiveRecipe(item);
            if (!recipe) {
                if (!effectiveGhost) {
                    if (itemDef.buyPrice) {
                        let c = netRate * itemDef.buyPrice;
                        globalCostPerMin += c;
                        // Use formatCurrency for cost tag
                        costTag = `<span class="cost-tag">${formatCurrency(c)}/m</span>`;
                    }
                    detailsTag = `<span class="details">${I18n.t("(Raw Input)")}</span>`;
                }
            } else {
                hasChildren = true;
                let batchYield = recipe.outputs[item] || 1;
                if (recipe.machine === "Extractor" || recipe.machine === "Alembic" || recipe.machine === "Advanced Alembic") batchYield *= p.alchemyMult;

                // --- NURSERY / FERTILITY LOGIC INJECTION ---
                let effectiveBaseTime = recipe.baseTime;

                if (recipe.machine === "Nursery" || recipe.machine === "World Tree Nursery") {
                    // NEW: Dynamic Cycle Time based on Total Batch Cost
                    const fertilitySpeed = (fertDef.maxFertility || 12);
                    let totalBatchCost = 0;

                    // Sum up nutrient costs for ALL outputs (handling Multi-Output Gentian)
                    Object.keys(recipe.outputs).forEach(outKey => {
                        const outQty = recipe.outputs[outKey];
                        const outDef = DB.items[outKey];
                        if (outDef && outDef.nutrientCost) {
                            totalBatchCost += outQty * outDef.nutrientCost;
                        }
                    });

                    // Time = Total Cost / Speed
                    if (totalBatchCost > 0) {
                        effectiveBaseTime = totalBatchCost / fertilitySpeed;
                    }
                }

                const batchesPerMin = netRate / batchYield;
                // Use effectiveBaseTime instead of recipe.baseTime for Max Throughput Calc
                const maxBatchesPerMin = (60 / effectiveBaseTime) * p.speedMult;
                const isLiquid = (itemDef.liquid === true);
                let effectiveBatchesPerMin = maxBatchesPerMin;
                let capReason = null;

                // Belt & Pipe Constraints
                // EXCEPTION: Cash Registers are effectively storage outputs/bins, not belt-constrained generators.
                if (!isLiquid && recipe.machine !== "Cash Register") {
                    const maxItemsPerMin = maxBatchesPerMin * batchYield;

                    // Cap based on Belt Speed
                    if (maxItemsPerMin > p.beltSpeed) {
                        effectiveBatchesPerMin = p.beltSpeed / batchYield;
                        capReason = I18n.t("Belt Limit ({speed}/m)", {speed: p.beltSpeed});
                    }
                } else {
                    // Universal Pipe Cap for Liquids
                    const currentOutput = maxBatchesPerMin * batchYield;
                    if (currentOutput > PIPE_CAP_PER_MIN) {
                        effectiveBatchesPerMin = PIPE_CAP_PER_MIN / batchYield;
                        capReason = I18n.t("Pipe Output Limit ({speed}/s)", {speed: (PIPE_CAP_PER_MIN / 60).toFixed(0)});
                    }
                }

                let rawMachinesCapped = batchesPerMin / effectiveBatchesPerMin;
                if (Math.abs(Math.round(rawMachinesCapped) - rawMachinesCapped) < 0.0001) { rawMachinesCapped = Math.round(rawMachinesCapped); }
                machinesNeeded = rawMachinesCapped;

                // --- CAP WARNING LOGIC (REFINED) ---
                // Only warn if the cap actually forced us to build MORE machines
                if (capReason) {
                    const maxThroughputUncapped = maxBatchesPerMin * batchYield;
                    // If calculate uncapped count:
                    // effUncapped = maxBatchesPerMin (unless belt limited? Wait, belt limit IS a cap reason)
                    // So we compare against 'maxBatchesPerMin' as the 'pure speed' baseline.

                    let effUncapped = maxBatchesPerMin;
                    // Note: If belt speed < max speed, that IS a cap. We want to know if Belt/Pipe limit checks
                    // changed the result vs just "Speed Upgrade Limit".

                    let rawMachinesUncapped = batchesPerMin / effUncapped;
                    const cappedCount = Math.ceil(machinesNeeded > 0.0001 ? machinesNeeded - 0.0001 : machinesNeeded);
                    const uncappedCount = Math.ceil(rawMachinesUncapped > 0.0001 ? rawMachinesUncapped - 0.0001 : rawMachinesUncapped);

                    if (cappedCount <= uncappedCount) {
                        capReason = null; // Cap didn't change the integer count, hide warning
                    }
                }

                // Track Bio Load for Nurseries
                if ((recipe.machine === "Nursery" || recipe.machine === "World Tree Nursery") && itemDef.nutrientCost) {
                    const totalNutrientsNeeded = netRate * itemDef.nutrientCost;
                    const itemsNeeded = totalNutrientsNeeded / grossFertVal;

                    if (effectiveGhost || !isInternalModule || isInternalModule) {
                        globalFertDemandItems += itemsNeeded;
                        globalBioLoad += (totalNutrientsNeeded / 60);
                    }

                    if (!effectiveGhost) {
                        bioTag = `<span class="bio-tag">${I18n.t("Nutr:")} ${formatVal(netRate * itemDef.nutrientCost / 60)} V/s, ${I18n.t("Needs")} ${(netRate * itemDef.nutrientCost / grossFertVal).toFixed(1)}/m ${I18n.t(p.selectedFert)}</span>`;
                    }
                }

                Object.keys(recipe.outputs).forEach(outKey => {
                    if (outKey !== item) {
                        let yieldPerBatch = recipe.outputs[outKey];
                        let totalByproduct = batchesPerMin * yieldPerBatch;

                        // TRACKING
                        if (trackGeneration) {
                            if (!iterationGenerated[outKey]) iterationGenerated[outKey] = 0;
                            iterationGenerated[outKey] += totalByproduct;
                        }

                        // Accumulate Global Byproducts during Render Phase too (Just-In-Time Availability)
                        if (effectiveGhost || !isInternalModule || !effectiveGhost) {
                            if (!globalByproducts[outKey]) globalByproducts[outKey] = 0;
                            globalByproducts[outKey] += totalByproduct;
                        }

                        if (!effectiveGhost) {
                            if (!totalByproducts[outKey]) totalByproducts[outKey] = 0;
                            totalByproducts[outKey] += totalByproduct;
                        }
                    }
                });

                if (!effectiveGhost) {
                    addMachineCount(recipe.machine, item, Math.ceil(machinesNeeded > 0.0001 ? machinesNeeded - 0.0001 : machinesNeeded), machinesNeeded);

                    // SEED ACCUMULATION (Construction Cost)
                    if ((recipe.machine === "Nursery" || recipe.machine === "World Tree Nursery") && recipe.seed) {
                        if (!activeSeedDemand[recipe.seed]) activeSeedDemand[recipe.seed] = 0;
                        activeSeedDemand[recipe.seed] += Math.ceil(machinesNeeded - 0.0001);
                    }
                }

                // HEAT CALCULATION
                if (DB.machines[recipe.machine] && DB.machines[recipe.machine].heatCost) {
                    const mach = DB.machines[recipe.machine]; const parent = DB.machines[mach.parent];
                    const sReq = mach.slotsRequired || 1; const pSlots = mach.parentSlots || parent.slots || 3;
                    const activeHeat = mach.heatCost * p.speedMult;

                    const nodeParentsNeeded = Math.ceil((machinesNeeded / (pSlots / sReq)) - 0.0001);
                    const totalHeatPs = (nodeParentsNeeded * parent.heatSelf * p.speedMult) + (machinesNeeded * activeHeat);

                    if (!effectiveGhost) {
                        const pName = mach.parent;
                        if (!furnaceSlotDemand[pName]) furnaceSlotDemand[pName] = {};
                        if (!furnaceSlotDemand[pName][recipe.machine]) furnaceSlotDemand[pName][recipe.machine] = 0;
                        furnaceSlotDemand[pName][recipe.machine] += Math.ceil(machinesNeeded - 0.0001) * sReq;
                    }

                    // ACCUMULATION
                    if (effectiveGhost || !isInternalModule || isInternalModule) {
                        globalHeatLoad += totalHeatPs;
                        globalFuelDemandItems += (totalHeatPs * 60) / grossFuelEnergy;
                    }

                    if (!effectiveGhost) {
                        heatTag = `<span class="heat-tag">${I18n.t("Heat:")} ${totalHeatPs.toFixed(1)} P/s, ${I18n.t("Needs")} ${((totalHeatPs * 60) / grossFuelEnergy).toFixed(1)}/m ${I18n.t(p.selectedFuel)}</span>`;
                    }
                }

                if (!effectiveGhost) {
                    let inputsStr = Object.keys(recipe.inputs).map(k => `${recipe.inputs[k]} ${I18n.t(k)}`).join(', ');
                    let outputsStr = Object.keys(recipe.outputs).map(k => `${recipe.outputs[k]} ${I18n.t(k)}`).join(', ');
                    let cycleTime = recipe.baseTime / p.speedMult;
                    let throughput = effectiveBatchesPerMin * batchYield;

                    const hasAlchemy = (recipe.machine === "Extractor" || recipe.machine === "Alembic" || recipe.machine === "Advanced Alembic");

                    let tooltipHtml = `
                        <div class="tooltip-box">
                            <div class="tooltip-header">${I18n.t("{machine} Stats", {machine: I18n.t(recipe.machine)})}</div>
                            ${tooltipRow("Recipe", `${inputsStr} &rarr; ${outputsStr}`)}
                            ${tooltipRow("Base Time", `${recipe.baseTime}s`)}
                            ${tooltipRow("Speed Mult", `${p.speedMult.toFixed(2)}x`)}
                            ${tooltipRow("Cycle Time", `${cycleTime.toFixed(2)}s`)}
                            ${hasAlchemy ? tooltipRow("Alchemy Mult", `${p.alchemyMult.toFixed(2)}x`) : ''}
                            ${tooltipRow("Throughput", `${throughput.toFixed(2)} /m/mach`)}
                        </div>`;

                    /* capTag declared above */
                    let capWarningIcon = "";
                    if (capReason) {
                        // Keep simple title for icon warning or convert? Title is safer for small icon.
                        capWarningIcon = `<span class="cap-warning" title="${I18n.t("Capped by {reason}", {reason: capReason})}">&#9888;</span>`;
                    }

                    if (p.showMax) {
                        const maxOutput = Math.ceil(machinesNeeded) * throughput;
                        capTag = `<span class="max-cap-tag">(${I18n.t("Max:")} ${formatVal(maxOutput)}/m)</span>`;
                    }
                    const machNameForAttr = recipe.machine.replace(/'/g, "");
                    const itemNameForAttr = item.replace(/'/g, "");
                    const machineName = recipe.machine;
                    const plural = (I18n.getLang() === 'en' && Math.ceil(machinesNeeded) !== 1) ? 's' : '';
                    machineTag = `<span class="machine-tag" onmouseover="highlightMachine('${machineName}')" onmouseout="removeHighlight()">${Math.ceil(machinesNeeded)} ${I18n.t(machineName)}${plural}${tooltipHtml}</span>${capWarningIcon}`;

                    // Add ExtTag to normal nodes too - MOVED to Action Buttons
                    // outputTag += extTag;

                    // Heat/Fert logic
                    // ...getRecipesFor(item);
                    const alts = getRecipesFor(item);
                    if (alts.length > 1) {
                        swapBtn = `<button class="swap-btn" onclick="openRecipeModal('${item}', this.parentElement)" title="${I18n.t("Swap Recipe")}">🔄</button>`;
                    }
                }

                // RECURSE INPUTS
                if (netRate > 0.0001) {
                    const netBatches = netRate / batchYield;
                    Object.keys(recipe.inputs).forEach(iName => {
                        // Skip Seed inputs for Nurseries (One-time cost, not ongoing)
                        if (recipe.machine === "Nursery") {
                            const iDef = DB.items[iName];
                            if (iDef && iDef.category === "Seeds") return;
                        }

                        let qtyPerBatch = recipe.inputs[iName];
                        let requiredInputRate = netBatches * qtyPerBatch;
                        ingredientChildren.push({ type: 'input', item: iName, rate: requiredInputRate });
                    });
                }
            }
        }

        if (effectiveGhost) {
            ingredientChildren.forEach(child => {
                buildNode(child.item, child.rate, isInternalModule, currentPath, effectiveGhost, isMeasurement, depth + 1);
            });
            return null;
        }

        // --- RENDER DOM ---
        const div = document.createElement('div'); div.className = 'node';
        let arrowHtml = `<span class="tree-arrow" style="visibility:${hasChildren ? 'visible' : 'hidden'}" onclick="toggleNode(this)">▼</span>`;
        let nodeContent = `
            ${arrowHtml}
            <span class="row-id" onclick="toggleNode(this)">${myRowID})</span>
            <span class="qty">${formatVal(rate)}/m</span>
            <span class="item-link" onclick="openDrillDown('${item}', ${rate})">
                <strong>${renderItem(item)}</strong>
                ${getItemTooltipHtml(item)}
            </span>
            ${swapBtn}
            ${detailsTag}
            ${costTag}
            ${machineTag}
            ${capTag}
            ${bioTag}
            ${heatTag}
            ${outputTag}
            <div class="push-right" style="display:flex; align-items:center;">${recycleBtnHtml}${extBtnHtml}</div>
        `;

        // Safe string replacements for attributes
        const safeMachine = machineTag ? (getActiveRecipe(item)?.machine || "").replace(/'/g, "") : "";
        const safeItem = item.replace(/'/g, "");

        div.innerHTML = `<div class="node-content" data-ancestors='${JSON.stringify(ancestors)}' data-machine="${safeMachine}" data-item="${safeItem}">${nodeContent}</div>`;
        // Add data-depth for CSS coloring
        div.setAttribute('data-depth', depth % 20);

        if (ingredientChildren.length > 0) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'node-children';
            ingredientChildren.forEach(child => {
                childrenDiv.appendChild(buildNode(child.item, child.rate, isInternalModule, currentPath, effectiveGhost, isMeasurement, depth + 1));
            });
            div.appendChild(childrenDiv);
        }
        return div;
    }

    // --- EXECUTE THE PASS (RENDER PHASE) ---
    if (p.targetItem) {
        const root = buildNode(p.targetItem, primaryRenderRate, false, [], false, false, 0);
        if (!isGhost) {
            let label = `${I18n.t("Primary Production Chain")} <span class="header-details">(${renderItem(p.targetItem)} ${formatVal(primaryRenderRate)}/m)</span>`;
            if (absorbedFuel && absorbedFert) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">${I18n.t("(Includes Internal Fuel & Fert)")}</span>`; }
            else if (absorbedFuel) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">${I18n.t("(Includes Internal Fuel)")}</span>`; }
            else if (absorbedFert) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">${I18n.t("(Includes Internal Fert)")}</span>`; }

            const sectionContent = document.createElement('div');
            sectionContent.appendChild(root);

            const section = createCollapsibleSection(label, sectionContent, 'section-primary-chain');
            treeContainer.appendChild(section);
        }
    }

    if (!isGhost) {
        if (p.selfFert && stableFertDemand > 0) {
            const grossFertNeeded = stableFertDemand;
            const title = `${I18n.t("Internal Nutrient Module")} <span class="header-details">(${renderItem(p.selectedFert)} ${formatVal(grossFertNeeded)}/m)</span>`;
            if (absorbedFert) {
                const note = document.createElement('div'); note.innerHTML = `<div class="node" style="margin-top:20px; color:#aaa; font-style:italic;">${I18n.t("Internal Nutrient Source:")} <strong>${I18n.t(p.selectedFert)}</strong> ${I18n.t("(Supplied by Main Output)")}<br>${I18n.t("Total Required:")} ${grossFertNeeded.toFixed(1)}/m</div>`;
                treeContainer.appendChild(createCollapsibleSection(title, note, 'section-internal-fert'));
            } else {
                const moduleRoot = buildNode(p.selectedFert, grossFertNeeded, true, []);
                const moduleContent = document.createElement('div');
                moduleContent.appendChild(moduleRoot);
                treeContainer.appendChild(createCollapsibleSection(title, moduleContent, 'section-internal-fert'));
            }
        }

        if (p.selfFeed && stableFuelDemand > 0) {
            const grossFuelNeeded = stableFuelDemand;
            const title = `${I18n.t("Internal Heat Module")} <span class="header-details">(${renderItem(p.selectedFuel)} ${formatVal(grossFuelNeeded)}/m)</span>`;
            if (absorbedFuel) {
                const note = document.createElement('div'); note.innerHTML = `<div class="node" style="margin-top:20px; color:#aaa; font-style:italic;">${I18n.t("Internal Fuel Source:")} <strong>${I18n.t(p.selectedFuel)}</strong> ${I18n.t("(Supplied by Main Output)")}<br>${I18n.t("Total Required:")} ${grossFuelNeeded.toFixed(1)}/m</div>`;
                treeContainer.appendChild(createCollapsibleSection(title, note, 'section-internal-heat'));
            } else {
                const moduleRoot = buildNode(p.selectedFuel, grossFuelNeeded, true, []);
                const moduleContent = document.createElement('div');
                moduleContent.appendChild(moduleRoot);
                treeContainer.appendChild(createCollapsibleSection(title, moduleContent, 'section-internal-heat'));
            }
        }
    }

    if (!isGhost) {
        // --- SUMMARY & EXTERNALS ---
        // Use formatCurrency in External Input Summary

        // --- SUMMARY & EXTERNALS (GRID LAYOUT 2-COL) ---
        const extDiv = document.createElement('div'); extDiv.className = 'node flat-node';
        let extHTML = `<div class="ext-grid">`;

        // 1. Raw Material Cost
        if (globalCostPerMin > 0) {
            extHTML += `
                <div class="ext-grid-val" style="color:var(--gold)">${formatCurrency(globalCostPerMin)}/m</div>
                <div class="ext-grid-item">${I18n.t("Raw Material Cost")}</div>
            `;
        }

        // 2. Fuel
        if (!p.selfFeed && globalFuelDemandItems > 0) {
            extHTML += `
                <div class="ext-grid-val" style="color:var(--fuel)">${formatVal(globalFuelDemandItems)}/m</div>
                <div class="ext-grid-item" style="flex-direction:row; align-items:center; justify-content:flex-start;">
                    ${renderIcon(p.selectedFuel)}
                    <div style="margin-left:6px; display:flex; flex-direction:column;">
                        ${I18n.t(p.selectedFuel)}
                        <div class="ext-grid-note">${I18n.t("(Fuel)")}</div>
                    </div>
                </div>
             `;
        }

        // 3. Fertilizer
        if (!p.selfFert && globalFertDemandItems > 0) {
            let needed = globalFertDemandItems;
            let label = I18n.t("(Fertilizer)");
            if (activeRecyclers[p.selectedFert]) {
                const avail = stableByproducts[p.selectedFert] || 0;
                const recycled = Math.min(needed, avail);
                needed -= recycled;
                if (recycled > 0) {
                    label = I18n.t("(Fertilizer, {amount} recycled)", {amount: formatVal(recycled)});
                    stableByproducts[p.selectedFert] -= recycled;
                }
            }
            if (needed > 0.01) {
                extHTML += `
                    <div class="ext-grid-val" style="color:var(--bio)">${formatVal(needed)}/m</div>
                    <div class="ext-grid-item" style="flex-direction:row; align-items:center; justify-content:flex-start;">
                        ${renderIcon(p.selectedFert)}
                        <div style="margin-left:6px; display:flex; flex-direction:column;">
                            ${I18n.t(p.selectedFert)}
                            <div class="ext-grid-note">${label}</div>
                        </div>
                    </div>
                `;
            }
        }

        // 4. User Externals
        const userExtKeys = Object.keys(globalUserExternalInputs).sort();
        userExtKeys.forEach(item => {
            const qty = globalUserExternalInputs[item];
            extHTML += `
                <div class="ext-grid-val" style="color:#2196f3">${formatVal(qty)}/m</div>
                <div class="ext-grid-item" style="flex-direction:row; align-items:center; justify-content:flex-start;">
                    <span style="margin-left:6px;">${renderItem(item)}</span>
                </div>
             `;
        });

        extHTML += `</div>`; // Close Grid

        extDiv.innerHTML = extHTML;
        if (reqContainer) {
            reqContainer.appendChild(createCollapsibleSection(I18n.t("External Inputs"), extDiv, 'section-external-inputs'));
        } else {
            treeContainer.appendChild(createCollapsibleSection(I18n.t("External Inputs"), extDiv, 'section-external-inputs'));
        }

        // --- BYPRODUCTS LOGIC ---
        const bypDiv = document.createElement('div'); bypDiv.className = 'node flat-node';
        let bypHTML = '';
        const sortedByproducts = Object.keys(totalByproducts).sort();

        // Store visible byproducts globally for the Toggle All logic
        window.currentByproductKeys = sortedByproducts;

        if (sortedByproducts.length > 0) {

            // --- RECYCLE ALL ROW ---
            if (sortedByproducts.length >= 2) {
                // Check state: Are ALL visible items currently recycling?
                const allOn = sortedByproducts.every(k => activeRecyclers[k]);
                const masterBtnClass = allOn ? "btn-recycle-on" : "btn-recycle-off";
                const masterIconClass = allOn ? "recycle-icon-white" : "recycle-icon-green";

                // Toggle Button (Matches styles of Item rows)
                const masterToggle = `<button class="split-btn ${masterBtnClass} btn-recycle-icon-only" onclick="toggleRecycleAll(); event.stopPropagation();" title="${I18n.t("Toggle Recycling For All Visible Byproducts")}"><span class="${masterIconClass} recycle-icon-only">♻</span></button>`;

                // Label (Matches Style)
                const masterLabel = `<span style="font-weight:bold; margin-left:8px;">${I18n.t("Recycle All")}</span>`;

                bypHTML += `<div class="node-content bg-transparent" style="display:flex; align-items:center; border-bottom:1px solid #444; margin-bottom:4px; padding-bottom:4px;">${masterToggle}${masterLabel}</div>`;
            }

            sortedByproducts.forEach(item => {
                let remaining = stableByproducts[item] || 0;
                let note = "";
                if (remaining < totalByproducts[item]) {
                    note = ` <span style="font-size:0.8em; color:#888;">(${formatVal(totalByproducts[item] - remaining)} recycled)</span>`;
                }
                const isRecycling = activeRecyclers[item];
                const btnClass = isRecycling ? "btn-recycle-on" : "btn-recycle-off";
                const iconClass = isRecycling ? "recycle-icon-white" : "recycle-icon-green";
                // Icon-only button for byproducts list - Fixed Size
                const toggleBtn = `<button class="split-btn ${btnClass} btn-recycle-icon-only" onclick="toggleRecycle('${item}'); event.stopPropagation();" title="${I18n.t("Toggle Recycling")}"><span class="${iconClass} recycle-icon-only">♻</span></button>`;

                bypHTML += `<div class="node-content bg-transparent" style="display:flex; align-items:center;">${toggleBtn}<span class="qty" style="color:var(--byproduct)">${formatVal(remaining)}/m</span><strong>${renderItem(item)}</strong>${note}</div>`;
            });
        } else {
            bypHTML = `<div class="node-content"><span class="details" style="font-style:italic">${I18n.t("None")}</span></div>`;
        }

        bypDiv.innerHTML = bypHTML;
        if (reqContainer) {
            reqContainer.appendChild(createCollapsibleSection(I18n.t("Byproducts"), bypDiv, 'section-byproducts'));
        } else {
            treeContainer.appendChild(createCollapsibleSection(I18n.t("Byproducts"), bypDiv, 'section-byproducts'));
        }

        // --- FLATTEN AGGREGATION FOR UI ---
        let flatMax = {};
        let flatMin = {};

        Object.keys(machineStats).forEach(mName => {
            let totalIntMax = 0;
            let totalCeiledMin = 0;

            Object.keys(machineStats[mName]).forEach(outItem => {
                const data = machineStats[mName][outItem];
                totalIntMax += data.nodeSumInt;
                totalCeiledMin += Math.ceil(data.rawFloat - 0.0001);
            });

            flatMax[mName] = totalIntMax;
            flatMin[mName] = totalCeiledMin;
        });

        // CALCULATE FINAL FURNACE COUNT FROM SLOTS
        let totalFurnaces = 0;
        Object.keys(furnaceSlotDemand).forEach(parentName => {
            const parentDef = DB.machines[parentName];
            if (parentDef) {
                // totalFurnaces is just an aggregate for legacy/debug checking if needed, 
                // but we pass the detailed object now.
                // We sum up the values in the object to get the total slots then divide
                let totalSlots = 0;
                if (typeof furnaceSlotDemand[parentName] === 'object') {
                    Object.values(furnaceSlotDemand[parentName]).forEach(v => totalSlots += v);
                } else {
                    totalSlots = furnaceSlotDemand[parentName];
                }
                totalFurnaces += Math.ceil((totalSlots - 0.0001) / (parentDef.slots || 3));
            }
        });

        // PASS RAW OBJECTS NOW using the new signature
        updateConstructionList(machineStats, furnaceSlotDemand, activeSeedDemand);

        updateSummaryBox(p, globalHeatLoad, globalBioLoad, globalCostPerMin, primaryRenderRate, globalFuelDemandItems, globalFertDemandItems);
    }
}

// =============================================================================
// GLOBAL INTERACTION FUNCTIONS
// =============================================================================

window.toggleRecycle = function (item) {
    if (activeRecyclers[item]) delete activeRecyclers[item];
    else activeRecyclers[item] = true;
    calculate();
};

window.toggleRecycleAll = function () {
    const visibleKeys = window.currentByproductKeys || [];
    if (visibleKeys.length === 0) return;

    // Logic: If ANY are OFF -> Turn ALL ON
    //        If ALL are ON -> Turn ALL OFF
    const allOn = visibleKeys.every(k => activeRecyclers[k]);

    if (allOn) {
        // Turn OFF
        visibleKeys.forEach(k => delete activeRecyclers[k]);
    } else {
        // Turn ON
        visibleKeys.forEach(k => activeRecyclers[k] = true);
    }

    persist();
    calculate();
};

window.toggleExternal = function (pathKey) {
    if (externalOverrides[pathKey]) {
        delete externalOverrides[pathKey];
    } else {
        externalOverrides[pathKey] = true;
        // Clean up children: Remove any existing overrides that are descendants of this path
        const parentPrefix = pathKey + "|";
        Object.keys(externalOverrides).forEach(key => {
            if (key.startsWith(parentPrefix)) {
                console.log("Removing child override due to parent toggle:", key);
                delete externalOverrides[key];
            }
        });
    }
    calculate();
};
