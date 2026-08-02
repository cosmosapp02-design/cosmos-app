import fs from "fs";
import path from "path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function runPhase7Migration() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("DATABASE_URL is missing in environment");
    process.exit(1);
  }

  console.log("[Phase 7 Migration] Connecting to Supabase Direct Postgres...");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[Phase 7 Migration] Connected successfully! Executing supabase/phase7_model_logging_migration.sql...");

    const sqlPath = path.resolve(process.cwd(), "supabase/phase7_model_logging_migration.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    await client.query(sqlContent);
    console.log("SUCCESS: Phase 7 Model Logging DDL applied cleanly!");

    await client.end();
  } catch (err: any) {
    console.error("[Phase 7 Migration Error]:", err.message);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

runPhase7Migration();
