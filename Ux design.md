---
name: ux-design
description: >
  Expert UI/UX design guidance covering the full product design lifecycle. Use this skill whenever
  the user asks about user experience, interface design, wireframing, user flows, information
  architecture, personas, usability, accessibility, design systems, design critique, UX research,
  prototyping, or interaction design. Trigger even for casual phrasing like "how should this
  look?", "is my layout good?", "how do I design this screen?", "what's the UX for this feature?",
  or "make this more user-friendly". This skill bridges design thinking and implementation — it
  helps both designers and developers produce excellent, user-centered interfaces.
---

# UI/UX Design Skill

## Phase 1 — Understand First

Before recommending anything, establish context:

1. **Who are the users?** (age range, tech-savviness, accessibility needs, professional context)
2. **What's the core job-to-be-done?** (What task are users trying to accomplish?)
3. **What's the platform?** (Mobile-first, desktop, responsive web, native app, kiosk, etc.)
4. **What's the emotional tone?** (Urgent/utilitarian, playful, professional, trust-critical, etc.)
5. **What already exists?** (Greenfield? Redesign? Component within a larger system?)

Do not skip this step. Generic UX advice is harmful. Good UX is always context-specific.

---

## Phase 2 — Choose the Right Design Mode

Based on the request, apply the relevant section(s) below.

---

## Mode A: Research & Discovery

### Research Methods

| Method | Best for | Time cost |
|--------|----------|-----------|
| User interviews (5–8 users) | Motivations, pain points | High |
| Survey | Validating hypotheses at scale | Medium |
| Contextual inquiry | Real behavior in context | Very high |
| Card sorting | Navigation labels, IA groupings | Medium |
| Tree testing | Validate IA without visual design | Medium |
| First-click testing | CTA/nav placement | Low |
| 5-second test | First impressions, value prop clarity | Very low |
| Usability testing (moderated) | Find critical task failures | Medium |
| A/B test | Validate one specific design decision | Low (setup) |
| Analytics review | What users do (not why) | Low |

**Rule**: Qualitative research tells you *why*. Quantitative tells you *what*. Do qualitative first.

### Personas — Behavior-Driven, Not Demographic

```
Persona: [Name]
Role archetype: [e.g., "The Reluctant Adopter" or "The Power Optimizer"]

Situation:
  What they're trying to accomplish:
  What they're currently doing instead:
  What's frustrating them:

Behaviors:
  How often they'd use this:
  Technical comfort level:
  Trust threshold (low/medium/high):

Goals:
  Functional: (get task X done faster)
  Emotional: (feel in control / avoid embarrassment)

Fears & blockers:
  What would stop them from adopting:

Design implications:
  [3–5 specific UI/UX decisions this persona drives]
```

**Warning**: Never design for "all users." Pick a primary persona. Secondary personas must not contradict primary needs.

### Jobs-to-be-Done

```
When [situation], I want to [motivation], so I can [outcome].
```

Example: "When I'm about to present to a client, I want to pull up last week's data without digging through folders, so I can look prepared."

Design implications from that JTBD: recents on dashboard, client-facing export in 1–2 taps, "last week" date range as a quick filter.

### Journey Map Structure

| Phase | Pre-awareness | Discovery | Onboarding | First use | Habit | Advocacy |
|-------|--------------|-----------|------------|-----------|-------|----------|
| Actions | | | | | | |
| Thoughts | | | | | | |
| Emotions | 😤 😐 😊 😍 | | | | | |
| Pain points | | | | | | |
| Opportunities | | | | | | |

**Key insight**: Best UX opportunities are at *transitions* between phases. Onboarding → First use is almost always broken.

---

## Mode B: Information Architecture & User Flows

### IA Patterns

| Pattern | Best for | Watch out for |
|---------|----------|--------------|
| Flat hierarchy | Small apps, single-task tools | Doesn't scale past ~7 items |
| Hub & spoke | Mobile apps with distinct modes | Hard to cross-navigate between spokes |
| Sequential / wizard | Onboarding, checkout, forms | Users can't jump ahead |
| Dashboard + detail | Data-heavy apps, CMS | Requires users to understand overview first |
| Search-primary | Large catalogs, knowledge bases | Poor discovery for unknown items |

