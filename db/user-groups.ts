import { env } from "cloudflare:workers";

export type StoredUserGroup = {
  group_id: string;
  encrypted_summary: string;
  updated_at: number;
};

function database(): D1Database {
  if (!env.DB) throw new Error("Database is unavailable");
  return env.DB;
}

export async function listUserGroups(userId: string) {
  const result = await database()
    .prepare("SELECT group_id, encrypted_summary, updated_at FROM user_groups WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(userId)
    .all<StoredUserGroup>();
  return result.results.map(row => ({
    groupId: row.group_id,
    encryptedSummary: JSON.parse(row.encrypted_summary),
    updatedAt: row.updated_at,
  }));
}

export async function upsertUserGroup(userId: string, groupId: string, encryptedSummary: unknown) {
  const group = await database().prepare("SELECT 1 AS found FROM groups WHERE id = ?").bind(groupId).first();
  if (!group) return null;
  const now = Date.now();
  await database()
    .prepare("INSERT INTO user_groups (user_id, group_id, encrypted_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, group_id) DO UPDATE SET encrypted_summary = excluded.encrypted_summary, updated_at = excluded.updated_at")
    .bind(userId, groupId, JSON.stringify(encryptedSummary), now, now)
    .run();
  return { groupId, updatedAt: now };
}
