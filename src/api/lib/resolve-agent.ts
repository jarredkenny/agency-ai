import { db } from "../db/client.js";

export async function resolveAgent(name: string) {
  return db.selectFrom("agents").where("name", "=", name).selectAll().executeTakeFirst();
}
