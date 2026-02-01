import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("agents")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("current_task", "text")
    .addColumn("location", "text")
    .addColumn("slack_bot_token", "text")
    .addColumn("slack_app_token", "text")
    .addColumn("session_key", "text", (col) => col.notNull().unique())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("tasks")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("design", "text")
    .addColumn("acceptance", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("backlog"))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("task_type", "text", (col) => col.notNull().defaultTo("task"))
    .addColumn("parent_id", "text", (col) =>
      col.references("tasks.id").onDelete("set null")
    )
    .addColumn("created_by", "text", (col) =>
      col.notNull().references("agents.id")
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("task_assignees")
    .addColumn("task_id", "text", (col) =>
      col.notNull().references("tasks.id").onDelete("cascade")
    )
    .addColumn("agent_id", "text", (col) =>
      col.notNull().references("agents.id").onDelete("cascade")
    )
    .addPrimaryKeyConstraint("pk_task_assignees", ["task_id", "agent_id"])
    .execute();

  await db.schema
    .createTable("messages")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("task_id", "text", (col) =>
      col.notNull().references("tasks.id").onDelete("cascade")
    )
    .addColumn("from_agent", "text", (col) =>
      col.notNull().references("agents.id")
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("activities")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("agent_id", "text", (col) =>
      col.notNull().references("agents.id")
    )
    .addColumn("task_id", "text", (col) =>
      col.references("tasks.id").onDelete("set null")
    )
    .addColumn("summary", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("notifications")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("target_agent", "text", (col) =>
      col.notNull().references("agents.id")
    )
    .addColumn("source_agent", "text", (col) =>
      col.references("agents.id")
    )
    .addColumn("task_id", "text", (col) =>
      col.references("tasks.id").onDelete("set null")
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("delivered", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("documents")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("doc_type", "text", (col) => col.notNull())
    .addColumn("task_id", "text", (col) =>
      col.references("tasks.id").onDelete("set null")
    )
    .addColumn("created_by", "text", (col) =>
      col.notNull().references("agents.id")
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createTable("knowledge")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("key", "text", (col) => col.notNull().unique())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("task_id", "text", (col) =>
      col.references("tasks.id").onDelete("set null")
    )
    .addColumn("tags", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  // Indexes
  await db.schema
    .createIndex("idx_tasks_status")
    .on("tasks")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_tasks_parent")
    .on("tasks")
    .column("parent_id")
    .execute();

  await db.schema
    .createIndex("idx_messages_task")
    .on("messages")
    .column("task_id")
    .execute();

  await db.schema
    .createIndex("idx_activities_created")
    .on("activities")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("idx_notifications_pending")
    .on("notifications")
    .columns(["target_agent", "delivered"])
    .execute();

  await db.schema
    .createIndex("idx_knowledge_key")
    .on("knowledge")
    .column("key")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("knowledge").ifExists().execute();
  await db.schema.dropTable("documents").ifExists().execute();
  await db.schema.dropTable("notifications").ifExists().execute();
  await db.schema.dropTable("activities").ifExists().execute();
  await db.schema.dropTable("messages").ifExists().execute();
  await db.schema.dropTable("task_assignees").ifExists().execute();
  await db.schema.dropTable("tasks").ifExists().execute();
  await db.schema.dropTable("agents").ifExists().execute();
}
