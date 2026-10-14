import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  editToken: text("edit_token").notNull().unique(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userGroups = sqliteTable("user_groups", {
  userId: text("user_id").notNull(),
  groupId: text("group_id").notNull(),
  encryptedSummary: text("encrypted_summary").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.groupId] }),
  index("user_groups_user_updated_idx").on(table.userId, table.updatedAt),
]);
