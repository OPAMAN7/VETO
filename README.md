# VETO — The Anti-Impulse Purchase Engine

VETO helps people pause before a purchase. It calculates cost per use, records likely
usage and existing alternatives, calculates a transparent impulse score, and gives the
browser a 48-hour cooling-off period. It does not purchase or sell anything.

## What is included

- A four-step purchase evaluation for item details, usage, redundancy and verdict.
- Cost-per-use and impulse-score calculations shown to the user.
- Saved decisions with bought, delayed and passed outcomes.
- SQLite as the safe local default.
- Optional JSON and MongoDB storage adapters.
- Decision CRUD and analytics APIs.
- A Gemini Purchase Coach with a missing-key fallback.
- eBay Browse product search with a missing-credential fallback.
- Persistent reminder records and optional Web Push configuration.
- Real analytics on the history page.
- Existing HTML/CSS/JavaScript interface served by the Node.js backend.

## Project structure

```text
VETO/
├── backend/
│   └── src/
│       ├── app.js
│       ├── config/
│       │   └── env.js
│       ├── middleware/
│       ├── services/
│       └── utils/
├── Html/
│   ├── css/
│   ├── js/
│   └── *.html
├── data/
│   └── veto.sqlite
├── stores/
│   └── decision-store.js
├── test/
├── server.js
├── package.json
└── .env.example
```

The frontend is intentionally kept at `Html/`. Root `server.js` is the backward-compatible
entry point. The Express application is in `backend/src/app.js`.

## Requirements

- Node.js 22.13 or newer
- npm

## Install and run

```powershell
npm install
npm start
```

Open <http://127.0.0.1:3000>.

Keep the server running while using the app. Opening HTML files directly does not connect
them to the API.

## Configuration

Copy `.env.example` to `.env` and set only the features you use:

```text
PORT=3000
STORAGE_DRIVER=sqlite

MONGODB_URI=
GEMINI_API_KEY=
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

Never put credentials in HTML, frontend JavaScript, Git commits or public files. `.env`
is ignored by Git.

## Storage

### SQLite — default

```text
STORAGE_DRIVER=sqlite
VETO_DB_PATH=data/veto.sqlite
```

The existing `data/veto.sqlite` database is preserved and extended with reminder tables.
VETO never deletes or automatically migrates it.

### JSON

```text
STORAGE_DRIVER=json
VETO_JSON_PATH=data/decisions.json
```

The JSON adapter is useful for local development. It is a separate source of data.

### MongoDB

```text
STORAGE_DRIVER=mongodb
MONGODB_URI=your-private-connection-uri
```

MongoDB connects only when that storage driver is selected. The old `VETO_STORE` variable
is also accepted for compatibility, but `STORAGE_DRIVER` is preferred.

Changing storage providers does not copy decisions between databases. SQLite, JSON and
MongoDB must not be used at the same time as competing sources of truth.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server and integration status |
| GET | `/api/decisions` | List decisions, newest first |
| GET | `/api/decisions/:id` | Fetch a decision |
| POST | `/api/decisions` | Create a decision |
| PUT | `/api/decisions/:id` | Update a decision |
| DELETE | `/api/decisions/:id` | Delete a decision |
| GET | `/api/analytics/summary` | Calculate analytics from saved decisions |
| POST | `/api/coach/analyze` | Get a Gemini purchase coaching response |
| GET | `/api/products/search?q=...` | Search eBay listings |
| POST | `/api/reminders` | Schedule a reminder |
| GET | `/api/reminders` | List reminder records |
| DELETE | `/api/reminders/:id` | Delete a reminder |
| POST | `/api/push/subscribe` | Save a browser push subscription |
| POST | `/api/push/unsubscribe` | Remove a push subscription |
| GET | `/api/push/public-key` | Get the public VAPID key |

## External integrations

### Gemini Purchase Coach

Set `GEMINI_API_KEY` in `.env`. The key is sent only from the backend. The coach:

- does not change saved decisions;
- does not replace VETO's transparent impulse score;
- returns a structured advisory response;
- reports a clear missing-key, timeout or quota error.

### eBay product search

Set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` in `.env`. You may set
`EBAY_MARKETPLACE_ID`, which defaults to `EBAY_US`.

No product data is invented. When credentials are missing or eBay has no access for the
selected marketplace, the API reports a configuration or upstream error.

### Web Push

Generate development VAPID keys locally:

```powershell
npm run generate:vapid
```

Add the generated values to `.env`:

```text
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

The backend stores reminder schedules and subscriptions. The scheduler only sends
reminders while the server is running and only when VAPID keys are configured. Browser
notifications can work while VETO is open; Web Push behavior is limited by OS/browser
notification settings.

## Tests

```powershell
npm test
```

The suite uses in-memory and temporary JSON/SQLite stores. It does not require Gemini,
eBay or MongoDB credentials. Missing external credentials are tested as configured
fallback responses.

## Common errors

- **Cannot find dependencies:** run `npm install`.
- **Port is already in use:** set `PORT=3001` in `.env`.
- **MongoDB mode will not start:** verify `MONGODB_URI`, network access and database
  credentials.
- **Coach response says not configured:** add `GEMINI_API_KEY` to `.env`.
- **Product search says not configured:** add both eBay credential variables.
- **Web Push says not configured:** generate VAPID keys and restart VETO.
- **Existing data disappeared:** check that `STORAGE_DRIVER=sqlite` and that
  `VETO_DB_PATH` still points to `data/veto.sqlite`.

## Development team

Developed for the CSE6 2025 Web Programming course (Semester 3) at BML Munjal University:
Aman Sharma, Saksham Dixit, Anirudh Singh and Himanshu Pal.
