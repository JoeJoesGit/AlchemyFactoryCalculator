# User Roadmap (Future Sessions)

## Data & Logic Improvements
- [ ] **Blast Furnace Implementation** (Logic for different heat/slots vs Stone Furnace)
- [ ] **Tiered Item Availability** (Parse from faultyd3v repo, limit selection/recipes by tier)
- [ ] **Best Recipe Solver** (Suggest best option by cost/efficiency/tier)
- [ ] **Replace `eval()` in DB editor** with safer JSON parsing

## UI / UX Improvements
- [ ] **Construction List Overhaul**: Show Machine Usage (Item/Count) instead of Cost breakdown (keep total at bottom).
- [ ] **External Feed Toggle**: Mark row as externally fed -> remove sub-chain from calc. Reset on target change.
- [ ] **Recycling UX**: 
    - [ ] Reset recycling choices when target changes.
    - [ ] Toggle recycling from Byproducts list directly?
    - [ ] Indicate source row/item for byproducts in the list.
- [ ] **Layout Optimization**:
    - [ ] Collapsible/Minimizable sections (Upgrades, Logistics, etc.)
    - [ ] Move/Collapse External Inputs & Byproducts (currently too far down).
    - [ ] Visual Hierarchy: Color-coded indentation/bars for Production Chain depth.
- [ ] **Notifications**: Replace annoying alerts with fading toast messages (Top Header).
- [x] **Numeric Formatting**:
    - [x] Net Output to 2 decimal places.
    - [x] Abbreviated Large Numbers (15.00k/m) implementation.
- [ ] **Interaction**:
    - [ ] Hover/Click Construction Item -> Highlight relevant machines in Tree.
    - [ ] Improved hover tooltip for Recipe on machines.

## Features
- [ ] **Shareable Links**: Encode Item/Rate/Settings into URL for sharing.
- [ ] **Export Chain**: Text/Markdown export for Discord/Copy-paste.
- [ ] **Machine-Based Targeting**: Set rate by "X Full Machines" (e.g. 4 Athanors @ 100%) vs just items/min.
- [ ] **Help System**: Info buttons/Help file for each section.

## Other
- [ ] Add start script / package.json
