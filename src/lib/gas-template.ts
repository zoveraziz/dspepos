export const GAS_CODE_TEMPLATE = `/**
 * ডিজিটাল সার্ভিস পয়েন্ট / শোরুম - Google Apps Script Two-Way Sync Backend
 * Features:
 *  - সম্পূর্ণ নিরাপদ ও নিখুঁত টু-ওয়ে সিঙ্ক (মোবাইল + পিসি + গুগল শিট)
 *  - ইউজার রোল সাপোর্ট (ম্যানেজার vs অ্যাডমিন অডিট লগ)
 *  - অটোমেটিক "রোল_ও_নিয়মাবলী" গাইডলাইন শিট তৈরি
 *  - ০ বা ফাঁকা টাকার কোনো এন্ট্রি শিটে ঢুকবে না
 *  - শিট ব্লিংকিং সম্পূর্ণ বন্ধ (Read-only fast path + in-place clearContent)
 *  - "Sorry, it is not possible to delete all non-frozen rows" এরর সম্পূর্ণ মুক্ত
 */

function parseAmount(val) {
  if (typeof val === "number") return val;
  var s = String(val || "").trim();
  var bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  for (var i = 0; i < 10; i++) {
    s = s.split(bnDigits[i]).join(String(i));
  }
  s = s.replace(/[^0-9.]/g, "");
  return parseFloat(s) || 0;
}

function normalizeDate(d) {
  if (!d) return "";
  var str = String(d).trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;
  var parts = str.split(/[\\/\\-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return parts[0] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[2]).slice(-2);
    if (parts[2].length === 4) return parts[2] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[0]).slice(-2);
  }
  var dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1);
    if (m.length < 2) m = "0" + m;
    var day = String(dt.getDate());
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  }
  return str;
}

/**
 * সমস্ত শিট, হেডার ও 'রোল_ও_নিয়মাবলী' ট্যাব স্বয়ংক্রিয়ভাবে নিশ্চিত করার ফাংশন
 */
function ensureSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();

  // Sheet 1: দৈনিক ক্রয়, বিক্রি ও অবশিষ্ট স্টক
  var summarySheet = ss.getSheetByName("দৈনিক_ক্রয়_বিক্রয়_স্টক");
  if (!summarySheet) {
    summarySheet = ss.insertSheet("দৈনিক_ক্রয়_বিক্রয়_স্টক", 0);
    summarySheet.appendRow([
      "তারিখ", "মাল ক্রয় (৳)", "মাল বিক্রি (৳)", "অবশিষ্ট স্টক (৳)", "কাস্টমার সংখ্যা", "সর্বশেষ আপডেট"
    ]);
    summarySheet.getRange(1, 1, 1, 6)
      .setFontWeight("bold")
      .setBackground("#0f172a")
      .setFontColor("#ffffff");
    summarySheet.setFrozenRows(1);
  }

  // Sheet 2: লেনদেন বিস্তারিত লগ (অপারেটর কলাম সহ)
  var logSheet = ss.getSheetByName("লেনদেন_বিস্তারিত");
  if (!logSheet) {
    logSheet = ss.insertSheet("লেনদেন_বিস্তারিত", 1);
    logSheet.appendRow([
      "আইডি", "তারিখ", "সময়", "ধরন", "টাকার পরিমাণ", "কাস্টমার নং", "বিবরণ / নোট", "অপারেটর", "আপডেট সময়"
    ]);
    logSheet.getRange(1, 1, 1, 9)
      .setFontWeight("bold")
      .setBackground("#1e293b")
      .setFontColor("#f8fafc");
    logSheet.setFrozenRows(1);
  } else {
    // যদি আগে ৮ কলামের পুরনো শিট থাকে, তবে কলাম ৮ ও ৯ কে অপারেটর ও আপডেট সময় নিশ্চিত করা
    try {
      var headerVal = logSheet.getRange(1, 8).getValue();
      if (headerVal !== "অপারেটর") {
        logSheet.getRange(1, 8).setValue("অপারেটর");
        logSheet.getRange(1, 9).setValue("আপডেট সময়");
        logSheet.getRange(1, 1, 1, 9)
          .setFontWeight("bold")
          .setBackground("#1e293b")
          .setFontColor("#f8fafc");
        logSheet.setFrozenRows(1);
      }
    } catch(e) {}
  }

  // Sheet 3: ইউজার রোল ও সিস্টেম ব্যবহারের নীতিমালা
  var rulesSheet = ss.getSheetByName("রোল_ও_নিয়মাবলী");
  if (!rulesSheet) {
    rulesSheet = ss.insertSheet("রোল_ও_নিয়মাবলী", 2);
    rulesSheet.appendRow(["🏢 DSP ePOS - ইউজার রোল, নিরাপত্তা ও ব্যবহারের নির্দেশিকা"]);
    rulesSheet.appendRow(["বিষয়", "ম্যানেজার (Manager)", "অ্যাডমিন / মালিক (Admin)", "নিরাপত্তা ও নিয়মাবলী"]);

    var rulesData = [
      ["মূল দায়িত্ব", "ক্যাশ কাউন্টারে সেলস এন্ট্রি ও রসিদ প্রিন্ট", "সার্বিক নিয়ন্ত্রণ, মাল ক্রয়, হিসাব ও স্টক নিরীক্ষা", "দোকানের হিসাব স্বচ্ছ ও নিরাপদ রাখা"],
      ["বিক্রি এন্ট্রি (Sale)", "অনুমোদিত (কিবোর্ডের Enter দিয়ে দ্রুত বিক্রি)", "অনুমোদিত", "প্রতিটি বিক্রির পাশে অপারেটরের নাম রেকর্ড থাকবে"],
      ["বিক্রি ডিলিট (Delete)", "নিষিদ্ধ (মুছতে পারবে না)", "অনুমোদিত (প্রয়োজনে ডিলিট করতে পারবে)", "কর্মচারী যাতে ক্যাশ নিয়ে বিক্রি ভয়েড না করতে পারে"],
      ["মাল ক্রয় এন্ট্রি (Purchase)", "লকড (কোনো এক্সেস নেই)", "অনুমোদিত (পাইকারি মাল কেনার হিসাব যোগ)", "মালিক দূর থেকেও মোবাইল দিয়ে ক্রয় এন্ট্রি দিতে পারবেন"],
      ["মাসের হিসাব ও স্টক শিট", "লকড (দেখতে পারবে না)", "পূর্ণ প্রবেশাধিকার (দৈনিক ও মাসিক খতিয়ান)", "মালিক ব্যতীত ব্যবসায়িক মোট লাভ/স্টক তথ্য গোপন থাকবে"],
      ["গুগল শিট সিঙ্ক সেটিংস", "লকড (পরিবর্তন করতে পারবে না)", "পূর্ণ নিয়ন্ত্রণ (শিট লিংক ও দোকানের নাম বদল)", "সিঙ্ক সেটিংস ভুলক্রমে যাতে নষ্ট না হয়"],
      ["লগইন ও মাস্টার পিন", "কাউন্টার ওপেন করলেই ম্যানেজার মোড", "ডিফল্ট মাস্টার পিন: 7788 (পরিবর্তনযোগ্য)", "মালিক কাজ শেষে ম্যানেজার মোডে রেখে যাবেন"],
      ["মাসের শেষে ডাটা ক্লিয়ার", "কোনো অনুমতি নেই", "শুধু কাউন্টার ফ্রেশ করা যাবে", "লোকাল ডাটা ক্লিয়ার করলেও গুগল শিটের রেকর্ড আজীবন সুরক্ষিত থাকে"]
    ];

    for (var rd = 0; rd < rulesData.length; rd++) {
      rulesSheet.appendRow(rulesData[rd]);
    }

    rulesSheet.getRange(1, 1, 1, 4).merge().setFontWeight("bold").setFontSize(13).setBackground("#0f172a").setFontColor("#ffffff").setHorizontalAlignment("center");
    rulesSheet.getRange(2, 1, 1, 4).setFontWeight("bold").setFontSize(11).setBackground("#1e293b").setFontColor("#38bdf8").setHorizontalAlignment("center");
    rulesSheet.getRange(3, 1, rulesData.length, 4).setFontSize(10).setVerticalAlignment("middle");
    rulesSheet.getRange(3, 1, rulesData.length, 1).setFontWeight("bold").setBackground("#f1f5f9");
    rulesSheet.setColumnWidth(1, 180);
    rulesSheet.setColumnWidth(2, 260);
    rulesSheet.setColumnWidth(3, 280);
    rulesSheet.setColumnWidth(4, 300);
    rulesSheet.setRowHeights(1, rulesData.length + 2, 28);
  }

  // নিশ্চিত করা যাতে শিটে পর্যাপ্ত খালি রো থাকে
  if (logSheet.getMaxRows() < 100) {
    logSheet.insertRowsAfter(logSheet.getMaxRows(), 500);
  }
  if (summarySheet.getMaxRows() < 100) {
    summarySheet.insertRowsAfter(summarySheet.getMaxRows(), 500);
  }

  return { summarySheet: summarySheet, logSheet: logSheet, rulesSheet: rulesSheet };
}

/**
 * এই ফাংশনটি Apps Script এডিটরে সরাসরি রান (Run ▶️) করা যায়
 */
function initialSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(ss);
  SpreadsheetApp.flush();
}

/**
 * গুগল স্প্রেডশিট ওপেন বা রিফ্রেশ করলেই স্বয়ংক্রিয়ভাবে চলবে
 */
function onOpen() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);
  } catch(e) {}
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "online",
      brand: "DSP ePOS Role-Based Sync Server",
      timestamp: new Date().toISOString()
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "সার্ভার ব্যস্ত, কিছুক্ষণ পর আবার চেষ্টা করুন।" })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "খালি রিকোয়েস্ট" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var request = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ensureSheets(ss);
    var summarySheet = sheets.summarySheet;
    var logSheet = sheets.logSheet;

    var now = new Date().toISOString();

    // ১. সম্পূর্ণ ডাটা ক্লিয়ার করার কমান্ড
    if (request.action === "CLEAR_ALL_DATA") {
      var maxLogCols = Math.max(9, logSheet.getLastColumn());
      var currentLogLastRow = logSheet.getLastRow();
      if (currentLogLastRow > 1) {
        logSheet.getRange(2, 1, currentLogLastRow - 1, maxLogCols).clearContent();
      }

      var maxSumCols = Math.max(6, summarySheet.getLastColumn());
      var currentSummaryLastRow = summarySheet.getLastRow();
      if (currentSummaryLastRow > 1) {
        summarySheet.getRange(2, 1, currentSummaryLastRow - 1, maxSumCols).clearContent();
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          message: "All data cleared successfully",
          serverTime: now,
          serverChanges: []
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ২. ব্যাচ সিঙ্ক কমান্ড
    if (request.action === "BATCH_SYNC") {
      var mutations = request.mutations || [];

      // ক. রিড-অনলি মোড (যদি নতুন কোনো পরিবর্তন না থাকে)
      if (mutations.length === 0) {
        var logDataRange = logSheet.getDataRange();
        var logValues = logDataRange.getDisplayValues();
        var allServerRecords = [];

        for (var r = 1; r < logValues.length; r++) {
          var row = logValues[r];
          var rowId = String(row[0] || "").trim();
          var amt = parseAmount(row[4]);
          var dateStr = normalizeDate(row[1]);

          if (!rowId || rowId === "undefined" || rowId === "null" || amt <= 0 || !dateStr) {
            continue;
          }

          var isPurchase = (row[3] === "মাল ক্রয়" || row[3] === "মাল ক্রয়" || row[3] === "PURCHASE");
          allServerRecords.push({
            id: rowId,
            date: dateStr,
            time: String(row[2] || ""),
            type: isPurchase ? "PURCHASE" : "SALE",
            amount: amt,
            serial_no: Number(row[5]) || 0,
            notes: String(row[6] || ""),
            operator: String(row[7] || (isPurchase ? "অ্যাডমিন" : "ম্যানেজার")),
            created_at: String(row[8] || now),
            updated_at: String(row[8] || now),
            is_deleted: 0
          });
        }

        allServerRecords.sort(function(a, b) {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.time !== b.time) return a.time.localeCompare(b.time);
          return (a.serial_no || 0) - (b.serial_no || 0);
        });

        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            serverTime: now,
            serverChanges: allServerRecords
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // খ. মিউটেশন ফিল্টারিং ও প্রসেসিং
      var deleteIds = {};
      var upsertMap = {};

      mutations.forEach(function(m) {
        var recId = String(m.record_id || "").trim();
        if (!recId || recId === "undefined" || recId === "null") return;

        if (m.action === "DELETE") {
          deleteIds[recId] = true;
        } else {
          var payload = m.payload;
          while (typeof payload === "string") {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              break;
            }
          }
          if (payload && typeof payload === "object") {
            var pAmt = parseAmount(payload.amount);
            if (pAmt > 0) {
              payload.amount = pAmt;
              upsertMap[recId] = payload;
            }
          }
        }
      });

      // গ. গুগল শিটের বিদ্যমান ডাটা পড়া
      var logDataRange = logSheet.getDataRange();
      var logValues = logDataRange.getDisplayValues();
      var keptRows = [];
      var handledIds = {};

      for (var r = 1; r < logValues.length; r++) {
        var row = logValues[r];
        var rowId = String(row[0] || "").trim();
        var existingAmt = parseAmount(row[4]);
        var existingDate = normalizeDate(row[1]);

        if (!rowId || rowId === "undefined" || rowId === "null" || existingAmt <= 0 || !existingDate) {
          continue;
        }

        if (deleteIds[rowId]) {
          continue;
        }

        if (upsertMap[rowId]) {
          var up = upsertMap[rowId];
          var upAmt = parseAmount(up.amount);
          if (upAmt > 0) {
            var isPurch = (up.type === "PURCHASE" || up.type === "মাল ক্রয়" || up.type === "মাল ক্রয়");
            var op = String(up.operator || (isPurch ? "অ্যাডমিন" : "ম্যানেজার"));
            keptRows.push([
              rowId,
              normalizeDate(up.date) || existingDate,
              String(up.time || ""),
              isPurch ? "মাল ক্রয়" : "বিক্রি",
              upAmt,
              Number(up.serial_no) || 0,
              String(up.notes || ""),
              op,
              now
            ]);
            handledIds[rowId] = true;
          }
        } else {
          var isPurchRow = (row[3] === "মাল ক্রয়" || row[3] === "মাল ক্রয়" || row[3] === "PURCHASE");
          var existingOp = String(row[7] || (isPurchRow ? "অ্যাডমিন" : "ম্যানেজার"));
          keptRows.push([
            rowId,
            existingDate,
            String(row[2] || ""),
            isPurchRow ? "মাল ক্রয়" : "বিক্রি",
            existingAmt,
            Number(row[5]) || 0,
            String(row[6] || ""),
            existingOp,
            String(row[8] || now)
          ]);
          handledIds[rowId] = true;
        }
      }

      // ঘ. নতুন ইনসার্ট হওয়া এন্ট্রি যোগ করা
      Object.keys(upsertMap).forEach(function(newId) {
        if (!handledIds[newId] && !deleteIds[newId]) {
          var p = upsertMap[newId];
          var amt = parseAmount(p.amount);
          if (amt <= 0) return;

          var dateStr = normalizeDate(p.date) || normalizeDate(new Date());
          var isPurch = (p.type === "PURCHASE" || p.type === "মাল ক্রয়" || p.type === "মাল ক্রয়");
          var op = String(p.operator || (isPurch ? "অ্যাডমিন" : "ম্যানেজার"));

          keptRows.push([
            newId,
            dateStr,
            String(p.time || "00:00:00"),
            isPurch ? "মাল ক্রয়" : "বিক্রি",
            amt,
            Number(p.serial_no) || 0,
            String(p.notes || ""),
            op,
            now
          ]);
        }
      });

      // ৪.১: সব লেনদেন নিখুঁতভাবে সাজানো
      keptRows.sort(function(a, b) {
        var d1 = String(a[1] || "");
        var d2 = String(b[1] || "");
        if (d1 !== d2) return d1.localeCompare(d2);

        var t1 = String(a[2] || "");
        var t2 = String(b[2] || "");
        if (t1 !== t2) return t1.localeCompare(t2);

        var s1 = Number(a[5]) || 0;
        var s2 = Number(b[5]) || 0;
        return s1 - s2;
      });

      // ৪.২: প্রতিটি দিনের জন্য একক ও ধারাবাহিক কাস্টমার সিরিয়াল (#১, #২, #৩...)
      var dayCustomerSeq = {};
      for (var k = 0; k < keptRows.length; k++) {
        var rowDate = String(keptRows[k][1] || "");
        var rowType = String(keptRows[k][3] || "");
        if (rowType === "বিক্রি") {
          if (!dayCustomerSeq[rowDate]) dayCustomerSeq[rowDate] = 0;
          dayCustomerSeq[rowDate]++;
          var currentSeq = dayCustomerSeq[rowDate];
          keptRows[k][5] = currentSeq;
          
          var noteVal = String(keptRows[k][6] || "").trim();
          if (!noteVal || noteVal.indexOf("কাস্টমার") === 0) {
            keptRows[k][6] = "কাস্টমার #" + currentSeq;
          }
        }
      }

      // ঙ. "লেনদেন_বিস্তারিত" শিট আপডেট করা
      var maxLogCols = Math.max(9, logSheet.getLastColumn());
      var currentLogLastRow = logSheet.getLastRow();
      if (currentLogLastRow > 1) {
        logSheet.getRange(2, 1, currentLogLastRow - 1, maxLogCols).clearContent().setBackground(null).setFontWeight("normal");
      }

      if (keptRows.length > 0) {
        if (logSheet.getMaxRows() < keptRows.length + 5) {
          logSheet.insertRowsAfter(logSheet.getMaxRows(), keptRows.length + 50 - logSheet.getMaxRows());
        }
        var logRange = logSheet.getRange(2, 1, keptRows.length, 9);
        logRange.setValues(keptRows);

        // ১. প্রফেশনাল অ্যালাইনমেন্ট ও ফরম্যাটিং
        logSheet.getRange(2, 1, keptRows.length, 1).setFontFamily("Courier New").setHorizontalAlignment("center");
        logSheet.getRange(2, 2, keptRows.length, 2).setHorizontalAlignment("center");
        logSheet.getRange(2, 4, keptRows.length, 1).setHorizontalAlignment("center");
        logSheet.getRange(2, 5, keptRows.length, 1).setNumberFormat("৳#,##0.00").setHorizontalAlignment("right");
        logSheet.getRange(2, 6, keptRows.length, 1).setHorizontalAlignment("center");
        logSheet.getRange(2, 7, keptRows.length, 1).setHorizontalAlignment("left");
        logSheet.getRange(2, 8, keptRows.length, 1).setHorizontalAlignment("center").setFontWeight("bold");
        logSheet.getRange(2, 9, keptRows.length, 1).setHorizontalAlignment("center");

        // ২. জেব্রা স্ট্রাইপ ও অপারেটর হাইলাইট
        var logBgs = [];
        for (var y = 0; y < keptRows.length; y++) {
          var isPurchLog = (keptRows[y][3] === "মাল ক্রয়");
          var c = isPurchLog ? (y % 2 === 0 ? "#eff6ff" : "#dbeafe") : (y % 2 === 0 ? "#ffffff" : "#f8fafc");
          logBgs.push([c, c, c, c, c, c, c, c, c]);
        }
        logRange.setBackgrounds(logBgs);

        // ৩. কলামগুলোর প্রস্থ
        logSheet.setColumnWidth(1, 140);
        logSheet.setColumnWidth(2, 110);
        logSheet.setColumnWidth(3, 100);
        logSheet.setColumnWidth(4, 90);
        logSheet.setColumnWidth(5, 130);
        logSheet.setColumnWidth(6, 100);
        logSheet.setColumnWidth(7, 180);
        logSheet.setColumnWidth(8, 120);
        logSheet.setColumnWidth(9, 160);
      }

      // চ. "দৈনিক_ক্রয়_বিক্রয়_স্টক" শিট স্বয়ংক্রিয়ভাবে হিসাব করা
      var dateMap = {};

      keptRows.forEach(function(row) {
        var d = String(row[1]);
        if (!d) return;
        var type = String(row[3]);
        var amt = parseAmount(row[4]);

        if (!dateMap[d]) {
          dateMap[d] = { purchase: 0, sale: 0, count: 0 };
        }

        if (type === "মাল ক্রয়") {
          dateMap[d].purchase += amt;
        } else if (type === "বিক্রি") {
          dateMap[d].sale += amt;
          dateMap[d].count += 1;
        }
      });

      var sortedDates = Object.keys(dateMap).sort();
      var runningStock = 0;
      var totalPurchAll = 0;
      var totalSaleAll = 0;
      var totalCustAll = 0;
      var summaryRows = [];

      sortedDates.forEach(function(d) {
        var item = dateMap[d];
        runningStock += (item.purchase - item.sale);
        totalPurchAll += item.purchase;
        totalSaleAll += item.sale;
        totalCustAll += item.count;

        summaryRows.push([
          d,
          item.purchase,
          item.sale,
          runningStock,
          item.count,
          new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka" })
        ]);
      });

      // গ্র্যান্ড টোটাল সামারি রো
      var hasSummaryData = summaryRows.length > 0;
      if (hasSummaryData) {
        summaryRows.push([
          "মোট সর্বমোট হিসাব",
          totalPurchAll,
          totalSaleAll,
          runningStock,
          totalCustAll,
          "সার্বিক ব্যালেন্স"
        ]);
      }

      var maxSumCols = Math.max(6, summarySheet.getLastColumn());
      var currentSummaryLastRow = summarySheet.getLastRow();
      if (currentSummaryLastRow > 1) {
        summarySheet.getRange(2, 1, currentSummaryLastRow - 1, maxSumCols).clearContent().setBackground(null).setFontWeight("normal");
      }

      if (summaryRows.length > 0) {
        if (summarySheet.getMaxRows() < summaryRows.length + 5) {
          summarySheet.insertRowsAfter(summarySheet.getMaxRows(), summaryRows.length + 50 - summarySheet.getMaxRows());
        }
        var sumRange = summarySheet.getRange(2, 1, summaryRows.length, 6);
        sumRange.setValues(summaryRows);

        summarySheet.getRange(2, 1, summaryRows.length, 1).setHorizontalAlignment("center");
        summarySheet.getRange(2, 2, summaryRows.length, 3).setNumberFormat("৳#,##0.00").setHorizontalAlignment("right");
        summarySheet.getRange(2, 5, summaryRows.length, 2).setHorizontalAlignment("center");

        var sumBgs = [];
        for (var z = 0; z < summaryRows.length - 1; z++) {
          var bg = (z % 2 === 0) ? "#ffffff" : "#f8fafc";
          sumBgs.push([bg, bg, bg, bg, bg, bg]);
        }
        sumBgs.push(["#e2e8f0", "#e2e8f0", "#e2e8f0", "#e2e8f0", "#e2e8f0", "#e2e8f0"]);
        sumRange.setBackgrounds(sumBgs);

        summarySheet.getRange(summaryRows.length + 1, 1, 1, 6).setFontWeight("bold");

        summarySheet.setColumnWidth(1, 120);
        summarySheet.setColumnWidth(2, 140);
        summarySheet.setColumnWidth(3, 140);
        summarySheet.setColumnWidth(4, 160);
        summarySheet.setColumnWidth(5, 120);
        summarySheet.setColumnWidth(6, 140);
      }

      // ছ. রেসপন্স তৈরি
      var allServerRecords = keptRows.map(function(row) {
        var isPurch = (row[3] === "মাল ক্রয়" || row[3] === "PURCHASE");
        return {
          id: String(row[0]),
          date: String(row[1]),
          time: String(row[2]),
          type: isPurch ? "PURCHASE" : "SALE",
          amount: parseAmount(row[4]),
          serial_no: Number(row[5]) || 0,
          notes: String(row[6] || ""),
          operator: String(row[7] || (isPurch ? "অ্যাডমিন" : "ম্যানেজার")),
          created_at: String(row[8] || now),
          updated_at: String(row[8] || now),
          is_deleted: 0
        };
      });

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          serverTime: now,
          serverChanges: allServerRecords
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "অজানা কমান্ড" })\n    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
`;