### Navigation Components

| Component | Use when | Avoid when |
|-----------|----------|------------|
| Top nav bar | ≤5 sections, desktop | Mobile |
| Bottom tab bar | ≤5 sections, mobile | Desktop |
| Left sidebar | Many sections (6–15), admin | Mobile, content pages |
| Hamburger menu | Secondary / overflow only | Primary navigation |
| Breadcrumbs | Deep hierarchies (3+ levels) | Flat apps, mobile |
| In-page tabs | Switching views of same content | Navigation between distinct sections |

**Rule**: Hamburger menus reduce discoverability ~30%. Use only for overflow.

Every IA must answer instantly:
1. **Where am I?**
2. **Where can I go?**
3. **How do I get back?**

### Onboarding — Progressive Disclosure

```
Step 1: Minimum viable setup
  → Only ask for what's needed to deliver first value
  → Defer profile, preferences, invites

Step 2: First meaningful action
  → Guide user to complete ONE action proving the product works
  → Use empty state as a CTA, not a blank screen

Step 3: Contextual tooltips
  → Introduce secondary features at the moment of first encounter

Step 4: "Come back" hook
  → Email / notification bringing user back within 24–48hrs
```

**Anti-patterns**: Feature tour popups · Profile setup before value · Forced tutorials · Email verify before access · Too many upfront choices.

### User Flow Documentation

```
[Entry Point / Trigger]
        ↓
  [Screen / State A]
   ↙           ↘
[Happy path]  [Error / Edge case]
     ↓              ↓
[Screen B]    [Recovery state]
     ↓              ↓
       [End state — merge]
```

Always document: entry points, happy path, error states, edge cases (empty data, slow network, permission denied), exit points.

---

## Mode C: Wireframing & Layout

### Layout Hierarchy — Answer These in Order

1. **What's the ONE thing users should do?** → Primary CTA, above the fold, maximum visual weight
2. **What context helps them decide?** → Secondary content, supporting info
3. **What else can they do?** → Tertiary actions, navigation, escape hatches

**Red flags**: Multiple equally-weighted CTAs · Critical info below the fold on mobile · Navigation fighting page content for prominence · Forms asking for info before establishing trust.

### Mobile-First Rules

- Touch targets: minimum 44×44px (iOS) / 48×48dp (Material)
- Thumb zone: primary actions in bottom 60% of screen
- Safe margins: 16px minimum both sides
- Design single-column first, expand to desktop
- Never rely on hover states for critical interactions

### 8pt Spacing Scale

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Inner element padding (tight) |
| space-2 | 8px | Between related items |
| space-3 | 16px | Component internal padding |
| space-4 | 24px | Between components |
| space-5 | 32px | Section separation |
| space-6 | 48px | Major layout sections |
| space-7 | 64px | Page-level whitespace |

Gestalt proximity: items 8px apart look grouped; items 32px+ apart feel like separate sections.

### Common Layout Patterns

**Dashboard**: Left sidebar ≤220px + main content. Max 2 levels of nested nav. Use breadcrumbs.

**Landing page**: Hero → Social proof → Features → CTA → FAQ → Footer. Lead with user's desired outcome, not features.

**Form / Onboarding**: One question per screen (mobile). Progress indicator always visible. Never hide back button. Inline validation.

**List / Feed**: Consistent card height. Always include empty states. Skeleton loaders > spinners for lists.

**Detail / Profile**: Sticky header with name + primary action. Tabs for long pages. FAB for primary edit.

### Wireframe Output Format

When wireframing, annotate every component:
```
[Component Name] — purpose
  ↳ Behavior: what happens on interaction
  ↳ State: default / hover / active / disabled / error / empty
  ↳ Content: real content example, not "lorem ipsum"
  ↳ Edge case: very long content / missing / loading?
```

Output formats: ASCII/text (quick iteration), SVG (visual fidelity), HTML (clickable prototype), annotated description (complex logic).

---

