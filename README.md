Veto: The Anti-Impulse Purchase Engine
Veto is a behavioral finance web application designed to intercept impulsive spending habits before checkout. Rather than passively tracking expenses after a transaction occurs, Veto introduces healthy friction into the buying cycle. By mathematically calculating the true long-term utility of an item and enforcing psychological cooling-off periods, this platform shifts users from reactive purchasing to mindful, data-driven financial decisions.

Core Features
Dynamic Cost-Per-Use Engine: Automatically calculates an item’s true lifetime cost based on user-projected usage frequency and category-specific depreciation rates.

Mandatory Cooling-Off Timers: The verdict page displays a 48-hour browser-side cooling-off countdown for the current draft.

Visual Clutter Check: Dynamically prompts users to review similar items they already own, actively challenging the justification for redundant purchases.

30-Day Regret Audit: Follows up on past decisions to compare predicted usage against actual reality, generating a behavioral "Self-Awareness Score" for future risk assessment.

Technical Architecture
This full-stack application is built using a progressively layered architecture to meet modern web standards and accessibility requirements:

Frontend (UI Layer): Semantic HTML5 and modern CSS3 (Grid/Flexbox) for a responsive interface.

Client Logic: Vanilla JavaScript handles form validation, calculations, live updates, and wizard navigation.

Local persistence: A small Node.js HTTP server stores decision history in SQLite at `data/veto.sqlite`. Draft answers and the cooling-off timer remain in browser localStorage.

## Run locally

1. Install Node.js 22.13 or newer.
2. From the repository root, run `npm start`.
3. Open `http://127.0.0.1:3000` in your browser.

The server creates the `data` folder and SQLite database automatically. Decisions are saved there and are available in the history page on subsequent visits. Keep the server running while using VETO; opening the HTML files directly or using a static-only server will not connect to the database API.

Development Team
Developed as the primary Project-Based Learning (PjBL) deliverable for the CSE6 2025 Web Programming course (Semester 3) at BML Munjal University by:

Aman Sharma

Saksham Dixit 

Anirudh Singh

Himanshu Pal
