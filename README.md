# VETO — The Anti-Impulse Purchase Engine

VETO adds a deliberate pause before a purchase. It records the item being considered, the reason for wanting it, expected usage, alternatives already available, and the final decision.

## What is working in this repository

- A four-step purchase-check flow built with semantic HTML, CSS, and vanilla JavaScript.
- Draft answers and the cooling-off countdown are kept in browser `localStorage`.
- The verdict page records one of three outcomes: `bought`, `delayed`, or `passed`.
- Decision history is loaded from the server and filtered in the browser.
- Cost-per-use and the impulse score are calculated by the frontend.
- The alternatives page currently contains sample/placeholder entries; it is not yet connected to an alternatives database.

## Requirements

- Node.js 22.13 or newer.
- npm (included with Node.js).

## Install and run

From the repository root:

```bash
npm install
npm start
```

Open <http://127.0.0.1:3000>. Keep the server running while using VETO. Opening the HTML files directly will not connect to the API.

The server listens on `127.0.0.1` by default. Set `PORT` to change the port.

## Decision storage modes

VETO has one storage interface and three interchangeable backends. Only one backend is active at a time.

### 1. SQLite (default — preserves the current local setup)

```text
VETO_STORE=sqlite
```

The default database is `data/veto.sqlite`. You can override the path with `VETO_DB_PATH`. This remains the default so an existing local SQLite history is not silently replaced.

### 2. JSON file (local development / intermediate prototype)

PowerShell:

```powershell
$env:VETO_STORE = "json"
npm start
```

The store creates `data/decisions.json` automatically. Override it with `VETO_JSON_PATH`.

### 3. MongoDB (persistent database)

PowerShell:

```powershell
$env:VETO_STORE = "mongodb"
$env:MONGODB_URI = "your-mongodb-connection-string"
npm start
```

Use your own MongoDB connection string and keep it in an environment variable. Do not commit credentials to GitHub. VETO creates/uses the `decisions` collection in the selected database.

**Important:** changing the storage mode does not copy records between databases. The existing SQLite database and the older `Html/js/veto_decisions.json` export are left untouched. No SQLite-to-JSON or SQLite-to-MongoDB history migration is performed automatically.

## API

All API responses are JSON. Decision objects keep the same shape used by the existing frontend:

```json
{
  "id": "unique-id",
  "savedAt": "2026-11-19T10:00:00.000Z",
  "outcome": "delayed",
  "draft": {
    "name": "Desk lamp",
    "price": "1200"
  }
}
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check API and active storage mode |
| `GET` | `/api/decisions` | List decisions, newest first |
| `GET` | `/api/decisions/:id` | Read one decision |
| `POST` | `/api/decisions` | Create a decision |
| `PUT` | `/api/decisions/:id` | Update the outcome and/or draft of a decision |
| `DELETE` | `/api/decisions/:id` | Delete a decision |

The existing frontend's `GET /api/decisions` and `POST /api/decisions` calls remain compatible. Request bodies are limited to 256 KB and validated on the server. Duplicate IDs return `409`; missing records return `404`.

## Tests

```bash
npm test
```

The tests use Node's built-in test runner and an in-memory test store; the JSON store tests use temporary files. They do not need a MongoDB account.

## Security and deployment notes

- The server binds to `127.0.0.1`, which is appropriate for local development.
- The API does not yet include user accounts or authentication. Do not expose it to the public internet or use it for multiple users until authentication, authorization, HTTPS, and deployment configuration are added.
- Keep MongoDB credentials and other secrets out of source control.
- Local decision files and SQLite database files are ignored by Git.

## Development team

Developed as the primary Project-Based Learning deliverable for the CSE6 2025 Web Programming course (Semester 3) at BML Munjal University by Aman Sharma, Saksham Dixit, Anirudh Singh, and Himanshu Pal.
