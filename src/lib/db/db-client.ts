import { TransactionRecord, DailySummaryRow, SyncMutation, DbTransactionStatement } from "./types";
import { DB_SCHEMA_SQL } from "./schema";

function normalizeDate(d: any): string {
  if (!d) return "";
  const str = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return str;
}

function normalizeTime(t: any): string {
  if (!t) return "00:00:00";
  const str = String(t).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return str;
}

class DatabaseManager {
  private worker: Worker | null = null;
  private dbId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private messageCounter = 0;
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private isFallbackMode = false;
  private idb: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private post(type: string, args: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error("Worker not initialized"));
      const messageId = `msg_${++this.messageCounter}_${Date.now()}`;

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error(`Worker request '${type}' timed out`));
        }
      }, 8000);

      this.pendingRequests.set(messageId, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.worker.postMessage({
        type,
        messageId,
        dbId: this.dbId,
        args,
      });
    });
  }

  private async _performInit(): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      const hasIsolation = window.crossOriginIsolated;
      const hasOPFS = typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;

      if (!hasIsolation || !hasOPFS) {
        await this._initIndexedDBFallback();
        return;
      }

      this.worker = new Worker("/sqlite/sqlite3-worker1.mjs", { type: "module" });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for sqlite3 worker1-ready"));
        }, 3000);

        const onReady = (ev: MessageEvent) => {
          if (ev.data?.type === "sqlite3-api" && ev.data?.result === "worker1-ready") {
            clearTimeout(timeout);
            this.worker?.removeEventListener("message", onReady);
            resolve();
          }
        };

        this.worker!.addEventListener("message", onReady);
      });

      this.worker.onmessage = (ev: MessageEvent) => {
        const data = ev.data;
        if (!data) return;
        const { messageId, type, result, error } = data;
        if (messageId && this.pendingRequests.has(messageId)) {
          const handler = this.pendingRequests.get(messageId)!;
          this.pendingRequests.delete(messageId);
          if (type === "error") {
            handler.reject(new Error(result?.message || error || "SQLite Worker Error"));
          } else {
            handler.resolve(result);
          }
        }
      };

      const openRes = await this.post("open", {
        filename: "madhuban_showroom_v1.sqlite3",
        vfs: "opfs",
      });

      this.dbId = openRes.dbId;

      await this.post("exec", {
        sql: "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
      });

      await this.post("exec", {
        sql: DB_SCHEMA_SQL,
      });

      console.log("[DB] SQLite3 WASM + OPFS Initialized successfully (0ms latency).");
    } catch (err) {
      console.warn("[DB] SQLite OPFS failed, activating Resilient IDB Engine:", err);
      if (this.worker) {
        try { this.worker.terminate(); } catch {}
        this.worker = null;
      }
      await this._initIndexedDBFallback();
    }
  }

  private async _initIndexedDBFallback(): Promise<void> {
    this.isFallbackMode = true;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("madhuban_showroom_idb_v1", 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains("transactions")) {
          const store = db.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("date", "date", { unique: false });
          store.createIndex("type", "type", { unique: false });
        }
        if (!db.objectStoreNames.contains("sync_outbox")) {
          const store = db.createObjectStore("sync_outbox", { keyPath: "mutation_id" });
          store.createIndex("status", "status", { unique: false });
        }
      };
      request.onsuccess = (e: any) => {
        this.idb = e.target.result;
        console.log("[DB] Resilient IndexedDB fallback active.");
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async executeTransaction(statements: DbTransactionStatement[]): Promise<void> {
    await this.init();

    if (!this.isFallbackMode && this.worker && this.dbId) {
      await this.post("exec", { sql: "BEGIN IMMEDIATE TRANSACTION;" });
      try {
        for (const st of statements) {
          await this.post("exec", {
            sql: st.sql,
            bind: st.params || [],
          });
        }
        await this.post("exec", { sql: "COMMIT;" });
      } catch (e) {
        await this.post("exec", { sql: "ROLLBACK;" });
        throw e;
      }
      return;
    }

    if (this.idb) {
      return new Promise((resolve, reject) => {
        const tx = this.idb!.transaction(["transactions", "sync_outbox"], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        for (const st of statements) {
          const sql = st.sql.trim();
          if (sql.startsWith("INSERT INTO transactions")) {
            const p = st.params!;
            const amt = Number(p[4]) || 0;
            const dateStr = String(p[1] || "").trim();
            // Protect local store: never overwrite with 0 or missing date
            if (amt > 0 && dateStr.length >= 8) {
              tx.objectStore("transactions").put({
                id: p[0],
                date: p[1],
                time: p[2],
                type: p[3],
                amount: amt,
                serial_no: Number(p[5]) || 0,
                notes: p[6] || "",
                created_at: p[7] || new Date().toISOString(),
                updated_at: p[8] || new Date().toISOString(),
                is_deleted: 0,
              });
            }
          } else if (sql.startsWith("INSERT INTO sync_outbox")) {
            const p = st.params!;
            tx.objectStore("sync_outbox").put({
              mutation_id: p[0],
              record_id: p[1],
              action: p[2],
              payload: p[3],
              status: "PENDING",
              retry_count: 0,
              created_at: new Date().toISOString(),
            });
          } else if (sql.startsWith("DELETE FROM sync_outbox WHERE mutation_id IN")) {
            const matches = sql.match(/'([^']+)'/g);
            if (matches) {
              const outboxStore = tx.objectStore("sync_outbox");
              matches.forEach((m) => outboxStore.delete(m.replace(/'/g, "")));
            }
          } else if (sql.includes("transactions") && sql.includes("is_deleted = 1")) {
            const id = st.params && st.params.length > 1 ? st.params[1] : st.params?.[0];
            if (id) {
              const req = tx.objectStore("transactions").get(id);
              req.onsuccess = () => {
                if (req.result) {
                  req.result.is_deleted = 1;
                  tx.objectStore("transactions").put(req.result);
                }
              };
            }
          }
        }
      });
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.init();

    if (!this.isFallbackMode && this.worker && this.dbId) {
      const res = await this.post("exec", {
        sql,
        bind: params,
        rowMode: "object",
        resultRows: [],
      });
      return (res?.resultRows || []) as T[];
    }

    if (this.idb) {
      return new Promise((resolve) => {
        if (sql.includes("FROM transactions")) {
          const tx = this.idb!.transaction("transactions", "readonly");
          const store = tx.objectStore("transactions");
          const req = store.getAll();
          req.onsuccess = () => {
            let list = (req.result as TransactionRecord[]).filter((r) => !r.is_deleted);
            list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
            resolve(list as unknown as T[]);
          };
        } else if (sql.includes("FROM sync_outbox")) {
          const tx = this.idb!.transaction("sync_outbox", "readonly");
          const store = tx.objectStore("sync_outbox");
          const req = store.getAll();
          req.onsuccess = () => {
            const list = (req.result as SyncMutation[]).filter((m) => m.status === "PENDING");
            resolve(list as unknown as T[]);
          };
        } else {
          resolve([]);
        }
      });
    }

    return [];
  }

  // Quick Customer Sale (Just Amount!)
  async addSale(amount: number): Promise<TransactionRecord> {
    const today = this.getTodayDateString();
    const todaySales = await this.getTodaySales();
    const nextSerial = todaySales.length + 1;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const record: TransactionRecord = {
      id: crypto.randomUUID(),
      date: today,
      time: timeStr,
      type: "SALE",
      amount: Number(amount),
      serial_no: nextSerial,
      notes: `কাস্টমার #${nextSerial}`,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_deleted: 0,
    };

    const mutationId = crypto.randomUUID();
    const payloadStr = JSON.stringify(record);

    await this.executeTransaction([
      {
        sql: `INSERT INTO transactions (id, date, time, type, amount, serial_no, notes, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          record.id,
          record.date,
          record.time,
          record.type,
          record.amount,
          record.serial_no,
          record.notes,
          record.created_at,
          record.updated_at,
        ],
      },
      {
        sql: `INSERT INTO sync_outbox (mutation_id, record_id, action, payload) VALUES (?, ?, 'INSERT', ?)`,
        params: [mutationId, record.id, payloadStr],
      },
    ]);

    return record;
  }

  // Add Daily Purchase (মাল ক্রয়)
  async addPurchase(amount: number, notes?: string): Promise<TransactionRecord> {
    const today = this.getTodayDateString();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const record: TransactionRecord = {
      id: crypto.randomUUID(),
      date: today,
      time: timeStr,
      type: "PURCHASE",
      amount: Number(amount),
      serial_no: 0,
      notes: notes || "মধু বন মাল ক্রয়",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_deleted: 0,
    };

    const mutationId = crypto.randomUUID();
    const payloadStr = JSON.stringify(record);

    await this.executeTransaction([
      {
        sql: `INSERT INTO transactions (id, date, time, type, amount, serial_no, notes, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          record.id,
          record.date,
          record.time,
          record.type,
          record.amount,
          record.serial_no,
          record.notes,
          record.created_at,
          record.updated_at,
        ],
      },
      {
        sql: `INSERT INTO sync_outbox (mutation_id, record_id, action, payload) VALUES (?, ?, 'INSERT', ?)`,
        params: [mutationId, record.id, payloadStr],
      },
    ]);

    return record;
  }

  // Get Today's Sales
  async getTodaySales(): Promise<TransactionRecord[]> {
    const today = this.getTodayDateString();
    const all = await this.query<TransactionRecord>(
      `SELECT * FROM transactions WHERE date = ? AND type = 'SALE' AND is_deleted = 0 ORDER BY serial_no ASC`,
      [today]
    );
    return all.filter((r) => r.date === today && r.type === "SALE" && !r.is_deleted);
  }

  // Get Today's Purchases
  async getTodayPurchases(): Promise<TransactionRecord[]> {
    const today = this.getTodayDateString();
    const all = await this.query<TransactionRecord>(
      `SELECT * FROM transactions WHERE date = ? AND type = 'PURCHASE' AND is_deleted = 0 ORDER BY created_at ASC`,
      [today]
    );
    return all.filter((r) => r.date === today && r.type === "PURCHASE" && !r.is_deleted);
  }

  // Delete a transaction
  async deleteTransaction(id: string): Promise<void> {
    const mutationId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.executeTransaction([
      {
        sql: `UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        params: [now, id],
      },
      {
        sql: `INSERT INTO sync_outbox (mutation_id, record_id, action, payload) VALUES (?, ?, 'DELETE', ?)`,
        params: [mutationId, id, JSON.stringify({ id, updated_at: now })],
      },
    ]);
  }

  // Google Sheets Style Combined Daily/Monthly Table:
  // [তারিখ, মাল ক্রয় (৳), মাল বিক্রি (৳), অবশিষ্ট স্টক (৳)]
  async getDailySummaries(): Promise<DailySummaryRow[]> {
    const all = await this.query<TransactionRecord>(
      "SELECT * FROM transactions WHERE is_deleted = 0 ORDER BY date ASC, created_at ASC"
    );

    const activeRecords = all.filter((r) => !r.is_deleted);

    // Group by Date
    const dateMap = new Map<string, { purchase: number; sale: number; count: number }>();

    activeRecords.forEach((r) => {
      const d = r.date;
      if (!dateMap.has(d)) {
        dateMap.set(d, { purchase: 0, sale: 0, count: 0 });
      }
      const item = dateMap.get(d)!;
      if (r.type === "PURCHASE") {
        item.purchase += r.amount;
      } else if (r.type === "SALE") {
        item.sale += r.amount;
        item.count += 1;
      }
    });

    // Sort Dates Ascending to calculate running cumulative stock
    const sortedDates = Array.from(dateMap.keys()).sort();
    let cumulativeStock = 0;
    const result: DailySummaryRow[] = [];

    sortedDates.forEach((date) => {
      const data = dateMap.get(date)!;
      cumulativeStock += data.purchase - data.sale;
      result.push({
        date,
        total_purchase: data.purchase,
        total_sale: data.sale,
        remaining_stock: cumulativeStock,
        sales_count: data.count,
      });
    });

    // Return Descending so latest date is on top
    return result.reverse();
  }

  // Pending Outbox & Sync methods
  async getPendingMutations(limit = 50): Promise<SyncMutation[]> {
    return this.query<SyncMutation>(
      `SELECT * FROM sync_outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ${limit}`
    );
  }

  async markMutationsSynced(mutationIds: string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    const formatted = mutationIds.map((id) => `'${id}'`).join(",");
    await this.executeTransaction([
      { sql: `DELETE FROM sync_outbox WHERE mutation_id IN (${formatted})` },
    ]);
  }

  async applyServerDeltas(serverRecords: TransactionRecord[]): Promise<void> {
    if (!serverRecords || serverRecords.length === 0) return;
    const statements: DbTransactionStatement[] = [];

    for (const item of serverRecords) {
      if (!item) continue;
      if (item.is_deleted) {
        statements.push({
          sql: `UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`,
          params: [item.updated_at, item.id],
        });
      } else {
        const amt = Number(item.amount) || 0;
        const dateStr = normalizeDate(item.date);
        const timeStr = normalizeTime(item.time);
        // Never allow invalid/empty server entries to overwrite valid local data
        if (amt <= 0 || !dateStr || dateStr.length !== 10) continue;

        statements.push({
          sql: `INSERT INTO transactions (id, date, time, type, amount, serial_no, notes, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(id) DO UPDATE SET
                  date = excluded.date,
                  time = excluded.time,
                  type = excluded.type,
                  amount = excluded.amount,
                  serial_no = excluded.serial_no,
                  notes = excluded.notes,
                  updated_at = excluded.updated_at
                WHERE excluded.updated_at > transactions.updated_at`,
          params: [
            String(item.id || crypto.randomUUID()),
            dateStr,
            timeStr,
            String(item.type || "SALE"),
            amt,
            Number(item.serial_no) || 0,
            String(item.notes || ""),
            String(item.created_at || item.updated_at || new Date().toISOString()),
            String(item.updated_at || new Date().toISOString()),
          ],
        });
      }
    }

    await this.executeTransaction(statements);
  }

  async clearAllData(): Promise<void> {
    await this.init();
    if (!this.isFallbackMode && this.worker && this.dbId) {
      await this.post("exec", { sql: "DELETE FROM transactions; DELETE FROM sync_outbox;" });
    }
    if (this.idb) {
      const tx = this.idb.transaction(["transactions", "sync_outbox"], "readwrite");
      tx.objectStore("transactions").clear();
      tx.objectStore("sync_outbox").clear();
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("madhuban_last_sync_time");
    }
  }

  private getTodayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

export const dbManager = new DatabaseManager();
