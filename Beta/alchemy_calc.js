/* ==========================================================================
   ALCHEMY CALCULATOR CORE ENGINE
   Handles recursion, math, and tree node generation.
   ========================================================================== */

let rowCounter = 0; 
let globalByproducts = {};
let activeRecyclers = {}; // { "path_to_node": true }

/* ==========================================================================
   SECTION: HELPER MATH FUNCTIONS
   ========================================================================== */
function getBeltSpeed(lvl) { let s = 60; if(lvl>0) s += Math.min(lvl,12)*15; if(lvl>12) s += (lvl-12)*3; return s; }
function getSpeedMult(lvl) { let m = 1.0; m += Math.min(lvl,12)*0.25; if(lvl>12) m += (lvl-12)*0.05; return m; }
function getAlchemyMult(lvl) { if(lvl<=0) return 1.0; let p = 0; for(let i=1; i<=lvl; i++) { if(i<=2) p+=6; else if(i<=8) p+=8; else p+=10; } return 1.0 + (p/100); }

function getRecipesFor(item) { if(!DB.recipes) return []; return DB.recipes.filter(r => r.outputs[item]); }
function getActiveRecipe(item) {
    const candidates = getRecipesFor(item);
    if(candidates.length === 0) return null; if(candidates.length === 1) return candidates[0];
    const prefId = DB.settings.preferredRecipes[item];
    if(prefId) { const found = candidates.find(r => r.id === prefId); if(found) return found; }
    return candidates[0];
}

function getProductionHeatCost(item, speedMult, alchemyMult) {
    let cost = 0; const recipe = getActiveRecipe(item);
    if (recipe && recipe.outputs[item]) {
         let batchYield = recipe.outputs[item];
         if (recipe.machine === "Extractor" || recipe.machine === "Alembic") batchYield *= alchemyMult;
         if (DB.machines[recipe.machine] && DB.machines[recipe.machine].heatCost) {
            const mach = DB.machines[recipe.machine]; const parent = DB.machines[mach.parent];
            const slotsReq = mach.slotsRequired || 1; const pSlots = mach.parentSlots || parent.slots || 3;
            const heatPs = (mach.heatCost * speedMult) + (parent.heatSelf / (pSlots/slotsReq)); 
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
        if (recipe.machine === "Extractor" || recipe.machine === "Alembic") batchYield *= alchemyMult;
        Object.keys(recipe.inputs).forEach(k => { 
            cost += getProductionFertCost(k, fertVal, fertSpeed, speedMult, alchemyMult) * (recipe.inputs[k] / batchYield); 
        });
    }
    return cost;
}

function formatVal(val) { if(val >= 1000000) return (val/1000000).toFixed(2) + 'm'; if(val >= 10000) return (val/1000).toFixed(2) + 'k'; return val.toFixed(2); }

/* ==========================================================================
   SECTION: CALCULATION ENGINE
   ========================================================================== */
function calculate() {
    try {
        if(!DB || !DB.recipes) return;
        
        // 1. Gather Inputs
        let rawInput = document.getElementById('targetItemInput').value.trim();
        let targetItem = Object.keys(DB.items).find(k => k.toLowerCase() === rawInput.toLowerCase()) || rawInput;
        const targetRate = parseFloat(document.getElementById('targetRate').value) || 0;
        
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
            document.getElementById('rateLabel').innerText = `Rate (Items/Min): ${lbl}`;
        }

        // --- PASS 1: GHOST CALCULATION (Discovery) ---
        globalByproducts = {}; 
        calculatePass(params, true); 

        // --- PASS 2: RENDER (Final) ---
        rowCounter = 0;
        document.getElementById('tree').innerHTML = '';
        calculatePass(params, false); 

    } catch(e) { console.error(e); }
}

