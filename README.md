# DSP ePOS (Digital Service Point - Offline-First Point of Sale)

> **Rocket-Speed • Offline-First • Zero React Re-render • In-Browser SQLite (OPFS) • Google Sheets Two-Way Sync • PWA Auto-Update • ESC/POS Print Bridge**

---

## ⚡ Core Features

1. **Progressive Web App (PWA)**: Installable on Mobile, Tablet, and Desktop as a native standalone app with offline support.
2. **Offline-First with SQLite (OPFS)**: Full ACID transactional database running directly in the browser via Origin Private File System (`sqlite3.wasm`). 0ms read/write latency.
3. **Resilient Fallback**: Automatically switches to an IndexedDB ACID engine if OPFS is unavailable on older devices.
4. **Google Sheets Two-Way Sync**:
   - Outbox pattern ensures offline sales are safely queued.
   - Batch syncs with Google Spreadsheet via Google Apps Script.
   - `LockService` prevents concurrent write race conditions.
   - Remote deltas auto-sync back to the client SQLite database.
5. **Zero-Re-render CSS-First UI**:
   - React mounts static structural shells once.
   - View tabs, dialogs, calculations, and lists operate via pure CSS state machines (`:checked`, `:has()`) and direct DOM manipulation (`ref.current`), completely bypassing React reconciliation overhead.
6. **Auto Update**: Service worker detects new deployments every 60s, triggers `skipWaiting()`, and updates the cache without losing un-synced data.
7. **Dual Print Bridge**:
   - **Direct ESC/POS Hardware Printing**: Web Serial API connection to USB/Serial 58mm/80mm thermal receipt printers without browser print dialogs.
   - **Zero-Reflow CSS Print**: Fallback `@media print` layout for standard document and roll printers.

---

## 🚀 Getting Started

### 1. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or an Android browser.

### 2. Connect Google Spreadsheet for Sync
1. Open your Google Spreadsheet.
2. Go to **Extensions > Apps Script**.
3. Copy all the code from `backend-gas/Code.js` and paste it into the editor.
4. Click **Deploy > New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL and paste it into the **Settings** tab in DSP ePOS!

### 3. Connect Thermal Printer (Optional)
- Plug your 58mm or 80mm thermal receipt printer via USB or Serial.
- Click **"🔌 Connect POS Printer"** in the top navigation bar.
- Select your printer port from the browser prompt.
- Invoices will print silently and instantly!
