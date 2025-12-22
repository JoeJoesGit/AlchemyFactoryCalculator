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
    { n: 1, d: 8,  label: "1/8" },     // 0.125
    { n: 1, d: 6,  label: "1/6" },     // ~0.166
    { n: 1, d: 5,  label: "1/5" },     // 0.2
    { n: 1, d: 4,  label: "1/4" },     // 0.25
    { n: 1, d: 3,  label: "1/3" },     // ~0.333
    { n: 2, d: 5,  label: null },      // 0.4
    
    // High range (Major splits)
    { n: 1, d: 2,  label: "1/2" },     // 0.5
    { n: 3, d: 5,  label: null },      // 0.6
    { n: 2, d: 3,  label: "2/3" },     // ~0.666
    { n: 3, d: 4,  label: "3/4" },     // 0.75
    { n: 4, d: 5,  label: null },      // 0.8
    { n: 5, d: 6,  label: "5/6" },     // ~0.833 (Unhidden per request)
    { n: 7, d: 8,  label: null },      // 0.875 (Hidden per request)
    { n: 1, d: 1,  label: "Full" }     // 1.0
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
    const match = BELT_FRACTIONS.find(f => Math.abs((f.n/f.d) - ratio) < epsilon);
    
    const percent = (ratio * 100).toFixed(1) + "%";
    
    if (match) {
        const fracStr = (match.n === 1 && match.d === 1) ? "Full Belt" : `${match.n}/${match.d} Belt`;
        const isApprox = Math.abs((match.n/match.d) - ratio) > 0.000001;
        const prefix = isApprox ? "~" : "";
        return `${prefix}${fracStr}, ${percent}`;
    }
    
    return `${percent} Load`;
}