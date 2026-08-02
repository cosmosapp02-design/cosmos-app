import fs from "fs";
import path from "path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function runPhase0Migration() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("DATABASE_URL is missing in .env.local");
    process.exit(1);
  }

  console.log("[Phase 0 Migration] Connecting to Supabase Direct Postgres...");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[Phase 0 Migration] Connected successfully! Executing supabase/phase0_schema_multitenancy.sql...");

    const sqlPath = path.resolve(process.cwd(), "supabase/phase0_schema_multitenancy.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    await client.query(sqlContent);
    console.log("SUCCESS: Phase 0 Schema Foundation & Multi-Tenancy DDL applied cleanly!");

    await client.end();
  } catch (err: any) {
    console.error("[Phase 0 Migration Error]:", err.message);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

runPhase0Migration();
