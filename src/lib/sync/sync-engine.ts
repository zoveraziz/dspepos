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
        mutations: pendingMutations.map((m) => ({
          mutation_id: m.mutation_id,
          record_id: m.record_id,
          action: m.action,
          payload: JSON.parse(m.payload),
        })),
      };

      const res = await fetch(this.endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(requestPayload),
      });

      const data = await res.json();

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
        this.emit("error", data.error || "সিঙ্ক এরর");
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
}

export const syncEngine = new SyncEngine();
