import fs from "fs";
import path from "path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;

  const sqlPath = path.resolve(process.cwd(), "supabase/full_schema_v2.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // 1. Try Direct Postgres Connection via pg client
  if (dbUrl && !dbUrl.includes("[YOUR-PASSWORD]")) {
    console.log("[Migration] Connecting to Supabase Postgres via Direct Connection String...");
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log("[Migration] Connected successfully! Executing full_schema_v2.sql...");
      await client.query(sqlContent);
      console.log("SUCCESS: All tables, indexes, RLS policies, and Realtime publications created!");
      await client.end();
      return;
    } catch (err: any) {
      console.error("[Migration Error via pg]:", err.message);
      await client.end().catch(() => {});
    }
  }

  // 2. Try Supabase Management API via SUPABASE_ACCESS_TOKEN
  if (token) {
    console.log("[Migration] Executing via Supabase Management API (SUPABASE_ACCESS_TOKEN)...");
    try {
      const res = await fetch(
        "https://api.supabase.com/v1/projects/erguibwskkljogogttgg/database/query",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sqlContent }),
        }
      );

      if (res.ok) {
        console.log("SUCCESS: All tables, indexes, RLS policies, and Realtime publications created!");
        return;
      } else {
        const errText = await res.text();
        console.error("[Migration Error via Management API]:", errText);
      }
    } catch (err: any) {
      console.error("[Migration Error via Management API]:", err.message);
    }
  }

  console.log("\n[Notice]: To let the script run automatically, please update .env.local with either:");
  console.log("1. Your database password in DATABASE_URL (replace [YOUR-PASSWORD] with your actual password)");
  console.log("OR");
  console.log("2. SUPABASE_ACCESS_TOKEN=sbp_... (generated from https://supabase.com/dashboard/account/tokens)");
}

runMigration().catch(console.error);
