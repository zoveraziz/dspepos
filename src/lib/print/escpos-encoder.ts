/**
 * High-Performance ESC/POS Binary Command Encoder for Thermal POS Printers (58mm/80mm)
 */
export class ESCPOSEncoder {
  private buffer: number[] = [];

  init(): this {
    this.buffer.push(0x1B, 0x40); // ESC @ (Reset & Init)
    return this;
  }

  alignCenter(): this {
    this.buffer.push(0x1B, 0x61, 0x01);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(0x1B, 0x61, 0x00);
    return this;
  }

  alignRight(): this {
    this.buffer.push(0x1B, 0x61, 0x02);
    return this;
  }

  bold(enable = true): this {
    this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  doubleSize(enable = true): this {
    // GS ! n (0x11 = double width & height, 0x00 = normal)
    this.buffer.push(0x1D, 0x21, enable ? 0x11 : 0x00);
    return this;
  }

  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str + "\n");
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  line(char = "-"): this {
    return this.text(char.repeat(32));
  }

  twoColumn(left: string, right: string, width = 32): this {
    const spaceCount = Math.max(1, width - left.length - right.length);
    const line = left + " ".repeat(spaceCount) + right;
    return this.text(line);
  }

  feed(lines = 2): this {
    this.buffer.push(0x1B, 0x64, lines);
    return this;
  }

  cut(): this {
    this.buffer.push(0x1D, 0x56, 0x41, 0x00); // Full Cut
    return this;
  }

  openCashDrawer(): this {
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0xFA); // Standard 24V drawer kick pulse
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
