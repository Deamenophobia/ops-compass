# Frontend design: soft daylight

The portal uses a warm cream canvas with lavender, mint and peach accents. Rounded
cards, quiet borders and a small compass character make it feel friendly during
daily maintenance. Technical detail stays in the handbook and the relevant tools.

## Implementation

- `softTheme.tsx` supplies the Backstage unified theme through `ThemeBlueprint`.
  It styles Material UI forms, buttons, cards, sidebar and headers across plugins.
- `soft.css` aligns the newer Backstage UI token layer. Keep these values in sync
  with the unified theme rather than applying global selectors to every element.
- `OperationsPage.tsx` and `AgentPage.tsx` own their layouts and contextual accents.
- `CompassMascot.tsx` is original inline SVG reused in headers and the sidebar logo.
  It is decorative, hidden from screen readers and unrelated to live health.
- System fonts avoid an external font request. No image-generation service or
  downloaded illustration is required to build the UI.

The local default is **Soft daylight**. The upstream light/dark theme extensions
are disabled so a saved system preference cannot unexpectedly replace this design.
A future dark variant needs its own reviewed contrast and status colors.

## Preserve these details

Keep healthy, warning, critical and unknown labels visible. Color reinforces the
label; it must never be the only way to interpret a state. Decorative artwork must
not imply a working server or connected AI. Demo labels, timestamps and source
failures remain explicit even when the surrounding UI is playful.

Buttons and links retain keyboard focus outlines. Form labels remain associated
with their inputs. Let controls wrap on narrow screens and long evidence IDs break
inside their containers. Header artwork hides on small screens to reserve space
for useful content. Avoid animated decoration that competes with status updates.

For visual changes, inspect desktop and mobile screenshots and walk through the
affected interactions. Do not add snapshot tests for each color or CSS value.

The theme registration follows the official
[Backstage customization guide](https://backstage.io/docs/golden-path/create-app/custom-theme/).
