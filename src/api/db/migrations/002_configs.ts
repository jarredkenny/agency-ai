import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("settings")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull().defaultTo("general"))
    .addColumn("description", "text")
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("skills")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull().defaultTo("general"))
    .addColumn("tags", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("role_configs")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("config_type", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  // Unique constraint on role + config_type
  await db.schema
    .createIndex("idx_role_configs_unique")
    .on("role_configs")
    .columns(["role", "config_type"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_settings_category")
    .on("settings")
    .column("category")
    .execute();

  await db.schema
    .createIndex("idx_skills_category")
    .on("skills")
    .column("category")
    .execute();

  await db.schema
    .createIndex("idx_role_configs_role")
    .on("role_configs")
    .column("role")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("role_configs").ifExists().execute();
  await db.schema.dropTable("skills").ifExists().execute();
  await db.schema.dropTable("settings").ifExists().execute();
}
