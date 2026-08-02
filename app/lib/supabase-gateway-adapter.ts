import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export const AGENT_RESERVED_PORTS: Record<string, number> = {
  zach_adams: 8643,
  sara_pate: 8644,
  peter: 8645,
  zara: 8646,
};

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Discord-Style Platform Adapter for Gateway Relay
 * Retired legacy exec() subprocess path. All dispatches now route over persistent WebSocket gateway.
 */
export class SupabaseGatewayAdapter {
  public getReservedPort(profileSlug: string): number {
    const slug = toProfileSlug(profileSlug);
    const port = AGENT_RESERVED_PORTS[slug];
    if (!port) {
      throw new Error(`[GatewayAdapter] Security lock: profile '${slug}' has no reserved port.`);
    }
    return port;
  }

  /**
   * Legacy job processor retired in Phase 5.
   * Jobs are dispatched directly via Gateway Relay (`relay/server.ts`) over live WebSocket sockets.
   */
  public async processJob(job: any): Promise<void> {
    console.log(`[GatewayAdapter] Legacy exec path retired for job ${job.id}. Routing managed by Gateway Relay.`);
  }
}

export const gatewayAdapter = new SupabaseGatewayAdapter();
