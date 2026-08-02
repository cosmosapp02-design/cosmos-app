import { NextRequest, NextResponse } from "next/server";
import { supervisor } from "@/app/lib/v2-supervisor";

// Ensure supervisor starts when API is accessed
supervisor.start().catch(() => {});

export async function GET() {
  return NextResponse.json({
    status: "online",
    supervisor: "v2-active",
    message: "Local Supervisor & Realtime Adapter running",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "start";

  if (action === "stop") {
    supervisor.stop();
    return NextResponse.json({ status: "stopped" });
  }

  await supervisor.start();
  return NextResponse.json({ status: "running" });
}
