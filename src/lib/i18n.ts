export type UiLang = "bn" | "en";
export type DigitMode = "en" | "bn";

export const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const EN_DIGITS: { [k: string]: string } = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9"
};

export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d, 10)]);
}

export function toEnglishDigits(input: string | number): string {
  return String(input).replace(/[০-৯]/g, (d) => EN_DIGITS[d] || d);
}

export function formatDigitString(input: string | number, mode: DigitMode): string {
  if (mode === "bn") {
    return toBengaliDigits(input);
  }
  return toEnglishDigits(input);
}

export function formatCurrency(
  val: number,
  mode: DigitMode,
  options: { decimals?: number } = {}
): string {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const decimals = options.decimals !== undefined ? options.decimals : (absVal % 1 === 0 ? 0 : 2);
  // Format with South Asian lakh/crore grouping standard in Bangladesh & India
  const formatted = absVal.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = isNegative ? "-৳" : "৳";
  if (mode === "bn") {
    return `${prefix}${toBengaliDigits(formatted)}`;
  }
  return `${prefix}${formatted}`;
}

export function formatLedgerDate(dateIso: string, mode: DigitMode): string {
  if (!dateIso) return "";
  const parts = dateIso.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const dmy = `${d}/${m}/${y}`;
    return formatDigitString(dmy, mode);
  }
  return formatDigitString(dateIso, mode);
}

export function formatCustomerCount(count: number, digitMode: DigitMode, uiLang: UiLang): string {
  const numStr = formatDigitString(count, digitMode);
  return uiLang === "en" ? `${numStr} Cust.` : `${numStr} জন`;
}

export function formatSpeed(speedMs: number, digitMode: DigitMode, uiLang: UiLang): string {
  const numStr = formatDigitString(speedMs, digitMode);
  return uiLang === "en" ? `${numStr}ms Offline` : `${numStr}ms অফলাইন`;
}

