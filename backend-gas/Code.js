/**
 * মধুবন শোরুম - Google Apps Script Two-Way Sync Backend
 * Features:
 *  - সম্পূর্ণ অটোমেটিক পার্মানেন্ট ডিলিট (অ্যাপে মুছলে গুগল শিট থেকেও সম্পূর্ণ রো মুছে যাবে)
 *  - ১ কলামে ক্রয়, ১ কলামে বিক্রি, ১ কলামে অবশিষ্ট স্টক
 *  - Concurrency LockService (ডাটা সুরক্ষিত রাখার জন্য)
 */

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "online",
      brand: "মধুবন শোরুম ePOS Sync Server",
      timestamp: new Date().toISOString()
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "সার্ভার ব্যস্ত, কিছুক্ষণ পর চেষ্টা করুন।" })
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

    if (request.action === "BATCH_SYNC") {
      var mutations = request.mutations || [];

      // ১. ডিলিট লিস্ট এবং ইনসার্ট/আপডেট আলাদা করা
      var deleteIds = {};
      var upsertMap = {};

      mutations.forEach(function(m) {
        var recId = String(m.record_id);
        if (m.action === "DELETE") {
          deleteIds[recId] = true;
        } else {
          upsertMap[recId] = m.payload;
        }
      });

      // ২. পূর্বের সব ডাটা পড়া
      var logDataRange = logSheet.getDataRange();
      var logValues = logDataRange.getValues();
      var keptRows = [];
      var handledIds = {};

      for (var r = 1; r < logValues.length; r++) {
        var row = logValues[r];
        var rowId = String(row[0]);

        // যদি এই আইডিটি অ্যাপে ডিলিট হয়ে থাকে, তাহলে এটিকে গুগল শিট থেকেও সম্পূর্ণ বাদ দেওয়া হবে
        if (deleteIds[rowId]) {
          continue;
        }

        // যদি এই আইডিতে কোনো আপডেট থাকে
        if (upsertMap[rowId]) {
          var up = upsertMap[rowId];
          keptRows.push([
            rowId,
            up.date,
            up.time,
            up.type === "SALE" ? "বিক্রি" : "মাল ক্রয়",
            up.amount,
            up.serial_no || 0,
            up.notes || "",
            now
          ]);
          handledIds[rowId] = true;
        } else {
          keptRows.push(row);
          handledIds[rowId] = true;
        }
      }

      // ৩. নতুন ইনসার্ট হওয়া এন্ট্রিগুলো যোগ করা
      Object.keys(upsertMap).forEach(function(newId) {
        if (!handledIds[newId] && !deleteIds[newId]) {
          var p = upsertMap[newId];
          keptRows.push([
            newId,
            p.date,
            p.time,
            p.type === "SALE" ? "বিক্রি" : "মাল ক্রয়",
            p.amount,
            p.serial_no || 0,
            p.notes || "",
            now
          ]);
        }
      });

      // ৪. "লেনদেন_বিস্তারিত" শিট সম্পূর্ণ আপডেট করা (ডিলিট হওয়া রো একদম মুছে যাবে)
      var currentLogLastRow = logSheet.getLastRow();
      if (currentLogLastRow > 1) {
        logSheet.getRange(2, 1, currentLogLastRow - 1, 8).clearContent();
      }

      if (keptRows.length > 0) {
        logSheet.getRange(2, 1, keptRows.length, 8).setValues(keptRows);
      }

      // ৫. "দৈনিক_ক্রয়_বিক্রয়_স্টক" শিট স্বয়ংক্রিয়ভাবে পুনরায় হিসাব করা
      var dateMap = {};

      keptRows.forEach(function(row) {
        var d = String(row[1]);
        var type = String(row[3]);
        var amt = Number(row[4]) || 0;

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

      var currentSummaryLastRow = summarySheet.getLastRow();
      if (currentSummaryLastRow > 1) {
        summarySheet.getRange(2, 1, currentSummaryLastRow - 1, 6).clearContent();
      }

      if (summaryRows.length > 0) {
        summarySheet.getRange(2, 1, summaryRows.length, 6).setValues(summaryRows);
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          serverTime: now,
          serverChanges: []
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Unknown action" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
