import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session-store";

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get("channel") || "general";
  const sessionId = getOrCreateSessionId(channel);
  return NextResponse.json({ channel, sessionId });
}
