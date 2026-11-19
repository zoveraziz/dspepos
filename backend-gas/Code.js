/**
 * ডিজিটাল সার্ভিস পয়েন্ট / মধুবন শোরুম - Google Apps Script Two-Way Sync Backend
 * Features:
 *  - সম্পূর্ণ নিরাপদ ও নিখুঁত টু-ওয়ে সিঙ্ক (মোবাইল + পিসি + গুগল শিট)
 *  - ০ বা ফাঁকা টাকার কোনো এন্ট্রি শিটে ঢুকবে না (ভুয়া "মাল ক্রয়" ০ রোধ)
 *  - শিট ব্লিংকিং সম্পূর্ণ বন্ধ (Read-only fast path + in-place clearContent)
 *  - "Sorry, it is not possible to delete all non-frozen rows" এরর সম্পূর্ণ মুক্ত
 *  - স্বয়ংক্রিয়ভাবে শিট থেকে পুরনো ভুল/০-টাকার ডাটা পরিষ্কার করে ফেলা
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  var parts = str.split(/[\/\-.]/);
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

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "online",
      brand: "ডিজিটাল সার্ভিস পয়েন্ট ePOS Sync Server",
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

    // Sheet 2: লেনদেন বিস্তারিত লগ
    var logSheet = ss.getSheetByName("লেনদেন_বিস্তারিত");
    if (!logSheet) {
      logSheet = ss.insertSheet("লেনদেন_বিস্তারিত", 1);
      logSheet.appendRow([
        "আইডি", "তারিখ", "সময়", "ধরন", "টাকার পরিমাণ", "কাস্টমার নং", "নোট", "আপডেট সময়"
      ]);
      logSheet.getRange(1, 1, 1, 8)
        .setFontWeight("bold")
        .setBackground("#334155")
        .setFontColor("#f8fafc");
      logSheet.setFrozenRows(1);
    }

    var now = new Date().toISOString();

    // ১. সম্পূর্ণ ডাটা ক্লিয়ার করার কমান্ড
    if (request.action === "CLEAR_ALL_DATA") {
      var maxLogCols = Math.max(8, logSheet.getLastColumn());
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

      // ক. রিড-অনলি মোড (যদি নতুন কোনো পরিবর্তন না থাকে) - কোনো শিট এডিট হবে না, ব্লিংকিং বন্ধ
      if (mutations.length === 0) {
        var logDataRange = logSheet.getDataRange();
        var logValues = logDataRange.getDisplayValues();
        var allServerRecords = [];

        for (var r = 1; r < logValues.length; r++) {
          var row = logValues[r];
          var rowId = String(row[0] || "").trim();
          var amt = parseAmount(row[4]);
          var dateStr = normalizeDate(row[1]);

          // ফাঁকা, ভুল বা ০ টাকার রো বাদ দেওয়া
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
            created_at: String(row[7] || now),
            updated_at: String(row[7] || now),
            is_deleted: 0
          });
        }

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
            // ০ বা নেগেটিভ টাকা কখনোই নেওয়া হবে না
            if (pAmt > 0) {
              payload.amount = pAmt;
              upsertMap[recId] = payload;
            }
          }
        }
      });

      // গ. গুগল শিটের বিদ্যমান ডাটা পড়া এবং ফিল্টার করা
      var logDataRange = logSheet.getDataRange();
      var logValues = logDataRange.getDisplayValues();
      var keptRows = [];
      var handledIds = {};

      for (var r = 1; r < logValues.length; r++) {
        var row = logValues[r];
        var rowId = String(row[0] || "").trim();
        var existingAmt = parseAmount(row[4]);
        var existingDate = normalizeDate(row[1]);

        // ফাঁকা রো বা অকার্যকর ০-টাকার রো শিট থেকে স্বয়ংক্রিয়ভাবে বাদ দেওয়া
        if (!rowId || rowId === "undefined" || rowId === "null" || existingAmt <= 0 || !existingDate) {
          continue;
        }

        // যদি অ্যাপ থেকে ডিলিট করা হয়ে থাকে
        if (deleteIds[rowId]) {
          continue;
        }

        // যদি এই আইডিতে কোনো নতুন আপডেট থাকে
        if (upsertMap[rowId]) {
          var up = upsertMap[rowId];
          var upAmt = parseAmount(up.amount);
          if (upAmt > 0) {
            var isPurch = (up.type === "PURCHASE" || up.type === "মাল ক্রয়" || up.type === "মাল ক্রয়");
            keptRows.push([
              rowId,
              normalizeDate(up.date) || existingDate,
              String(up.time || ""),
              isPurch ? "মাল ক্রয়" : "বিক্রি",
              upAmt,
              Number(up.serial_no) || 0,
              String(up.notes || ""),
              now
            ]);
            handledIds[rowId] = true;
          }
        } else {
          var isPurchRow = (row[3] === "মাল ক্রয়" || row[3] === "মাল ক্রয়" || row[3] === "PURCHASE");
          keptRows.push([
            rowId,
            existingDate,
            String(row[2] || ""),
            isPurchRow ? "মাল ক্রয়" : "বিক্রি",
            existingAmt,
            Number(row[5]) || 0,
            String(row[6] || ""),
            String(row[7] || now)
          ]);
          handledIds[rowId] = true;
        }
      }

      // ঘ. নতুন ইনসার্ট হওয়া এন্ট্রিগুলো যোগ করা
      Object.keys(upsertMap).forEach(function(newId) {
        if (!handledIds[newId] && !deleteIds[newId]) {
          var p = upsertMap[newId];
          var amt = parseAmount(p.amount);
          if (amt <= 0) return;

          var dateStr = normalizeDate(p.date) || normalizeDate(new Date());
          var isPurch = (p.type === "PURCHASE" || p.type === "মাল ক্রয়" || p.type === "মাল ক্রয়");

          keptRows.push([
            newId,
            dateStr,
            String(p.time || "00:00:00"),
            isPurch ? "মাল ক্রয়" : "বিক্রি",
            amt,
            Number(p.serial_no) || 0,
            String(p.notes || ""),
            now
          ]);
        }
      });

      // ঙ. "লেনদেন_বিস্তারিত" শিট নিরাপদভাবে আপডেট করা (clearContent ব্যবহার করা হয়েছে যাতে কোনো এরর না হয়)
      var maxLogCols = Math.max(8, logSheet.getLastColumn());
      var currentLogLastRow = logSheet.getLastRow();
      if (currentLogLastRow > 1) {
        logSheet.getRange(2, 1, currentLogLastRow - 1, maxLogCols).clearContent();
      }

      if (keptRows.length > 0) {
        if (logSheet.getMaxRows() < keptRows.length + 1) {
          logSheet.insertRowsAfter(logSheet.getMaxRows(), keptRows.length + 10 - logSheet.getMaxRows());
        }
        logSheet.getRange(2, 1, keptRows.length, 8).setValues(keptRows);
      }

      // চ. "দৈনিক_ক্রয়_বিক্রয়_স্টক" শিট স্বয়ংক্রিয়ভাবে পুনরায় সঠিকভাবে হিসাব করা
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
      var summaryRows = [];

      sortedDates.forEach(function(d) {
        var item = dateMap[d];
        runningStock += (item.purchase - item.sale);
        summaryRows.push([
          d,
          item.purchase,
          item.sale,
          runningStock,
          item.count,
          new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka" })
        ]);
      });

      var maxSumCols = Math.max(6, summarySheet.getLastColumn());
      var currentSummaryLastRow = summarySheet.getLastRow();
      if (currentSummaryLastRow > 1) {
        summarySheet.getRange(2, 1, currentSummaryLastRow - 1, maxSumCols).clearContent();
      }

      if (summaryRows.length > 0) {
        if (summarySheet.getMaxRows() < summaryRows.length + 1) {
          summarySheet.insertRowsAfter(summarySheet.getMaxRows(), summaryRows.length + 10 - summarySheet.getMaxRows());
        }
        summarySheet.getRange(2, 1, summaryRows.length, 6).setValues(summaryRows);
      }

      // ছ. রেসপন্স তৈরি করা যাতে সব ডিভাইস (মোবাইল + পিসি) রিয়েলটাইমে আপডেট দেখতে পায়
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
          created_at: String(row[7] || now),
          updated_at: String(row[7] || now),
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
      JSON.stringify({ success: false, error: "অজানা কমান্ড" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
