import { FileMigrationProvider, Migrator } from "kysely";
import { db } from "./client.js";
import * as path from "path";
import { promises as fs } from "fs";

export async function runMigrations() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dir, "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to migrate");
    console.error(error);
    process.exit(1);
  }
}

// Run directly if executed as a script
if (import.meta.main) {
  await runMigrations();
  await db.destroy();
}
