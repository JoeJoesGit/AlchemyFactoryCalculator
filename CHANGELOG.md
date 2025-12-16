# Alchemy Factory Planner - Changelog

## v42 - Format Restoration
* **Code:** Restored fully expanded CSS formatting to ensure code readability and correct line counts.
* **Verification:** Re-verified module execution order to ensure complex recipes (e.g., Healing Potion) trigger fuel demands correctly.

## v41 - Module Ordering Fix
* **Fix:** Fixed a critical logical bug where the Heat Module calculation ran before the Fertilizer Module.
* **Logic:** Fertilizer Module now calculates *first* so that its heat demand is correctly registered by the Heat Module.
* **Math:** Internal modules now correctly contribute to global summary statistics.

## v40 - UI Cleanup
* **UI:** Removed the "Show External Chain" toggles and checkboxes.
* **Logic:** The "External Inputs" section now displays automatically whenever a resource is not set to Self-Feed/Fertilize.

## v39 - Recursion & Visual Fixes
* **Fix:** Fixed a bug where the production tree disappeared if the Target Item was the same as the Fuel/Fertilizer source.
* **UI:** Changed the color of "Gold Cost" in the summary to Yellow (matching the tree) instead of Red.
* **UI:** Restored "Gross vs Net" deduction text in the summary box.

## v38 - Tree Pruning (Blueprint Mode)
* **Feature:** **Tree Pruning.** The Main Production Tree now hides fuel/fertilizer sub-chains if "Self-Feed" is active, reducing visual clutter.
* **Logic:** The "Internal Modules" section at the bottom now renders the *full* gross production chain for fuel/fertilizer (including the recursive cost).
* **Code:** Restored readable CSS formatting.

## v37 - Blueprint Layout Pivot
* **Layout:** **Blueprint View.** Split the display into three distinct sections:
    1.  **Primary Chain:** The main product and its direct ingredients.
    2.  **Internal Modules:** Consolidated production chains for self-feeding Fuel and Fertilizer.
    3.  **External Inputs:** A "Shopping List" of raw resources, gold, and imported fuel/fertilizer.
* **Summary:** Added "Internal Load" vs "External Load" to the summary box.

## v36 - Unified Tagging
* **Feature:** **Smart Tags.** Replaced old text tags with standardized data.
    * *Consumption:* `Heat: 26.0 P/s, Needs 32.5/m Charcoal Powder`.
    * *Production:* `Output: 288.00 V/s` (Only appears on active Fuel/Fertilizer items).
* **Feature:** **Number Abbreviation.** Large numbers now auto-format (e.g., `17.28k`, `1.25m`).

## v35 - Visual Overhaul & Sorting
* **UI:** **Row Numbers.** Added blue sequential row identifiers (e.g., `1)`, `2)`) to the far left of the tree.
* **Logic:** **Smart Sorting.** Ingredients are now always rendered *above* support/fuel nodes in the tree hierarchy.
* **UI:** Renamed "Stone Furnace" in the sidebar to "Stone Furnace (Minimum)" to clarify it represents total heat capacity.

## v34 - Visual Prototype
* **Internal:** Initial implementation of Row IDs and Tagging (superseded by v35/v36 logic).

## v33 - Externalized History
* **Maintenance:** Moved full changelog history to `CHANGELOG.md` to reduce HTML file size and prevent code truncation errors.
* **UI:** Updated in-app modal to show only the most recent changes and link to this file.

## v32 - Restored Features
* **Fix:** Restored the detailed Belt Load presets that were accidentally dropped in v30/v31.
* **Options:** Users can now select 1/32, 1/16, 1/8, 1/4, 1/2, 2/3, and Full Belt loads again.

## v31 - Critical Stability Fixes
* **Fix:** Fixed a "Calculation Error: targetItemDef is not defined" crash that occurred when calculating profit.
* **Fix:** Fixed "Cannot read property 'checked' of null" error by restoring missing IDs to the "Show External Chain" checkboxes.
* **Code:** Added null-checks to document.getElementById calls to prevent future crashes if UI elements are modified.

## v30 - Logic Rebuild
* **Refactor:** Rolled back core calculation logic to the stable v24 base to eliminate "GrossRate" errors.
* **Feature:** Re-integrated the "Recipe Swapping" logic and "Chunky Spinners" on top of the stable base.
* **Safety:** Added order-of-operation sanitization to ensure variables are defined before use.

## v29 - UI Hotfix
* **Fix:** Restored missing HTML elements for external chain toggles that caused immediate crashes on load in v27/v28.

## v28 - Code Restoration
* **Fix:** Addressed an issue where the code generator truncated ~150 lines of code, breaking the recursive calculation engine.
* **Fix:** Manually merged v26 features with v27 safety checks.

## v27 - Safe Mode & Auto-Repair
* **Feature:** Added "Auto-Repair" logic on startup. If the app detects old save data (missing IDs from v24/v25), it attempts to migrate settings rather than crashing.
* **UX:** Added `try/catch` blocks around the main calculator to show helpful alert messages instead of a blank screen on error.

## v26 - UX Overhaul & Alternate Recipes
* **Feature:** **Recipe Swapping.** Added a cycle icon (🔄) next to items in the tree. Clicking it opens a modal to select alternate recipes (e.g., making Sand from Stone vs. Salt).
* **Feature:** **Chunky Spinners.** Replaced standard browser input arrows with large, touch-friendly `[ - ]` and `[ + ]` buttons spanning the full height of input boxes.
* **Database:** Updated logic to handle preferred recipe IDs in local storage.

## v25 - GitHub Polish
* **UI:** Cleaned up "Export to File" button text.
* **UI:** Made the version number in the header clickable to open the internal Changelog modal.
* **Data:** Verified fertilizer and fuel values against the game Codex.

## v24 - Persistence
* **Feature:** **Local Storage.** The app now automatically saves your upgrade levels, default settings, and preferences to the browser.
* **Feature:** Added "Factory Reset" button to wipe local data and reload defaults from `alchemy_db.js`.

## v23 - Default Logistics
* **Feature:** Added a "Defaults" panel in the right column.
* **Logic:** Users can set a Global Default Fuel and Fertilizer that auto-populates the logistics dropdowns on page load.

## v22 - Layout & Tiers
* **UI:** Moved to a **3-Column Layout** (Inputs | Tree | Upgrades) for better use of screen real estate.
* **Logic:** Implemented tiered upgrade logic (diminishing returns or step-functions) for Belt Speed and Factory Efficiency.
* **Logic:** Added specific machine boosts (e.g., Alchemy Skill affecting Alembics/Extractors specifically).

## v21 - Belt Presets
* **Feature:** Added a "Belt Load" dropdown.
* **Logic:** Users can select a percentage of a max belt (based on current belt level) rather than typing items/min manually.

## v20 - Rendering Fixes
* **Fix:** Resolved a recursion display bug where internal support nodes (injecting into the main tree) were not rendering visible children.

## v19 - Net Logistics
* **Math:** Implemented "Net Energy" and "Net Nutrient" math.
* **Logic:** The calculator now accounts for the fuel consumed by the fuel production chain itself (the "Self-Feeding Tax").

## v18 - In-Line Injection
* **UI:** Support chains (Fuel/Fertilizer) now inject directly into the main tree hierarchy under the specific machines consuming them, rather than only appearing as separate isolated trees.

## v17 - Construction List
* **Feature:** Added a "Construction List" sidebar.
* **Logic:** Sums total machine counts across all active chains and calculates required parent furnaces.