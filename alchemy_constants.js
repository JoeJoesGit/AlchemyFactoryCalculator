// alchemy_constants.js
// Holds configuration data for UI elements

const BELT_FRACTIONS = [
    // Low end precision (powers of 2 and 10)
    { n: 1, d: 64, label: null },      // ~0.015
    { n: 1, d: 32, label: "1/32" },    // ~0.031
    { n: 1, d: 24, label: null },      // ~0.041
    { n: 1, d: 20, label: null },      // 0.05
    { n: 1, d: 16, label: "1/16" },    // 0.0625
    { n: 1, d: 12, label: null },      // ~0.083
    { n: 1, d: 10, label: null },      // 0.1

    // Mid range (Standard factory ratios)
    { n: 1, d: 8, label: "1/8" },     // 0.125
    { n: 1, d: 6, label: "1/6" },     // ~0.166
    { n: 1, d: 5, label: "1/5" },     // 0.2
    { n: 1, d: 4, label: "1/4" },     // 0.25
    { n: 1, d: 3, label: "1/3" },     // ~0.333
    { n: 2, d: 5, label: null },      // 0.4

    // High range (Major splits)
    { n: 1, d: 2, label: "1/2" },     // 0.5
    { n: 3, d: 5, label: null },      // 0.6
    { n: 2, d: 3, label: "2/3" },     // ~0.666
    { n: 3, d: 4, label: "3/4" },     // 0.75
    { n: 4, d: 5, label: null },      // 0.8
    { n: 5, d: 6, label: "5/6" },     // ~0.833 (Unhidden per request)
    { n: 7, d: 8, label: null },      // 0.875 (Hidden per request)
    { n: 1, d: 1, label: "Full" }     // 1.0
];

// Helper: Get decimal value
function getFractionValue(fractionObj) {
    return fractionObj.n / fractionObj.d;
}

// Helper: Calculate items/min based on belt speed
function calculateRateFromFraction(fractionObj, currentBeltSpeed) {
    const value = getFractionValue(fractionObj);
    return value * currentBeltSpeed;
}

// Helper: Get Smart Text for Label
function getSmartLabel(currentRate, maxSpeed) {
    if (maxSpeed <= 0) return "0%";
    const ratio = currentRate / maxSpeed;

    // 1. Check for exact/near match in our constants
    const epsilon = 0.002;
    const match = BELT_FRACTIONS.find(f => Math.abs((f.n / f.d) - ratio) < epsilon);

    const percent = (ratio * 100).toFixed(1) + "%";

    if (match) {
        const fracStr = (match.n === 1 && match.d === 1) ? I18n.t("Full Belt") : I18n.t("{n}/{d} Belt", {n: match.n, d: match.d});
        const isApprox = Math.abs((match.n / match.d) - ratio) > 0.000001;
        const prefix = isApprox ? "~" : "";
        return `${prefix}${fracStr}, ${percent}`;
    }

    return I18n.t("{percent} Load", {percent: percent});
}

