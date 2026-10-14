"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, LoaderCircle, LockKeyhole, ReceiptText } from "lucide-react";
import { decryptJson, type EncryptedPayload } from "@/lib/browser-crypto";

type HistoryWire = { groupId: string; encryptedSummary: EncryptedPayload; updatedAt: number };
type HistorySummary = { name: string; total: number; expenseCount: number; settlementCount: number; unpaidCount: number };
type HistoryItem = HistoryWire & { summary?: HistorySummary; keyValue?: string };
const money = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/account/groups", { cache: "no-store" });
        const json = await response.json() as { groups?: HistoryWire[]; error?: string };
        if (!response.ok) throw new Error(json.error ?? "履歴を読み込めませんでした。");
        const resolved = await Promise.all((json.groups ?? []).map(async item => {
          const keyValue = localStorage.getItem(`warinchu:key:${item.groupId}`) ?? "";
          if (!keyValue) return item;
          try { return { ...item, keyValue, summary: await decryptJson<HistorySummary>(item.encryptedSummary, keyValue) }; }
          catch { return item; }
        }));
        setItems(resolved);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "履歴を読み込めませんでした。");
      } finally { setLoading(false); }
    };
    void load();
  }, []);

  if (loading) return <div className="mt-10 flex items-center gap-3 font-bold"><LoaderCircle className="animate-spin" />履歴を読み込んでいます</div>;
  if (error) return <div className="mt-8 flex items-center gap-3 rounded-2xl border-2 border-red-800 bg-red-50 p-5 font-bold text-red-800"><CircleAlert />{error}</div>;
  if (!items.length) return <section className="neo-card mt-8 p-8 text-center"><ReceiptText className="mx-auto size-10"/><h2 className="mt-4 text-xl font-black">履歴はまだありません</h2><p className="mt-2 text-sm leading-6 text-[#68645b]">ログインした状態で割り勘を作るか、共有リンクを開くとここに追加されます。</p><Link href="/" className="primary-button mt-6 inline-flex min-h-11 items-center px-5">割り勘を始める</Link></section>;

  return <div className="mt-8 grid gap-4">
    {items.map(item => {
      if (!item.summary || !item.keyValue) return <article key={item.groupId} className="neo-mini-card flex items-center gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-black bg-[#efeee9]"><LockKeyhole className="size-5"/></div>
        <div><h2 className="font-black">内容を表示できません</h2><p className="mt-1 text-sm leading-6 text-[#68645b]">この端末に復号キーがありません。共有リンクを一度開くと表示されます。</p></div>
      </article>;
      const status = item.summary.settlementCount === 0 ? { label: "精算不要", className: "bg-[#efeee9]" } : item.summary.unpaidCount === 0 ? { label: "支払い済み", className: "bg-[#d9e6dc] text-[#176246]" } : { label: `未精算 ${item.summary.unpaidCount}件`, className: "bg-[#f7d96d] text-[#6b4b00]" };
      return <Link key={item.groupId} href={`/?group=${encodeURIComponent(item.groupId)}#key=${encodeURIComponent(item.keyValue)}`} className="neo-mini-card block transition hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><h2 className="truncate text-xl font-black">{item.summary.name}</h2><p className="mt-2 text-sm text-[#68645b]">{item.summary.expenseCount}件の支払い · {new Date(item.updatedAt).toLocaleDateString("ja-JP")}</p></div>
          <span className={`shrink-0 rounded-full border-2 border-black px-3 py-1 text-xs font-black ${status.className}`}>{status.label}</span>
        </div>
        <div className="mt-5 flex items-end justify-between border-t-2 border-dashed border-[#c7c3b8] pt-4"><span className="text-sm font-bold text-[#68645b]">支出合計</span><strong className="text-2xl tabular-nums">{money.format(item.summary.total)}</strong></div>
      </Link>;
    })}
    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#6d6961]"><CheckCircle2 className="mt-0.5 size-4 shrink-0"/>履歴の名前・金額・支払い状況は端末内で復号されます。運営側には内容を読めない暗号文だけを保存しています。</p>
  </div>;
}
