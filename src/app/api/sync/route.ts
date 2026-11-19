import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpointUrl =
      body.endpointUrl ||
      "https://script.google.com/macros/s/AKfycbz-GjX0kwJAGfx6Nt9IXv3xWsiteWxXNpEEBwarG7D_T0fAS4ONAewYfehWG_Jd4lC_/exec";

    const payload = body.payload || body;

    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API Sync Proxy Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to communicate with Google Sheet backend" },
      { status: 500 }
    );
  }
}
