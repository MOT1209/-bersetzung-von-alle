# Design System — AraLink (أداة الترجمة الذكية)

This document defines the visual design system for the translation tool. All pages and components **must** follow these tokens and patterns.

---

## Product Personality

A modern, trustworthy, productivity tool. Dark-first, calm colors, generous spacing, crystal-clear feedback. The user's job is one action: paste a link → pick a language → read the result. Nothing else should compete for attention.

---

## Core Layout

- **Direction:** RTL (`dir="rtl"` on `<html>`), Arabic UI labels.
- **Font:** "Cairo" or "Tajawal" from Google Fonts (headings 700/800 weight, body 400).
- **Layout:** Single centered column, max-width 820px, generous vertical rhythm.
- **Hero:** App name + tagline at top; the input card (URL field + language select + button) is the visual anchor.
- **Result area:** appears below the input card after translation — two-tab view: "الترجمة" (translation) / "النص الأصلي" (original), or side-by-side on wide screens.

---

## Colors

Dark-first theme. Defined as CSS variables:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0b1220` | Page background |
| `--bg-card` | `#111a2e` | Cards, panels |
| `--bg-input` | `#0d1526` | Input fields |
| `--border` | `#1f2b45` | Borders, dividers |
| `--text` | `#e6edf7` | Primary text |
| `--text-muted` | `#8b9bb8` | Secondary text, placeholders |
| `--primary` | `#6366f1` | Buttons, accents, focus |
| `--primary-hover` | `#4f46e5` | Button hover |
| `--accent` | `#22d3ee` | Links, highlights, progress |
| `--success` | `#34d399` | Success states |
| `--warning` | `#fbbf24` | Warnings |
| `--danger` | `#f87171` | Errors |
| `--gradient` | `linear-gradient(135deg,#6366f1,#8b5cf6)` | Hero title, primary CTA |

---

## Typography

- Headings: `font-weight: 800`, tight line-height (1.2).
- Body: `font-size: 16px`, line-height 1.8 (Arabic needs taller line-height).
- Small/helper text: `0.85rem`, muted color.
- Monospace (`font-family: monospace`) for URLs and error codes.

---

## Components

### Input Card (the hero)
- White-translucent card (`background: rgba(17,26,46,.8)`, `backdrop-filter: blur(12px)`, radius 16px, border 1px `--border`).
- URL input: full width, dark bg, `border-radius: 12px`, focus ring in `--primary`.
- Language selector: custom `<select>` styled to match, with a searchable language list ("كل اللغات" = auto-detect target).
- Primary button "ترجم الآن": gradient background, white text, `border-radius: 12px`, hover lifts (`transform: translateY(-1px)` + shadow).

### Progress / States
- **Loading:** three-pulse dots + step label ("جاري جلب المحتوى…", "جاري الترجمة…", "جاهز").
- **Error:** inline alert card, `--danger` border, Arabic message + retry button. Never silent failures.
- **Success:** green check badge + summary line ("تمت الترجمة من الإنجليزية إلى العربية").

### Result Panel
- Tabs (الترجمة / الأصلي) — pill-style toggle, active tab = `--primary` bg.
- Translation body: white text on `--bg-card`, paragraphs preserved, `line-height: 1.9`.
- YouTube mode: embedded player (`iframe`) + transcript below, each subtitle line translated, timestamped.
- Download button: "تحميل SRT" when transcript mode.

### Footer
- Muted small text, Arabic, no clutter.

---

## Spacing & Radius

- Page padding: `32px` desktop / `16px` mobile.
- Card padding: `24-28px`.
- Radius scale: `8px` (small), `12px` (inputs/buttons), `16px` (cards).
- Shadow: `0 12px 40px rgba(0,0,0,.35)` for elevated cards.

---

## Motion

- Transitions: `150-200ms ease` for hovers/focus.
- Result reveal: fade + slight slide-up (`opacity 0→1`, `translateY 8px→0`).
- No decorative animations — motion only communicates state.

---

## Accessibility

- All interactive elements keyboard-focusable with visible `--primary` ring.
- Contrast: body text `#e6edf7` on `#0b1220` (well above AA).
- Error messages via `role="alert"`.
- Language select includes all ~100 languages, labeled in Arabic.

---

## What NOT to do

- No light mode for MVP (dark-only is intentional).
- No sidebar navigation, no multi-page routing — single page app.
- No autoplay of audio, no auto-scroll traps.
- No English UI text (the product is Arabic-first; English only inside code).
