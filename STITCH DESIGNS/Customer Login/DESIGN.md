# Design System Specification: The Precision Press

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Blueprint"**
In the world of high-volume industrial printing, precision is the only currency. This design system moves away from the "generic SaaS" aesthetic of floating cards and bubbly buttons. Instead, it adopts an editorial, architectural approach. It treats the interface as a masterwork of layout—where dense information is organized through structural hierarchy, tonal layering, and sophisticated typography. 

By leveraging **Intentional Asymmetry** and **Structural Depth**, we create a space that feels like a high-end command center: authoritative, reliable, and meticulously organized. We break the "template" look by favoring wide-set margins, overlapping navigational layers, and a radical rejection of traditional borders.

---

## 2. Colors & Surface Logic
The palette is rooted in a deep, authoritative Indigo, punctuated by technical Teal and Purple accents that signify high-value actions and system status.

### The "No-Line" Rule
To achieve a premium, editorial feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through:
*   **Tonal Shifts:** Placing a `surface-container-low` section against a `surface` background.
*   **Negative Space:** Using generous gutters to let the eye define the edge.
*   **Value Contrast:** High-contrast text against subtle background shifts.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of premium cardstock.
*   **Base Layer:** `surface` (#f8f9fa) — The foundation of the application.
*   **The "Work Tray":** `surface-container-low` — Used for secondary sidebars or utility panels.
*   **The "Active Sheet":** `surface-container-lowest` (#ffffff) — Reserved for primary content cards and data tables.
*   **The "Command Layer":** `surface-container-highest` — For high-impact modal headers or deep-nested utility.

### The "Glass & Gradient" Rule
For floating elements (Tooltips, Dropdowns, Hover states), utilize **Glassmorphism**. Use semi-transparent surface colors with a `20px` backdrop-blur. 
*   **Signature Textures:** Main CTAs should utilize a subtle linear gradient from `primary` (#00236f) to `primary_container` (#1e3a8a) at a 135-degree angle. This adds a "lithographic" depth that flat colors cannot replicate.

---

## 3. Typography
We utilize a dual-font strategy to balance industrial precision with editorial authority.

*   **Display & Headlines (Manrope):** Chosen for its geometric stability and modern "tech-heavy" feel. 
    *   *Role:* High-level data summaries, Page titles, and Branding.
*   **Body & Labels (Inter):** The workhorse of the system. 
    *   *Role:* All functional data, inputs, and dense tables.

**The Hierarchy of Reliability:**
*   **Display LG (3.5rem):** Used for single-source-of-truth metrics (e.g., total impressions).
*   **Headline SM (1.5rem):** The standard for card titles and section headers.
*   **Label MD (0.75rem):** High-contrast, semi-bold Inter for metadata labels, ensuring clarity at high density.

---

## 4. Elevation & Depth
Depth is a tool for navigation, not just decoration. We use **Tonal Layering** over traditional drop shadows.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft "lift" that feels integrated into the architecture.
*   **Ambient Shadows:** If a card must float (e.g., an active print job being dragged), use an extra-diffused shadow: `0px 20px 40px rgba(0, 35, 111, 0.06)`. Note the tint—the shadow is a deep indigo, not gray, mimicking natural light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in complex data views, use the `outline_variant` token at **15% opacity**. Never use a 100% opaque border.

---

## 5. Components

### Buttons
*   **Primary:** Gradient-filled (Indigo palette), `lg` (1rem) corner radius. Use high-contrast white text.
*   **Secondary:** `surface_container_high` background with `primary` text. No border.
*   **Tertiary:** Ghost style. Only an icon and text, shifting to a subtle `surface_variant` on hover.

### Input Fields (The "Clean Edge" Input)
*   **Visual Style:** Borderless. Use a `surface-container-highest` background.
*   **State:** On focus, the background transitions to `surface-container-lowest` with a 2px `primary` bottom-stroke.
*   **Density:** Compact padding (8px 12px) to support enterprise-level data entry.

### Rounded Cards (16px / 1rem)
*   **Structure:** No dividers. Use `title-sm` headings and `body-sm` content separated by 16px of vertical space. 
*   **Interaction:** On hover, a card should shift from `surface-container-lowest` to a subtle gradient glow using the `secondary_fixed` (Teal) token at 5% opacity.

### Chips & Tags
*   **Status Tags:** Use `tertiary_container` (Purple) for "In Production" and `secondary_container` (Teal) for "Completed." These should have 0% opacity backgrounds with high-contrast text to keep the UI clean.

### Specialized Component: The Print Queue Strip
*   A dense, horizontal list item utilizing `surface-container-low`. Instead of dividers, each item is separated by a 4px vertical gap, allowing the `background` color to "bleed" through as a natural separator.

---

## 6. Do’s and Don’ts

### Do
*   **Do** favor vertical whitespace over horizontal lines to separate list items.
*   **Do** use the `tertiary` (Purple) accent sparingly for "high-value" or "premium" features.
*   **Do** align all text to a strict 4px baseline grid to maintain industrial precision.
*   **Do** use `backdrop-blur` on all overlay elements to maintain a sense of context.

### Don't
*   **Don't** use pure black (#000000) for text. Use `on_surface` to keep the palette sophisticated.
*   **Don't** use standard 1px borders to separate the sidebar from the main content; use a tonal shift from `surface` to `surface-container-low`.
*   **Don't** use generic icons. Use thin-stroke (1.5pt) geometric icons that match the weight of the Inter typeface.
*   **Don't** crowd the interface. Even in high-density views, maintain the "Editorial" feel through wide outer margins (32px+).