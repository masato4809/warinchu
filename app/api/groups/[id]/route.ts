import { NextResponse } from "next/server";
import { readGroupRecord, updateGroupRecord, verifyGroupEditToken } from "@/db/groups";

export const runtime = "edge";

const isEncryptedData = (value: unknown) => Boolean(value && typeof value === "object" && (value as Record<string, unknown>).version === 1 && typeof (value as Record<string, unknown>).iv === "string" && typeof (value as Record<string, unknown>).ciphertext === "string");

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const record = await readGroupRecord(id);
    if (!record) return NextResponse.json({ error: "グループが見つかりません。" }, { status: 404 });
    if (!isEncryptedData(record.data)) {
      const editToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!await verifyGroupEditToken(id, editToken)) return NextResponse.json({ error: "このグループは安全な形式への移行が必要です。編集用リンクを持つ人に一度開いてもらってください。" }, { status: 409 });
    }
    return NextResponse.json(record);
  } catch (error) {
    console.error("read group failed", error);
    return NextResponse.json({ error: "データを読み込めませんでした。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const data = await request.json();
    if (!editToken) return NextResponse.json({ error: "編集用リンクが必要です。" }, { status: 403 });
    if (!isEncryptedData(data)) return NextResponse.json({ error: "暗号化されていないデータは保存できません。" }, { status: 400 });
    const encoded = JSON.stringify(data);
    if (encoded.length > 200_000) return NextResponse.json({ error: "データ量が上限を超えています。" }, { status: 413 });
    const record = await updateGroupRecord(id, editToken, data);
    return record ? NextResponse.json(record) : NextResponse.json({ error: "編集権限を確認できませんでした。" }, { status: 403 });
  } catch (error) {
    console.error("update group failed", error);
    return NextResponse.json({ error: "変更を保存できませんでした。" }, { status: 500 });
  }
}
