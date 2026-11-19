import { NextRequest, NextResponse } from "next/server";

function normalizeDate(d: any): string {
  if (!d) return "";
  const str = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(dateObj);
  }
  return str;
}

function normalizeTime(t: any): string {
  if (!t) return "00:00:00";
  const str = String(t).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString("en-US", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }
  return str;
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpointUrl =
      body.endpointUrl ||
      "https://script.google.com/macros/s/AKfycbz-GjX0kwJAGfx6Nt9IXv3xWsiteWxXNpEEBwarG7D_T0fAS4ONAewYfehWG_Jd4lC_/exec";

    let payload = body.payload || body;

    // Normalize and unwrap mutations so Google Apps Script always receives clean objects
    if (payload && Array.isArray(payload.mutations)) {
      payload.mutations = payload.mutations.map((m: any) => {
        let p = m.payload;
        while (typeof p === "string") {
          try {
            p = JSON.parse(p);
          } catch {
            break;
          }
        }
        p = p || {};
        if (p.date) p.date = normalizeDate(p.date);
        if (p.time) p.time = normalizeTime(p.time);
        return {
          mutation_id: String(m.mutation_id || ""),
          record_id: String(m.record_id || ""),
          action: m.action || "INSERT",
          payload: p,
        };
      });
    }

    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Apps Script returned invalid response (possibly HTML/redirect error)",
          raw: text.substring(0, 300),
        },
        { status: 502 }
      );
    }

    // Filter and normalize serverChanges so dates are strictly YYYY-MM-DD
    if (data && Array.isArray(data.serverChanges)) {
      data.serverChanges = data.serverChanges
        .map((item: any) => {
          if (!item) return null;
          const cleanDate = normalizeDate(item.date);
          const cleanTime = normalizeTime(item.time);
          return {
            ...item,
            date: cleanDate,
            time: cleanTime,
            amount: Number(item.amount) || 0,
            serial_no: Number(item.serial_no) || 0,
          };
        })
        .filter((item: any) => {
          if (!item) return false;
          if (item.is_deleted) return true;
          return item.amount > 0 && item.date && item.date.length === 10;
        });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API Sync Proxy Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to communicate with Google Sheet backend" },
      { status: 500 }
    );
  }
}

