import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add new columns
  await sql`ALTER TABLE agents ADD COLUMN runtime TEXT`.execute(db);
  await sql`ALTER TABLE agents ADD COLUMN machine TEXT`.execute(db);

  // Backfill from location:
  // local → runtime: system
  // docker → runtime: docker
  // remote → runtime: system (machine filled from fleet.json separately)
  // NULL/missing → runtime: system
  await sql`UPDATE agents SET runtime = CASE
    WHEN location = 'docker' THEN 'docker'
    ELSE 'system'
  END WHERE runtime IS NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0, so we leave them
  // and just clear the values
  await sql`UPDATE agents SET runtime = NULL, machine = NULL`.execute(db);
}
