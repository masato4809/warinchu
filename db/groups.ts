import { env } from "cloudflare:workers";

type StoredGroup = { id: string; data: string; updated_at: number };

function database(): D1Database {
  if (!env.DB) throw new Error("Database is unavailable");
  return env.DB;
}

export async function createGroupRecord(id: string, editToken: string, data: unknown) {
  const now = Date.now();
  await database().prepare("INSERT INTO groups (id, edit_token, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, editToken, JSON.stringify(data), now, now).run();
  return { id, data, updatedAt: now };
}

export async function readGroupRecord(id: string) {
  const row = await database().prepare("SELECT id, data, updated_at FROM groups WHERE id = ?").bind(id).first<StoredGroup>();
  if (!row) return null;
  return { id: row.id, data: JSON.parse(row.data), updatedAt: row.updated_at };
}

export async function verifyGroupEditToken(id: string, editToken: string) {
  if (!editToken) return false;
  const row = await database().prepare("SELECT 1 AS allowed FROM groups WHERE id = ? AND edit_token = ?").bind(id, editToken).first<{ allowed: number }>();
  return Boolean(row?.allowed);
}

export async function updateGroupRecord(id: string, editToken: string, data: unknown) {
  const now = Date.now();
  const result = await database().prepare("UPDATE groups SET data = ?, updated_at = ? WHERE id = ? AND edit_token = ?")
    .bind(JSON.stringify(data), now, id, editToken).run();
  if (!result.meta.changes) return null;
  return { id, data, updatedAt: now };
}
