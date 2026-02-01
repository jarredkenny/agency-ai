import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE settings ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN input_type TEXT NOT NULL DEFAULT 'text'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0; recreate table if needed
  await sql`ALTER TABLE settings DROP COLUMN sensitive`.execute(db);
  await sql`ALTER TABLE settings DROP COLUMN input_type`.execute(db);
}
