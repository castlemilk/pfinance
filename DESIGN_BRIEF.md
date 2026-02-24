# PFinance — Design Brief for Asset Generation

## Brand Identity

**PFinance** is a personal & household finance tracker with an AI-powered categorization engine. The visual identity blends **retro-futurism** with **skeuomorphic realism** — think 1970s CRT terminals reimagined with modern depth, texture, and interactivity.

**Tagline**: *Take Control of Your Finances*

**Tone**: Trustworthy, tactile, warm, premium, approachable

---

## Visual Language

### Aesthetic Keywords
> CRT terminal · skeuomorphic · retro-futuristic · tactile · warm · phosphor glow · brushed metal · embossed · scanlines · felt texture · physical depth

### What It Is
- Warm, inviting, feels like a premium physical object
- 3D surfaces with realistic light/shadow
- CRT monitor frames around data displays
- Glowing phosphor text, animated scanlines
- Embossed/debossed text and stamped elements
- Power LEDs, dot grids, bezels, knobs

### What It's NOT
- Flat/minimal (no Material Design, no Vercel-style)
- Neon cyberpunk (it's warm, not cold)
- Skeuomorphism circa 2010 (no leather textures or stitching — this is refined)
- Cluttered or busy (depth ≠ noise)

---

## Color System

Four switchable retro palettes, each with light/dark variants. **All assets should work with the default Amber Terminal palette** but be adaptable.

### Default Palette: Amber Terminal

| Role | Light Mode | Dark Mode | Hex (approx) |
|------|-----------|-----------|---------------|
| **Primary** | Amber orange | Bright amber | `#FFA94D` |
| **Secondary** | Avocado green | Sage green | `#87A96B` |
| **Accent** | Rust red | Tawny orange | `#D16A47` |
| **Background** | Warm cream paper | CRT black | `#F5F0E8` / `#1A1815` |
| **Text** | Chocolate brown | Warm sand | `#4A3728` / `#E8DCC8` |
| **Glow** | Amber | Amber | `#FFA94D` |

### Alternate Palettes (for multi-palette assets)

| Palette | Primary | Secondary | Vibe |
|---------|---------|-----------|------|
| **Soft Retro Chic** | Dusty rose `#D69CAA` | Powder blue `#AEC6CF` | 1980s pastel diary |
| **Mid-century Mint & Peach** | Mint green `#72C2A8` | Peach coral `#F5B6A5` | 1950s kitchen appliance |
| **Earthy Terracotta & Sage** | Terracotta `#C37A67` | Sage green `#A0A088` | Organic rustic pottery |

### Chart Data Colors (Amber Terminal)
```
Amber:    #FFA94D
Avocado:  #87A96B
Rust:     #D16A47
Golden:   #C4A35A
Olive:    #6B7A5E
```

---

## Typography

| Usage | Font | Weight | Notes |
|-------|------|--------|-------|
| Display / Headlines | System sans or **Inter** | Bold (700) | Embossed text shadow |
| Body | System sans or **Inter** | Regular (400) | Clean readability |
| Data / Dashboard | **Monospace** (JetBrains Mono / system mono) | Medium (500) | All numbers, labels, terminal text |
| Embossed text | Any | Any | Light top shadow, dark bottom shadow |

---

## UI Surface Materials

### Card Surfaces
- **CRT Monitor Card**: Plastic/metal bezel gradient, inner dark screen area with scanlines, power LED (green, blinking), curvature vignette, model number label
- **Raised Card**: Top-light → bottom-dark gradient, layered shadows (ambient + direct), inner highlight edge, lifts on hover
- **Inset Panel**: Sunken/recessed surface for data displays, darker inset shadow, used for numbers and inputs
- **Glass Panel**: Frosted backdrop-blur with specular highlight stripe

### Interactive Elements
- **3D Buttons**: Top-light gradient, bottom shadow lip, pressed state shifts down 1px with inset shadow
- **Toggle Switch**: Recessed metal track with raised glossy knob, spring animation on toggle
- **Progress Bars**: Inset track with filled glowing segment

### Decorative Effects
- **Scanlines**: 2px repeating horizontal lines at low opacity
- **Phosphor Glow**: Text-shadow glow in palette primary color (stronger in dark mode)
- **Power LEDs**: 6px green dot with radial gradient and pulse animation
- **Dot Grid**: Subtle dot matrix pattern behind content
- **CRT Curvature**: Radial vignette on screen areas

---

## Background Treatments

### WebGL Animated Background
- Twinkling multi-layer starfield
- Simplex noise nebula in warm amber/sage tones
- Pauses when offscreen (intersection observer)
- Subtle, never distracting — sits behind all content

### Static Backgrounds
- Warm cream with subtle noise grain texture (light mode)
- Deep charcoal-black with subtle amber glow halos (dark mode)
- Dot grid overlay at very low opacity

---

## Component Patterns

### Dashboard Mockup (Hero)
A CRT monitor frame containing:
- 3 stat panels (Balance, Spent, Saved) in inset wells
- Interactive bar chart (7 bars, weekly spending) with hover glow
- Transaction list (3 line items)
- Monospace font throughout
- Traffic light dots in window chrome

### Feature Cards
6 CRT monitor cards in a 3×2 grid:
- Bezel top: power LED + "Module 01" label + dots
- Screen area: scanlines, curvature, icon + title + description
- Bezel bottom: decorative lines + model number
- Phosphor text glow on titles

### Testimonial Cards (Marquee)
Infinite scroll, 2 rows, opposite directions:
- CRT monitor frame per card
- Circular avatar photo with ring border
- Star rating (5 stars)
- Quote text + author name/role
- Online indicator dot

### Pricing Cards
- Skeuomorphic rocker toggle (Monthly/Annual)
- Raised cards with hover lift
- Inset price display panel
- Glossy "Most Popular" badge
- Embossed checkmark bullets

---

## Animation Inventory

| Animation | Usage | Duration |
|-----------|-------|----------|
| `float` / `floatSlow` | Floating cards (gentle bob) | 4–6s loop |
| `shimmer` | Glossy highlight sweep on badges | 3s + delay |
| `scanline` | CRT display scan | 8s loop |
| `gentlePulse` | Subtle glow breathing | 3s loop |
| `crtFlicker` | Screen brightness flicker | 4–5s loop |
| `ledBlink` | Power LED pulse | 3s loop |
| `marqueeScroll` | Infinite testimonial scroll | 40–45s |

---

## Asset Generation Prompts

### App Screenshots / Mockups
> "A premium personal finance dashboard displayed on a CRT monitor frame with amber phosphor glow, scanlines, and dark background. Shows bar charts, expense categories, and balance cards. Warm retro-futuristic aesthetic with skeuomorphic 3D depth, embossed text, and power LED indicators. Color palette: amber, cream, avocado green, rust red."

### Logo / Brand Mark
> "Minimalist wallet icon with amber-to-sage gradient, 3D inner shadow giving depth, rounded corners. Sits inside a slightly rounded square with subtle bezel edge. Warm retro color palette."

### Marketing Banner (Hero)
> "Split-screen hero: left side has large embossed headline 'Take Control of Your Finances' on a starfield background with dot grid, right side shows a CRT monitor mockup of a finance dashboard with inset stat panels, glowing bar chart, and floating mini-cards. Warm amber and cream palette, skeuomorphic depth."

### Feature Section
> "Six CRT monitor cards in a 3×2 grid on a starfield background. Each monitor has a plastic bezel with power LED, and an inner screen showing an icon and description. Scanline overlay, curvature vignette. Icons: wallet, chart, people, brain, bell, shield."

### Dark Mode Showcase
> "Same finance dashboard UI but in dark CRT terminal mode. Deep black background with amber phosphor glow text, green power LEDs, visible scanlines on all data panels, text-shadow glow on numbers. Stars and nebula visible in background."

### Social Media Card (1200×630)
> "PFinance brand card: CRT monitor frame in center showing a pie chart and transaction list. 'Take Control of Your Finances' in embossed text above. Warm amber palette, starfield background, power LED in corner. Tagline and logo at bottom."

---

## File Formats

| Asset Type | Format | Sizes |
|------------|--------|-------|
| Logo | SVG, PNG | 32px, 64px, 128px, 512px |
| Favicon | ICO, SVG | 16px, 32px, 192px, 512px |
| OG Image | PNG, WebP | 1200×630 |
| App Screenshots | PNG, WebP | 1280×720, 1920×1080 |
| Marketing Assets | PNG, WebP | Various |

---

## Key Principles for Asset Generation

1. **Warm, not cold** — amber/cream/rust, never blue/gray/neon
2. **Depth, not flat** — every surface has light direction and shadow
3. **Retro-future** — CRT frames and scanlines, but clean and modern
4. **Palette-adaptive** — primary accent should be swappable
5. **Dark mode emphasis** — CRT glow effects are most dramatic in dark mode
6. **Monospace for data** — all numbers and labels use monospace font
7. **Physical metaphors** — LEDs, bezels, switches, embossing, not abstract shapes
