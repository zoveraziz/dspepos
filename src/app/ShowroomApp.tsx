"use client";

import { useEffect, useRef, useState } from "react";
import { dbManager } from "@/lib/db/db-client";
import { syncEngine } from "@/lib/sync/sync-engine";
import { printBridge } from "@/lib/print/print-bridge";
import { initPWA } from "@/lib/pwa/pwa-client";
import { TransactionRecord, DailySummaryRow } from "@/lib/db/types";
import { GAS_CODE_TEMPLATE } from "@/lib/gas-template";

export default function ShowroomApp() {
  // Active Tab State (Explicit and reliable)
  const [activeTab, setActiveTab] = useState<"counter" | "monthly" | "purchase" | "sync">("counter");
  const [gasCopied, setGasCopied] = useState(false);

  // DOM References (Zero React Re-render Engine for Sales & Calculations)
  const syncPillRef = useRef<HTMLDivElement>(null);
  const syncMsgRef = useRef<HTMLSpanElement>(null);
  const printerBtnRef = useRef<HTMLButtonElement>(null);

  // Quick Counter Inputs & Controls
  const saleAmountInputRef = useRef<HTMLInputElement>(null);
  const autoPrintCheckboxRef = useRef<HTMLInputElement>(null);
  const purchaseAmountInputRef = useRef<HTMLInputElement>(null);
  const purchaseNotesInputRef = useRef<HTMLInputElement>(null);

  // Live Summary Badge Display Refs (Direct DOM updates)
  const liveTodaySaleRef = useRef<HTMLDivElement>(null);
  const liveTodayPurchaseRef = useRef<HTMLDivElement>(null);
  const liveCustomerCountRef = useRef<HTMLDivElement>(null);
  const tableTotalSaleRef = useRef<HTMLSpanElement>(null);
  const footerTotalSaleRef = useRef<HTMLSpanElement>(null);

  // Monthly Overview Badge Display Refs
  const monthlyTotalPurchaseRef = useRef<HTMLDivElement>(null);
  const monthlyTotalSaleRef = useRef<HTMLDivElement>(null);
  const monthlyRemainingStockRef = useRef<HTMLDivElement>(null);

  // Tables
  const todaySalesTableBodyRef = useRef<HTMLTableSectionElement>(null);
  const monthlyTableBodyRef = useRef<HTMLTableSectionElement>(null);
  const purchasesTableBodyRef = useRef<HTMLTableSectionElement>(null);
  const gasUrlInputRef = useRef<HTMLInputElement>(null);

  // In-memory cache for fast search & offline access
  const todaySalesCacheRef = useRef<TransactionRecord[]>([]);

  // Theme Mode (Dark / Light)
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem("dsp_epos_theme") as "dark" | "light") || "dark";
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
      if (saved === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch {}
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("dsp_epos_theme", next);
    } catch {}
  };

  useEffect(() => {
    // Unregister stale service workers in dev
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.update();
        }
      });
    }

    initPWA();
    dbManager.init().then(() => {
      refreshAllData();
      syncEngine.triggerSync();
    });

    if (gasUrlInputRef.current) {
      gasUrlInputRef.current.value = syncEngine.getEndpointUrl();
    }

    // Direct DOM Sync Status Listener
    const handleSyncEvent = (e: any) => {
      const { state, message } = e.detail;
      if (syncPillRef.current) {
        syncPillRef.current.setAttribute("data-status", state);
      }
      if (syncMsgRef.current) {
        syncMsgRef.current.textContent = message || state;
      }
      if (state === "synced") {
        refreshAllData();
      }
    };

    window.addEventListener("madhuban-sync-event", handleSyncEvent);

    // Auto-focus the sale amount input on load
    saleAmountInputRef.current?.focus();

    return () => {
      window.removeEventListener("madhuban-sync-event", handleSyncEvent);
    };
  }, []);

  // When active tab changes, refresh relevant DOM data and auto-focus
  useEffect(() => {
    refreshAllData();
    if (activeTab === "counter") {
      setTimeout(() => saleAmountInputRef.current?.focus(), 50);
    }
  }, [activeTab]);

  // Refresh All Tables & KPI Badges (Direct DOM - 0ms React overhead)
  const refreshAllData = async () => {
    try {
      // 1. Load Today's Sales
      const sales = await dbManager.getTodaySales();
      todaySalesCacheRef.current = sales;
      renderTodaySales(sales);

      // 2. Load Today's Purchases
      const purchases = await dbManager.getTodayPurchases();
      renderTodayPurchases(purchases);

      // 3. Compute Today's Totals
      const todaySalesTotal = sales.reduce((acc, curr) => acc + curr.amount, 0);
      const todayPurchaseTotal = purchases.reduce((acc, curr) => acc + curr.amount, 0);

      if (liveTodaySaleRef.current) liveTodaySaleRef.current.textContent = `৳${todaySalesTotal.toLocaleString("bn-BD")}`;
      if (tableTotalSaleRef.current) tableTotalSaleRef.current.textContent = `৳${todaySalesTotal.toLocaleString("bn-BD")}`;
      if (footerTotalSaleRef.current) footerTotalSaleRef.current.textContent = `৳${todaySalesTotal.toLocaleString("bn-BD")}`;
      if (liveTodayPurchaseRef.current) liveTodayPurchaseRef.current.textContent = `৳${todayPurchaseTotal.toLocaleString("bn-BD")}`;
      if (liveCustomerCountRef.current) liveCustomerCountRef.current.textContent = `${sales.length} জন`;

      // 4. Load Combined Monthly Sheet Table
      const summaries = await dbManager.getDailySummaries();
      renderMonthlySummaries(summaries);
    } catch (e) {
      console.error("[ePOS] Failed to refresh data:", e);
    }
  };

  // Render Today's Sales Table
  const renderTodaySales = (sales: TransactionRecord[]) => {
    if (!todaySalesTableBodyRef.current) return;

    if (sales.length === 0) {
      todaySalesTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-slate-400">
            আজকে এখনও কোনো বিক্রি এন্ট্রি করা হয়নি। উপরে টাকার অঙ্ক লিখে Enter চাপুন।
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    const reversed = [...sales].reverse();

    reversed.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-bold text-amber-400 font-mono">#${s.serial_no}</td>
        <td class="text-slate-300">${s.time}</td>
        <td class="font-semibold text-white">কাস্টমার #${s.serial_no}</td>
        <td class="font-bold text-lg text-emerald-400">৳${s.amount.toFixed(2)}</td>
        <td class="text-right">
          <button data-action="print" data-id="${s.id}" class="btn-secondary mr-2" title="রিসিট প্রিন্ট">
            🖨️ স্লিপ
          </button>
          <button data-action="delete" data-id="${s.id}" class="btn-danger" title="মুছুন">
            🗑️
          </button>
        </td>
      `;
      fragment.appendChild(tr);
    });

    todaySalesTableBodyRef.current.replaceChildren(fragment);
  };

  // Render Monthly Combined Table (ক্রয় | বিক্রি | অবশিষ্ট স্টক)
  const renderMonthlySummaries = (summaries: DailySummaryRow[]) => {
    if (!monthlyTableBodyRef.current) return;

    let totalMonthPurchase = 0;
    let totalMonthSale = 0;

    if (summaries.length === 0) {
      monthlyTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-slate-400">
            কোনো হিসাব পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    summaries.forEach((row) => {
      totalMonthPurchase += row.total_purchase;
      totalMonthSale += row.total_sale;

      const tr = document.createElement("tr");
      const isPositive = row.remaining_stock >= 0;

      tr.innerHTML = `
        <td class="font-semibold text-slate-200 font-mono">${row.date}</td>
        <td class="font-bold text-blue-400">৳${row.total_purchase.toLocaleString("bn-BD")}</td>
        <td class="font-bold text-emerald-400">৳${row.total_sale.toLocaleString("bn-BD")}</td>
        <td class="font-bold ${isPositive ? 'text-amber-400' : 'text-red-400'}">
          ৳${row.remaining_stock.toLocaleString("bn-BD")}
        </td>
        <td class="text-slate-400">${row.sales_count} জন</td>
      `;
      fragment.appendChild(tr);
    });

    monthlyTableBodyRef.current.replaceChildren(fragment);

    const netBalance = totalMonthPurchase - totalMonthSale;
    if (monthlyTotalPurchaseRef.current) monthlyTotalPurchaseRef.current.textContent = `৳${totalMonthPurchase.toLocaleString("bn-BD")}`;
    if (monthlyTotalSaleRef.current) monthlyTotalSaleRef.current.textContent = `৳${totalMonthSale.toLocaleString("bn-BD")}`;
    if (monthlyRemainingStockRef.current) monthlyRemainingStockRef.current.textContent = `৳${netBalance.toLocaleString("bn-BD")}`;
  };

  // Render Today's Purchases
  const renderTodayPurchases = (purchases: TransactionRecord[]) => {
    if (!purchasesTableBodyRef.current) return;

    if (purchases.length === 0) {
      purchasesTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-6 text-slate-400">
            আজকে কোনো মাল ক্রয় এন্ট্রি করা হয়নি।
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    purchases.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-slate-300">${p.time}</td>
        <td class="font-semibold text-white">${p.notes || "DSP মাল ক্রয়"}</td>
        <td class="font-bold text-lg text-blue-400">৳${p.amount.toFixed(2)}</td>
        <td class="text-right">
          <button data-action="delete" data-id="${p.id}" class="btn-danger">🗑️</button>
        </td>
      `;
      fragment.appendChild(tr);
    });
    purchasesTableBodyRef.current.replaceChildren(fragment);
  };

  // Handle Quick Sale Entry (Manager types amount & hits Enter)
  const handleQuickSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleAmountInputRef.current) return;

    const val = parseFloat(saleAmountInputRef.current.value);
    if (!val || val <= 0) {
      saleAmountInputRef.current.focus();
      return;
    }

    try {
      const record = await dbManager.addSale(val);

      saleAmountInputRef.current.value = "";
      saleAmountInputRef.current.focus();

      await refreshAllData();

      if (autoPrintCheckboxRef.current?.checked) {
        await printBridge.printSlip(record);
      }

      syncEngine.triggerSync();
    } catch (err: any) {
      alert("বিক্রি সেভ করতে সমস্যা হয়েছে: " + err.message);
    }
  };

  // Handle Quick Purchase Entry (Owner adds purchase amount)
  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseAmountInputRef.current) return;

    const amt = parseFloat(purchaseAmountInputRef.current.value);
    const notes = purchaseNotesInputRef.current?.value || "";

    if (!amt || amt <= 0) return;

    try {
      await dbManager.addPurchase(amt, notes);
      if (purchaseAmountInputRef.current) purchaseAmountInputRef.current.value = "";
      if (purchaseNotesInputRef.current) purchaseNotesInputRef.current.value = "";

      await refreshAllData();
      syncEngine.triggerSync();
      alert("আজকের মাল ক্রয় সফলভাবে যুক্ত হয়েছে!");
    } catch (err: any) {
      alert("ক্রয় সেভ করতে সমস্যা হয়েছে: " + err.message);
    }
  };

  const addQuickAmount = (amt: number) => {
    if (!saleAmountInputRef.current) return;
    const current = parseFloat(saleAmountInputRef.current.value) || 0;
    saleAmountInputRef.current.value = String(current + amt);
    saleAmountInputRef.current.focus();
  };

  const handleTableClick = async (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement;
    if (!target) return;

    const action = target.getAttribute("data-action");
    const recordId = target.getAttribute("data-id");
    if (!recordId) return;

    const record = todaySalesCacheRef.current.find((r) => r.id === recordId);

    if (action === "print" && record) {
      await printBridge.printSlip(record);
    } else if (action === "delete") {
      if (confirm("এই বিক্রির এন্ট্রিটি কি মুছে ফেলতে চান?")) {
        await dbManager.deleteTransaction(recordId);
        await refreshAllData();
        syncEngine.triggerSync();
      }
    }
  };

  const handlePurchaseTableClick = async (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement;
    if (!target) return;

    const action = target.getAttribute("data-action");
    const recordId = target.getAttribute("data-id");
    if (!recordId) return;

    if (action === "delete") {
      if (confirm("এই মাল ক্রয়ের এন্ট্রিটি কি মুছে ফেলতে চান?")) {
        await dbManager.deleteTransaction(recordId);
        await refreshAllData();
        syncEngine.triggerSync();
      }
    }
  };

  const handleConnectPrinter = async () => {
    const ok = await printBridge.connectHardwarePrinter();
    if (printerBtnRef.current) {
      if (ok) {
        printerBtnRef.current.textContent = "🟢 প্রিন্টার সংযুক্ত";
        printerBtnRef.current.style.borderColor = "#10b981";
      } else {
        printerBtnRef.current.textContent = "🔌 থার্মাল প্রিন্টার যুক্ত করুন";
      }
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (gasUrlInputRef.current) {
      syncEngine.setEndpointUrl(gasUrlInputRef.current.value);
      alert("গুগল শিট স্ক্রিপ্ট লিংক সেভ হয়েছে! সিঙ্ক পরীক্ষা করা হচ্ছে...");
      syncEngine.triggerSync();
    }
  };

  const handleCopyGasCode = async () => {
    try {
      await navigator.clipboard.writeText(GAS_CODE_TEMPLATE);
      setGasCopied(true);
      setTimeout(() => setGasCopied(false), 3000);
      alert("✓ গুগল অ্যাপস স্ক্রিপ্ট কোডটি ক্লিপবোর্ডে কপি হয়েছে! আপনার শিটের Apps Script এডিটরে পেস্ট করে সেভ করুন।");
    } catch {
      alert("কোড কপি করতে সমস্যা হয়েছে। অনুগ্রহ করে ব্রাউজার পারমিশন দিন।");
    }
  };

  const handleForceUpdate = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
      localStorage.removeItem("madhuban_last_sync_time");
      window.location.href = window.location.origin + "/?v=" + Date.now();
    } catch {
      window.location.reload();
    }
  };

  const handleClearAllData = async () => {
    const ok = confirm("⚠️ আপনি কি নিশ্চিত যে সমস্ত পরীক্ষামূলক বিক্রি ও ক্রয়ের হিসাব মুছে ফেলে সিস্টেম একদম ফ্রেশ ও নতুন করতে চান?");
    if (!ok) return;

    try {
      await syncEngine.clearRemoteAndLocalData();
      todaySalesCacheRef.current = [];
      await refreshAllData();
      alert("✓ সমস্ত ডাটা সফলভাবে মুছে ফেলা হয়েছে! সিস্টেম এখন একদম নতুন ও ফ্রেশ।");
    } catch (err: any) {
      alert("ডাটা মুছতে সমস্যা হয়েছে: " + err.message);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-badge">DSP</span>
          <h1 className="text-xl font-bold tracking-tight text-white">ডিজিটাল সার্ভিস পয়েন্ট</h1>
          <span className="text-xs text-amber-300 font-semibold hidden sm:inline">DSP ePOS</span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            onClick={toggleTheme}
            className="btn-theme-toggle cursor-pointer"
            title="মোড পরিবর্তন করুন (লাইট / ডার্ক)"
          >
            {theme === "dark" ? "☀️ লাইট মোড" : "🌙 ডার্ক মোড"}
          </button>

          <div ref={syncPillRef} className="sync-status-pill" data-status="idle">
            <span className="inline-block w-2 h-2 rounded-full bg-current"></span>
            <span ref={syncMsgRef}>অফলাইন মোড</span>
          </div>

          <button
            ref={printerBtnRef}
            type="button"
            onClick={handleConnectPrinter}
            className="btn-secondary text-xs cursor-pointer"
          >
            🔌 থার্মাল প্রিন্টার যুক্ত করুন
          </button>
        </div>
      </header>

      {/* TOP LIVE KPI DASHBOARD CARDS */}
      <div className="kpi-section">
        <div className="kpi-grid">
          <div className="kpi-card kpi-card-emerald">
            <div className="kpi-label">💰 সর্বমোট আজকের বিক্রি</div>
            <div ref={liveTodaySaleRef} className="kpi-value kpi-value-emerald">
              ৳০
            </div>
          </div>

          <div className="kpi-card kpi-card-blue">
            <div className="kpi-label">📦 আজকের মাল ক্রয়</div>
            <div ref={liveTodayPurchaseRef} className="kpi-value kpi-value-blue">
              ৳০
            </div>
          </div>

          <div className="kpi-card kpi-card-amber">
            <div className="kpi-label">👥 আজকের মোট কাস্টমার</div>
            <div ref={liveCustomerCountRef} className="kpi-value kpi-value-amber">
              ০ জন
            </div>
          </div>

          <div className="kpi-card kpi-card-purple">
            <div className="kpi-label">⚡ সিস্টেম স্পিড</div>
            <div className="kpi-value kpi-value-purple">
              0ms অফলাইন
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <nav className="tab-nav">
        <button
          type="button"
          onClick={() => setActiveTab("counter")}
          className={`tab-btn ${activeTab === "counter" ? "tab-btn-active" : ""}`}
        >
          ⚡ ম্যানেজারের সেলস কাউন্টার (আজকের বিক্রি)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("monthly")}
          className={`tab-btn ${activeTab === "monthly" ? "tab-btn-active" : ""}`}
        >
          📊 মাসের হিসাব ও স্টক শিট (গুগল শিট ফরম্যাট)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("purchase")}
          className={`tab-btn ${activeTab === "purchase" ? "tab-btn-active" : ""}`}
        >
          📦 মাল ক্রয় এন্ট্রি (মালিকের ডেস্ক)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sync")}
          className={`tab-btn ${activeTab === "sync" ? "tab-btn-active" : ""}`}
        >
          ⚙️ গুগল শিট সিঙ্ক
        </button>
      </nav>

      {/* TAB CONTENT PANELS */}
      <main className="flex-1 p-6">
        {/* TAB 1: MANAGER RAPID SALES COUNTER */}
        {activeTab === "counter" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Modern Sales Entry Hero Card */}
            <div className="pos-hero-card">
              <div className="pos-hero-header">
                <div className="pos-hero-title">
                  <span>⚡ ক্যাশ কাউন্টার - দ্রুত বিক্রি এন্ট্রি</span>
                </div>
                <div className="text-xs text-slate-400 hidden sm:block">
                  টাকার অঙ্ক লিখে কিবোর্ডের <kbd className="pos-key-badge">Enter ↵</kbd> চাপলেই বিক্রি সেভ হবে
                </div>
              </div>

              <form onSubmit={handleQuickSaleSubmit} className="space-y-2.5">
                <div className="pos-input-container">
                  <div className="pos-input-wrapper">
                    <span className="pos-currency-symbol">৳</span>
                    <input
                      ref={saleAmountInputRef}
                      type="number"
                      step="any"
                      min="1"
                      placeholder="টাকার পরিমাণ লিখুন (যেমন: ৫০০)"
                      className="pos-amount-input"
                      required
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="submit"
                    className="pos-submit-button"
                  >
                    <span>✓ বিক্রি যোগ করুন</span>
                    <kbd className="pos-key-badge">Enter ↵</kbd>
                  </button>
                </div>

                {/* Controls Bar */}
                <div className="pos-controls-row">
                  <span className="text-xs text-slate-400">
                    💡 কোনো নাম লেখার প্রয়োজন নেই, শুধু বিক্রির টাকা লিখে এন্টার দিন
                  </span>
                  <label className="pos-checkbox-label">
                    <input
                      ref={autoPrintCheckboxRef}
                      type="checkbox"
                    />
                    <span>এন্ট্রি সাথে সাথে প্রিন্ট স্লিপ দিন</span>
                  </label>
                </div>
              </form>
            </div>

            {/* Today's Sales Table */}
            <div className="table-card">
              <div className="table-header">
                <div>
                  <h2 className="text-lg font-bold text-white">আজকের বিক্রি (কাস্টমার বাই কাস্টমার)</h2>
                  <p className="text-xs text-slate-400">প্রতিটি কাস্টমারের বিক্রির টাকা ক্রমানুসারে নিচে যোগ হচ্ছে</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">আজকের সর্বমোট:</span>
                  <span ref={tableTotalSaleRef} className="text-xl font-bold text-emerald-400">
                    ৳০
                  </span>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table" onClick={handleTableClick}>
                  <thead>
                    <tr>
                      <th>ক্রমিক</th>
                      <th>সময়</th>
                      <th>বিবরণ</th>
                      <th>বিক্রির টাকা (৳)</th>
                      <th className="text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody ref={todaySalesTableBodyRef}>
                    {/* Populated directly without React VDOM re-renders */}
                  </tbody>
                </table>
              </div>

              {/* Table Footer with Big Grand Total */}
              <div className="p-4 bg-slate-900/90 border-t border-slate-700 flex justify-between items-center">
                <span className="font-bold text-slate-300 text-base">সর্বমোট আজকের বিক্রি:</span>
                <span ref={footerTotalSaleRef} className="text-2xl font-black text-emerald-400">
                  ৳০
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MONTHLY COMBINED STOCK & SALES SHEET */}
        {activeTab === "monthly" && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="table-card p-6 border-l-4 border-blue-500">
                <div className="text-sm text-slate-400 font-semibold">📦 মাসের সর্বমোট মাল ক্রয়</div>
                <div ref={monthlyTotalPurchaseRef} className="text-3xl font-black text-blue-400 mt-2">
                  ৳০
                </div>
              </div>

              <div className="table-card p-6 border-l-4 border-emerald-500">
                <div className="text-sm text-slate-400 font-semibold">💰 মাসের সর্বমোট মাল বিক্রি</div>
                <div ref={monthlyTotalSaleRef} className="text-3xl font-black text-emerald-400 mt-2">
                  ৳০
                </div>
              </div>

              <div className="table-card p-6 border-l-4 border-amber-500">
                <div className="text-sm text-slate-400 font-semibold">📊 অবশিষ্ট স্টক / ব্যালেন্স</div>
                <div ref={monthlyRemainingStockRef} className="text-3xl font-black text-amber-400 mt-2">
                  ৳০
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-header">
                <div>
                  <h2 className="text-lg font-bold text-white">দৈনিক ক্রয়, বিক্রি ও অবশিষ্ট স্টক শিট</h2>
                  <p className="text-xs text-slate-400">প্রতিদিনের হিসাব এক কলামে ক্রয়, এক কলামে বিক্রি এবং এক কলামে অবশিষ্ট স্টক</p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshAllData()}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  🔄 রিফ্রেশ হিসাব
                </button>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>তারিখ</th>
                      <th>মাল ক্রয় (৳)</th>
                      <th>মাল বিক্রি (৳)</th>
                      <th>অবশিষ্ট স্টক / ব্যালেন্স (৳)</th>
                      <th>মোট কাস্টমার</th>
                    </tr>
                  </thead>
                  <tbody ref={monthlyTableBodyRef}>
                    {/* Daily Combined Rows */}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OWNER DAILY PURCHASE DESK */}
        {activeTab === "purchase" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="table-card p-6 border-2 border-blue-500/40">
              <h2 className="text-lg font-bold text-white mb-2">📦 মাল ক্রয় এন্ট্রি (মালিকের হিসাব)</h2>
              <p className="text-xs text-slate-400 mb-4">
                শোরুমের জন্য আজ কত টাকার মাল ক্রয় করেছেন তা এখানে যোগ করুন। এটি স্বয়ংক্রিয়ভাবে স্টক শিটে যোগ হবে।
              </p>

              <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                <div className="form-group">
                  <label>আজকের মাল ক্রয়ের টাকা (৳) *</label>
                  <input
                    ref={purchaseAmountInputRef}
                    type="number"
                    step="any"
                    min="1"
                    placeholder="যেমন: ২৫০০০"
                    className="form-input text-lg font-bold text-blue-400"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>বিবরণ / চালানের নোট (ঐচ্ছিক)</label>
                  <input
                    ref={purchaseNotesInputRef}
                    placeholder="যেমন: কারখানার মিষ্টি ও কেক চালান"
                    className="form-input"
                  />
                </div>

                <button type="submit" className="btn-primary w-full justify-center py-3 text-base cursor-pointer">
                  + আজকের ক্রয় হিসেবে যুক্ত করুন
                </button>
              </form>
            </div>

            <div className="table-card">
              <div className="table-header">
                <h3 className="font-bold text-white">আজকের মাল ক্রয়ের তালিকা</h3>
              </div>
              <div className="table-wrapper">
                <table className="data-table" onClick={handlePurchaseTableClick}>
                  <thead>
                    <tr>
                      <th>সময়</th>
                      <th>বিবরণ</th>
                      <th>টাকার পরিমাণ (৳)</th>
                      <th className="text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody ref={purchasesTableBodyRef}>
                    {/* Rendered purchases */}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GOOGLE SHEETS SYNC SETTINGS */}
        {activeTab === "sync" && (
          <div className="max-w-3xl mx-auto space-y-6 pb-12 px-2 sm:px-0">
            {/* CARD 1: Google Sheets 2-Way Live Sync Config */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl backdrop-blur relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl text-emerald-400 flex-shrink-0">
                    📊
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                      গুগল শিট ২-মুখী অটো সিঙ্ক
                      <span className="text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        লাইভ ব্যাকআপ
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      মোবাইল, পিসি এবং গুগল স্প্রেডশিটে স্বয়ংক্রিয়ভাবে লেনদেন সিঙ্ক ও ব্যাকআপ রাখুন।
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>🔗 Google Apps Script Web App URL</span>
                    </label>
                    <span className="text-slate-500 font-mono text-[11px]">POST /exec Endpoint</span>
                  </div>
                  <div className="relative">
                    <input
                      ref={gasUrlInputRef}
                      type="url"
                      defaultValue={syncEngine.getEndpointUrl()}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-mono tracking-tight"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    * আপনার স্প্রেডশিট থেকে প্রাপ্ত Apps Script Web App ডেপ্লয়মেন্ট URL লিংকটি এখানে বসান।
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 active:scale-95 transition cursor-pointer text-sm"
                  >
                    <span>💾</span> সেভ ও টেস্ট সিঙ্ক
                  </button>
                  <button
                    type="button"
                    onClick={() => syncEngine.triggerSync()}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-5 py-2.5 rounded-xl border border-slate-700 active:scale-95 transition cursor-pointer text-sm"
                  >
                    <span>🔄</span> এখনই সিঙ্ক করুন
                  </button>
                </div>
              </form>
            </div>

            {/* CARD 2: Step-by-Step Setup Guide */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-lg relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
                    📋
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">গুগল শিট যুক্ত করার সহজ নিয়ম</h3>
                    <p className="text-xs text-slate-400">মাত্র ৪টি সহজ ধাপে সম্পূর্ণ ফ্রিতে সিঙ্ক চালু করুন</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyGasCode}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 px-3.5 py-1.5 rounded-lg active:scale-95 transition cursor-pointer self-start sm:self-auto"
                >
                  <span>📋</span> {gasCopied ? "✓ কোড কপি হয়েছে!" : "Apps Script কোড কপি করুন"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Step 1 */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex gap-3.5 hover:border-slate-700 transition">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/25">
                    ০১
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 mb-1">নতুন স্প্রেডশিট খুলুন</h4>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      গুগল ড্রাইভে গিয়ে একটি নতুন গুগল স্প্রেডশিট (Google Sheet) তৈরি করুন।
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex gap-3.5 hover:border-slate-700 transition">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/25">
                    ০২
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 mb-1">Apps Script-এ যান</h4>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      শিটের ওপরের মেনু থেকে <span className="text-amber-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">Extensions &gt; Apps Script</span> ওপেন করুন।
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex gap-3.5 hover:border-slate-700 transition">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/25">
                    ০৩
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 mb-1">কোড পেস্ট ও Web app ডেপ্লয়</h4>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      পুরনো কোড মুছে আমাদের দেওয়া কোড পেস্ট করুন এবং <span className="text-emerald-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">Deploy &gt; Web app</span> হিসেবে ডেপ্লয় করুন (Who has access: Anyone)।
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex gap-3.5 hover:border-slate-700 transition">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/25">
                    ০৪
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 mb-1">লিংক সেভ ও চালু</h4>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      পাওয়া ওয়েব অ্যাপ লিঙ্কটি ওপরের বক্সে পেস্ট করে <span className="text-teal-300 font-semibold">"সেভ ও টেস্ট সিঙ্ক"</span> বাটনে চাপ দিন।
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 3: Version Update & Cache Refresh */}
            <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 sm:p-7 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl flex-shrink-0 mt-0.5">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-amber-300 text-base">নতুন ভার্সন আপডেট ও ক্যাশ রিফ্রেশ</h3>
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        v2.3.0
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                      মোবাইল বা পিসিতে পুরোনো ক্যাশের কারণে সিঙ্ক আটকে থাকলে বা নতুন কোনো আপডেট না দেখালে এই বাটনে চাপ দিন। এটি ব্রাউজারের পুরোনো ফাইল পরিষ্কার করে সরাসরি লেটেস্ট ভার্সন লোড করবে।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleForceUpdate}
                  className="inline-flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-semibold px-5 py-2.5 rounded-xl active:scale-95 transition cursor-pointer text-xs whitespace-nowrap self-start sm:self-auto shadow-sm"
                >
                  <span>🔄</span> ক্যাশ ক্লিয়ার ও আপডেট
                </button>
              </div>
            </div>

            {/* CARD 4: System Fresh Reset Danger Zone */}
            <div className="bg-slate-900/80 border border-red-500/30 rounded-2xl p-6 sm:p-7 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-500" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 text-xl flex-shrink-0 mt-0.5">
                    ⚠️
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-red-400 text-base">সিস্টেম ফ্রেশ রিসেট (নতুন করে শুরু)</h3>
                      <span className="text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
                        বিপদজনক অঞ্চল
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                      টেস্টিংয়ের সময় যোগ করা সমস্ত বিক্রি ও ক্রয়ের হিসাব গুগল শিট এবং লোকাল ডাটাবেজ থেকে মুছে কাস্টমার সিরিয়াল ও স্টক হিসাব একদম #১ থেকে ফ্রেশ শুরু করতে নিচের বাটনে চাপ দিন।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="inline-flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-semibold px-5 py-2.5 rounded-xl active:scale-95 transition cursor-pointer text-xs whitespace-nowrap self-start sm:self-auto shadow-sm"
                >
                  <span>🗑️</span> সমস্ত ডাটা মুছুন (রিসেট)
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