## Mode D: Visual Design & Design Systems

### Visual Hierarchy — Control with These Properties

| Property | High priority | Low priority |
|----------|--------------|--------------|
| Size | Large | Small |
| Weight | Bold / heavy | Light / regular |
| Color | Brand / accent | Neutral / muted |
| Position | Top-left, center | Bottom, right |
| Space | More whitespace around | Dense, packed |
| Contrast | High vs background | Low contrast |

**Rule of 3**: Only 3 visual priority levels per screen — primary, secondary, tertiary.

### Semantic Color Roles

```
Brand / Primary      — interactive elements, links, primary CTAs
Brand / Secondary    — alternative actions, hover, selected states
Neutral / 50–900     — text, backgrounds, borders (9-step scale)
Semantic / Success   — confirmations (#22C55E family)
Semantic / Warning   — caution, pending (#F59E0B family)
Semantic / Error     — validation failures, destructive (#EF4444 family)
Semantic / Info      — informational alerts (#3B82F6 family)
Surface / Background — page background (lightest neutral)
Surface / Card       — elevated surfaces (white or neutral-50)
Surface / Overlay    — modal backdrops (neutral-900 @ 50%)
```

### Contrast Requirements (WCAG 2.1 AA)

| Text | Minimum ratio |
|------|--------------|
| Normal text (<18px) | 4.5:1 |
| Large text (≥18px bold / ≥24px) | 3:1 |
| UI components, icons | 3:1 |

Common failure: Light gray on white. #6B7280 on white is 4.6:1 — barely passing. Never go lighter for body text.

### Typography Scale

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| display | 48–72px | 700–800 | Hero headlines |
| h1 | 32–40px | 700 | Page titles |
| h2 | 24–28px | 600–700 | Section headings |
| h3 | 20–22px | 600 | Card headings |
| h4 | 16–18px | 600 | Component headings |
| body-lg | 17–18px | 400 | Long-form reading |
| body | 15–16px | 400 | Default body text |
| body-sm | 13–14px | 400 | Captions, metadata |
| label | 11–12px | 500–600 uppercase | Form labels |

Line height: 1.5–1.7 (body), 1.1–1.3 (headlines). Line length: 55–75 chars. Never use Inter/Roboto as the sole font for designed products.

### Design Token Naming: Category.Property.Variant.State

```
color.brand.primary.default     → #2563EB
color.brand.primary.hover       → #1D4ED8
color.semantic.error.default    → #EF4444
spacing.component.padding.md    → 12px
spacing.layout.section.gap      → 48px
font.size.body                  → 16px
radius.md                       → 8px
radius.pill                     → 9999px
shadow.sm  → 0 1px 2px rgba(0,0,0,0.05)
shadow.md  → 0 4px 6px rgba(0,0,0,0.07)
```

### Component Rules

**Buttons**: 1 primary per page (filled, brand). 1–2 secondary (outlined/ghost). Destructive = error red + confirmation step.

**Forms**: Labels above fields (never placeholder-only). Inline validation on blur. Required = asterisk with legend. Single-column outperforms multi-column for completion rate.

**Empty states** — Design all 3:
- First-time empty: illustration + headline + CTA
- Search/filter empty: explain query + suggest clearing filters
- Error empty: explain what happened + retry action

**Loading**: Skeleton screens for list/page loads (>300ms). Spinner for single-component loads. Progress bar for known-duration ops. Optimistic UI for simple CRUD.

---

## Mode E: Accessibility & Inclusive Design

### WCAG 2.1 AA Quick Checklist

**Perceivable**
- [ ] All images have meaningful alt text (`alt=""` for decorative)
- [ ] Text contrast ≥ 4.5:1 normal, ≥ 3:1 large text / UI components
- [ ] No information conveyed by color alone (add icon + text)
- [ ] Content doesn't break at 200–400% zoom

**Operable**
- [ ] All functionality keyboard-accessible (Tab, Enter, Space, arrows)
- [ ] Visible focus indicator on all interactive elements
- [ ] No keyboard traps
- [ ] Skip to main content link at top of page
- [ ] Touch targets ≥ 44×44px

