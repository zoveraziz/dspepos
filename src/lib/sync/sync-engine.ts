import { dbManager } from "../db/db-client";
import { TransactionRecord } from "../db/types";

export type SyncState = "idle" | "syncing" | "offline" | "synced" | "error";

class SyncEngine {
  private isRunning = false;
  private endpointUrl: string = "";
  private listeners: Set<(state: SyncState, message?: string) => void> = new Set();
  private lastSyncTime: string = "";

  constructor() {
    if (typeof window !== "undefined") {
      this.endpointUrl = localStorage.getItem("madhuban_gas_url") || "https://script.google.com/macros/s/AKfycbz-GjX0kwJAGfx6Nt9IXv3xWsiteWxXNpEEBwarG7D_T0fAS4ONAewYfehWG_Jd4lC_/exec";
      localStorage.setItem("madhuban_gas_url", this.endpointUrl);
      this.lastSyncTime = localStorage.getItem("madhuban_last_sync_time") || "";

      window.addEventListener("online", () => {
        this.emit("idle", "Online detected, starting sync...");
        this.triggerSync();
      });

      window.addEventListener("offline", () => {
        this.emit("offline", "অফলাইন মোড (লোকাল ডাটাবেজে সেভ হচ্ছে)");
      });

      setInterval(() => {
        if (navigator.onLine && !this.isRunning && this.endpointUrl) {
          this.triggerSync();
        }
      }, 30000);
    }
  }

  setEndpointUrl(url: string) {
    this.endpointUrl = url.trim();
    if (typeof window !== "undefined") {
      localStorage.setItem("madhuban_gas_url", this.endpointUrl);
    }
  }

  getEndpointUrl(): string {
    return this.endpointUrl;
  }

  subscribe(callback: (state: SyncState, message?: string) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(state: SyncState, message?: string) {
    this.listeners.forEach((cb) => cb(state, message));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("madhuban-sync-event", {
          detail: { state, message, timestamp: new Date().toLocaleTimeString() },
        })
      );
    }
  }

  async triggerSync(): Promise<boolean> {
    if (this.isRunning) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.emit("offline", "অফলাইন মোড");
      return false;
    }

    if (!this.endpointUrl) {
      this.emit("idle", "গুগল শিট সিঙ্ক লিংক সেট করুন");
      return false;
    }

    this.isRunning = true;
    this.emit("syncing", "গুগল শিটে সিঙ্ক হচ্ছে...");

    try {
      const pendingMutations = await dbManager.getPendingMutations(50);
      const mutationIds = pendingMutations.map((m) => m.mutation_id);

      const requestPayload = {
        action: "BATCH_SYNC",
        lastSyncTime: this.lastSyncTime,
        mutations: pendingMutations.map((m) => {
          let parsedPayload: any = m.payload;
          while (typeof parsedPayload === "string") {
            try {
              parsedPayload = JSON.parse(parsedPayload);
            } catch {
              break;
            }
          }
          return {
            mutation_id: m.mutation_id,
            record_id: m.record_id,
            action: m.action,
            payload: parsedPayload || {},
          };
        }),
      };

      let data: any = null;
      let errorMsg = "";

      try {
        const proxyRes = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpointUrl: this.endpointUrl,
            payload: requestPayload,
          }),
        });
        if (proxyRes.ok) {
          data = await proxyRes.json();
        } else {
          try {
            const errJson = await proxyRes.json();
            errorMsg = errJson.error || `HTTP ${proxyRes.status}`;
          } catch {
            errorMsg = `HTTP ${proxyRes.status}`;
          }
        }
      } catch (proxyErr: any) {
        console.warn("[SyncEngine] Proxy fetch error:", proxyErr);
        errorMsg = proxyErr?.message || "Proxy request failed";
      }

      if (!data && this.endpointUrl) {
        try {
          const res = await fetch(this.endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(requestPayload),
          });
          data = await res.json();
        } catch (directErr) {
          console.warn("[SyncEngine] Direct fetch fallback failed:", directErr);
        }
      }

      if (data && data.success) {
        if (mutationIds.length > 0) {
          await dbManager.markMutationsSynced(mutationIds);
        }

        if (data.serverChanges && data.serverChanges.length > 0) {
          await dbManager.applyServerDeltas(data.serverChanges as TransactionRecord[]);
        }

        this.lastSyncTime = data.serverTime || new Date().toISOString();
        if (typeof window !== "undefined") {
          localStorage.setItem("madhuban_last_sync_time", this.lastSyncTime);
        }

        this.emit("synced", `গুগল শিটে সিঙ্ক সম্পন্ন (${pendingMutations.length} এন্ট্রি)`);
        return true;
      } else {
        const finalError = data?.error || errorMsg || "সিঙ্ক এরর";
        this.emit("error", finalError);
        return false;
      }
    } catch (err: any) {
      console.warn("[SyncEngine] Sync error:", err);
      this.emit("error", "সার্ভার এরর বা নেটওয়ার্ক টাইমআউট");
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  async clearRemoteAndLocalData(): Promise<boolean> {
    this.emit("syncing", "গুগল শিট ও লোকাল ডাটা পরিষ্কার করা হচ্ছে...");
    try {
      const requestPayload = {
        action: "CLEAR_ALL_DATA",
      };

      try {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpointUrl: this.endpointUrl,
            payload: requestPayload,
          }),
        });
      } catch (e) {
        if (this.endpointUrl) {
          await fetch(this.endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(requestPayload),
          });
        }
      }

      await dbManager.clearAllData();
      this.lastSyncTime = "";
      if (typeof window !== "undefined") {
        localStorage.removeItem("madhuban_last_sync_time");
      }
      this.emit("synced", "ডাটাবেজ ও গুগল শিট সম্পূর্ণ ফ্রেশ করা হয়েছে");
      return true;
    } catch (err: any) {
      console.warn("[SyncEngine] Clear error:", err);
      this.emit("error", "ডাটা ক্লিয়ার করতে সমস্যা হয়েছে");
      return false;
    }
  }
}

export const syncEngine = new SyncEngine();
