import { NextRequest, NextResponse } from "next/server";

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
        return {
          mutation_id: String(m.mutation_id || ""),
          record_id: String(m.record_id || ""),
          action: m.action || "INSERT",
          payload: p || {},
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

    // Filter out any corrupted/empty ghost records from serverChanges so client state is never corrupted
    if (data && Array.isArray(data.serverChanges)) {
      data.serverChanges = data.serverChanges.filter((item: any) => {
        if (!item) return false;
        if (item.is_deleted) return true;
        const amt = Number(item.amount) || 0;
        const date = String(item.date || "").trim();
        return amt > 0 && date.length >= 8;
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