**Understandable**
- [ ] Page language declared (`<html lang="en">`)
- [ ] Labels programmatically associated with inputs
- [ ] Error messages identify field AND describe fix
- [ ] Consistent navigation across pages

**Robust**
- [ ] Valid semantic HTML (headings in order, `<button>` not `<div>`)
- [ ] Custom components have correct ARIA roles and states
- [ ] Status messages use `aria-live` regions

### Semantic HTML — Use Before ARIA

```html
<!-- Wrong -->
<div class="btn" onclick="submit()">Submit</div>
<!-- Right -->
<button type="submit">Submit</button>

<!-- Heading hierarchy: never skip levels -->
<h1>Page title</h1>
  <h2>Section</h2>
    <h3>Sub-section</h3>
```

### Common ARIA Patterns

```html
<!-- Live regions for dynamic content -->
<div aria-live="polite">Form saved successfully!</div>
<div role="alert">Please fix 2 errors before submitting.</div>

<!-- Modal -->
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm deletion</h2>
  <button>Cancel</button><button>Delete</button>
</div>
<!-- On open: move focus in. Trap Tab inside. On close: return focus to trigger. -->

<!-- Toggle button -->
<button aria-pressed="false" aria-label="Dark mode">...</button>
```

### Color Blindness

8% of males affected. Never use color as the only signal. Avoid red+green for meaningful distinctions. Test with Figma's Color Blind mode or Colorblinding browser extension.

### Inclusive Design — Beyond Compliance

- **Situational disabilities**: broken arm, bright sunlight, holding a baby → design for these
- **Cognitive load**: clear language, consistent patterns, chunked info — helps everyone
- **Low bandwidth / old devices**: progressive enhancement, core without JS (especially India)
- **Plain language**: ≤20 word sentences, active voice, Grade 8 reading level, no jargon

---

## Mode F: Usability Review & Critique

### Feedback Format

Always: **[Observation] → [User impact] → [Recommendation]**

Bad: "The font feels wrong."
Good: "The #9CA3AF body text on white has 2.85:1 contrast — below WCAG AA 4.5:1 minimum. Users with low vision or outdoors will struggle. Use #6B7280 or darker."

### 5 Critique Lenses

**Lens 1: Clarity** — Does the user immediately know what this screen is for and what to do?
- One clear purpose within 5 seconds · Primary action visually dominant · Labels are self-explanatory · Empty/error states use plain language

**Lens 2: Efficiency** — Minimum effort to complete the task?
- No unnecessary steps · Smart defaults · No re-entering provided info · Frequently-used actions prominently placed · Irreversible actions require confirmation; routine actions don't

**Lens 3: Trust & Safety** — Does the UI feel safe?
- Action consequences clear before commit · Error messages say what AND how to fix · Data sharing disclosed · Costs visible before final step

**Lens 4: Consistency** — Is behavior predictable?
- Same action = same result · Similar elements look/behave the same · Platform conventions followed · Vocabulary consistent throughout

**Lens 5: Accessibility** — Can all users access this?
- Contrast, keyboard access, touch targets, color not the only signal

### Severity Scale

| Score | Impact | Priority |
|-------|--------|----------|
| 1 | Cosmetic only | Fix if time allows |
| 2 | Minor usability problem | Low priority |
| 3 | Major usability problem | High priority |
| 4 | Catastrophic — blocks task | Fix before launch |

### Nielsen's 10 Heuristics (Quick Reference)

1. **Visibility of system status** — always show what's happening
2. **Match the real world** — familiar language, not system jargon
3. **User control & freedom** — undo, back, cancel always available
4. **Consistency & standards** — follow platform conventions
5. **Error prevention** — prevent errors before they happen
6. **Recognition over recall** — show options, don't make users memorize
7. **Flexibility & efficiency** — shortcuts for power users + simple default path
8. **Aesthetic & minimalist design** — every element earns its place
9. **Help users recover from errors** — plain language + solution
10. **Help & documentation** — contextual, easy to find

