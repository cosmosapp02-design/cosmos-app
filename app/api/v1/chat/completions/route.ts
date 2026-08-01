import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const profile = req.nextUrl.searchParams.get("profile") || body.profile;
    const sessionId = req.headers.get("X-Hermes-Session-Id") || body.session_id || body.sessionId;

    const targetUrl = profile
      ? `http://127.0.0.1:8642/p/${profile}/v1/chat/completions`
      : `http://127.0.0.1:8642/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
    };

    if (sessionId) {
      headers["X-Hermes-Session-Id"] = sessionId;
    }

    const hermesRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!hermesRes.ok) {
      const errText = await hermesRes.text();
      return new Response(errText, { status: hermesRes.status });
    }

    return new Response(hermesRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
