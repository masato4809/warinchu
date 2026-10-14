import { NextResponse } from "next/server";
import { createGroupRecord } from "@/db/groups";

export const runtime = "edge";

const token = (bytes = 18) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
type EncryptedGroupData = { version: 1; iv: string; ciphertext: string };
const validEncryptedData = (value: unknown): value is EncryptedGroupData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.iv === "string" && data.iv.length >= 16 && data.iv.length <= 32 && typeof data.ciphertext === "string" && data.ciphertext.length > 20 && data.ciphertext.length <= 200_000;
};

export async function POST(request: Request) {
  try {
    const encryptedData = await request.json() as unknown;
    if (!validEncryptedData(encryptedData)) return NextResponse.json({ error: "暗号化されたグループデータを確認できませんでした。" }, { status: 400 });
    const id = token(8);
    const editToken = token(24);
    const record = await createGroupRecord(id, editToken, encryptedData);
    return NextResponse.json({ ...record, editToken }, { status: 201 });
  } catch (error) {
    console.error("create group failed", error);
    return NextResponse.json({ error: "グループを作成できませんでした。少し待ってもう一度お試しください。" }, { status: 500 });
  }
}
