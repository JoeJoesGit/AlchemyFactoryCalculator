# User Roadmap (Future Sessions)

## Data & Logic Improvements
- [ ] **Blast Furnace Implementation** (Logic for different heat/slots vs Stone Furnace)
- [ ] **Tiered Item Availability** (Parse from faultyd3v repo, limit selection/recipes by tier)
- [ ] **Best Recipe Solver** (Suggest best option by cost/efficiency/tier)
- [ ] **Replace `eval()` in DB editor** with safer JSON parsing
- [ ] **Extreme Code Compression (Phase 2)**:
    - Implement Binary Bit-Packing to reduce share code length to ~30-40 chars.
    - Replace JSON+Gzip with custom binary schema.

## UI / UX Improvements
- [x] **Construction List Overhaul**: Show Machine Usage (Item/Count) instead of Cost breakdown (keep total at bottom).
- [x] **External Feed Toggle**: Mark row as externally fed -> remove sub-chain from calc. Reset on target change.
- [ ] **Recycling UX**: 
    - [x] Reset recycling choices when target changes.
    - [x] Toggle recycling from Byproducts list directly?
    - [ ] Indicate source row/item for byproducts in the list.
- [ ] **Layout Optimization**:
    - [x] Collapsible/Minimizable sections (Upgrades, Logistics, etc.)
    - [x] Move/Collapse External Inputs & Byproducts (currently too far down).
    - [x] Visual Hierarchy: Color-coded indentation/bars for Production Chain depth.
- [ ] **Notifications**: Replace annoying alerts with fading toast messages (Top Header).
- [x] **Numeric Formatting**:
    - [x] Net Output to 2 decimal places.
    - [x] Abbreviated Large Numbers (15.00k/m) implementation.
- [ ] **Interaction**:
    - [x] Hover/Click Construction Item -> Highlight relevant machines in Tree.
    - [ ] Improved hover tooltip for Recipe on machines.

## Features
- [x] **Shareable Links**: Encode Item/Rate/Settings into URL for sharing.
- [ ] **Export Chain**: Text/Markdown export for Discord/Copy-paste.
- [ ] **Machine-Based Targeting**: Set rate by "X Full Machines" (e.g. 4 Athanors @ 100%) vs just items/min.
- [ ] **Help System**: Info buttons/Help file for each section.

## Other
- [ ] Add start script / package.json
- [ ] Fix world tree and related items (To begin harvesting from the World Tree, it must first grow from a sapling into a full tree, but this process can be ignored for the purposes of the simulator. A fully grown World Tree (without upgrades) consumes 20,000 NV/s (this ignores the NV/s of fertilizer input) and produces an item every 3 seconds. After outputting 99 leaves, it will output one core on the 100th output, then return to leaf output.)
- [x] advanced alembic should have alchemy skill upgrades affect it
- [x] Gentian Nectar needs handling as byproduct and functionality adjustment so recipes work correctly with it (doesn't show as byproduct, doesn't show as using a Nursery, isn't really a liquid)
