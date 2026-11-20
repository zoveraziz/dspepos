import { ESCPOSEncoder } from "./escpos-encoder";
import { TransactionRecord, DailySummaryRow } from "../db/types";

class PrintBridge {
  private serialPort: any = null;

  async connectHardwarePrinter(): Promise<boolean> {
    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      alert("Web Serial API is not supported in this browser. Use Chrome or Edge on Desktop/Android.");
      return false;
    }

    try {
      this.serialPort = await (navigator as any).serial.requestPort();
      await this.serialPort.open({ baudRate: 9600 });
      return true;
    } catch (e) {
      console.warn("[PrintBridge] Hardware printer connection cancelled:", e);
      return false;
    }
  }

  isHardwareConnected(): boolean {
    return this.serialPort !== null;
  }

  async printSlip(record: TransactionRecord): Promise<void> {
    // 1. Direct Thermal Hardware Printer
    if (this.serialPort) {
      try {
        const encoder = new ESCPOSEncoder();
        encoder
          .init()
          .alignCenter()
          .bold(true)
          .doubleSize(true)
          .text("ডিজিটাল সার্ভিস পয়েন্ট")
          .doubleSize(false)
          .bold(false)
          .text("DSP ePOS সেলস রসিদ")
          .line("=")
          .alignLeft()
          .twoColumn(`কাস্টমার নং: #${record.serial_no}`, record.time)
          .twoColumn("তারিখ:", record.date)
          .line("-")
          .bold(true)
          .doubleSize(true)
          .alignCenter()
          .text(`৳${record.amount.toFixed(2)}`)
          .doubleSize(false)
          .bold(false)
          .line("=")
          .text("ধন্যবাদ, আবার আসবেন!")
          .feed(3)
          .cut();

        const rawData = encoder.encode();
        const writer = this.serialPort.writable.getWriter();
        await writer.write(rawData);
        writer.releaseLock();
        return;
      } catch (err) {
        console.warn("[PrintBridge] Hardware print fallback to CSS print:", err);
      }
    }

    // 2. High-Speed CSS Print Fallback
    this.printViaCSS(record);
  }

  private printViaCSS(record: TransactionRecord) {
    if (typeof document === "undefined") return;

    let mount = document.getElementById("epos-print-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "epos-print-mount";
      document.body.appendChild(mount);
    }

    mount.innerHTML = `
      <div class="print-receipt-container">
        <div class="text-center font-bold text-xl">ডিজিটাল সার্ভিস পয়েন্ট</div>
        <div class="text-center text-xs">DSP ePOS সেলস রসিদ</div>
        <div class="print-divider">================================</div>
        <div class="flex-between"><span>কাস্টমার নং:</span><span class="font-bold">#${record.serial_no}</span></div>
        <div class="flex-between"><span>তারিখ:</span><span>${record.date}</span></div>
        <div class="flex-between"><span>সময়:</span><span>${record.time}</span></div>
        <div class="print-divider">--------------------------------</div>
        <div class="text-center font-bold text-2xl my-2">৳${record.amount.toFixed(2)}</div>
        <div class="print-divider">================================</div>
        <div class="text-center text-xs mt-2">ধন্যবাদ, আবার আসবেন!</div>
      </div>
    `;

    window.print();
  }

  printLedgerReport(
    rows: DailySummaryRow[],
    periodTitle: string,
    totals: { purchase: number; sale: number; stock: number; customers: number }
  ) {
    if (typeof document === "undefined") return;

    let mount = document.getElementById("epos-print-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "epos-print-mount";
      document.body.appendChild(mount);
    }

    const formatBnMoney = (n: number) => {
      const isNeg = n < 0;
      const formatted = Math.abs(n).toLocaleString("bn-BD");
      return isNeg ? `-৳${formatted}` : `৳${formatted}`;
    };

    const rowsHtml = rows
      .map(
        (r) => {
          const parts = r.date.split("-");
          const dmy = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : r.date;
          return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-family: 'Hind Siliguri', sans-serif; font-weight: 600;">${dmy}</td>
        <td style="padding: 6px 8px; text-align: right; color: #1e40af; font-weight: 600;">${formatBnMoney(r.total_purchase)}</td>
        <td style="padding: 6px 8px; text-align: right; color: #047857; font-weight: 600;">${formatBnMoney(r.total_sale)}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${r.remaining_stock < 0 ? '#dc2626' : '#b45309'};">${formatBnMoney(r.remaining_stock)}</td>
        <td style="padding: 6px 8px; text-align: center;">${r.sales_count} জন</td>
      </tr>
    `;
        }
      )
      .join("");

    mount.innerHTML = `
      <div class="print-report-container">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px;">
          <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 4px 0; color: #0f172a;">ডিজিটাল সার্ভিস পয়েন্ট</h1>
          <p style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 4px 0;">দৈনিক ক্রয়, বিক্রয় ও স্টক খতিয়ান হিসাব রিপোর্ট</p>
          <div style="font-size: 11px; color: #64748b; display: flex; justify-content: space-between; margin-top: 6px;">
            <span>রিপোর্ট পরিধি: <strong>${periodTitle}</strong></span>
            <span>প্রিন্ট সময়: ${new Date().toLocaleString("bn-BD")}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; background: #f8fafc;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600;">মোট মাল ক্রয়</div>
            <div style="font-size: 15px; font-weight: 800; color: #1e40af; margin-top: 2px;">${formatBnMoney(totals.purchase)}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; background: #f8fafc;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600;">মোট মাল বিক্রি</div>
            <div style="font-size: 15px; font-weight: 800; color: #047857; margin-top: 2px;">${formatBnMoney(totals.sale)}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; background: #f8fafc;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600;">অবশিষ্ট স্টক / ব্যালেন্স</div>
            <div style="font-size: 15px; font-weight: 800; color: ${totals.stock < 0 ? '#dc2626' : '#b45309'}; margin-top: 2px;">${formatBnMoney(totals.stock)}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; background: #f8fafc;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600;">মোট কাস্টমার সংখ্যা</div>
            <div style="font-size: 15px; font-weight: 800; color: #334155; margin-top: 2px;">${totals.customers} জন</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1; margin-bottom: 30px;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff;">
              <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">তারিখ</th>
              <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right;">মাল ক্রয় (৳)</th>
              <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right;">মাল বিক্রি (৳)</th>
              <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right;">অবশিষ্ট স্টক / ব্যালেন্স (৳)</th>
              <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">মোট কাস্টমার</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #94a3b8;">কোনো তথ্য পাওয়া যায়নি</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background: #e2e8f0; font-weight: 800; font-size: 11.5px; border-top: 2px solid #0f172a;">
              <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">মোট সর্বমোট হিসাব</td>
              <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; color: #1e40af;">৳${totals.purchase.toLocaleString("bn-BD")}</td>
              <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; color: #047857;">৳${totals.sale.toLocaleString("bn-BD")}</td>
              <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; color: #b45309;">৳${totals.stock.toLocaleString("bn-BD")}</td>
              <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${totals.customers} জন</td>
            </tr>
          </tfoot>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 48px; padding: 0 30px;">
          <div style="text-align: center; border-top: 1px dashed #000; width: 150px; padding-top: 6px; font-size: 11px;">ক্যাশিয়ার / ম্যানেজার স্বাক্ষর</div>
          <div style="text-align: center; border-top: 1px dashed #000; width: 150px; padding-top: 6px; font-size: 11px;">স্বত্বাধিকারী / মালিক স্বাক্ষর</div>
        </div>
      </div>
    `;

    window.print();
  }
}

export const printBridge = new PrintBridge();
