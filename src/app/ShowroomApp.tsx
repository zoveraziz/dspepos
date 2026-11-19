"use client";

import { useEffect, useRef, useState } from "react";
import { dbManager } from "@/lib/db/db-client";
import { syncEngine } from "@/lib/sync/sync-engine";
import { printBridge } from "@/lib/print/print-bridge";
import { initPWA } from "@/lib/pwa/pwa-client";
import { TransactionRecord, DailySummaryRow } from "@/lib/db/types";

export default function ShowroomApp() {
  // Active Tab State (Explicit and reliable)
  const [activeTab, setActiveTab] = useState<"counter" | "monthly" | "purchase" | "sync">("counter");

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
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="table-card p-6">
              <h2 className="text-lg font-bold text-white mb-1">গুগল শিট ২-মুখী অটো সিঙ্ক কনফিগারেশন</h2>
              <p className="text-xs text-slate-400 mb-4">
                আপনার গুগল স্প্রেডশিটে স্বয়ংক্রিয়ভাবে ব্যাকআপ ও রিমোট দেখার জন্য স্ক্রিপ্ট লিংক দিন।
              </p>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="form-group">
                  <label>Google Apps Script Web App URL</label>
                  <input
                    ref={gasUrlInputRef}
                    type="url"
                    defaultValue={syncEngine.getEndpointUrl()}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="form-input"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button type="submit" className="btn-primary cursor-pointer">
                    সেভ ও সিঙ্ক টেস্ট
                  </button>
                  <button
                    type="button"
                    onClick={() => syncEngine.triggerSync()}
                    className="btn-secondary cursor-pointer"
                  >
                    এখনই সিঙ্ক করুন
                  </button>
                </div>
              </form>
            </div>

            <div className="table-card p-6 text-sm space-y-3">
              <h3 className="font-bold text-white">গুগল শিট যুক্ত করার ৩টি সহজ ধাপ:</h3>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li>আপনার গুগল ড্রাইভ থেকে একটি নতুন গুগল স্প্রেডশিট খুলুন।</li>
                <li>উপরে <strong>Extensions &gt; Apps Script</strong>-এ যান।</li>
                <li>
                  এই প্রজেক্টের <code>backend-gas/Code.js</code> ফাইলের সব কোড কপি করে পেস্ট করে <strong>Deploy &gt; New deployment &gt; Web app</strong> হিসেবে ডেপ্লয় করুন।
                </li>
                <li>পাওয়া লিংকটি উপরের বক্সে পেস্ট করে সেভ করুন।</li>
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
