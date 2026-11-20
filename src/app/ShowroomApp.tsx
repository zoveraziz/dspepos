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

  // Tab 2: Monthly Ledger Filters & Search State
  const [dateFilterPreset, setDateFilterPreset] = useState<"all" | "today" | "7days" | "month" | "custom">("all");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [ledgerSearch, setLedgerSearch] = useState<string>("");

  const rawMonthlySummariesRef = useRef<DailySummaryRow[]>([]);
  const filteredMonthlySummariesRef = useRef<DailySummaryRow[]>([]);

  // Monthly Table Footer Grand Totals
  const monthlyGrandTotalPurchaseRef = useRef<HTMLTableCellElement>(null);
  const monthlyGrandTotalSaleRef = useRef<HTMLTableCellElement>(null);
  const monthlyGrandTotalStockRef = useRef<HTMLTableCellElement>(null);
  const monthlyGrandTotalCustRef = useRef<HTMLTableCellElement>(null);

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

    // Direct DOM Sync Status Listener (Clean, non-jumping badges with hover tooltip)
    const handleSyncEvent = (e: any) => {
      const { state, message } = e.detail;
      if (syncPillRef.current) {
        syncPillRef.current.setAttribute("data-status", state);
        syncPillRef.current.title = message || state;
      }
      if (syncMsgRef.current) {
        if (state === "synced") {
          syncMsgRef.current.textContent = "✓ সিঙ্কড";
        } else if (state === "syncing") {
          syncMsgRef.current.textContent = "⟳ সিঙ্ক হচ্ছে...";
        } else if (state === "offline") {
          syncMsgRef.current.textContent = "⚠️ অফলাইন";
        } else if (state === "error") {
          syncMsgRef.current.textContent = "❌ সিঙ্ক এরর";
        } else {
          syncMsgRef.current.textContent = message || "অফলাইন মোড";
        }
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
        <td class="amount-sale">৳${s.amount.toFixed(2)}</td>
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

  // Effect to re-filter and re-render monthly summaries when filter states change
  useEffect(() => {
    applyMonthlyFilterAndRender();
  }, [dateFilterPreset, customFromDate, customToDate, ledgerSearch]);

  const applyMonthlyFilterAndRender = () => {
    if (!monthlyTableBodyRef.current) return;
    const allRows = rawMonthlySummariesRef.current || [];

    const now = new Date();
    const toDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const todayStr = toDateStr(now);

    let filtered = allRows.slice();

    if (dateFilterPreset === "today") {
      filtered = filtered.filter((r) => r.date === todayStr);
    } else if (dateFilterPreset === "7days") {
      const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startStr = toDateStr(sevenDaysAgo);
      filtered = filtered.filter((r) => r.date >= startStr && r.date <= todayStr);
    } else if (dateFilterPreset === "month") {
      const currentMonthPrefix = todayStr.substring(0, 7);
      filtered = filtered.filter((r) => r.date.startsWith(currentMonthPrefix));
    } else if (dateFilterPreset === "custom") {
      if (customFromDate) {
        filtered = filtered.filter((r) => r.date >= customFromDate);
      }
      if (customToDate) {
        filtered = filtered.filter((r) => r.date <= customToDate);
      }
    }

    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.date.toLowerCase().includes(q) ||
          r.total_purchase.toString().includes(q) ||
          r.total_sale.toString().includes(q) ||
          r.remaining_stock.toString().includes(q) ||
          r.sales_count.toString().includes(q)
      );
    }

    filteredMonthlySummariesRef.current = filtered;

    let totalFilteredPurchase = 0;
    let totalFilteredSale = 0;
    let totalFilteredCust = 0;

    if (filtered.length === 0) {
      monthlyTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-slate-400">
            কোনো হিসাব পাওয়া যায়নি।
          </td>
        </tr>
      `;
    } else {
      const fragment = document.createDocumentFragment();
      filtered.forEach((row) => {
        totalFilteredPurchase += row.total_purchase;
        totalFilteredSale += row.total_sale;
        totalFilteredCust += row.sales_count;

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
    }

    const netBalance = totalFilteredPurchase - totalFilteredSale;
    if (monthlyTotalPurchaseRef.current) monthlyTotalPurchaseRef.current.textContent = `৳${totalFilteredPurchase.toLocaleString("bn-BD")}`;
    if (monthlyTotalSaleRef.current) monthlyTotalSaleRef.current.textContent = `৳${totalFilteredSale.toLocaleString("bn-BD")}`;
    if (monthlyRemainingStockRef.current) monthlyRemainingStockRef.current.textContent = `৳${netBalance.toLocaleString("bn-BD")}`;

    if (monthlyGrandTotalPurchaseRef.current) monthlyGrandTotalPurchaseRef.current.textContent = `৳${totalFilteredPurchase.toLocaleString("bn-BD")}`;
    if (monthlyGrandTotalSaleRef.current) monthlyGrandTotalSaleRef.current.textContent = `৳${totalFilteredSale.toLocaleString("bn-BD")}`;
    if (monthlyGrandTotalStockRef.current) monthlyGrandTotalStockRef.current.textContent = `৳${netBalance.toLocaleString("bn-BD")}`;
    if (monthlyGrandTotalCustRef.current) monthlyGrandTotalCustRef.current.textContent = `${totalFilteredCust} জন`;
  };

  // Render Monthly Combined Table (ক্রয় | বিক্রি | অবশিষ্ট স্টক)
  const renderMonthlySummaries = (summaries: DailySummaryRow[]) => {
    rawMonthlySummariesRef.current = summaries;
    applyMonthlyFilterAndRender();
  };

  // Export Filtered Monthly Summaries as CSV for Excel (UTF-8 BOM encoded)
  const handleExportCSV = () => {
    const rows = filteredMonthlySummariesRef.current || [];
    if (rows.length === 0) {
      alert("ডাউনলোড করার মতো কোনো হিসাব নেই।");
      return;
    }

    let totalPurch = 0;
    let totalSale = 0;
    let totalCust = 0;

    let csv = "তারিখ,মাল ক্রয় (টাকা),মাল বিক্রি (টাকা),অবশিষ্ট স্টক / ব্যালেন্স (টাকা),মোট কাস্টমার সংখ্যা\r\n";

    rows.forEach((r) => {
      totalPurch += r.total_purchase;
      totalSale += r.total_sale;
      totalCust += r.sales_count;
      csv += `"${r.date}",${r.total_purchase.toFixed(2)},${r.total_sale.toFixed(2)},${r.remaining_stock.toFixed(2)},${r.sales_count}\r\n`;
    });

    const netBal = totalPurch - totalSale;
    csv += `"মোট সর্বমোট হিসাব",${totalPurch.toFixed(2)},${totalSale.toFixed(2)},${netBal.toFixed(2)},${totalCust}\r\n`;

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `DSP_দৈনিক_স্টক_খতিয়ান_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Print Filtered Ledger Report (A4 Printable)
  const handlePrintReport = () => {
    const rows = filteredMonthlySummariesRef.current || [];
    let totalPurch = 0;
    let totalSale = 0;
    let totalCust = 0;

    rows.forEach((r) => {
      totalPurch += r.total_purchase;
      totalSale += r.total_sale;
      totalCust += r.sales_count;
    });

    let periodTitle = "সব দিন";
    if (dateFilterPreset === "today") periodTitle = "আজকের হিসাব";
    else if (dateFilterPreset === "7days") periodTitle = "গত ৭ দিনের হিসাব";
    else if (dateFilterPreset === "month") periodTitle = "চলতি মাসের হিসাব";
    else if (dateFilterPreset === "custom") {
      periodTitle = `${customFromDate || "শুরু"} থেকে ${customToDate || "আজ"}`;
    }

    printBridge.printLedgerReport(rows, periodTitle, {
      purchase: totalPurch,
      sale: totalSale,
      stock: totalPurch - totalSale,
      customers: totalCust,
    });
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
        <td class="amount-purchase">৳${p.amount.toFixed(2)}</td>
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
            {theme === "dark" ? (
              <span>☀️ লাইট<span className="hidden sm:inline"> মোড</span></span>
            ) : (
              <span>🌙 ডার্ক<span className="hidden sm:inline"> মোড</span></span>
            )}
          </button>

          <div ref={syncPillRef} className="sync-status-pill" data-status="idle" title="গুগল শিট সিঙ্ক স্ট্যাটাস">
            <span className="inline-block w-2 h-2 rounded-full bg-current"></span>
            <span ref={syncMsgRef}>অফলাইন মোড</span>
          </div>

          <button
            ref={printerBtnRef}
            type="button"
            onClick={handleConnectPrinter}
            className="btn-header-printer cursor-pointer"
            title="ক্যাশ কাউন্টারের থার্মাল প্রিন্টার যুক্ত করুন"
          >
            <span>🔌 <span className="hidden sm:inline">থার্মাল </span>প্রিন্টার</span>
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
      <main className="app-main-content">
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
                <div className="table-header-total">
                  <span className="table-header-total-label">আজকের সর্বমোট বিক্রি:</span>
                  <span ref={tableTotalSaleRef} className="table-header-total-amount">
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
            </div>
          </div>
        )}

        {/* TAB 2: MONTHLY COMBINED STOCK & SALES SHEET */}
        {activeTab === "monthly" && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="monthly-kpi-grid">
              <div className="monthly-kpi-card monthly-kpi-card-blue">
                <div className="monthly-kpi-title">📦 মাসের সর্বমোট মাল ক্রয়</div>
                <div ref={monthlyTotalPurchaseRef} className="monthly-kpi-val text-blue-400">
                  ৳০
                </div>
              </div>

              <div className="monthly-kpi-card monthly-kpi-card-emerald">
                <div className="monthly-kpi-title">💰 মাসের সর্বমোট মাল বিক্রি</div>
                <div ref={monthlyTotalSaleRef} className="monthly-kpi-val text-emerald-400">
                  ৳০
                </div>
              </div>

              <div className="monthly-kpi-card monthly-kpi-card-amber">
                <div className="monthly-kpi-title">📊 অবশিষ্ট স্টক / ব্যালেন্স</div>
                <div ref={monthlyRemainingStockRef} className="monthly-kpi-val text-amber-400">
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

              {/* Toolbar: Filter Pills, Date Picker, Live Search, Excel/CSV Export & A4 Print */}
              <div className="ledger-toolbar">
                <div className="ledger-filter-group">
                  <span className="text-xs text-slate-400 font-bold mr-1">ফিল্টার:</span>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("all")}
                    className={`filter-pill ${dateFilterPreset === "all" ? "filter-pill-active" : ""}`}
                  >
                    সব দিন
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("today")}
                    className={`filter-pill ${dateFilterPreset === "today" ? "filter-pill-active" : ""}`}
                  >
                    আজকে
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("7days")}
                    className={`filter-pill ${dateFilterPreset === "7days" ? "filter-pill-active" : ""}`}
                  >
                    গত ৭ দিন
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("month")}
                    className={`filter-pill ${dateFilterPreset === "month" ? "filter-pill-active" : ""}`}
                  >
                    চলতি মাস
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("custom")}
                    className={`filter-pill ${dateFilterPreset === "custom" ? "filter-pill-active" : ""}`}
                  >
                    কাস্টম তারিখ ▾
                  </button>

                  {dateFilterPreset === "custom" && (
                    <div className="ledger-custom-date">
                      <span>হতে:</span>
                      <input
                        type="date"
                        value={customFromDate}
                        onChange={(e) => setCustomFromDate(e.target.value)}
                        className="ledger-date-input"
                      />
                      <span>পর্যন্ত:</span>
                      <input
                        type="date"
                        value={customToDate}
                        onChange={(e) => setCustomToDate(e.target.value)}
                        className="ledger-date-input"
                      />
                    </div>
                  )}

                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="🔍 তারিখ বা টাকা খুঁজুন..."
                    className="ledger-date-input ml-1"
                    style={{ minWidth: "210px" }}
                  />
                </div>

                <div className="ledger-actions-group">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="btn-export-excel"
                    title="মাইক্রোসফট এক্সেলে খতিয়ান ডাউনলোড করুন (বাংলা ফন্ট সাপোর্ট সহ)"
                  >
                    📥 এক্সেল (CSV) ডাউনলোড
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="btn-export-print"
                    title="পুরো খতিয়ান বিবরণী A4 পেপারে প্রিন্ট বা PDF সেভ করুন"
                  >
                    🖨️ খতিয়ান রিপোর্ট প্রিন্ট (A4)
                  </button>
                </div>
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
                  <tfoot>
                    <tr className="ledger-footer-total">
                      <td className="text-white font-bold">মোট সর্বমোট হিসাব</td>
                      <td ref={monthlyGrandTotalPurchaseRef} className="font-bold text-blue-400">৳০</td>
                      <td ref={monthlyGrandTotalSaleRef} className="font-bold text-emerald-400">৳০</td>
                      <td ref={monthlyGrandTotalStockRef} className="font-bold text-amber-400">৳০</td>
                      <td ref={monthlyGrandTotalCustRef} className="font-bold text-slate-300">০ জন</td>
                    </tr>
                  </tfoot>
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
          <div className="sync-page-container">
            {/* CARD 1: Google Sheets 2-Way Live Sync Config */}
            <div className="sync-card sync-card-emerald">
              <div className="sync-card-header">
                <div className="sync-header-left">
                  <div className="sync-card-icon sync-card-icon-emerald">
                    📊
                  </div>
                  <div>
                    <h2 className="sync-card-title">
                      গুগল শিট ২-মুখী অটো সিঙ্ক
                      <span className="sync-badge sync-badge-emerald">
                        লাইভ ব্যাকআপ
                      </span>
                    </h2>
                    <p className="sync-card-desc">
                      মোবাইল, পিসি এবং গুগল স্প্রেডশিটে স্বয়ংক্রিয়ভাবে লেনদেন সিঙ্ক ও ব্যাকআপ রাখুন।
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontWeight: 600, color: "var(--text-main)" }}>
                      🔗 Google Apps Script Web App URL
                    </label>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                      POST /exec Endpoint
                    </span>
                  </div>
                  <input
                    ref={gasUrlInputRef}
                    type="url"
                    defaultValue={syncEngine.getEndpointUrl()}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="sync-input-field"
                    required
                  />
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    * আপনার স্প্রেডশিট থেকে প্রাপ্ত Apps Script Web App ডেপ্লয়মেন্ট URL লিংকটি এখানে বসান।
                  </p>
                </div>

                <div className="sync-button-group">
                  <button type="submit" className="btn-sync-submit">
                    <span>💾</span> সেভ ও টেস্ট সিঙ্ক
                  </button>
                  <button
                    type="button"
                    onClick={() => syncEngine.triggerSync()}
                    className="btn-sync-now"
                  >
                    <span>🔄</span> এখনই সিঙ্ক করুন
                  </button>
                </div>
              </form>
            </div>

            {/* CARD 2: Step-by-Step Setup Guide */}
            <div className="sync-card">
              <div className="sync-card-header" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
                <div className="sync-header-left">
                  <div className="sync-card-icon sync-card-icon-blue">
                    📋
                  </div>
                  <div>
                    <h3 className="sync-card-title">গুগল শিট যুক্ত করার সহজ নিয়ম</h3>
                    <p className="sync-card-desc">মাত্র ৪টি সহজ ধাপে সম্পূর্ণ ফ্রিতে সিঙ্ক চালু করুন</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyGasCode}
                  className="btn-copy-code"
                >
                  <span>📋</span> {gasCopied ? "✓ কোড কপি হয়েছে!" : "Apps Script কোড কপি করুন"}
                </button>
              </div>

              <div className="sync-steps-grid">
                {/* Step 1 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">০১</div>
                  <div className="sync-step-content">
                    <h4>নতুন স্প্রেডশিট খুলুন</h4>
                    <p>গুগল ড্রাইভে গিয়ে একটি নতুন গুগল স্প্রেডশিট (Google Sheet) তৈরি করুন।</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">০২</div>
                  <div className="sync-step-content">
                    <h4>Apps Script-এ যান</h4>
                    <p>শিটের ওপরের মেনু থেকে Extensions &gt; Apps Script ওপেন করুন।</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">০৩</div>
                  <div className="sync-step-content">
                    <h4>কোড পেস্ট ও Web app ডেপ্লয়</h4>
                    <p>পুরনো কোড মুছে আমাদের দেওয়া কোড পেস্ট করুন এবং Deploy &gt; Web app হিসেবে ডেপ্লয় করুন (Who has access: Anyone)।</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">০৪</div>
                  <div className="sync-step-content">
                    <h4>লিংক সেভ ও চালু</h4>
                    <p>পাওয়া ওয়েব অ্যাপ লিঙ্কটি ওপরের বক্সে পেস্ট করে "সেভ ও টেস্ট সিঙ্ক" বাটনে চাপ দিন।</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 3: Version Update & Cache Refresh */}
            <div className="sync-card sync-card-amber">
              <div className="sync-row-layout">
                <div className="sync-header-left">
                  <div className="sync-card-icon sync-card-icon-amber">
                    ⚡
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fbbf24" }}>
                        নতুন ভার্সন আপডেট ও ক্যাশ রিফ্রেশ
                      </h3>
                      <span className="sync-badge sync-badge-amber">
                        v2.5.2
                      </span>
                    </div>
                    <p className="sync-card-desc" style={{ maxWidth: "560px", marginTop: "4px" }}>
                      মোবাইল বা পিসিতে পুরোনো ক্যাশের কারণে সিঙ্ক আটকে থাকলে বা নতুন কোনো আপডেট না দেখালে এই বাটনে চাপ দিন। এটি ব্রাউজারের পুরোনো ফাইল পরিষ্কার করে সরাসরি লেটেস্ট ভার্সন লোড করবে।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleForceUpdate}
                  className="btn-warning-action"
                >
                  <span>🔄</span> ক্যাশ ক্লিয়ার ও আপডেট
                </button>
              </div>
            </div>

            {/* CARD 4: System Fresh Reset Danger Zone */}
            <div className="sync-card sync-card-danger">
              <div className="sync-row-layout">
                <div className="sync-header-left">
                  <div className="sync-card-icon sync-card-icon-red">
                    ⚠️
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f87171" }}>
                        সিস্টেম ফ্রেশ রিসেট (নতুন করে শুরু)
                      </h3>
                      <span className="sync-badge sync-badge-red">
                        বিপদজনক অঞ্চল
                      </span>
                    </div>
                    <p className="sync-card-desc" style={{ maxWidth: "560px", marginTop: "4px" }}>
                      টেস্টিংয়ের সময় যোগ করা সমস্ত বিক্রি ও ক্রয়ের হিসাব গুগল শিট এবং লোকাল ডাটাবেজ থেকে মুছে কাস্টমার সিরিয়াল ও স্টক হিসাব একদম #১ থেকে ফ্রেশ শুরু করতে নিচের বাটনে চাপ দিন।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="btn-danger-action"
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