function calculatePass(p, isGhost) {
    // Re-calc basic inputs
    const fuelDef = DB.items[p.selectedFuel] || {};
    let netFuelEnergy = (fuelDef.heat || 10) * p.fuelMult; const grossFuelEnergy = netFuelEnergy; 
    if (p.selfFeed) { netFuelEnergy -= getProductionHeatCost(p.selectedFuel, p.speedMult, p.alchemyMult); }
    if(netFuelEnergy <= 0) netFuelEnergy = 0.1; 

    const fertDef = DB.items[p.selectedFert] || { nutrientValue: 144, maxFertility: 12 };
    let netFertVal = fertDef.nutrientValue * p.fertMult; const grossFertVal = netFertVal;
    if (p.selfFert) { netFertVal -= getProductionFertCost(p.selectedFert, netFertVal, fertDef.maxFertility, p.speedMult, p.alchemyMult); }
    if(netFertVal <= 0) netFertVal = 0.1;

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
    
    let isAbsorbedFuel = (p.selfFeed && p.targetItem === p.selectedFuel);
    let isAbsorbedFert = (p.selfFert && p.targetItem === p.selectedFert);

    if (!isGhost) {
        // Reset globals for simulation
        globalByproducts = {};
        globalFuelDemandItems = 0; globalFertDemandItems = 0; globalHeatLoad = 0; globalBioLoad = 0; globalCostPerMin = 0;
        
        // 1. Base Snapshot: Run Primary Chain (Measurement Mode = true)
        buildNode(p.targetItem, p.targetRate, false, [], true, true); 
        let baseSnapshot = {...globalByproducts}; 
        
        // Default stable state
        stableByproducts = {...baseSnapshot};
        
        // 2. Stabilization Loop
        if (p.selfFeed || p.selfFert) {
            let seedByproducts = {};
            if (!isAbsorbedFuel && !isAbsorbedFert) {
                seedByproducts = {...baseSnapshot};
            }

            let lastPassGenerated = {}; 

            for(let i=0; i<10; i++) {
                // Setup Environment
                globalByproducts = {...seedByproducts};
                Object.keys(lastPassGenerated).forEach(k => {
                    if(!globalByproducts[k]) globalByproducts[k] = 0;
                    globalByproducts[k] += lastPassGenerated[k];
                });

                trackGeneration = true; 
                iterationGenerated = {};
                
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
                
                lastPassGenerated = {...iterationGenerated};
                
                let nextFuel = globalFuelDemandItems;
                let nextFert = globalFertDemandItems;
                
                if (Math.abs(nextFuel - prevFuel) < 0.01 && Math.abs(nextFert - prevFert) < 0.01) {
                    stableFuelDemand = nextFuel;
                    stableFertDemand = nextFert;
                    break;
                }
                stableFuelDemand = nextFuel;
                stableFertDemand = nextFert;
            }
            
            // Capture Final State (One last measurement pass at stable rate)
            globalByproducts = {}; 
            if (!isAbsorbedFuel && !isAbsorbedFert) {
                globalByproducts = {...baseSnapshot};
            }
            
            if (isAbsorbedFuel) {
                buildNode(p.targetItem, p.targetRate + stableFuelDemand, false, [], true, true);
            } else if (isAbsorbedFert) {
                buildNode(p.targetItem, p.targetRate + stableFertDemand, false, [], true, true);
            } else {
                if (p.selfFeed && stableFuelDemand > 0) buildNode(p.selectedFuel, stableFuelDemand, true, [], true, true);
                if (p.selfFert && stableFertDemand > 0) buildNode(p.selectedFert, stableFertDemand, true, [], true, true);
            }
            
            stableByproducts = {...globalByproducts};
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
        
        // Apply Stable Byproducts
        globalByproducts = {...stableByproducts};
        
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

    // Recursive Builder
    function buildNode(item, rate, isInternalModule, ancestors = [], forceGhost = false, isMeasurement = false) {
        const effectiveGhost = isGhost || forceGhost;

        // RECYCLING CHECK
        let deduction = 0;
        let pathKey = ancestors.join(">") + ">" + item;
        let canRecycle = false;
        
        // FIX: Always show button if active, even if pool is empty
        if (!isMeasurement && activeRecyclers[pathKey]) {
             canRecycle = true;
             if (globalByproducts[item] > 0.01) {
                 deduction = Math.min(rate, globalByproducts[item]);
                 globalByproducts[item] -= deduction; 
             }
        } else if (!effectiveGhost && globalByproducts[item] > 0.01) {
             canRecycle = true;
        }

        const netRate = Math.max(0, rate - deduction);
        const itemDef = DB.items[item] || {}; 
        let ingredientChildren = []; 
        let currentPath = [...ancestors, item];
        let myRowID = 0;
        
        if (!effectiveGhost) { rowCounter++; myRowID = rowCounter; }

        let outputTag = ""; let machineTag = ""; let heatTag = ""; let swapBtn = ""; 
        let bioTag = ""; let costTag = ""; let detailsTag = ""; let recycleTag = "";
        let machinesNeeded = 0; let hasChildren = false;

        let isFuel = (item === p.selectedFuel); let isFert = (item === p.selectedFert);
        if(isFuel) { outputTag = `<span class="output-tag">Output: ${formatVal((rate * (fuelDef.heat||10)*p.fuelMult)/60)} P/s</span>`; }
        else if (isFert) { outputTag = `<span class="output-tag">Output: ${formatVal((rate * fertDef.nutrientValue*p.fertMult)/60)} V/s</span>`; }

        // --- RECYCLE UI ---
        if (canRecycle && !effectiveGhost) {
            if (activeRecyclers[pathKey]) {
                let activeClass = "active";
                let label = `♻️ ${formatVal(deduction)} Used`;
                recycleTag = `<div class="push-right"><button class="recycle-btn ${activeClass}" onclick="toggleRecycle('${pathKey}')">${label}</button></div>`;
            } else {
                let label = `♻️ ${formatVal(globalByproducts[item])} Avail`;
                recycleTag = `<div class="push-right"><button class="recycle-btn" onclick="toggleRecycle('${pathKey}')">${label}</button></div>`;
            }
        }

        // Logic branching based on Item Type
        if (itemDef.category === "Herbs" && itemDef.nutrientCost) {
            const fertilitySpeed = (fertDef.maxFertility || 12); const timePerItem = itemDef.nutrientCost / fertilitySpeed; 
            const calculatedSpeed = (60 / timePerItem) * p.speedMult; 
            const isLiquid = (itemDef.liquid === true);
            const itemsPerMinPerMachine = isLiquid ? calculatedSpeed : Math.min(calculatedSpeed, p.beltSpeed);
            
            machinesNeeded = netRate / itemsPerMinPerMachine;
            if (Math.abs(Math.round(machinesNeeded) - machinesNeeded) < 0.0001) { machinesNeeded = Math.round(machinesNeeded); }

            if(!effectiveGhost) {
                addMachineCount("Nursery", item, Math.ceil(machinesNeeded - 0.0001), machinesNeeded);
            }

            const totalNutrientsNeeded = netRate * itemDef.nutrientCost; const itemsNeeded = totalNutrientsNeeded / grossFertVal; 
            
            // ACCUMULATION
            if (effectiveGhost || !isInternalModule || isInternalModule) {
                globalFertDemandItems += itemsNeeded; 
                globalBioLoad += (totalNutrientsNeeded / 60); 
            }
            
            if(!effectiveGhost) {
                let tooltipText = `Recipe: ${item} (Nursery)\nBase Time: ${(timePerItem * (60/p.speedMult)).toFixed(1)}s\nSpeed Mult: ${p.speedMult.toFixed(2)}x\nThroughput: ${itemsPerMinPerMachine.toFixed(2)} items/min`;
                let capTag = "";
                if(p.showMax) {
                    const maxOutput = Math.ceil(machinesNeeded) * itemsPerMinPerMachine;
                    capTag = `<span class="max-cap-tag">(Max: ${formatVal(maxOutput)}/m)</span>`;
                }
                machineTag = `<span class="machine-tag" title="${tooltipText}">${Math.ceil(machinesNeeded)} Nursery${capTag}</span>`;
                bioTag = `<span class="bio-tag">Nutr: ${formatVal(netRate * itemDef.nutrientCost / 60)} V/s, Needs ${(netRate * itemDef.nutrientCost / grossFertVal).toFixed(1)}/m ${p.selectedFert}</span>`;
            }
        } 
        else {
            const recipe = getActiveRecipe(item);
            if (!recipe) {
                if(!effectiveGhost) {
                    if(itemDef.buyPrice) { 
                        let c = netRate * itemDef.buyPrice; 
                        globalCostPerMin += c; 
                        costTag = `<span class="cost-tag">${Math.ceil(c).toLocaleString()} G/m</span>`; 
                    }
                    detailsTag = `<span class="details">(Raw Input)</span>`;
                }
            } else {
                hasChildren = true;
                let batchYield = recipe.outputs[item] || 1;
                if (recipe.machine === "Extractor" || recipe.machine === "Alembic") batchYield *= p.alchemyMult;
                
                const batchesPerMin = netRate / batchYield;
                const maxBatchesPerMin = (60 / recipe.baseTime) * p.speedMult;
                const isLiquid = (itemDef.liquid === true);
                let effectiveBatchesPerMin = maxBatchesPerMin;
                
                if (!isLiquid) {
                    const maxItemsPerMin = maxBatchesPerMin * batchYield;
                    if (maxItemsPerMin > p.beltSpeed) { effectiveBatchesPerMin = p.beltSpeed / batchYield; }
                }
                
                let rawMachines = batchesPerMin / effectiveBatchesPerMin;
                if (Math.abs(Math.round(rawMachines) - rawMachines) < 0.0001) { rawMachines = Math.round(rawMachines); }
                machinesNeeded = rawMachines;
                
                Object.keys(recipe.outputs).forEach(outKey => {
                    if (outKey !== item) {
                        let yieldPerBatch = recipe.outputs[outKey];
                        let totalByproduct = batchesPerMin * yieldPerBatch; 
                        
                        // TRACKING
                        if (trackGeneration) {
                            if (!iterationGenerated[outKey]) iterationGenerated[outKey] = 0;
                            iterationGenerated[outKey] += totalByproduct;
                        }

                        // FIX: Accumulate Global Byproducts during Render Phase too (Just-In-Time Availability)
                        if (effectiveGhost || !isInternalModule || !effectiveGhost) { 
                            // Note: '!effectiveGhost' covers the Render Pass. 
                            if(!globalByproducts[outKey]) globalByproducts[outKey] = 0;
                            globalByproducts[outKey] += totalByproduct;
                        }
                        
                        if (!effectiveGhost) {
                            if(!totalByproducts[outKey]) totalByproducts[outKey] = 0;
                            totalByproducts[outKey] += totalByproduct;
                        }
                    }
                });

                if(!effectiveGhost) {
                    addMachineCount(recipe.machine, item, Math.ceil(machinesNeeded - 0.0001), machinesNeeded);
                }

                // HEAT CALCULATION
                if (DB.machines[recipe.machine] && DB.machines[recipe.machine].heatCost) {
                    const mach = DB.machines[recipe.machine]; const parent = DB.machines[mach.parent];
                    const sReq = mach.slotsRequired || 1; const pSlots = mach.parentSlots || parent.slots || 3;
                    const activeHeat = mach.heatCost * p.speedMult; 
                    
                    const nodeParentsNeeded = Math.ceil((machinesNeeded / (pSlots/sReq)) - 0.0001);
                    const totalHeatPs = (nodeParentsNeeded * parent.heatSelf * p.speedMult) + (machinesNeeded * activeHeat);
                    
                    if (!effectiveGhost) {
                        const pName = mach.parent; 
                        if (!furnaceSlotDemand[pName]) furnaceSlotDemand[pName] = 0;
                        furnaceSlotDemand[pName] += Math.ceil(machinesNeeded - 0.0001) * sReq;
                    }
                    
                    // ACCUMULATION
                    if (effectiveGhost || !isInternalModule || isInternalModule) {
                        globalHeatLoad += totalHeatPs; 
                        globalFuelDemandItems += (totalHeatPs * 60) / grossFuelEnergy;
                    }
                    
                    if(!effectiveGhost) {
                        heatTag = `<span class="heat-tag">Heat: ${totalHeatPs.toFixed(1)} P/s, Needs ${((totalHeatPs * 60) / grossFuelEnergy).toFixed(1)}/m ${p.selectedFuel}</span>`;
                    }
                }

                if(!effectiveGhost) {
                    let inputsStr = Object.keys(recipe.inputs).map(k => `${recipe.inputs[k]} ${k}`).join(', ');
                    let outputsStr = Object.keys(recipe.outputs).map(k => `${recipe.outputs[k]} ${k}`).join(', ');
                    let cycleTime = recipe.baseTime / p.speedMult;
                    let throughput = effectiveBatchesPerMin * batchYield;
                    let tooltipText = `Recipe: ${inputsStr} -> ${outputsStr}\nBase Time: ${recipe.baseTime}s\nSpeed Mult: ${p.speedMult.toFixed(2)}x\nCycle Time: ${cycleTime.toFixed(2)}s\nThroughput: ${throughput.toFixed(2)} items/min per machine`;

                    let capTag = "";
                    if(p.showMax) {
                        const maxOutput = Math.ceil(machinesNeeded) * throughput;
                        capTag = `<span class="max-cap-tag">(Max: ${formatVal(maxOutput)}/m)</span>`;
                    }
                    machineTag = `<span class="machine-tag" title="${tooltipText}">${Math.ceil(machinesNeeded)} ${recipe.machine}s${capTag}</span>`;

                    const alts = getRecipesFor(item);
                    if(alts.length > 1) { 
                        swapBtn = `<button class="swap-btn" onclick="openRecipeModal('${item}', this.parentElement)" title="Swap Recipe">🔄</button>`; 
                    }
                }
                
                // RECURSE INPUTS
                if (netRate > 0.0001) {
                    const netBatches = netRate / batchYield;
                    Object.keys(recipe.inputs).forEach(iName => {
                        let qtyPerBatch = recipe.inputs[iName];
                        let requiredInputRate = netBatches * qtyPerBatch;
                        ingredientChildren.push({ type: 'input', item: iName, rate: requiredInputRate });
                    });
                }
            }
        }

        if (effectiveGhost) {
            ingredientChildren.forEach(child => { 
                buildNode(child.item, child.rate, isInternalModule, currentPath, effectiveGhost, isMeasurement); 
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
            <span class="item-link" onclick="openDrillDown('${item}', ${rate})"><strong>${item}</strong></span>
            ${swapBtn}
            ${detailsTag}
            ${costTag}
            ${machineTag}
            ${bioTag}
            ${heatTag}
            ${outputTag}
            ${recycleTag}
        `;

        div.innerHTML = `<div class="node-content" data-ancestors='${JSON.stringify(ancestors)}'>${nodeContent}</div>`;
        if (ingredientChildren.length > 0) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'node-children';
            ingredientChildren.forEach(child => { 
                childrenDiv.appendChild(buildNode(child.item, child.rate, isInternalModule, currentPath, effectiveGhost, isMeasurement)); 
            });
            div.appendChild(childrenDiv);
        }
        return div;
    }

    // --- EXECUTE THE PASS (RENDER PHASE) ---
    if(p.targetItem) {
        const root = buildNode(p.targetItem, primaryRenderRate, false, []);
        if(!isGhost) {
            let label = `--- Primary Production Chain (${p.targetItem}) ---`;
            if (absorbedFuel && absorbedFert) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">(Includes Internal Fuel & Fert)</span>`; }
            else if (absorbedFuel) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">(Includes Internal Fuel)</span>`; }
            else if (absorbedFert) { label += ` <span style="font-size:0.8em; color:#aaa; font-style:italic;">(Includes Internal Fert)</span>`; }

            const h = document.createElement('div'); h.className = 'section-header'; h.innerHTML = label; treeContainer.appendChild(h); 
            treeContainer.appendChild(root);
        }
    }

    if (!isGhost) {
        if (p.selfFert && stableFertDemand > 0) {
            const grossFertNeeded = stableFertDemand;
            if (absorbedFert) {
                const note = document.createElement('div'); note.innerHTML = `<div class="node" style="margin-top:20px; color:#aaa; font-style:italic;">Internal Nutrient Source: <strong>${p.selectedFert}</strong> (Supplied by Main Output)<br>Total Required: ${grossFertNeeded.toFixed(1)}/m</div>`; treeContainer.appendChild(note);
            } else {
                const h = document.createElement('div'); h.className = 'section-header'; h.innerText = `--- Internal Nutrient Module (${p.selectedFert}) ---`; treeContainer.appendChild(h); rowCounter=0; 
                treeContainer.appendChild(buildNode(p.selectedFert, grossFertNeeded, true, []));
            }
        }

        if (p.selfFeed && stableFuelDemand > 0) {
            const grossFuelNeeded = stableFuelDemand;
            if (absorbedFuel) {
                const note = document.createElement('div'); note.innerHTML = `<div class="node" style="margin-top:20px; color:#aaa; font-style:italic;">Internal Fuel Source: <strong>${p.selectedFuel}</strong> (Supplied by Main Output)<br>Total Required: ${grossFuelNeeded.toFixed(1)}/m</div>`; treeContainer.appendChild(note);
            } else {
                const h = document.createElement('div'); h.className = 'section-header'; h.innerText = `--- Internal Heat Module (${p.selectedFuel}) ---`; treeContainer.appendChild(h); rowCounter=0; 
                treeContainer.appendChild(buildNode(p.selectedFuel, grossFuelNeeded, true, []));
            }
        }
    }

    if (!isGhost) {
        // --- SUMMARY & EXTERNALS ---
        const extH = document.createElement('div'); extH.className = 'section-header'; extH.innerText = `--- External Inputs ---`; treeContainer.appendChild(extH);
        const extDiv = document.createElement('div'); extDiv.className = 'node';
        let extHTML = `<div class="node-content" style="margin-bottom:5px;"><span class="qty" style="color:var(--gold)">${Math.ceil(globalCostPerMin).toLocaleString()} G/m</span><strong>Raw Material Cost</strong></div>`;
        
        if (!p.selfFeed && globalFuelDemandItems > 0) { extHTML += `<div class="node-content" style="margin-bottom:5px;"><span class="qty" style="color:var(--fuel)">${globalFuelDemandItems.toFixed(1)}/m</span><strong>${p.selectedFuel}</strong> (Fuel Import)</div>`; }
        if (!p.selfFert && globalFertDemandItems > 0) { extHTML += `<div class="node-content" style="margin-bottom:5px;"><span class="qty" style="color:var(--bio)">${globalFertDemandItems.toFixed(1)}/m</span><strong>${p.selectedFert}</strong> (Fertilizer Import)</div>`; }
        
        extDiv.innerHTML = extHTML; treeContainer.appendChild(extDiv);

        const bypHeader = document.createElement('div'); bypHeader.className = 'section-header'; bypHeader.innerText = `--- BYPRODUCTS ---`; treeContainer.appendChild(bypHeader);
        const bypDiv = document.createElement('div'); bypDiv.className = 'node';
        let bypHTML = '';
        const sortedByproducts = Object.keys(totalByproducts).sort();
        if (sortedByproducts.length > 0) {
            sortedByproducts.forEach(item => {
                let remaining = globalByproducts[item] || 0; 
                let note = "";
                if (remaining < totalByproducts[item]) {
                    note = ` <span style="font-size:0.8em; color:#888;">(${formatVal(totalByproducts[item] - remaining)} recycled)</span>`;
                }
                bypHTML += `<div class="node-content"><span class="qty" style="color:var(--byproduct)">${formatVal(remaining)}/m</span><strong>${item}</strong>${note}</div>`;
            });
        } else {
            bypHTML = `<div class="node-content"><span class="details" style="font-style:italic">None</span></div>`;
        }
        bypDiv.innerHTML = bypHTML; treeContainer.appendChild(bypDiv);

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
                totalFurnaces += Math.ceil((furnaceSlotDemand[parentName] - 0.0001) / (parentDef.slots || 3));
            }
        });

        updateConstructionList(flatMax, flatMin, totalFurnaces);
        
        updateSummaryBox(p, globalHeatLoad, globalBioLoad, globalCostPerMin, primaryRenderRate, globalFuelDemandItems, globalFertDemandItems);
    }
}