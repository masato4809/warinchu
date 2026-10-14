import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { listUserGroups, upsertUserGroup } from "@/db/user-groups";

export const runtime = "edge";

function validEncryptedSummary(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.iv === "string" && data.iv.length >= 16 && data.iv.length <= 32 && typeof data.ciphertext === "string" && data.ciphertext.length > 20 && data.ciphertext.length <= 20_000;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  try {
    return NextResponse.json({ groups: await listUserGroups(user.userId) });
  } catch (error) {
    console.error("list user groups failed", error);
    return NextResponse.json({ error: "履歴を読み込めませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  try {
    const body = await request.json() as { groupId?: unknown; encryptedSummary?: unknown };
    if (typeof body.groupId !== "string" || !/^[a-z0-9]{8,32}$/i.test(body.groupId) || !validEncryptedSummary(body.encryptedSummary)) {
      return NextResponse.json({ error: "履歴データを確認できませんでした。" }, { status: 400 });
    }
    const saved = await upsertUserGroup(user.userId, body.groupId, body.encryptedSummary);
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: "グループが見つかりません。" }, { status: 404 });
  } catch (error) {
    console.error("save user group failed", error);
    return NextResponse.json({ error: "履歴を保存できませんでした。" }, { status: 500 });
  }
}
