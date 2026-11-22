"use client";

import { useEffect, useRef, useState } from "react";
import { dbManager } from "@/lib/db/db-client";
import { syncEngine } from "@/lib/sync/sync-engine";
import { printBridge } from "@/lib/print/print-bridge";
import { initPWA } from "@/lib/pwa/pwa-client";
import { TransactionRecord, DailySummaryRow } from "@/lib/db/types";
import { GAS_CODE_TEMPLATE } from "@/lib/gas-template";
import {
  UiLang,
  DigitMode,
  translations,
  formatCurrency,
  formatDigitString,
  formatCustomerCount,
  formatSpeed,
  formatLedgerDate,
  toEnglishDigits,
} from "@/lib/i18n";

export default function ShowroomApp() {
  // Language & Digit Mode State
  const [uiLang, setUiLang] = useState<UiLang>("bn");
  const [digitMode, setDigitMode] = useState<DigitMode>("en");
  const uiLangRef = useRef<UiLang>(uiLang);
  const digitModeRef = useRef<DigitMode>(digitMode);
  uiLangRef.current = uiLang;
  digitModeRef.current = digitMode;
  const t = translations[uiLang];

  // Store / Showroom Profile (Custom branding for multiple shops)
  const [shopName, setShopName] = useState<string>("ডিজিটাল সার্ভিস পয়েন্ট");
  const [shopSubtitle, setShopSubtitle] = useState<string>("DSP ePOS");
  const [shopPhone, setShopPhone] = useState<string>("");
  const [profileSavedMsg, setProfileSavedMsg] = useState<boolean>(false);
  const shopNameInputRef = useRef<HTMLInputElement>(null);
  const shopSubtitleInputRef = useRef<HTMLInputElement>(null);
  const shopPhoneInputRef = useRef<HTMLInputElement>(null);

  // Role-Based Access Control (Manager vs Admin)
  const [userRole, setUserRole] = useState<"manager" | "admin">("manager");
  const [adminPin, setAdminPin] = useState<string>("7788");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const userRoleRef = useRef<"manager" | "admin">(userRole);
  userRoleRef.current = userRole;
  const pendingTabRef = useRef<"counter" | "monthly" | "purchase" | "sync" | null>(null);
  const adminPinInputRef = useRef<HTMLInputElement>(null);

  // Active Tab State (Explicit and reliable)
  const [activeTab, setActiveTab] = useState<"counter" | "monthly" | "purchase" | "sync">("counter");
  const [gasCopied, setGasCopied] = useState(false);

  // Tab 2: Monthly Ledger Filters & Search State
  const [dateFilterPreset, setDateFilterPreset] = useState<"all" | "today" | "7days" | "month" | "custom">("all");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [ledgerSearch, setLedgerSearch] = useState<string>("");

  const lastAddedSaleIdRef = useRef<string | null>(null);

  const dateFilterPresetRef = useRef<"all" | "today" | "7days" | "month" | "custom">("all");
  const customFromDateRef = useRef<string>("");
  const customToDateRef = useRef<string>("");
  const ledgerSearchRef = useRef<string>("");

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

      const savedDigit = localStorage.getItem("dsp_digit_mode");
      if (savedDigit === "bn" || savedDigit === "en") {
        setDigitMode(savedDigit);
        digitModeRef.current = savedDigit;
      }
      const savedLang = localStorage.getItem("dsp_ui_lang");
      if (savedLang === "bn" || savedLang === "en") {
        setUiLang(savedLang);
        uiLangRef.current = savedLang;
      }

      const savedName = localStorage.getItem("dsp_shop_name");
      if (savedName) setShopName(savedName);
      const savedSub = localStorage.getItem("dsp_shop_subtitle");
      if (savedSub) setShopSubtitle(savedSub);
      const savedPhone = localStorage.getItem("dsp_shop_phone");
      if (savedPhone) setShopPhone(savedPhone);

      const savedRole = localStorage.getItem("dsp_user_role");
      if (savedRole === "admin" || savedRole === "manager") {
        setUserRole(savedRole);
        userRoleRef.current = savedRole;
      }
      const savedPin = localStorage.getItem("dsp_admin_pin");
      if (savedPin) {
        setAdminPin(savedPin);
      }

      // Persistent Storage lock for zero-data-loss offline safety
      if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
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

  const toggleDigitMode = () => {
    const next = digitMode === "en" ? "bn" : "en";
    setDigitMode(next);
    digitModeRef.current = next;
    try {
      localStorage.setItem("dsp_digit_mode", next);
    } catch {}
  };

  const toggleUiLang = () => {
    const next = uiLang === "bn" ? "en" : "bn";
    setUiLang(next);
    uiLangRef.current = next;
    try {
      localStorage.setItem("dsp_ui_lang", next);
    } catch {}
  };

  const handleUnlockAdmin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.trim() === adminPin.trim()) {
      setUserRole("admin");
      userRoleRef.current = "admin";
      try {
        localStorage.setItem("dsp_user_role", "admin");
      } catch {}
      setIsAdminModalOpen(false);
      setPinInput("");
      setPinError("");
      if (pendingTabRef.current) {
        setActiveTab(pendingTabRef.current);
        pendingTabRef.current = null;
      }
    } else {
      setPinError(uiLang === "en" ? "Incorrect PIN! Default is 7788." : "ভুল পিন কোড! ডিফল্ট পিন: 7788");
      setPinInput("");
    }
  };

  const handleSwitchToManager = () => {
    setUserRole("manager");
    userRoleRef.current = "manager";
    try {
      localStorage.setItem("dsp_user_role", "manager");
    } catch {}
    setActiveTab("counter");
  };

  const handleTabClick = (tab: "counter" | "monthly" | "purchase" | "sync") => {
    if (tab === "counter") {
      setActiveTab("counter");
      return;
    }
    if (userRole === "admin") {
      setActiveTab(tab);
    } else {
      pendingTabRef.current = tab;
      setPinError("");
      setPinInput("");
      setIsAdminModalOpen(true);
    }
  };

  useEffect(() => {
    userRoleRef.current = userRole;
    renderTodaySales(todaySalesCacheRef.current);
  }, [userRole]);

  useEffect(() => {
    refreshAllData();
    applyMonthlyFilterAndRender();
  }, [digitMode, uiLang]);

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
      if (syncEngine.hasEndpoint()) {
        syncEngine.triggerSync();
      }
    });

    if (gasUrlInputRef.current) {
      gasUrlInputRef.current.value = syncEngine.getEndpointUrl();
    }

    // Direct DOM Sync Status Listener (Clean, non-jumping badges with hover tooltip)
    const handleSyncEvent = (e: any) => {
      const { state, message } = e.detail;
      const curLang = uiLangRef.current;
      if (syncPillRef.current) {
        syncPillRef.current.setAttribute("data-status", state);
        syncPillRef.current.title = message || state;
      }
      if (syncMsgRef.current) {
        if (state === "synced") {
          syncMsgRef.current.textContent = curLang === "en" ? "✓ Synced" : "✓ সিঙ্কড";
        } else if (state === "syncing") {
          syncMsgRef.current.textContent = curLang === "en" ? "⟳ Syncing..." : "⟳ সিঙ্ক হচ্ছে...";
        } else if (state === "offline") {
          syncMsgRef.current.textContent = curLang === "en" ? "⚡ Offline" : "⚡ অফলাইন";
        } else if (state === "error") {
          syncMsgRef.current.textContent = curLang === "en" ? "❌ Sync Error" : "❌ সিঙ্ক এরর";
        } else {
          if (!syncEngine.hasEndpoint()) {
            syncMsgRef.current.textContent = curLang === "en" ? "⚙️ Set Sheet" : "⚙️ শিট সেট";
          } else {
            syncMsgRef.current.textContent = message || (curLang === "en" ? "⚡ Offline" : "⚡ অফলাইন");
          }
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

      const curDigits = digitModeRef.current;
      const curLang = uiLangRef.current;

      if (liveTodaySaleRef.current) liveTodaySaleRef.current.textContent = formatCurrency(todaySalesTotal, curDigits);
      if (tableTotalSaleRef.current) tableTotalSaleRef.current.textContent = formatCurrency(todaySalesTotal, curDigits);
      if (liveTodayPurchaseRef.current) liveTodayPurchaseRef.current.textContent = formatCurrency(todayPurchaseTotal, curDigits);
      if (liveCustomerCountRef.current) liveCustomerCountRef.current.textContent = formatCustomerCount(sales.length, curDigits, curLang);

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

    const curDigits = digitModeRef.current;
    const curLang = uiLangRef.current;
    const tCur = translations[curLang];

    if (sales.length === 0) {
      todaySalesTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-10">
            <div class="empty-state-box">
              <div class="empty-state-icon">☀️</div>
              <div class="empty-state-title">${tCur.emptySalesTitle}</div>
              <p class="empty-state-desc">${tCur.emptySalesDesc}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    const reversed = [...sales].reverse();

    const canDelete = userRoleRef.current === "admin";

    reversed.forEach((s) => {
      const tr = document.createElement("tr");
      if (s.id === lastAddedSaleIdRef.current) {
        tr.classList.add("row-just-added");
      }
      const serialDisplay = formatDigitString(s.serial_no, curDigits);
      const timeDisplay = formatDigitString(s.time, curDigits);
      const custLabel = `${tCur.customerPrefix} #${serialDisplay}`;
      const amountDisplay = formatCurrency(s.amount, curDigits, { decimals: 2 });

      tr.innerHTML = `
        <td class="font-bold text-amber-400">#${serialDisplay}</td>
        <td class="text-slate-300">${timeDisplay}</td>
        <td class="font-medium text-white">${custLabel}</td>
        <td class="amount-sale">${amountDisplay}</td>
        <td class="text-right">
          <button data-action="print" data-id="${s.id}" class="btn-table-action mr-1.5" title="${tCur.printSlipBtn}">
            🖨️ ${tCur.printSlipBtn}
          </button>
          ${canDelete ? `
            <button data-action="delete" data-id="${s.id}" class="btn-table-danger" title="মুছুন">
              🗑️
            </button>
          ` : ""}
        </td>
      `;
      fragment.appendChild(tr);
    });

    todaySalesTableBodyRef.current.replaceChildren(fragment);
  };

  // Effect to re-filter and re-render monthly summaries when filter states change
  useEffect(() => {
    dateFilterPresetRef.current = dateFilterPreset;
    customFromDateRef.current = customFromDate;
    customToDateRef.current = customToDate;
    ledgerSearchRef.current = ledgerSearch;
    applyMonthlyFilterAndRender();
  }, [dateFilterPreset, customFromDate, customToDate, ledgerSearch]);

  const applyMonthlyFilterAndRender = () => {
    if (!monthlyTableBodyRef.current) return;
    const allRows = rawMonthlySummariesRef.current || [];

    const todayStr = dbManager.getTodayDateString();
    const parts = todayStr.split("-");
    const todayDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const toDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const currentPreset = dateFilterPresetRef.current;
    const currentFrom = customFromDateRef.current;
    const currentTo = customToDateRef.current;
    const currentSearch = ledgerSearchRef.current;

    let filtered = allRows.slice();

    if (currentPreset === "today") {
      filtered = filtered.filter((r) => r.date === todayStr);
    } else if (currentPreset === "7days") {
      const sevenDaysAgo = new Date(todayDateObj.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startStr = toDateStr(sevenDaysAgo);
      filtered = filtered.filter((r) => r.date >= startStr && r.date <= todayStr);
    } else if (currentPreset === "month") {
      const currentMonthPrefix = todayStr.substring(0, 7);
      filtered = filtered.filter((r) => r.date.startsWith(currentMonthPrefix));
    } else if (currentPreset === "custom") {
      if (currentFrom) {
        filtered = filtered.filter((r) => r.date >= currentFrom);
      }
      if (currentTo) {
        filtered = filtered.filter((r) => r.date <= currentTo);
      }
    }

    if (currentSearch.trim()) {
      const q = currentSearch.trim().toLowerCase();
      const qEn = toEnglishDigits(q);
      filtered = filtered.filter((r) => {
        const parts = r.date.split("-");
        const dmySlash = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "";
        const dmyHyphen = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : "";
        return (
          r.date.includes(qEn) ||
          dmySlash.includes(qEn) ||
          dmyHyphen.includes(qEn) ||
          r.total_purchase.toString().includes(qEn) ||
          r.total_sale.toString().includes(qEn) ||
          r.remaining_stock.toString().includes(qEn) ||
          r.sales_count.toString().includes(qEn)
        );
      });
    }

    filteredMonthlySummariesRef.current = filtered;

    let totalFilteredPurchase = 0;
    let totalFilteredSale = 0;
    let totalFilteredCust = 0;

    const curDigits = digitModeRef.current;
    const curLang = uiLangRef.current;
    const tCur = translations[curLang];

    if (filtered.length === 0) {
      monthlyTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-10">
            <div class="empty-state-box">
              <div class="empty-state-icon">📊</div>
              <div class="empty-state-title">${tCur.noLedgerData}</div>
              <p class="empty-state-desc">${curLang === "en" ? "Try selecting 'All Days' filter or a different date range." : "তারিখের ফিল্টারে 'সব দিন' নির্বাচন করুন বা অন্য তারিখ দিয়ে খুঁজুন।"}</p>
            </div>
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

        const dateStr = formatLedgerDate(row.date, curDigits);
        const purchaseStr = formatCurrency(row.total_purchase, curDigits, { decimals: 2 });
        const saleStr = formatCurrency(row.total_sale, curDigits, { decimals: 2 });
        const stockStr = formatCurrency(row.remaining_stock, curDigits, { decimals: 2 });
        const custStr = formatCustomerCount(row.sales_count, curDigits, curLang);

        tr.innerHTML = `
          <td class="ledger-cell-date">${dateStr}</td>
          <td class="ledger-cell-purchase">${purchaseStr}</td>
          <td class="ledger-cell-sale">${saleStr}</td>
          <td class="${isPositive ? 'ledger-cell-stock-pos' : 'ledger-cell-stock-neg'}">
            ${stockStr}
          </td>
          <td class="ledger-cell-cust">${custStr}</td>
        `;
        fragment.appendChild(tr);
      });
      monthlyTableBodyRef.current.replaceChildren(fragment);
    }

    const netBalance = totalFilteredPurchase - totalFilteredSale;
    if (monthlyTotalPurchaseRef.current) monthlyTotalPurchaseRef.current.textContent = formatCurrency(totalFilteredPurchase, curDigits);
    if (monthlyTotalSaleRef.current) monthlyTotalSaleRef.current.textContent = formatCurrency(totalFilteredSale, curDigits);
    if (monthlyRemainingStockRef.current) monthlyRemainingStockRef.current.textContent = formatCurrency(netBalance, curDigits);

    if (monthlyGrandTotalPurchaseRef.current) monthlyGrandTotalPurchaseRef.current.textContent = formatCurrency(totalFilteredPurchase, curDigits, { decimals: 2 });
    if (monthlyGrandTotalSaleRef.current) monthlyGrandTotalSaleRef.current.textContent = formatCurrency(totalFilteredSale, curDigits, { decimals: 2 });
    if (monthlyGrandTotalStockRef.current) monthlyGrandTotalStockRef.current.textContent = formatCurrency(netBalance, curDigits, { decimals: 2 });
    if (monthlyGrandTotalCustRef.current) monthlyGrandTotalCustRef.current.textContent = formatCustomerCount(totalFilteredCust, curDigits, curLang);
  };

  // Render Monthly Combined Table (ক্রয় | বিক্রি | অবশিষ্ট স্টক)
  const renderMonthlySummaries = (summaries: DailySummaryRow[]) => {
    rawMonthlySummariesRef.current = summaries;
    applyMonthlyFilterAndRender();
  };

  // Export Filtered Monthly Summaries as CSV for Excel (UTF-8 BOM encoded)
  const handleExportCSV = () => {
    const rows = filteredMonthlySummariesRef.current || [];
    const curLang = uiLangRef.current;
    if (rows.length === 0) {
      alert(curLang === "en" ? "No records to export." : "ডাউনলোড করার মতো কোনো হিসাব নেই।");
      return;
    }

    let totalPurch = 0;
    let totalSale = 0;
    let totalCust = 0;

    let csv = curLang === "en"
      ? "Date,Purchases (BDT),Sales (BDT),Closing Stock (BDT),Customer Count\r\n"
      : "তারিখ,মাল ক্রয় (টাকা),মাল বিক্রি (টাকা),অবশিষ্ট স্টক / ব্যালেন্স (টাকা),মোট কাস্টমার সংখ্যা\r\n";

    rows.forEach((r) => {
      totalPurch += r.total_purchase;
      totalSale += r.total_sale;
      totalCust += r.sales_count;
      csv += `"${r.date}",${r.total_purchase.toFixed(2)},${r.total_sale.toFixed(2)},${r.remaining_stock.toFixed(2)},${r.sales_count}\r\n`;
    });

    const netBal = totalPurch - totalSale;
    const totalLabel = curLang === "en" ? "Grand Total Summary" : "মোট সর্বমোট হিসাব";
    csv += `"${totalLabel}",${totalPurch.toFixed(2)},${totalSale.toFixed(2)},${netBal.toFixed(2)},${totalCust}\r\n`;

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `DSP_Ledger_${today}.csv`;
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

    const curLang = uiLangRef.current;
    let periodTitle = curLang === "en" ? "All Time" : "সব দিন";
    if (dateFilterPreset === "today") periodTitle = curLang === "en" ? "Today's Ledger" : "আজকের হিসাব";
    else if (dateFilterPreset === "7days") periodTitle = curLang === "en" ? "Last 7 Days Ledger" : "গত ৭ দিনের হিসাব";
    else if (dateFilterPreset === "month") periodTitle = curLang === "en" ? "This Month's Ledger" : "চলতি মাসের হিসাব";
    else if (dateFilterPreset === "custom") {
      periodTitle = `${customFromDate || (curLang === "en" ? "Start" : "শুরু")} - ${customToDate || (curLang === "en" ? "Today" : "আজ")}`;
    }

    printBridge.printLedgerReport(
      rows,
      periodTitle,
      {
        purchase: totalPurch,
        sale: totalSale,
        stock: totalPurch - totalSale,
        customers: totalCust,
      },
      { shopName, subtitle: shopSubtitle, phone: shopPhone }
    );
  };

  // Render Today's Purchases
  const renderTodayPurchases = (purchases: TransactionRecord[]) => {
    if (!purchasesTableBodyRef.current) return;

    const curDigits = digitModeRef.current;
    const curLang = uiLangRef.current;
    const tCur = translations[curLang];

    if (purchases.length === 0) {
      purchasesTableBodyRef.current.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-10">
            <div class="empty-state-box">
              <div class="empty-state-icon">📦</div>
              <div class="empty-state-title">${tCur.noPurchasesToday}</div>
              <p class="empty-state-desc">${curLang === "en" ? "Enter daily stock purchase above to maintain accurate inventory records." : "দোকানের নতুন মালামাল ক্রয়ের টাকা ও চালান ওপরে এন্ট্রি করুন, এটি স্বয়ংক্রিয়ভাবে স্টক শিটে যুক্ত হবে।"}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    purchases.forEach((p) => {
      const tr = document.createElement("tr");
      const timeDisplay = formatDigitString(p.time, curDigits);
      const amountDisplay = formatCurrency(p.amount, curDigits, { decimals: 2 });
      const notesDisplay = p.notes || tCur.defaultPurchaseNote;

      tr.innerHTML = `
        <td class="text-slate-300">${timeDisplay}</td>
        <td class="font-medium text-white">${notesDisplay}</td>
        <td class="amount-purchase">${amountDisplay}</td>
        <td class="text-right">
          <button data-action="delete" data-id="${p.id}" class="btn-table-danger" title="মুছুন">🗑️</button>
        </td>
      `;
      fragment.appendChild(tr);
    });
    purchasesTableBodyRef.current.replaceChildren(fragment);
  };

  // Synthesized Apple / Square style tactile cash register audio & haptic chime
  const playCashChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // Crisp two-tone chime (C6 ~ 1046Hz smoothly transitioning into E6 ~ 1318Hz)
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1318.5, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch {}
  };

  // One-Click WhatsApp Daily Closing Report Generator
  const handleShareWhatsApp = async () => {
    try {
      const todaySales = await dbManager.getTodaySales();
      const todayPurchases = await dbManager.getTodayPurchases();
      const totalSale = todaySales.reduce((acc, curr) => acc + curr.amount, 0);
      const totalPurchase = todayPurchases.reduce((acc, curr) => acc + curr.amount, 0);
      const netCash = totalSale - totalPurchase;
      const custCount = todaySales.length;

      const todayStr = dbManager.getTodayDateString();
      const parts = todayStr.split("-");
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : todayStr;

      const curDigits = digitModeRef.current;
      const curLang = uiLangRef.current;

      const saleStr = formatCurrency(totalSale, curDigits);
      const purchStr = formatCurrency(totalPurchase, curDigits);
      const netStr = formatCurrency(netCash, curDigits);
      const custStr = formatCustomerCount(custCount, curDigits, curLang);

      const msg = [
        `📊 *${curLang === "en" ? "Daily Closing Report" : "দৈনিক হিসাব ক্লোজিং রিপোর্ট"}*`,
        `🏪 *${shopName}* ${shopSubtitle ? `(${shopSubtitle})` : ""}`,
        `📅 *${curLang === "en" ? "Date" : "তারিখ"}:* ${formattedDate}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💰 *${curLang === "en" ? "Total Sales" : "আজকের মোট বিক্রি"}:* ${saleStr}`,
        `📦 *${curLang === "en" ? "Total Purchases" : "আজকের মাল ক্রয়"}:* ${purchStr}`,
        `👥 *${curLang === "en" ? "Total Customers" : "মোট কাস্টমার"}:* ${custStr}`,
        `💵 *${curLang === "en" ? "Net Cash Balance" : "আজকের নিট ক্যাশ"}:* ${netStr}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `✅ *${shopName} ePOS System*`,
      ].join("\n");

      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } catch (e: any) {
      alert("হোয়াটসঅ্যাপে শেয়ার করতে সমস্যা হয়েছে: " + e.message);
    }
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
      const record = await dbManager.addSale(val, userRoleRef.current === "admin" ? "অ্যাডমিন" : "ম্যানেজার");
      lastAddedSaleIdRef.current = record.id;
      playCashChime();

      saleAmountInputRef.current.value = "";
      saleAmountInputRef.current.focus();

      await refreshAllData();

      setTimeout(() => {
        if (lastAddedSaleIdRef.current === record.id) {
          lastAddedSaleIdRef.current = null;
        }
      }, 2000);

      if (autoPrintCheckboxRef.current?.checked) {
        await printBridge.printSlip(record, { shopName, subtitle: shopSubtitle, phone: shopPhone });
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
      await printBridge.printSlip(record, { shopName, subtitle: shopSubtitle, phone: shopPhone });
    } else if (action === "delete") {
      if (userRoleRef.current !== "admin") {
        alert(uiLang === "en" ? "Delete is restricted to Admin. Please unlock Admin mode." : "বিক্রি মোছার অনুমতি কেবল অ্যাডমিন/মালিকের রয়েছে। অনুগ্রহ করে অ্যাডমিন মোডে লগইন করুন।");
        return;
      }
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
      if (userRoleRef.current !== "admin") {
        alert(uiLang === "en" ? "Delete is restricted to Admin. Please unlock Admin mode." : "মাল ক্রয় মোছার অনুমতি কেবল অ্যাডমিন/মালিকের রয়েছে।");
        return;
      }
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

  const handleSaveShopProfile = (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    if (shopNameInputRef.current) {
      const name = shopNameInputRef.current.value.trim() || "ডিজিটাল সার্ভিস পয়েন্ট";
      setShopName(name);
      localStorage.setItem("dsp_shop_name", name);
    }
    if (shopSubtitleInputRef.current) {
      const sub = shopSubtitleInputRef.current.value.trim() || "DSP ePOS";
      setShopSubtitle(sub);
      localStorage.setItem("dsp_shop_subtitle", sub);
    }
    if (shopPhoneInputRef.current) {
      const phone = shopPhoneInputRef.current.value.trim();
      setShopPhone(phone);
      localStorage.setItem("dsp_shop_phone", phone);
    }
    if (adminPinInputRef.current) {
      const pin = adminPinInputRef.current.value.trim();
      if (pin.length >= 4) {
        setAdminPin(pin);
        localStorage.setItem("dsp_admin_pin", pin);
      } else if (pin.length > 0) {
        alert(uiLang === "en" ? "PIN must be at least 4 digits." : "পিন অন্তত ৪ ডিজিটের হতে হবে।");
        return;
      }
    }
    setProfileSavedMsg(true);
    setTimeout(() => setProfileSavedMsg(false), 3000);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (gasUrlInputRef.current) {
      const url = gasUrlInputRef.current.value.trim();
      syncEngine.setEndpointUrl(url);
    }
    if (shopNameInputRef.current) {
      const name = shopNameInputRef.current.value.trim() || "ডিজিটাল সার্ভিস পয়েন্ট";
      setShopName(name);
      localStorage.setItem("dsp_shop_name", name);
    }
    if (shopSubtitleInputRef.current) {
      const sub = shopSubtitleInputRef.current.value.trim() || "DSP ePOS";
      setShopSubtitle(sub);
      localStorage.setItem("dsp_shop_subtitle", sub);
    }
    if (shopPhoneInputRef.current) {
      const phone = shopPhoneInputRef.current.value.trim();
      setShopPhone(phone);
      localStorage.setItem("dsp_shop_phone", phone);
    }
    if (adminPinInputRef.current) {
      const pin = adminPinInputRef.current.value.trim();
      if (pin.length >= 4) {
        setAdminPin(pin);
        localStorage.setItem("dsp_admin_pin", pin);
      }
    }
    alert(uiLang === "en" ? "✓ Store profile & Google Sheet link saved! Testing sync..." : "✓ শোরুম প্রোফাইল ও গুগল শিট লিংক সেভ হয়েছে! সিঙ্ক পরীক্ষা করা হচ্ছে...");
    syncEngine.triggerSync();
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
        <div className="header-inner">
          <div className="header-brand">
            <span className="brand-badge">DSP</span>
            <h1 className="text-xl font-bold tracking-tight text-white">{shopName}</h1>
            <span className="text-xs text-amber-300 font-semibold hidden sm:inline">{shopSubtitle}</span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-theme-toggle cursor-pointer"
              title="মোড পরিবর্তন করুন (লাইট / ডার্ক)"
            >
              {theme === "dark" ? (
                <span>☀️ <span className="hidden sm:inline">{t.lightMode}</span></span>
              ) : (
                <span>🌙 <span className="hidden sm:inline">{t.darkMode}</span></span>
              )}
            </button>

            {/* Digit Language Toggle: 123 (English) vs ১২৩ (Bengali) */}
            <button
              type="button"
              onClick={toggleDigitMode}
              className="btn-header-pill cursor-pointer"
              title={t.digitToggleTitle}
            >
              <span>🔢 {digitMode === "en" ? "123" : "১২৩"}</span>
            </button>

            {/* UI Language Toggle: বাংলা vs English */}
            <button
              type="button"
              onClick={toggleUiLang}
              className="btn-header-pill cursor-pointer"
              title={t.langToggleTitle}
            >
              <span>🌐 {uiLang === "bn" ? "বাং" : "EN"}</span>
            </button>

            {/* Role Switcher: Manager vs Admin */}
            {userRole === "manager" ? (
              <button
                type="button"
                onClick={() => {
                  pendingTabRef.current = null;
                  setPinError("");
                  setPinInput("");
                  setIsAdminModalOpen(true);
                }}
                className="btn-header-pill cursor-pointer"
                style={{ borderColor: "#64748b", color: "#e2e8f0" }}
                title={uiLang === "en" ? "Manager Mode Active (Click to unlock Admin)" : "ম্যানেজার মোড সক্রিয় (ক্লিক করে অ্যাডমিন মোডে যান)"}
              >
                <span>👤 {uiLang === "en" ? "Manager" : "ম্যানেজার"}</span>
                <span style={{ fontSize: "10px", padding: "1px 5px", background: "rgba(245,158,11,0.25)", color: "#fbbf24", borderRadius: "4px", marginLeft: "4px", fontWeight: 700 }}>
                  🔑 {uiLang === "en" ? "Admin" : "অ্যাডমিন"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSwitchToManager}
                className="btn-header-pill cursor-pointer"
                style={{ borderColor: "#10b981", color: "#34d399", background: "rgba(16,185,129,0.15)" }}
                title={uiLang === "en" ? "Admin Mode Active (Click to lock to Manager)" : "অ্যাডমিন মোড সক্রিয় (ক্লিক করে ম্যানেজার মোডে ফিরুন)"}
              >
                <span>👑 {uiLang === "en" ? "Admin" : "অ্যাডমিন"}</span>
                <span style={{ fontSize: "10px", padding: "1px 5px", background: "rgba(239,68,68,0.25)", color: "#f87171", borderRadius: "4px", marginLeft: "4px", fontWeight: 700 }}>
                  🔒 {uiLang === "en" ? "Lock" : "লক"}
                </span>
              </button>
            )}

            <div
              ref={syncPillRef}
              className="sync-status-pill cursor-pointer"
              data-status={syncEngine.hasEndpoint() ? "idle" : "offline"}
              title={syncEngine.hasEndpoint() ? "গুগল শিট সিঙ্ক স্ট্যাটাস" : "গুগল শিট সেট করুন"}
              onClick={() => setActiveTab("sync")}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-current flex-shrink-0"></span>
              <span ref={syncMsgRef} className="truncate">
                {syncEngine.hasEndpoint()
                  ? (uiLang === "en" ? "⚡ Offline" : "⚡ অফলাইন")
                  : (uiLang === "en" ? "⚙️ Set Sheet" : "⚙️ শিট সেট")}
              </span>
            </div>

            <button
              ref={printerBtnRef}
              type="button"
              onClick={handleConnectPrinter}
              className="btn-header-printer cursor-pointer"
              title={uiLang === "en" ? "Connect Hardware Thermal Printer" : "ক্যাশ কাউন্টারের থার্মাল প্রিন্টার যুক্ত করুন"}
            >
              <span>🔌 <span className="hidden sm:inline">{uiLang === "en" ? "Thermal " : "থার্মাল "}</span>{uiLang === "en" ? "Printer" : "প্রিন্টার"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* TOP LIVE KPI DASHBOARD CARDS */}
      <div className="kpi-section">
        <div className="kpi-grid">
          <div className="kpi-card kpi-card-emerald">
            <div className="kpi-label">{t.kpiSales}</div>
            <div ref={liveTodaySaleRef} className="kpi-value kpi-value-emerald">
              {formatCurrency(0, digitMode)}
            </div>
          </div>

          <div className="kpi-card kpi-card-blue">
            <div className="kpi-label">{t.kpiPurchase}</div>
            <div ref={liveTodayPurchaseRef} className="kpi-value kpi-value-blue">
              {formatCurrency(0, digitMode)}
            </div>
          </div>

          <div className="kpi-card kpi-card-amber">
            <div className="kpi-label">{t.kpiCustomers}</div>
            <div ref={liveCustomerCountRef} className="kpi-value kpi-value-amber">
              {formatCustomerCount(0, digitMode, uiLang)}
            </div>
          </div>

          <div className="kpi-card kpi-card-purple">
            <div className="kpi-label">{t.kpiSpeed}</div>
            <div className="kpi-value kpi-value-purple">
              {formatSpeed(0, digitMode, uiLang)}
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <nav className="tab-nav">
        <div className="tab-nav-inner">
          <button
            type="button"
            onClick={() => handleTabClick("counter")}
            className={`tab-btn ${activeTab === "counter" ? "tab-btn-active" : ""}`}
          >
            ⚡ {t.tabCounter}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("monthly")}
            className={`tab-btn ${activeTab === "monthly" ? "tab-btn-active" : ""}`}
            title={userRole === "manager" ? "লক করা (অ্যাডমিন পিন প্রয়োজন)" : ""}
          >
            📊 {t.tabMonthly} {userRole === "manager" ? "🔒" : ""}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("purchase")}
            className={`tab-btn ${activeTab === "purchase" ? "tab-btn-active" : ""}`}
            title={userRole === "manager" ? "লক করা (অ্যাডমিন পিন প্রয়োজন)" : ""}
          >
            📦 {t.tabPurchase} {userRole === "manager" ? "🔒" : ""}
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("sync")}
            className={`tab-btn ${activeTab === "sync" ? "tab-btn-active" : ""}`}
            title={userRole === "manager" ? "লক করা (অ্যাডমিন পিন প্রয়োজন)" : ""}
          >
            ⚙️ {t.tabSync} {userRole === "manager" ? "🔒" : ""}
          </button>
        </div>
      </nav>

      {/* TAB CONTENT PANELS */}
      <main className="app-main-content">
        {/* TAB 1: MANAGER RAPID SALES COUNTER */}
        {activeTab === "counter" && (
          <div className="space-y-6 w-full">
            {/* Modern Sales Entry Hero Card */}
            <div className="pos-hero-card">
              <div className="pos-hero-header">
                <div className="pos-hero-title">
                  <span>⚡ {t.counterCardTitle}</span>
                </div>
                <div className="text-xs text-slate-400 hidden sm:block">
                  {t.counterShortcutHint}
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
                      placeholder={t.counterPlaceholder}
                      className="pos-amount-input"
                      required
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="submit"
                    className="pos-submit-button"
                  >
                    <span>✓ {t.counterAddBtn}</span>
                    <kbd className="pos-key-badge">Enter ↵</kbd>
                  </button>
                </div>

                {/* Controls Bar */}
                <div className="pos-controls-row">
                  <span className="text-xs text-slate-400">
                    💡 {t.counterHelper}
                  </span>
                  <label className="pos-checkbox-label">
                    <input
                      ref={autoPrintCheckboxRef}
                      type="checkbox"
                    />
                    <span>{t.counterAutoPrint}</span>
                  </label>
                </div>
              </form>
            </div>

            {/* Today's Sales Table */}
            <div className="table-card">
              <div className="table-header">
                <div>
                  <h2 className="table-title">{t.tableSalesTitle}</h2>
                  <p className="table-subtitle">{t.tableSalesSubtitle}</p>
                </div>
                <div className="table-header-right">
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="btn-share-whatsapp cursor-pointer"
                    title={uiLang === "en" ? "Share today's closing summary to WhatsApp" : "আজকের দিনের মোট হিসাব হোয়াটসঅ্যাপে পাঠান"}
                  >
                    <span>📲</span> <span>{t.shareWhatsAppBtn}</span>
                  </button>
                  <div className="table-header-total">
                    <span className="table-header-total-label">{t.tableGrandTotalLabel}</span>
                    <span ref={tableTotalSaleRef} className="table-header-total-amount">
                      {formatCurrency(0, digitMode)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table" onClick={handleTableClick}>
                  <thead>
                    <tr>
                      <th>{t.colSerial}</th>
                      <th>{t.colTime}</th>
                      <th>{t.colDesc}</th>
                      <th>{t.colSaleAmount}</th>
                      <th className="text-right">{t.colAction}</th>
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
          <div className="space-y-6 w-full">
            <div className="monthly-kpi-grid">
              <div className="monthly-kpi-card monthly-kpi-card-blue">
                <div className="monthly-kpi-title">📦 {t.monthlyPurchaseTitle}</div>
                <div ref={monthlyTotalPurchaseRef} className="monthly-kpi-val text-blue-400">
                  {formatCurrency(0, digitMode)}
                </div>
              </div>

              <div className="monthly-kpi-card monthly-kpi-card-emerald">
                <div className="monthly-kpi-title">💰 {t.monthlySaleTitle}</div>
                <div ref={monthlyTotalSaleRef} className="monthly-kpi-val text-emerald-400">
                  {formatCurrency(0, digitMode)}
                </div>
              </div>

              <div className="monthly-kpi-card monthly-kpi-card-amber">
                <div className="monthly-kpi-title">📊 {t.monthlyStockTitle}</div>
                <div ref={monthlyRemainingStockRef} className="monthly-kpi-val text-amber-400">
                  {formatCurrency(0, digitMode)}
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-header">
                <div>
                  <h2 className="table-title">{t.ledgerTitle}</h2>
                  <p className="table-subtitle">{t.ledgerSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshAllData()}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  🔄 {uiLang === "en" ? "Refresh" : "রিফ্রেশ হিসাব"}
                </button>
              </div>

              {/* Toolbar: Filter Pills, Date Picker, Live Search, Excel/CSV Export & A4 Print */}
              <div className="ledger-toolbar">
                <div className="ledger-filter-group">
                  <span className="text-xs text-slate-400 font-bold mr-1">{uiLang === "en" ? "Filter:" : "ফিল্টার:"}</span>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("all")}
                    className={`filter-pill ${dateFilterPreset === "all" ? "filter-pill-active" : ""}`}
                  >
                    {t.filterAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("today")}
                    className={`filter-pill ${dateFilterPreset === "today" ? "filter-pill-active" : ""}`}
                  >
                    {t.filterToday}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("7days")}
                    className={`filter-pill ${dateFilterPreset === "7days" ? "filter-pill-active" : ""}`}
                  >
                    {t.filter7Days}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("month")}
                    className={`filter-pill ${dateFilterPreset === "month" ? "filter-pill-active" : ""}`}
                  >
                    {t.filterMonth}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterPreset("custom")}
                    className={`filter-pill ${dateFilterPreset === "custom" ? "filter-pill-active" : ""}`}
                  >
                    {t.filterCustom}
                  </button>

                  {dateFilterPreset === "custom" && (
                    <div className="ledger-custom-date">
                      <span>{uiLang === "en" ? "From:" : "হতে:"}</span>
                      <input
                        type="date"
                        value={customFromDate}
                        onChange={(e) => setCustomFromDate(e.target.value)}
                        className="ledger-date-input"
                      />
                      <span>{uiLang === "en" ? "To:" : "পর্যন্ত:"}</span>
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
                    placeholder={t.searchPlaceholder}
                    className="ledger-date-input ml-1"
                    style={{ minWidth: "210px" }}
                  />
                </div>

                <div className="ledger-actions-group">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="btn-export-excel"
                    title={uiLang === "en" ? "Download as Excel / CSV" : "মাইক্রোসফট এক্সেলে খতিয়ান ডাউনলোড করুন (বাংলা ফন্ট সাপোর্ট সহ)"}
                  >
                    📥 {t.exportExcel}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="btn-export-print"
                    title={uiLang === "en" ? "Print or Save as A4 PDF" : "পুরো খতিয়ান বিবরণী A4 পেপারে প্রিন্ট বা PDF সেভ করুন"}
                  >
                    🖨️ {t.exportPrint}
                  </button>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.colDate}</th>
                      <th>{t.colTotalPurchase}</th>
                      <th>{t.colTotalSale}</th>
                      <th>{t.colRemainingStock}</th>
                      <th>{t.colTotalCust}</th>
                    </tr>
                  </thead>
                  <tbody ref={monthlyTableBodyRef}>
                    {/* Daily Combined Rows */}
                  </tbody>
                  <tfoot>
                    <tr className="ledger-footer-total">
                      <td className="text-white font-bold">{t.grandTotalLabel}</td>
                      <td ref={monthlyGrandTotalPurchaseRef} className="font-bold text-blue-400">{formatCurrency(0, digitMode, { decimals: 2 })}</td>
                      <td ref={monthlyGrandTotalSaleRef} className="font-bold text-emerald-400">{formatCurrency(0, digitMode, { decimals: 2 })}</td>
                      <td ref={monthlyGrandTotalStockRef} className="font-bold text-amber-400">{formatCurrency(0, digitMode, { decimals: 2 })}</td>
                      <td ref={monthlyGrandTotalCustRef} className="font-bold text-slate-300">{formatCustomerCount(0, digitMode, uiLang)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OWNER DAILY PURCHASE DESK */}
        {activeTab === "purchase" && (
          <div className="space-y-6 w-full">
            <div className="table-card p-6 border-2 border-blue-500/40">
              <h2 className="table-title mb-1">📦 {t.purchaseCardTitle}</h2>
              <p className="table-subtitle mb-4">
                {t.purchaseCardSubtitle}
              </p>

              <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                <div className="form-group">
                  <label>{t.purchaseAmountLabel}</label>
                  <input
                    ref={purchaseAmountInputRef}
                    type="number"
                    step="any"
                    min="1"
                    placeholder={t.purchaseAmountPlaceholder}
                    className="form-input text-lg font-bold text-blue-400"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>{t.purchaseNotesLabel}</label>
                  <input
                    ref={purchaseNotesInputRef}
                    placeholder={t.purchaseNotesPlaceholder}
                    className="form-input"
                  />
                </div>

                <button type="submit" className="btn-primary w-full justify-center py-3 text-base cursor-pointer">
                  {t.purchaseAddBtn}
                </button>
              </form>
            </div>

            <div className="table-card">
              <div className="table-header">
                <h3 className="table-title">{t.purchaseTableTitle}</h3>
              </div>
              <div className="table-wrapper">
                <table className="data-table" onClick={handlePurchaseTableClick}>
                  <thead>
                    <tr>
                      <th>{t.colTime}</th>
                      <th>{t.colDesc}</th>
                      <th>{uiLang === "en" ? "Amount (৳)" : "টাকার পরিমাণ (৳)"}</th>
                      <th className="text-right">{t.colAction}</th>
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
                      {t.syncCard1Title}
                      <span className="sync-badge sync-badge-emerald">
                        {t.syncCard1Badge}
                      </span>
                    </h2>
                    <p className="sync-card-desc">
                      {t.syncCard1Desc}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveSettings}>
                {/* Safe multi-showroom alert if Google Sheet is not configured */}
                {!syncEngine.hasEndpoint() && (
                  <div style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1.25rem", color: "#fbbf24", fontSize: "0.85rem", lineHeight: "1.5" }}>
                    <strong>⚠️ {uiLang === "en" ? "Fresh Device / New Showroom Setup:" : "নতুন ডিভাইস বা নতুন শোরুম সেটআপ:"}</strong><br />
                    {uiLang === "en"
                      ? "This device is not connected to any Google Sheet yet. Paste your own Apps Script URL below to sync your shop data securely."
                      : "এই ডিভাইসে এখনও কোনো গুগল শিট লিংক যুক্ত করা হয়নি। আপনার শোরুমের হিসাব সম্পূর্ণ আলাদা ও নিরাপদ রাখতে নিচে আপনার গুগল শিটের Apps Script লিংকটি বসিয়ে 'সেভ ও টেস্ট সিঙ্ক' চাপুন।"}
                  </div>
                )}

                {/* Shop / Showroom Profile (Name, Subtitle, Phone for Print Receipts, and PIN) */}
                <div style={{ backgroundColor: "rgba(0, 0, 0, 0.2)", borderRadius: "8px", border: "1px solid var(--border-color)", padding: "1rem", marginBottom: "1.25rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>
                        🏪 {uiLang === "en" ? "Shop / Showroom Name" : "দোকান বা শোরুমের নাম"}
                      </label>
                      <input
                        ref={shopNameInputRef}
                        type="text"
                        defaultValue={shopName}
                        placeholder={uiLang === "en" ? "e.g. Badsha Sweets" : "যেমন: বাদশাহ এন্টারপ্রাইজ"}
                        className="sync-input-field"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>
                        🏷️ {uiLang === "en" ? "Subtitle / Branch" : "উপ-শিরোনাম বা শাখা (স্লিপের জন্য)"}
                      </label>
                      <input
                        ref={shopSubtitleInputRef}
                        type="text"
                        defaultValue={shopSubtitle}
                        placeholder={uiLang === "en" ? "e.g. DSP ePOS / Main Branch" : "যেমন: DSP ePOS বা শাখা: চকবাজার"}
                        className="sync-input-field"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>
                        📞 {uiLang === "en" ? "Contact Number / Address" : "মোবাইল নম্বর / ঠিকানা (রসিদের জন্য)"}
                      </label>
                      <input
                        ref={shopPhoneInputRef}
                        type="text"
                        defaultValue={shopPhone}
                        placeholder={uiLang === "en" ? "e.g. +88017XXXXXXXX" : "যেমন: মোবাইল: ০১৭১২-XXXXXX"}
                        className="sync-input-field"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.85rem" }}>
                        🔐 {uiLang === "en" ? "Admin Master PIN (4 Digits)" : "অ্যাডমিন মাস্টার পিন (৪ ডিজিট)"}
                      </label>
                      <input
                        ref={adminPinInputRef}
                        type="password"
                        maxLength={8}
                        defaultValue={adminPin}
                        placeholder="যেমন: 7788"
                        className="sync-input-field"
                      />
                    </div>
                  </div>

                  {/* Dedicated Save Button right below PIN & Profile Inputs */}
                  <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleSaveShopProfile}
                      className="btn-save-profile cursor-pointer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "0.92rem",
                        padding: "0.6rem 1.4rem",
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      <span>💾</span> {uiLang === "en" ? "Save Shop Info & PIN" : "দোকানের তথ্য ও পিন সেভ করুন"}
                    </button>
                    {profileSavedMsg && (
                      <span style={{ color: "#34d399", fontWeight: 700, fontSize: "0.9rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        ✓ {uiLang === "en" ? "Shop info & PIN saved successfully!" : "দোকানের তথ্য ও পিন সফলভাবে সেভ হয়েছে!"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontWeight: 600, color: "var(--text-main)" }}>
                      🔗 {t.gasUrlLabel}
                    </label>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                      {t.gasEndpointLabel}
                    </span>
                  </div>
                  <input
                    ref={gasUrlInputRef}
                    type="url"
                    defaultValue={syncEngine.getEndpointUrl()}
                    placeholder={t.gasUrlPlaceholder}
                    className="sync-input-field"
                    required
                  />
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    {t.gasUrlHint}
                  </p>
                </div>

                <div className="sync-button-group">
                  <button type="submit" className="btn-sync-submit">
                    <span>💾</span> {t.saveAndTestSyncBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => syncEngine.triggerSync()}
                    className="btn-sync-now"
                  >
                    <span>🔄</span> {t.syncNowBtn}
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
                    <h3 className="sync-card-title">{t.syncCard2Title}</h3>
                    <p className="sync-card-desc">{t.syncCard2Desc}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyGasCode}
                  className="btn-copy-code"
                >
                  <span>📋</span> {gasCopied ? t.copiedCodeBtn : t.copyCodeBtn}
                </button>
              </div>

              <div className="sync-steps-grid">
                {/* Step 1 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">{formatDigitString("01", digitMode)}</div>
                  <div className="sync-step-content">
                    <h4>{t.step1Title}</h4>
                    <p>{t.step1Desc}</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">{formatDigitString("02", digitMode)}</div>
                  <div className="sync-step-content">
                    <h4>{t.step2Title}</h4>
                    <p>{t.step2Desc}</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">{formatDigitString("03", digitMode)}</div>
                  <div className="sync-step-content">
                    <h4>{t.step3Title}</h4>
                    <p>{t.step3Desc}</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="sync-step-box">
                  <div className="sync-step-num">{formatDigitString("04", digitMode)}</div>
                  <div className="sync-step-content">
                    <h4>{t.step4Title}</h4>
                    <p>{t.step4Desc}</p>
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
                        {t.syncCard3Title}
                      </h3>
                      <span className="sync-badge sync-badge-amber">
                        v2.7.0
                      </span>
                    </div>
                    <p className="sync-card-desc" style={{ maxWidth: "560px", marginTop: "4px" }}>
                      {t.syncCard3Desc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleForceUpdate}
                  className="btn-warning-action"
                >
                  <span>🔄</span> {t.forceUpdateBtn}
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
                        {t.syncCard4Title}
                      </h3>
                      <span className="sync-badge sync-badge-red">
                        {t.syncCard4Badge}
                      </span>
                    </div>
                    <p className="sync-card-desc" style={{ maxWidth: "560px", marginTop: "4px" }}>
                      {t.syncCard4Desc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="btn-danger-action"
                >
                  <span>🗑️</span> {t.resetBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ADMIN PIN UNLOCK MODAL */}
      {isAdminModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAdminModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.5rem" }}>🔐</span>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                    {uiLang === "en" ? "Admin PIN Verification" : "অ্যাডমিন মাস্টার পিন দিন"}
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {uiLang === "en"
                      ? "Enter 4-digit admin PIN to unlock restricted features"
                      : "মাসের হিসাব, মাল ক্রয় ও সেটিংস আনলক করতে অ্যাডমিন পিন দিন"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAdminModalOpen(false);
                  pendingTabRef.current = null;
                }}
                className="modal-close-btn"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUnlockAdmin} style={{ marginTop: "1.25rem" }}>
              <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                <input
                  type="password"
                  maxLength={8}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setPinError("");
                  }}
                  placeholder="••••"
                  className="pin-display-input"
                />
                {pinError && (
                  <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "0.5rem", fontWeight: 600 }}>
                    ⚠️ {pinError}
                  </p>
                )}
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                  {uiLang === "en" ? "Default master PIN: 7788" : "ডিফল্ট মাস্টার পিন: 7788 (সেটিংস থেকে পরিবর্তনযোগ্য)"}
                </p>
              </div>

              {/* Touch Keypad for POS / Mobile */}
              <div className="pin-keypad-grid">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => {
                      if (btn === "C") {
                        setPinInput("");
                        setPinError("");
                      } else if (btn === "⌫") {
                        setPinInput((prev) => prev.slice(0, -1));
                      } else {
                        if (pinInput.length < 8) {
                          setPinInput((prev) => prev + btn);
                          setPinError("");
                        }
                      }
                    }}
                    className="pin-key-btn"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminModalOpen(false);
                    pendingTabRef.current = null;
                  }}
                  className="btn-secondary"
                  style={{ flex: 1, padding: "0.65rem" }}
                >
                  {uiLang === "en" ? "Cancel" : "বাতিল"}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1, padding: "0.65rem", backgroundColor: "#10b981", color: "#fff", fontWeight: 700 }}
                >
                  🔓 {uiLang === "en" ? "Unlock Admin" : "আনলক করুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
