---
name: Merchant Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#464555'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display-kpi:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 21px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is centered on clarity, operational efficiency, and trust. Designed for e-commerce merchants, the aesthetic is **Modern Minimalism** with a focus on data density and high scannability.

The brand personality is professional yet accessible, avoiding unnecessary decorative elements to ensure that critical business metrics remain the focal point. The interface utilizes generous white space, a constrained color palette, and systematic alignment to evoke a sense of organized control and reliability.

## Colors

The color strategy employs a "Functional First" approach. The palette is dominated by neutral shades of charcoal and muted gray to maintain a professional atmosphere, while **Slate Indigo** is reserved exclusively for primary actions and brand presence.

- **Background & Surface:** Use `#F9FAFB` for the application canvas and `#FFFFFF` for elevated containers (cards, modals, sidebars) to create subtle depth without heavy shadows.
- **Typography:** Primary information uses `#111827` for maximum legibility. Secondary meta-data and labels use `#6B7280`.
- **Status Indicators:** Success, Warning, and Error colors are used sparingly for semantic feedback (e.g., stock levels, payment status, order alerts).

## Typography

This design system utilizes a dual-font strategy. **Plus Jakarta Sans** is used for headlines and KPI metrics to provide a modern, slightly geometric character to the brand's voice. **Inter** is utilized for all body text, inputs, and data tables due to its exceptional legibility at small sizes and its neutral, systematic feel.

- **KPI Metrics:** Use `display-kpi` for top-level dashboard numbers to ensure they are the first thing a merchant sees.
- **Hierarchy:** Maintain a clear distinction between `title-sm` (used for card headers) and `body-md` (used for general information).
- **Labels:** Use `label-caps` for table headers and category tags to differentiate them from interactive content.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a maximum content width of 1440px for desktop.

- **Grid System:** Use a 12-column grid for desktop with 24px gutters. On tablet, switch to an 8-column grid. On mobile, use a 4-column grid.
- **Vertical Rhythm:** Components should be spaced using increments of 8px (`sm`, `md`, `lg`).
- **Dashboard Structure:** A persistent left-hand sidebar (256px width) provides primary navigation, while the main content area utilizes a `lg` (24px) padding to separate the canvas from the content cards.

## Elevation & Depth

In alignment with the minimalistic aesthetic, depth is primarily communicated through color layering rather than heavy shadows.

- **Tonal Layers:** The background sits at the lowest level. White surfaces (`#FFFFFF`) represent the primary interactive layer.
- **Borders:** All cards and containers must feature a 1px solid border using `#E5E7EB`. This provides structural definition without visual weight.
- **Shadows:** Use a single, highly diffused "Ambient Shadow" for elevated elements like dropdowns or active cards: `0px 4px 6px -1px rgba(0, 0, 0, 0.05), 0px 2px 4px -2px rgba(0, 0, 0, 0.05)`.
- **Interactive States:** Hovering over a card or list item should result in a subtle background shift to `#F9FAFB` rather than an increase in shadow.

## Shapes

The shape language is "Soft," utilizing moderate corner radii to balance the precision of the layout with a friendly, modern feel.

- **Standard Elements:** Buttons, input fields, and small UI components use a 0.25rem (4px) radius.
- **Containers:** Large cards and dashboard sections use a 0.5rem (8px) radius.
- **Selection:** Active states in navigation or multi-select chips may use a pill-shape (full rounding) to clearly distinguish them from structural elements.

## Components

- **Buttons:** Primary buttons use a solid Slate Indigo fill with white text. Secondary buttons use a white fill with a `#E5E7EB` border and Charcoal text. Use a 40px height for standard buttons.
- **Input Fields:** Use a 1px border (`#E5E7EB`) with a 4px radius. The focus state must transition the border to Slate Indigo with a subtle 2px outer glow of the same color at 10% opacity.
- **KPI Cards:** Feature the metric title in `label-caps` (Muted Gray) and the value in `display-kpi` (Charcoal). Include a small trend indicator (Success or Error color) at the bottom right.
- **Data Tables:** Tables should be "borderless" internally, using only horizontal dividers in `#E5E7EB`. Row height should be 56px to ensure touch-targets are accessible and data is readable.
- **Chips/Badges:** Used for status (e.g., "Shipped," "Pending"). Use a low-saturation background of the functional color (e.g., Success green at 10% opacity) with high-saturation text for the label.
- **Sidebar:** The sidebar should use a subtle dark theme (Charcoal `#111827`) or a clean white theme with a right-side border. Icons should be line-based (2px stroke) for a modern, lightweight look.
