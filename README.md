# Reality Check

A purchase decision tool that converts any price into the only number that matters: **what one use costs you**.

## Overview

Reality Check helps you make smarter purchasing decisions by calculating the true cost per use of items. Instead of just looking at a price tag, you answer four simple questions about how you'll actually use the item, and get a verdict: **Buy**, **Wait 48 hours**, or **Skip**.

**Phase 1 prototype** — HTML and CSS only, built for CSE 2022 Web Programming.

## How it works

1. **Describe the item** — Name, category, and price. The category sets a default lifespan (a phone ≠ a t-shirt).
2. **Commit to a frequency** — How often will you really use it? Cost per use updates as you adjust the sliders.
3. **Check for alternatives** — Do you already own something that does the job? Can it be borrowed or rented?
4. **Read the verdict** — Buy, wait 48 hours, or skip—with the numbers backing up the call.

## Features

- **Cost per use calculation** — Price ÷ (uses per month × months of use)
- **Impulse score** — 0–100 weighting based on price, budget, duplicates, and alternatives
- **Three verdict bands** — Buy (<75), Wait (75–89), Skip (90+)
- **Accessible design** — WCAG compliant with keyboard navigation and screen reader support
- **Responsive layout** — Works on mobile and desktop
- **Cheaper alternatives database** — See what others bought instead

## Getting started

1. Clone the repository
2. Open `Html/index.html` in your browser
3. Click "Start a check" to try it out

## File structure

```
Html/
  index.html              Home page
  step-1-item.html        Describe the item
  step-2-usage.html       Set frequency
  step-3-redundancy.html  Check for duplicates
  step-4-verdict.html     View verdict
  alternatives.html       Browse cheaper alternatives
  css/
    styles.css            Design tokens, components, utilities
```

## Design principles

- **Cost per use is the metric that matters** — not the price tag
- **Never hide the math** — users see how every number feeds the verdict
- **Accessibility by default** — colour + words, keyboard-first, semantic HTML
- **Realistic frequency** — sliders for monthly use and lifespan, not abstract percentages

## Technologies

- **HTML5** — Semantic markup with ARIA labels
- **CSS3** — Design tokens, Grid, Flexbox, custom properties
- **No dependencies** — Pure static site

## Next phases

- **Phase 2** — JavaScript interactivity (form validation, live calculations)
- **Phase 3** — Server backend (MongoDB storage, real alternatives data, print reports)

## License

This is an educational project. Feel free to fork and adapt.

## Questions?

See the issues or check the [web repository](https://github.com/OPAMAN7/VETO).