// --- ITEM ID REGISTRY (Auto-Generated 2026-01-10) ---
// Used for compact code import/export. 
// Index = ID. Value = Item Name.
const ITEM_REGISTRY = [
    "Adamant",
    "Advanced Fertilizer",
    "Aqua Vitae",
    "Bandage",
    "Basic Fertilizer",
    "Black Powder",
    "Blast Potion",
    "Brandy",
    "Brick",
    "Broken Shard",
    "Bronze Ingot",
    "Bronze Rivet",
    "Chamomile",
    "Chamomile Powder",
    "Chamomile Seeds",
    "Charcoal",
    "Charcoal Powder",
    "Clay",
    "Clay Powder",
    "Coal",
    "Coal Ore",
    "Coke",
    "Coke Powder",
    "Copper Bearing",
    "Copper Coin x50",
    "Copper Ingot",
    "Copper Powder",
    "Crown",
    "Crude Crystal",
    "Crude Gold Dust",
    "Crude Shard",
    "Crude Silver Powder",
    "Diamond",
    "Dull Shard",
    "Emerald",
    "Eternal Catalyst",
    "Fairy Dust",
    "Fairy Tear",
    "Fertile Catalyst",
    "Flax",
    "Flax Fiber",
    "Flax Seeds",
    "Fruit Wine",
    "Gentian",
    "Gentian Nectar",
    "Gentian Powder",
    "Gentian Seeds",
    "Glass",
    "Gloom Fungus",
    "Gloom Spores",
    "Gold Coin x50",
    "Gold Dust",
    "Gold Ingot",
    "Growth Potion",
    "Healing Potion",
    "Impure Copper Powder",
    "Impure Gold Dust",
    "Impure Silver Powder",
    "Iron Ingot",
    "Iron Nails",
    "Iron Ore",
    "Iron Sand",
    "Jupiter",
    "Lapis Lazuli",
    "Large Wooden Gear",
    "Lavender",
    "Lavender Essential Oil",
    "Lavender Seeds",
    "Limestone",
    "Limewater",
    "Linen",
    "Linen Rope",
    "Linen Thread",
    "Linseed Oil",
    "Logs",
    "Luna",
    "Malachite",
    "Mars",
    "Mercury",
    "Meteorite",
    "Moon Tear",
    "Moonlit Soap",
    "Mortar",
    "Oblivion Essence",
    "Obsidian",
    "Panacea Potion",
    "Perfect Diamond",
    "Perfumed Soap",
    "Perfumed Soap Powder",
    "Philosopher's Stone",
    "Plank",
    "Plant Ash",
    "Pocket Watch",
    "Polished Crystal",
    "Pure Gold Dust",
    "Pyrite Ore",
    "Quartz Ore",
    "Quicklime",
    "Quicklime Powder",
    "Quicksilver",
    "Redcurrant Seeds",
    "Redcurrant",
    "Resonant Catalyst",
    "Rock Salt",
    "Rotten Log",
    "Ruby",
    "Sage",
    "Sage Powder",
    "Sage Seeds",
    "Salt",
    "Salt Water",
    "Sand",
    "Sapphire",
    "Saturn",
    "Shattered Crystal",
    "Silver Amulet",
    "Silver Coin x50",
    "Silver Ingot",
    "Silver Powder",
    "Small Wooden Gear",
    "Soap",
    "Soap Powder",
    "Sol",
    "Star Dust",
    "Steel Gear",
    "Steel Ingot",
    "Stone",
    "Sulfur",
    "Sulfur Powder",
    "Sulfuric Acid",
    "Topaz",
    "Transformation Potion",
    "Turquoise",
    "Unstable Catalyst",
    "Venus",
    "Vitality Essence",
    "Vitality Potion",
    "Volcanic Ash",
    "Wooden Pulley",
    "World Tree Core",
    "World Tree Leaf",
    "World Tree Seed",
    "Yeast Powder",
    "Refined Sand 1",
    "Refined Sand 2",
    "Refined Sand 3",
    "Refined Sand 4",
    "Refined Sand 5",
    "Fully Refined Sand",
    "Gelatinous Gridlock",
    "Portal Sigil",
    "Copper Coin",
    "Silver Coin",
    "Gold Coin"
];

// --- CODE KEYS (Compact Serialization) ---
const CODE_KEYS = {
    // 1. Top Level
    "v": "v",
    "target": "t",
    "settings": "s",
    "upgrades": "u",
    "lists": "l",

    // 2. Target Keys
    "item": "i",
    "rate": "r",

    // 3. Settings Keys
    "fuel": "f",
    "fert": "e",
    "selfFeed": "sf",
    "selfFert": "se",
    "showMax": "sm",

    // 4. List Keys
    "preferred": "p",
    "recyclers": "y",
    "externals": "x"
};

// Reverse Map for Import
const REVERSE_CODE_KEYS = {};
for (let k in CODE_KEYS) {
    REVERSE_CODE_KEYS[CODE_KEYS[k]] = k;
}

// --- GAME LOGIC CAPS ---
const PIPE_CAP_PER_MIN = 999999999999; // update on 1/13/2026 fixed cap, but don't know what it's set to so making cap very high