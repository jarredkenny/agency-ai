import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import * as path from "path";
import type { Database } from "./types.js";

const dbPath =
  process.env.DATABASE_PATH ?? path.resolve(process.cwd(), ".agency", "agency.db");

const sqliteDb = new BunDatabase(dbPath);
sqliteDb.exec("PRAGMA journal_mode = WAL");
sqliteDb.exec("PRAGMA foreign_keys = ON");

const dialect = new BunSqliteDialect({ database: sqliteDb });

export const db = new Kysely<Database>({ dialect });
