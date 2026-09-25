# BBQ Frontend Guidelines

## 1. Styling & Design System
- Use **Vanilla CSS** exclusively. Do NOT introduce TailwindCSS, CSS-in-JS libraries, or utility-class frameworks.
- All styles, dimensions, colors, and shadows must derive from the centralized design tokens defined in `apps/desktop/src/styles/index.css` (e.g. `--bbq-surface`, `--bbq-primary`, `--bbq-text`, `--bbq-radius`, `--bbq-duration`).
- Maintain full compatibility with both **Dark** and **Light** themes.

## 2. Accessibility & WCAG 2.1 AA Compliance
- All text, icons, and status badges (`.bbq-capability-badge`) must satisfy WCAG 2.1 AA contrast requirements (>= 4.5:1 for normal text, >= 3.0:1 for large text and interactive UI borders).
- Never communicate status or capability state using color alone; always pair colors with human-readable text labels or descriptive ARIA attributes.
- Respect system accessibility settings: honor `prefers-reduced-motion` and the user's `reduced_motion` setting by disabling decorative animations and non-essential scale transitions.

## 3. Component & State Architecture
- Avoid prop drilling and unnecessary global context providers that cause wide component tree invalidation.
- Keep widget models pure and testable (e.g. `settingsModel.ts`, `mediaModel.ts`, `launcherModel.ts`). Pure calculations, bounds checking, and data transformations should live in domain model files without React dependencies.
- Prevent duplicate UI controls (e.g. ensure singular responsibility for system switches like `start_at_login`).