### Common Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Modal overuse | Interrupts flow | Use inline warnings or snackbars |
| Infinite scroll, no anchor | Users lose their place | Back to top + position memory |
| Wizard without progress | Anxiety about remaining steps | Always show step X of Y |
| Auto-playing media | Hijacks audio | Default mute |
| Dropdown for large sets | Scanning 50 options is miserable | Searchable autocomplete |
| Password without show/hide | Can't verify what was typed | Visibility toggle |
| Generic error messages | "An error occurred" = useless | Name the problem + next step |
| Placeholder as label | Disappears on focus | Label always above field |
| Click target too small | Mis-taps, frustration | ≥44px minimum |

**Dark patterns** (flag as ethical issues): roach motels, hidden costs, confirmshaming, forced continuity, disguised ads, privacy zuckering.

---

## Mode G: Interaction Design & Micro-interactions

### Core Principles

1. **Feedback**: Every action must produce a response — button press, form submit, save, error. Nothing disappears into the void.
2. **Causality**: Animation reflects spatial relationship — drill-down slides right, back slides left, expand in-place.
3. **Continuity**: Objects persist across states — card expands to detail, thumbnail zooms to full image.

### Response Time Expectations

| Duration | Perception | Use for |
|----------|-----------|---------|
| 0–100ms | Instant | Button state changes, hover |
| 100–300ms | Fast, responsive | Simple UI transitions |
| 300–500ms | Noticeable but fine | Layout changes, page transitions |
| 500ms–1s | Needs feedback | Loading content |
| 1–3s | Impatience threshold | Skeleton screens |
| 3s+ | Show progress | Progress bar, background job messaging |

### Animation Duration Rules

- Micro-interactions (toggle, checkbox): 100–200ms
- Component transitions (dropdown, tooltip): 150–250ms
- Page transitions: 250–400ms (mobile), 300–500ms (desktop)

### Easing Guide

| Easing | CSS | Use when |
|--------|-----|----------|
| Ease out | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Elements entering |
| Ease in | `cubic-bezier(0.4, 0.0, 1, 1)` | Elements leaving |
| Ease in-out | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Elements moving A→B |
| Linear | `linear` | Progress bars, spinners |

Never use CSS default `ease` for UI. Never use `ease-in` for entering elements (starts too slow).

### State Matrix — Design All States

| State | Visual treatment |
|-------|-----------------|
| Default | Base design |
| Hover | Subtle background change, cursor |
| Focus | Visible outline (never remove!) |
| Active / Pressed | Slight scale down, deeper shadow |
| Loading | Spinner inside, button disabled |
| Success | Green checkmark, brief then reset |
| Error | Red + specific error message |
| Disabled | 50% opacity, no interaction |
| Empty | Illustration + CTA |
| Selected | Filled or highlighted |

**Commonly forgotten**: disabled with tooltip (why?), optimistic update + failure recovery, empty-after-delete state.

### Gesture Conventions (Mobile)

| Gesture | Convention |
|---------|-----------|
| Swipe right | iOS back — never override |
| Swipe left (list item) | Delete / archive |
| Pull to refresh | Reload content |
| Long press | Context menu / alternative action |
| Double tap | Zoom in; like (social) |

Always provide a tap-based alternative to any gesture. Show affordances (handles, partial reveals, animation hints).

### Skeleton Screens

```css
/* Shimmer animation */
background: linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

Match shape/proportion of actual content. Show 3–5 skeletons max. Replace progressively as data arrives.

### Button Loading Pattern

```
1. Immediate: disable button + show spinner inside
2. Success: checkmark for 1–2s → return to default or navigate
3. Failure: return to default + error message near button
```

---

## Output Standards

When giving UX feedback:
- **Lead with the user's perspective**, not implementation details
- **Be specific**: not "improve the layout" — "move the CTA above the form headline so users see the goal before the ask"
- **Rank by impact**: lead with the highest-impact change
- **Show don't tell**: include ASCII layouts, before/after comparisons, examples
- **Name the pattern**: "This is progressive disclosure" helps users learn
- **Cite the reasoning**: "Because mobile users scroll fast and miss mid-page CTAs"