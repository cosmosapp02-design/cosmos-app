import { NextResponse } from "next/server";

export async function GET() {
  try {
    const hermesRes = await fetch("http://127.0.0.1:8642/v1/models", {
      headers: {
        Authorization: "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
      },
    });
    const data = await hermesRes.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({
      object: "list",
      data: [{ id: "hermes-agent", object: "model", created: Math.floor(Date.now() / 1000), owned_by: "hermes" }],
    });
  }
}