export const translations = {
  bn: {
    // Header
    brandTitle: "ডিজিটাল সার্ভিস পয়েন্ট",
    brandSub: "DSP ePOS",
    lightMode: "লাইট মোড",
    darkMode: "ডার্ক মোড",
    digitToggleTitle: "সংখ্যা মোড পরিবর্তন করুন (ইংরেজি / বাংলা)",
    langToggleTitle: "ভাষা পরিবর্তন করুন (বাংলা / English)",
    printerBtn: "থার্মাল প্রিন্টার",
    synced: "সিঙ্কড",
    syncing: "সিঙ্ক হচ্ছে...",
    offlineReady: "অফলাইন প্রস্তুত",
    syncError: "সিঙ্ক সমস্যা",
    
    // KPI Cards
    kpiSales: "সর্বমোট আজকের বিক্রি",
    kpiPurchase: "আজকের মাল ক্রয়",
    kpiCustomers: "আজকের মোট কাস্টমার",
    kpiSpeed: "সিস্টেম স্পিড",

    // Tabs
    tabCounter: "ম্যানেজারের সেলস কাউন্টার (আজকের বিক্রি)",
    tabMonthly: "মাসের হিসাব ও স্টক শিট (গুগল শিট ফরম্যাট)",
    tabPurchase: "মাল ক্রয় এন্ট্রি (মালিকের ডেস্ক)",
    tabSync: "গুগল শিট সিঙ্ক",
    tabCounterShort: "কাউন্টার",
    tabMonthlyShort: "মাসিক হিসাব",
    tabPurchaseShort: "মাল ক্রয়",
    tabSyncShort: "শিট সিঙ্ক",

    // Tab 1: Sales Counter
    counterCardTitle: "ক্যাশ কাউন্টার - দ্রুত বিক্রি এন্ট্রি",
    counterShortcutHint: "টাকার অঙ্ক লিখে কিবোর্ডের Enter চাপলেই বিক্রি সেভ হবে",
    counterPlaceholder: "টাকার পরিমাণ লিখুন (যেমন: ৫০০)",
    counterAddBtn: "বিক্রি যোগ করুন",
    counterHelper: "কোনো নাম লেখার প্রয়োজন নেই, শুধু বিক্রির টাকা লিখে এন্টার দিন",
    counterAutoPrint: "এন্ট্রি সাথে সাথে প্রিন্ট স্লিপ দিন",
    tableSalesTitle: "আজকের বিক্রি",
    tableSalesSubtitle: "প্রতিটি কাস্টমারের বিক্রির টাকা ক্রমানুসারে নিচে যোগ হচ্ছে",
    tableGrandTotalLabel: "আজকের সর্বমোট বিক্রি:",
    colSerial: "ক্রমিক",
    colTime: "সময়",
    colDesc: "বিবরণ",
    colSaleAmount: "বিক্রির টাকা (৳)",
    colAction: "অ্যাকশন",
    printSlipBtn: "স্লিপ",
    customerPrefix: "কাস্টমার",
    noSalesToday: "আজকে এখনও কোনো বিক্রি এন্ট্রি করা হয়নি। উপরে টাকার অঙ্ক লিখে Enter চাপুন।",
    shareWhatsAppBtn: "হোয়াটসঅ্যাপে পাঠান",
    emptySalesTitle: "আজকের দিনের শুভ সূচনা করুন! ☀️",
    emptySalesDesc: "ওপরের বক্সে বিক্রির টাকা লিখে কিবোর্ডের Enter চাপুন বা 'বিক্রি যোগ করুন' চাপুন।",

    // Tab 2: Monthly Sheet
    monthlyPurchaseTitle: "মাসের সর্বমোট মাল ক্রয়",
    monthlySaleTitle: "মাসের সর্বমোট মাল বিক্রি",
    monthlyStockTitle: "অবশিষ্ট স্টক / ব্যালেন্স",
    ledgerTitle: "দৈনিক ক্রয়, বিক্রি ও অবশিষ্ট স্টক শিট",
    ledgerSubtitle: "প্রতিদিনের হিসাব এক কলামে ক্রয়, এক কলামে বিক্রি এবং এক কলামে অবশিষ্ট স্টক",
    filterAll: "সব দিন",
    filterToday: "আজকে",
    filter7Days: "গত ৭ দিন",
    filterMonth: "চলতি মাস",
    filterCustom: "কাস্টম তারিখ ▾",
    searchPlaceholder: "🔍 তারিখ দিয়ে খুঁজুন...",
    exportExcel: "এক্সেল ডাউনলোড (.csv)",
    exportPrint: "খতিয়ান প্রিন্ট (A4 PDF)",
    colDate: "তারিখ",
    colTotalPurchase: "মাল ক্রয় (টাকা ৳)",
    colTotalSale: "মাল বিক্রি (টাকা ৳)",
    colRemainingStock: "অবশিষ্ট স্টক / ব্যালেন্স (৳)",
    colTotalCust: "মোট কাস্টমার",
    grandTotalLabel: "মোট সর্বমোট হিসাব:",
    noLedgerData: "এই ফিল্টারে কোনো হিসাব পাওয়া যায়নি।",

    // Tab 3: Purchase Desk
    purchaseCardTitle: "মাল ক্রয় এন্ট্রি (মালিকের হিসাব)",
    purchaseCardSubtitle: "শোরুমের জন্য আজ কত টাকার মাল ক্রয় করেছেন তা এখানে যোগ করুন। এটি স্বয়ংক্রিয়ভাবে স্টক শিটে যোগ হবে।",
    purchaseAmountLabel: "আজকের মাল ক্রয়ের টাকা (৳) *",
    purchaseAmountPlaceholder: "যেমন: ২৫০০০",
    purchaseNotesLabel: "বিবরণ / চালানের নোট (ঐচ্ছিক)",
    purchaseNotesPlaceholder: "যেমন: কারখানার মিষ্টি ও কেক চালান",
    purchaseAddBtn: "+ আজকের ক্রয় হিসেবে যুক্ত করুন",
    purchaseTableTitle: "আজকের মাল ক্রয়ের তালিকা",
    noPurchasesToday: "আজকে কোনো মাল ক্রয় এন্ট্রি করা হয়নি।",
    defaultPurchaseNote: "DSP মাল ক্রয়",

    // Tab 4: Sync Settings
    syncCard1Title: "গুগল শিট ২-মুখী অটো সিঙ্ক",
    syncCard1Badge: "লাইভ ব্যাকআপ",
    syncCard1Desc: "মোবাইল, পিসি এবং গুগল স্প্রেডশিটে স্বয়ংক্রিয়ভাবে লেনদেন সিঙ্ক ও ব্যাকআপ রাখুন।",
    gasUrlLabel: "Google Apps Script Web App URL",
    gasEndpointLabel: "POST /exec Endpoint",
    gasUrlPlaceholder: "https://script.google.com/macros/s/.../exec",
    gasUrlHint: "* আপনার স্প্রেডশিট থেকে প্রাপ্ত Apps Script Web App ডেপ্লয়মেন্ট URL লিংকটি এখানে বসান।",
    saveAndTestSyncBtn: "সেভ ও টেস্ট সিঙ্ক",
    syncNowBtn: "এখনই সিঙ্ক করুন",
    syncCard2Title: "গুগল শিট যুক্ত করার সহজ নিয়ম",
    syncCard2Desc: "মাত্র ৪টি সহজ ধাপে সম্পূর্ণ ফ্রিতে সিঙ্ক চালু করুন",
    copyCodeBtn: "Apps Script কোড কপি করুন",
    copiedCodeBtn: "✓ কোড কপি হয়েছে!",
    step1Title: "নতুন স্প্রেডশিট খুলুন",
    step1Desc: "গুগল ড্রাইভে গিয়ে একটি নতুন গুগল স্প্রেডশিট (Google Sheet) তৈরি করুন।",
    step2Title: "Apps Script-এ যান",
    step2Desc: "শিটের ওপরের মেনু থেকে Extensions > Apps Script ওপেন করুন।",
    step3Title: "কোড পেস্ট ও Web app ডেপ্লয়",
    step3Desc: "পুরনো কোড মুছে আমাদের দেওয়া কোড পেস্ট করুন এবং Deploy > Web app হিসেবে ডেপ্লয় করুন (Who has access: Anyone)।",
    step4Title: "লিংক সেভ ও চালু",
    step4Desc: "পাওয়া ওয়েব অ্যাপ লিঙ্কটি ওপরের বক্সে পেস্ট করে \"সেভ ও টেস্ট সিঙ্ক\" বাটনে চাপ দিন।",
    syncCard3Title: "নতুন ভার্সন আপডেট ও ক্যাশ রিফ্রেশ",
    syncCard3Desc: "মোবাইল বা পিসিতে পুরোনো ক্যাশের কারণে সিঙ্ক আটকে থাকলে বা নতুন কোনো আপডেট না দেখালে এই বাটনে চাপ দিন। এটি ব্রাউজারের পুরোনো ফাইল পরিষ্কার করে সরাসরি লেটেস্ট ভার্সন লোড করবে।",
    forceUpdateBtn: "ক্যাশ ক্লিয়ার ও আপডেট",
    syncCard4Title: "সিস্টেম ফ্রেশ রিসেট (নতুন করে শুরু)",
    syncCard4Badge: "বিপদজনক অঞ্চল",
    syncCard4Desc: "টেস্টিংয়ের সময় যোগ করা সমস্ত বিক্রি ও ক্রয়ের হিসাব গুগল শিট এবং লোকাল ডাটাবেজ থেকে মুছে কাস্টমার সিরিয়াল ও স্টক হিসাব একদম #১ থেকে ফ্রেশ শুরু করতে নিচের বাটনে চাপ দিন।",
    resetBtn: "⚠️ সমস্ত ডাটা মুছে নতুন করে শুরু করুন",

    // Trial & License
    trialBadge: "১৫ দিনের ফ্রি ট্রায়াল",
    trialBadgeShort: "ফ্রি ট্রায়াল",
    trialBadgeActive: "১৫ দিনের ট্রায়াল মোড সক্রিয়",
    trialCardTitle: "সফটওয়্যার লাইসেন্স ও ১৫ দিনের ফ্রি ট্রায়াল",
    trialCardDesc: "আপনি বর্তমানে পূর্ণাঙ্গ ফিচারের ১৫ দিনের ফ্রি ট্রায়াল ব্যবহার করছেন। কোনো প্রকার চার্জ ছাড়াই ক্যাশ কাউন্টার, মেমো প্রিন্টিং, বাকি খাতা ও গুগল শিট ব্যাকআপ পরখ করে দেখুন। সন্তুষ্ট হলে লাইসেন্স ক্রয় করতে পারেন।",
    trialFeature1: "ফুল অফলাইন পিওএস ও হাই-স্পিড লোকাল ডাটাবেজ",
    trialFeature2: "৫৮মিমি/৮০মিমি বাংলা থার্মাল রিসিট প্রিন্ট",
    trialFeature3: "গুগল শিটে ২-মুখী লাইভ ক্লাউড ব্যাকআপ",
    trialFeature4: "মাসিক লাভ-ক্ষতি ও পাইকারি মাল ক্রয় খাতা",
    trialContactLabel: "সফটওয়্যার কিনতে চান বা ট্রায়াল সহায়তা প্রয়োজন?",
    trialBuyBtn: "লাইসেন্স নিতে যোগাযোগ করুন",

    // Proprietor & Support
    proprietorBadge: "ডিজিটাল সার্ভিস পয়েন্ট",
    proprietorTitle: "ডিজিটাল সার্ভিস পয়েন্ট-এর একটি প্রোডাক্ট",
    proprietorDesc: "স্বত্বাধিকারী ও প্রযুক্তিগত সহায়তায়: ডিজিটাল সার্ভিস পয়েন্ট • সর্বস্বত্ব সংরক্ষিত",
    visitWebsiteBtn: "ওয়েবসাইট ভিজিট করুন",
    supportHelplineBtn: "সহায়তা ও লাইসেন্স",

    // PWA & App Install
    installAppBtn: "অ্যাপ ইনস্টল",
    installAppTitle: "মোবাইল বা পিওএস মেশিনে অ্যাপ ইনস্টল",
    installAppDesc: "হোম স্ক্রিনে আইকন যুক্ত করে সরাসরি ফুলস্ক্রিন মোবাইল অ্যাপ হিসেবে চালান",
    appInstalledBadge: "অ্যাপ ইনস্টলড",
    installGuideTitle: "অ্যাপ ইনস্টল করার সহজ নিয়ম",
  },
  en: {
    // Header
    brandTitle: "Digital Service Point",
    brandSub: "DSP ePOS",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    digitToggleTitle: "Switch Digit Mode (English / বাংলা)",
    langToggleTitle: "Switch Language (বাংলা / English)",
    printerBtn: "Thermal Printer",
    synced: "Synced",
    syncing: "Syncing...",
    offlineReady: "Offline Ready",
    syncError: "Sync Error",
    
    // KPI Cards
    kpiSales: "Today's Total Sales",
    kpiPurchase: "Today's Purchases",
    kpiCustomers: "Today's Total Customers",
    kpiSpeed: "System Speed",

    // Tabs
    tabCounter: "Sales Counter (Today's Sales)",
    tabMonthly: "Monthly Ledger & Stock Sheet",
    tabPurchase: "Purchase Entry (Owner Desk)",
    tabSync: "Google Sheets Sync",
    tabCounterShort: "Counter",
    tabMonthlyShort: "Monthly",
    tabPurchaseShort: "Purchase",
    tabSyncShort: "Sync",

    // Tab 1: Sales Counter
    counterCardTitle: "Cash Counter - Quick Sale Entry",
    counterShortcutHint: "Type amount and press Enter to save sale",
    counterPlaceholder: "Enter amount (e.g. 500)",
    counterAddBtn: "Add Sale",
    counterHelper: "No customer name required, just enter amount and hit Enter",
    counterAutoPrint: "Auto-print receipt slip on entry",
    tableSalesTitle: "Today's Sales",
    tableSalesSubtitle: "Customer sales records added chronologically below",
    tableGrandTotalLabel: "Today's Grand Total:",
    colSerial: "SL",
    colTime: "Time",
    colDesc: "Description",
    colSaleAmount: "Sale Amount (৳)",
    colAction: "Action",
    printSlipBtn: "Slip",
    customerPrefix: "Customer",
    noSalesToday: "No sales recorded today yet. Enter amount above and press Enter.",
    shareWhatsAppBtn: "WhatsApp Share",
    emptySalesTitle: "Start Today's Sales! ☀️",
    emptySalesDesc: "Enter the sale amount above and press Enter to record customer sale.",

    // Tab 2: Monthly Sheet
    monthlyPurchaseTitle: "Total Monthly Purchases",
    monthlySaleTitle: "Total Monthly Sales",
    monthlyStockTitle: "Closing Stock / Balance",
    ledgerTitle: "Daily Purchase, Sale & Stock Ledger",
    ledgerSubtitle: "Daily records of purchase, sales, and closing remaining stock balance",
    filterAll: "All Days",
    filterToday: "Today",
    filter7Days: "Last 7 Days",
    filterMonth: "This Month",
    filterCustom: "Custom Date ▾",
    searchPlaceholder: "🔍 Search by date...",
    exportExcel: "Export Excel (.csv)",
    exportPrint: "Print Ledger (A4 PDF)",
    colDate: "Date",
    colTotalPurchase: "Purchases (৳)",
    colTotalSale: "Sales (৳)",
    colRemainingStock: "Closing Stock / Balance (৳)",
    colTotalCust: "Total Customers",
    grandTotalLabel: "Grand Total Summary:",
    noLedgerData: "No records found matching this filter.",

    // Tab 3: Purchase Desk
    purchaseCardTitle: "Purchase Entry (Owner Desk)",
    purchaseCardSubtitle: "Enter showroom stock purchase amount here. It automatically updates the monthly stock ledger.",
    purchaseAmountLabel: "Today's Purchase Amount (৳) *",
    purchaseAmountPlaceholder: "e.g. 25000",
    purchaseNotesLabel: "Description / Invoice Notes (Optional)",
    purchaseNotesPlaceholder: "e.g. Sweet & cake factory batch",
    purchaseAddBtn: "+ Add to Today's Purchases",
    purchaseTableTitle: "Today's Purchases List",
    noPurchasesToday: "No purchases recorded today.",
    defaultPurchaseNote: "DSP Purchases",

    // Tab 4: Sync Settings
    syncCard1Title: "Google Sheets 2-Way Live Sync",
    syncCard1Badge: "Live Backup",
    syncCard1Desc: "Automatically sync and backup all transactions across mobile, PC, and Google Sheets in real-time.",
    gasUrlLabel: "Google Apps Script Web App URL",
    gasEndpointLabel: "POST /exec Endpoint",
    gasUrlPlaceholder: "https://script.google.com/macros/s/.../exec",
    gasUrlHint: "* Paste your Google Apps Script Web App deployment URL here.",
    saveAndTestSyncBtn: "Save & Test Sync",
    syncNowBtn: "Sync Now",
    syncCard2Title: "Easy Setup Guide for Google Sheets",
    syncCard2Desc: "Enable 2-way live sync in 4 simple steps for free",
    copyCodeBtn: "Copy Apps Script Code",
    copiedCodeBtn: "✓ Code Copied!",
    step1Title: "Open New Spreadsheet",
    step1Desc: "Go to Google Drive and create a new Google Sheet.",
    step2Title: "Go to Apps Script",
    step2Desc: "From the spreadsheet top menu, open Extensions > Apps Script.",
    step3Title: "Paste Code & Deploy",
    step3Desc: "Delete old code, paste our provided script, and Deploy as Web app (Access: Anyone).",
    step4Title: "Save Link & Activate",
    step4Desc: "Paste the deployment URL into the box above and click \"Save & Test Sync\".",
    syncCard3Title: "Version Update & Cache Refresh",
    syncCard3Desc: "If cached files prevent fresh updates or sync, click this button to clear cache and reload latest version.",
    forceUpdateBtn: "Clear Cache & Update",
    syncCard4Title: "System Fresh Reset (Start Fresh)",
    syncCard4Badge: "Danger Zone",
    syncCard4Desc: "Wipe all test sales and purchases from Google Sheets and local storage to start serial numbers and stock from #1.",
    resetBtn: "⚠️ Wipe All Data & Start Fresh",

    // Trial & License
    trialBadge: "15-Day Free Trial",
    trialBadgeShort: "Free Trial",
    trialBadgeActive: "15-Day Trial Mode Active",
    trialCardTitle: "Software License & 15-Day Free Trial",
    trialCardDesc: "You are currently running the full-featured 15-Day Free Trial. Test live billing, cash counter, sales history, multi-showroom support, and Google Sheets sync risk-free before purchasing.",
    trialFeature1: "Full offline POS & High-speed Local DB",
    trialFeature2: "58mm/80mm Bengali Thermal Receipt Print",
    trialFeature3: "Google Sheets 2-way live cloud backup",
    trialFeature4: "Monthly profit/loss & stock purchase ledger",
    trialContactLabel: "Interested in purchasing or need trial support?",
    trialBuyBtn: "Inquire to Purchase",

    // Proprietor & Support
    proprietorBadge: "Digital Service Point",
    proprietorTitle: "A Product of Digital Service Point",
    proprietorDesc: "Proprietor & Technology Partner: Digital Service Point • All Rights Reserved",
    visitWebsiteBtn: "Visit Website",
    supportHelplineBtn: "Support & License",

    // PWA & App Install
    installAppBtn: "Install App",
    installAppTitle: "Install on Mobile or POS Terminal",
    installAppDesc: "Add icon to home screen and run as a standalone full-screen mobile app",
    appInstalledBadge: "App Installed",
    installGuideTitle: "Easy App Installation Guide",
  }
};
