import { ESCPOSEncoder } from "./escpos-encoder";
import { TransactionRecord } from "../db/types";

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
}

export const printBridge = new PrintBridge();
