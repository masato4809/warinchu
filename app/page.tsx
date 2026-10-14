"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, CircleAlert, Copy, Download, LoaderCircle, LockKeyhole, Plus, ReceiptText, ScanLine, Share2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDataKey, decryptJson, encryptJson, isEncryptedPayload, type EncryptedPayload } from "@/lib/browser-crypto";

type Member = { id: string; name: string };
type Expense = { id: string; title: string; amount: number; payerId: string; participantIds: string[]; shares: Record<string, number>; splitMode: "equal" | "ratio" | "custom"; createdAt: number };
type GroupData = { name: string; currency: "JPY"; members: Member[]; expenses: Expense[]; paidSettlements: string[] };
type GroupRecord = { id: string; data: GroupData; updatedAt: number };
type WireGroupRecord = { id: string; data: GroupData | EncryptedPayload; updatedAt: number };
type Settlement = { from: Member; to: Member; amount: number; key: string };

const money = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const inputClass = "neo-input mt-2 h-12 w-full px-4 text-base outline-none transition";
const freshId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function allocate(amount: number, ids: string[], weights: Record<string, number>) {
  const valid = ids.filter(id => (weights[id] ?? 0) > 0);
  const totalWeight = valid.reduce((sum, id) => sum + weights[id], 0);
  const raw = valid.map(id => ({ id, value: amount * weights[id] / totalWeight }));
  const result = Object.fromEntries(raw.map(item => [item.id, Math.floor(item.value)]));
  let remainder = amount - Object.values(result).reduce((a, b) => a + b, 0);
  raw.sort((a, b) => (b.value % 1) - (a.value % 1)).forEach(item => { if (remainder-- > 0) result[item.id] += 1; });
  return result as Record<string, number>;
}

function calculateSettlements(group: GroupData): Settlement[] {
  const balances = Object.fromEntries(group.members.map(member => [member.id, 0])) as Record<string, number>;
  group.expenses.forEach(expense => {
    balances[expense.payerId] = (balances[expense.payerId] ?? 0) + expense.amount;
    Object.entries(expense.shares).forEach(([id, share]) => { balances[id] = (balances[id] ?? 0) - share; });
  });
  const debtors = group.members.map(member => ({ member, amount: -(balances[member.id] ?? 0) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const creditors = group.members.map(member => ({ member, amount: balances[member.id] ?? 0 })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const result: Settlement[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) result.push({ from: debtors[i].member, to: creditors[j].member, amount, key: `${debtors[i].member.id}:${creditors[j].member.id}:${amount}` });
    debtors[i].amount -= amount; creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++; if (creditors[j].amount === 0) j++;
  }
  return result;
}

export default function Home() {
  const [record, setRecord] = useState<GroupRecord | null>(null);
  const [editToken, setEditToken] = useState("");
  const [dataKey, setDataKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadGroup = useCallback(async (quiet = false) => {
    const id = new URLSearchParams(location.search).get("group");
    if (!id) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const savedEditToken = hash.get("edit") || localStorage.getItem(`waritto:${id}`) || "";
      const savedDataKey = hash.get("key") || localStorage.getItem(`warinchu:key:${id}`) || "";
      const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, { cache: "no-store", headers: savedEditToken ? { authorization: `Bearer ${savedEditToken}` } : undefined });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      const wire = json as WireGroupRecord;
      if (isEncryptedPayload(wire.data)) {
        if (!savedDataKey) throw new Error("このグループを開くための復号キーがありません。新しい閲覧用リンクを送ってもらってください。");
        const data = await decryptJson<GroupData>(wire.data, savedDataKey).catch(() => { throw new Error("リンクの復号キーが正しくありません。共有元から新しいリンクを受け取ってください。"); });
        localStorage.setItem(`warinchu:key:${id}`, savedDataKey); setDataKey(savedDataKey);
        setRecord(current => current?.updatedAt === wire.updatedAt ? current : { id: wire.id, data, updatedAt: wire.updatedAt });
      } else {
        if (!savedEditToken) throw new Error("このグループは安全な形式への移行が必要です。編集用リンクを持つ人に一度開いてもらってください。");
        const migrationKey = createDataKey(); const encryptedData = await encryptJson(wire.data, migrationKey);
        const migration = await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${savedEditToken}` }, body: JSON.stringify(encryptedData) });
        const migrated = await migration.json(); if (!migration.ok) throw new Error(migrated.error);
        localStorage.setItem(`warinchu:key:${id}`, migrationKey); setDataKey(migrationKey);
        setRecord({ id: wire.id, data: wire.data, updatedAt: migrated.updatedAt });
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "読み込みに失敗しました。"); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => {
    const groupId = new URLSearchParams(location.search).get("group");
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const hashToken = hash.get("edit") ?? ""; const hashKey = hash.get("key") ?? "";
    if (hashToken) { setEditToken(hashToken); localStorage.setItem(`waritto:${groupId}`, hashToken); history.replaceState(null, "", `${location.pathname}${location.search}`); }
    else { const saved = localStorage.getItem(`waritto:${groupId}`); if (saved) setEditToken(saved); }
    if (hashKey) { setDataKey(hashKey); localStorage.setItem(`warinchu:key:${groupId}`, hashKey); history.replaceState(null, "", `${location.pathname}${location.search}`); }
    else { const saved = localStorage.getItem(`warinchu:key:${groupId}`); if (saved) setDataKey(saved); }
    void loadGroup();
    const timer = setInterval(() => void loadGroup(true), 8000);
    return () => clearInterval(timer);
  }, [loadGroup]);
  if (loading) return <StatusScreen icon={<LoaderCircle className="size-7 animate-spin" />} title="割り勘帳を開いています" />;
  if (error && !record) return <StatusScreen icon={<CircleAlert className="size-7" />} title={error} action={<Button onClick={() => { history.replaceState(null, "", "/"); location.reload(); }}>トップへ戻る</Button>} />;
  if (!record) return <CreateScreen />;
  return <GroupApp record={record} canEdit={Boolean(editToken)} editToken={editToken} dataKey={dataKey} onChange={setRecord} onReload={loadGroup} />;
}

function StatusScreen({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <main className="app-shell grid min-h-screen place-items-center p-6"><div className="neo-card p-8 text-center"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border-2 border-black bg-[#f7d96d]">{icon}</div><h1 className="text-xl font-black">{title}</h1><div className="mt-5">{action}</div></div></main>;
}
function Brand() { return <Link href="/" className="flex items-center gap-3"><div className="brand-mark">わ</div><div><p className="text-xl font-black tracking-[-.06em]">わりんちゅ</p><p className="text-[11px] font-semibold text-[#777]">みんなの割り勘ノート</p></div></Link>; }

function CreateScreen() {
  const [name, setName] = useState(""); const [members, setMembers] = useState(["", ""]); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const names = [...new Set(members.map(value => value.trim()).filter(Boolean))];
      if (!name.trim() || names.length < 2) throw new Error("グループ名と2人以上のメンバーを入力してください。");
      const data: GroupData = { name: name.trim(), currency: "JPY", members: names.map((memberName,index)=>({id:`m${index+1}-${freshId().slice(-6)}`,name:memberName})), expenses: [], paidSettlements: [] };
      const dataKey = createDataKey(); const encryptedData = await encryptJson(data, dataKey);
      const response = await fetch("/api/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(encryptedData) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error);
      localStorage.setItem(`waritto:${json.id}`, json.editToken);
      localStorage.setItem(`warinchu:key:${json.id}`, dataKey);
      location.href = `/?group=${encodeURIComponent(json.id)}#key=${encodeURIComponent(dataKey)}&edit=${encodeURIComponent(json.editToken)}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "作成できませんでした。"); setSubmitting(false); }
  }
  return <main className="app-shell min-h-screen text-[#202020]">
    <header className="app-header"><div className="mx-auto max-w-6xl px-5 py-4 sm:px-8"><Brand /></div></header>
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-76px)] lg:grid-cols-[1fr_440px] lg:py-16">
      <section className="max-w-xl"><p className="eyebrow">登録・インストール不要</p><h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-[-.065em] sm:text-6xl">割り勘を、<br/><span className="marker-line">もっと気軽に。</span></h1><p className="mt-6 max-w-lg text-lg font-medium leading-8 text-[#626262]">旅行や飲み会のお金をリンクひとつで共有。最後は「誰が誰にいくら払うか」まで、すっきり整理します。</p><div className="mt-9 grid gap-4 sm:grid-cols-3">{[["1","グループを作る"],["2","リンクを送る"],["3","みんなで記録"]].map(([n,label]) => <div key={n} className="neo-mini-card"><span className="step-dot">{n}</span><p className="mt-3 font-black">{label}</p></div>)}</div></section>
      <form onSubmit={create} className="neo-card p-6 sm:p-8">
        <p className="text-sm font-black text-[#6e8064]">30秒でスタート</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">新しい割り勘ノート</h2>
        <label className="mt-7 block text-sm font-bold">グループ名</label><input required maxLength={60} value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="例：箱根旅行" />
        <label className="mt-5 block text-sm font-bold">メンバー</label>
        <div className="mt-2 space-y-3">{members.map((member,index)=><div key={index} className="flex items-center gap-2"><span className="member-number">{index+1}</span><input required={index<2} maxLength={30} aria-label={`メンバー${index+1}の名前`} value={member} onChange={e=>setMembers(current=>current.map((value,i)=>i===index?e.target.value:value))} className="neo-input h-11 min-w-0 flex-1 px-4 text-base outline-none" placeholder={`メンバー${index+1}の名前`}/>{members.length>2&&<Button type="button" variant="ghost" size="icon" aria-label={`メンバー${index+1}を削除`} className="shrink-0 text-[#777] hover:text-red-600" onClick={()=>setMembers(current=>current.filter((_,i)=>i!==index))}><Trash2 className="size-4"/></Button>}</div>)}</div>
        <Button type="button" variant="outline" disabled={members.length>=20} className="outline-button mt-4 h-10 w-full" onClick={()=>setMembers(current=>[...current,""])}><Plus className="size-4"/>メンバーを追加</Button>
        <p className="mt-2 text-sm text-[#777]">1人ずつ入力してください。2人以上で作成できます。</p>
        {error && <p className="mt-4 rounded-xl border-2 border-red-700 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<Button disabled={submitting} className="primary-button mt-6 h-12 w-full text-base">{submitting ? <LoaderCircle className="animate-spin" /> : <Plus />} グループを作る</Button><p className="mt-4 text-center text-xs font-medium leading-5 text-[#777]">明細はこの端末で暗号化されます。運営側には内容が見えません。</p>
      </form>
    </div>
  </main>;
}

function GroupApp({ record, canEdit, editToken, dataKey, onChange, onReload }: { record: GroupRecord; canEdit: boolean; editToken: string; dataKey: string; onChange: (record: GroupRecord) => void; onReload: (quiet?: boolean) => Promise<void> }) {
  const [expenseOpen, setExpenseOpen] = useState(false); const [shareOpen, setShareOpen] = useState(false); const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const settlements = useMemo(() => calculateSettlements(record.data), [record.data]); const total = record.data.expenses.reduce((sum, expense) => sum + expense.amount, 0); const memberName = (id: string) => record.data.members.find(member => member.id === id)?.name ?? "不明";
  const persist = useCallback(async (data: GroupData) => {
    const previous = record; onChange({ ...record, data }); setSaveState("saving");
    try { if(!dataKey)throw new Error("復号キーがありません"); const encryptedData=await encryptJson(data,dataKey); const response = await fetch(`/api/groups/${record.id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${editToken}` }, body: JSON.stringify(encryptedData) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); onChange({id:record.id,data,updatedAt:json.updatedAt}); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1400); }
    catch { onChange(previous); setSaveState("error"); setTimeout(() => setSaveState("idle"), 2500); }
  }, [dataKey, editToken, onChange, record]);
  function addExpense(expense: Expense) { void persist({ ...record.data, expenses: [expense, ...record.data.expenses] }); setExpenseOpen(false); }
  function removeExpense(id: string) { if (confirm("この支払いを削除しますか？")) void persist({ ...record.data, expenses: record.data.expenses.filter(expense => expense.id !== id) }); }
  function togglePaid(key: string) { const paid = record.data.paidSettlements.includes(key); void persist({ ...record.data, paidSettlements: paid ? record.data.paidSettlements.filter(value => value !== key) : [...record.data.paidSettlements, key] }); }
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown } }).modelContext; if (!context?.registerTool) return; const controller = new AbortController();
    void Promise.resolve(context.registerTool({ name:"read_group_summary", title:"割り勘帳の集計を見る", description:"現在開いている割り勘帳の合計と精算内容を読み取ります。", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:true}, execute:() => ({ group:record.data.name, total, members:record.data.members.map(m=>m.name), settlements:settlements.map(s=>({from:s.from.name,to:s.to.name,amount:s.amount})) }) }, { signal: controller.signal })); return () => controller.abort();
  }, [record.data, settlements, total]);
  useEffect(() => {
    if (!dataKey) return;
    const controller = new AbortController();
    const saveToHistory = async () => {
      const unpaidCount = settlements.filter(item => !record.data.paidSettlements.includes(item.key)).length;
      const encryptedSummary = await encryptJson({ name: record.data.name, total, expenseCount: record.data.expenses.length, settlementCount: settlements.length, unpaidCount }, dataKey);
      const response = await fetch("/api/account/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupId: record.id, encryptedSummary }), signal: controller.signal });
      if (!response.ok && response.status !== 401) console.warn("履歴を保存できませんでした");
    };
    void saveToHistory().catch(error => { if ((error as Error).name !== "AbortError") console.warn("履歴を保存できませんでした"); });
    return () => controller.abort();
  }, [dataKey, record.data.expenses.length, record.data.name, record.data.paidSettlements, record.id, settlements, total]);
  return <main className="min-h-screen bg-[#F4F7FB] text-[#11233F]"><header className="sticky top-0 z-30 border-b border-[#DDE5F0] bg-white/92 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><div className="flex items-center gap-2"><span className="hidden text-xs font-bold text-[#687791] sm:block">{saveState === "saving" ? "保存中…" : saveState === "saved" ? "保存しました" : saveState === "error" ? "保存できませんでした" : "自動保存"}</span><Button variant="outline" className="rounded-full" onClick={() => window.print()}><Download className="size-4"/><span className="hidden sm:inline">PDF出力</span></Button><Button variant="outline" className="rounded-full" onClick={() => setShareOpen(true)}><Share2 className="size-4"/><span className="hidden sm:inline">リンクを共有</span></Button></div></div></header><div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_350px] lg:py-10"><section className="overflow-hidden rounded-[28px] border border-[#DCE4EF] bg-white shadow-[0_18px_60px_rgba(24,50,83,.08)]"><div className="bg-[#102A56] p-6 text-white sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-sm font-semibold text-[#9FC3FF]">{canEdit ? "編集できる割り勘帳" : "閲覧専用"}</p><h1 className="text-3xl font-black tracking-[-.04em] sm:text-4xl">{record.data.name}</h1><div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#D4E3FF]"><Users className="size-4" /> {record.data.members.map(m=>m.name).join("・")}</div></div>{canEdit ? <Button className="rounded-full bg-white text-[#153568] hover:bg-[#EEF4FF]" onClick={() => setExpenseOpen(true)}><Plus className="size-4"/> 支払いを追加</Button> : <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold"><LockKeyhole className="size-4"/> 閲覧のみ</span>}</div></div><div className="p-5 sm:p-8"><div className="mb-6 flex items-end justify-between"><div><p className="text-sm font-bold text-[#687791]">支出合計</p><p className="mt-1 text-3xl font-black tabular-nums tracking-[-.04em]">{money.format(total)}</p></div><p className="text-sm text-[#708099]">{record.data.expenses.length}件の支払い</p></div>{record.data.expenses.length ? <div className="space-y-3">{record.data.expenses.map((expense, index) => <article key={expense.id} className="flex items-center gap-4 rounded-2xl border border-[#E1E8F1] p-4"><span className={`h-12 w-1.5 shrink-0 rounded-full ${["bg-[#155DFC]","bg-[#F59E0B]","bg-[#10B981]","bg-[#8B5CF6]"][index%4]}`} /><div className="min-w-0 flex-1"><h2 className="truncate font-bold">{expense.title}</h2><p className="mt-1 truncate text-sm text-[#708099]">{memberName(expense.payerId)}が支払い · {expense.participantIds.map(memberName).join("、")}</p></div><div className="text-right"><p className="font-black tabular-nums">{money.format(expense.amount)}</p><p className="mt-1 text-xs text-[#8190A4]">{expense.splitMode === "equal" ? "均等" : expense.splitMode === "ratio" ? "割合" : "金額指定"}</p></div>{canEdit && <Button aria-label={`${expense.title}を削除`} variant="ghost" size="icon" className="text-[#8491A3] hover:text-red-600" onClick={() => removeExpense(expense.id)}><Trash2 className="size-4"/></Button>}</article>)}</div> : <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#C9D5E5] bg-[#F8FAFD] p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#E5EEFF] text-[#155DFC]"><ReceiptText /></div><h2 className="mt-4 font-black">まだ支払いがありません</h2><p className="mt-2 text-sm text-[#708099]">最初の立て替えを記録すると、精算結果が自動で表示されます。</p>{canEdit && <Button className="mt-5 rounded-xl bg-[#155DFC]" onClick={()=>setExpenseOpen(true)}><Plus/>支払いを追加</Button>}</div></div>}</div></section><aside className="space-y-5"><section className="rounded-[28px] bg-[#E5EEFF] p-6 ring-1 ring-[#CCDCF7]"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-bold text-[#41618F]">いま精算すると</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{settlements.length ? `${settlements.length}回で完了` : "精算はありません"}</h2></div><div className="grid size-11 place-items-center rounded-2xl bg-white text-[#155DFC]"><ReceiptText className="size-5"/></div></div><div className="space-y-3">{settlements.map(item => { const paid=record.data.paidSettlements.includes(item.key); return <button key={item.key} disabled={!canEdit} onClick={()=>togglePaid(item.key)} className={`w-full rounded-2xl border p-4 text-left transition ${paid ? "border-[#9AD5BC] bg-[#EFFAF5]" : "border-transparent bg-white"}`}><div className="flex items-center justify-between text-sm font-bold"><span>{item.from.name}</span><ArrowRight className="size-4 text-[#7890B3]"/><span>{item.to.name}</span></div><div className="mt-2 flex items-end justify-between"><span className={`text-xs font-bold ${paid ? "text-[#087A52]" : "text-[#718098]"}`}>{paid ? "支払い済み" : canEdit ? "タップで支払い済み" : "未精算"}</span><span className="text-xl font-black tabular-nums">{money.format(item.amount)}</span></div></button>; })}</div></section><section className="rounded-2xl border border-[#DCE4EF] bg-white p-5"><h2 className="font-black">計算の見方</h2><p className="mt-2 text-sm leading-6 text-[#687791]">支払った合計と本来の負担額の差を計算し、やり取りが少なくなる順にまとめています。</p><Button variant="ghost" className="mt-3 px-0 text-[#155DFC]" onClick={()=>void onReload()}>最新の状態に更新</Button></section></aside></div><ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} members={record.data.members} onAdd={addExpense}/><ShareDialog open={shareOpen} onOpenChange={setShareOpen} record={record} editToken={editToken}/><PrintReport group={record.data} settlements={settlements} total={total} groupId={record.id}/></main>;
}

function PrintReport({ group, settlements, total, groupId }: { group: GroupData; settlements: Settlement[]; total: number; groupId: string }) {
  const memberName = (id: string) => group.members.find(member => member.id === id)?.name ?? "不明";
  const memberTotals = group.members.map(member => {
    const paid = group.expenses.filter(expense => expense.payerId === member.id).reduce((sum, expense) => sum + expense.amount, 0);
    const owed = group.expenses.reduce((sum, expense) => sum + (expense.shares[member.id] ?? 0), 0);
    return { ...member, paid, owed, balance: paid - owed };
  });
  const generatedAt = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  void groupId;
  return <section className="print-report" aria-label="清算PDF">
    <header className="print-header"><div><p className="print-brand">わりんちゅ</p><h1>{group.name} 清算レポート</h1><p className="print-meta">作成日時：{generatedAt}</p></div><div className="print-total"><span>支出合計</span><strong>{money.format(total)}</strong></div></header>
    <section className="print-section"><h2>清算方法</h2>{settlements.length ? <div className="print-settlements">{settlements.map((item,index) => <div className="print-settlement" key={item.key}><span className="print-step">{index+1}</span><strong>{item.from.name}</strong><span>から</span><strong>{item.to.name}</strong><span>へ</span><b>{money.format(item.amount)}</b><em>{group.paidSettlements.includes(item.key) ? "支払い済み" : "未精算"}</em></div>)}</div> : <p className="print-empty">現在、必要な清算はありません。</p>}</section>
    <section className="print-section"><h2>メンバー別の内訳</h2><table><thead><tr><th>メンバー</th><th>支払った額</th><th>負担額</th><th>差額</th></tr></thead><tbody>{memberTotals.map(member => <tr key={member.id}><td>{member.name}</td><td>{money.format(member.paid)}</td><td>{money.format(member.owed)}</td><td className={member.balance >= 0 ? "print-positive" : "print-negative"}>{member.balance >= 0 ? "+" : ""}{money.format(member.balance)}</td></tr>)}</tbody></table></section>
    <section className="print-section"><h2>支払い明細</h2>{group.expenses.length ? <table><thead><tr><th>内容</th><th>支払った人</th><th>対象者</th><th>金額</th></tr></thead><tbody>{group.expenses.map(expense => <tr key={expense.id}><td>{expense.title}</td><td>{memberName(expense.payerId)}</td><td>{expense.participantIds.map(memberName).join("、")}</td><td>{money.format(expense.amount)}</td></tr>)}</tbody></table> : <p className="print-empty">支払い明細はありません。</p>}</section>
    <footer className="print-footer"><span>安全のため共有リンクはPDFに記載していません</span><span>わりんちゅで作成</span></footer>
  </section>;
}

function receiptFields(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/[|｜]/g, " ").trim()).filter(Boolean);
  const amounts = (line: string) => [...line.matchAll(/(?:¥|￥)?\s*([0-9０-９][0-9０-９,，.]*)\s*(?:円)?/g)]
    .map(match => Number(match[1].normalize("NFKC").replace(/[,，.]/g, "")))
    .filter(value => Number.isFinite(value) && value > 0 && value < 100000000);
  const totalLine = [...lines].reverse().find(line => /(?:合計|総計|お会計|ご請求|支払額|税込)/.test(line) && amounts(line).length);
  const allCandidates = lines.flatMap(line => /(?:TEL|電話|No\.?|日時|20\d{2}[年/.-])/.test(line) ? [] : amounts(line));
  const total = totalLine ? Math.max(...amounts(totalLine)) : (allCandidates.length ? Math.max(...allCandidates) : 0);
  const title = lines.find(line => {
    const compact = line.replace(/\s/g, "");
    return compact.length >= 2 && compact.length <= 28 && !/^[-=*#\d０-９¥￥\s]+$/.test(line) && !/(領収|レシート|TEL|電話|日時|合計|小計|お会計|担当|取引|店番|登録番号)/.test(line);
  }) ?? "レシートの支払い";
  return { title, amount: total ? String(Math.round(total)) : "" };
}

function ExpenseDialog({ open, onOpenChange, members, onAdd }: { open:boolean; onOpenChange:(value:boolean)=>void; members:Member[]; onAdd:(expense:Expense)=>void }) {
  const [title,setTitle]=useState(""); const [amount,setAmount]=useState(""); const [payer,setPayer]=useState(members[0]?.id ?? ""); const [mode,setMode]=useState<Expense["splitMode"]>("equal"); const [selected,setSelected]=useState<string[]>(members.map(m=>m.id)); const [values,setValues]=useState<Record<string,string>>({}); const [error,setError]=useState("");
  const [ocrState,setOcrState]=useState<"idle"|"reading"|"done"|"error">("idle"); const [ocrProgress,setOcrProgress]=useState(0); const [receiptName,setReceiptName]=useState("");
  const memberKey = members.map(member => member.id).join("|");
  useEffect(()=>{ if(open){setTitle("");setAmount("");setPayer(members[0]?.id??"");setMode("equal");setSelected(members.map(m=>m.id));setValues({});setError("");setOcrState("idle");setOcrProgress(0);setReceiptName("");}},[open,memberKey]);
  async function readReceipt(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0]; event.target.value=""; if(!file)return;
    if(!file.type.startsWith("image/")){setError("画像ファイルを選んでください。");return;}
    setReceiptName(file.name); setOcrState("reading"); setOcrProgress(0); setError("");
    let worker:Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>|null=null;
    try{
      const {createWorker,OEM,PSM}=await import("tesseract.js");
      worker=await createWorker(["jpn","eng"],OEM.LSTM_ONLY,{logger:message=>{if(message.status==="recognizing text")setOcrProgress(Math.round(message.progress*100));}});
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:"1"});
      const result=await worker.recognize(file); const fields=receiptFields(result.data.text);
      if(fields.title)setTitle(fields.title); if(fields.amount)setAmount(fields.amount);
      if(!fields.amount)setError("金額を特定できませんでした。読み取り結果を参考に手入力してください。");
      setOcrState("done");
    }catch{setOcrState("error");setError("レシートを読み取れませんでした。明るい場所で真上から撮影した画像をお試しください。");}
    finally{if(worker)await worker.terminate();}
  }
  function submit(event:FormEvent){ event.preventDefault(); const numeric=Math.round(Number(amount)); if(!title.trim()||numeric<=0||!payer||selected.length===0){setError("内容、金額、支払った人、対象者を確認してください。");return;} let shares:Record<string,number>; if(mode==="equal") shares=allocate(numeric,selected,Object.fromEntries(selected.map(id=>[id,1]))); else if(mode==="ratio"){const weights=Object.fromEntries(selected.map(id=>[id,Number(values[id]||1)])); if(Object.values(weights).some(v=>v<=0)){setError("割合は1以上で入力してください。");return;} shares=allocate(numeric,selected,weights);} else {shares=Object.fromEntries(selected.map(id=>[id,Math.round(Number(values[id]||0))])); if(Object.values(shares).reduce((a,b)=>a+b,0)!==numeric){setError("個別金額の合計を支払額と同じにしてください。");return;}} onAdd({id:freshId(),title:title.trim(),amount:numeric,payerId:payer,participantIds:selected,shares,splitMode:mode,createdAt:Date.now()});}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[26px] sm:max-w-xl"><DialogHeader><DialogTitle className="text-2xl font-black">支払いを追加</DialogTitle><DialogDescription>誰が払い、誰の分だったかを記録します。</DialogDescription></DialogHeader><form onSubmit={submit}><section className="receipt-reader"><div className="flex items-center gap-3"><div className="receipt-reader-icon"><ScanLine className="size-5"/></div><div className="min-w-0 flex-1"><p className="font-black">レシートから入力</p><p className="text-xs text-[#666]">店名と合計金額を自動で読み取ります</p></div><label className={`receipt-button ${ocrState==="reading"?"pointer-events-none opacity-60":""}`}><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={readReceipt}/>{ocrState==="reading"?<LoaderCircle className="size-4 animate-spin"/>:<Camera className="size-4"/>}{ocrState==="reading"?`${ocrProgress}%`:"撮影・選択"}</label></div>{receiptName&&<div className="mt-3 flex items-center gap-2 border-t border-black/15 pt-3 text-xs font-bold text-[#666]">{ocrState==="done"?<CheckCircle2 className="size-4 text-[#52705c]"/>:<ReceiptText className="size-4"/>}<span className="truncate">{receiptName}</span><span className="ml-auto shrink-0">{ocrState==="done"?"読み取り完了":ocrState==="error"?"読み取り失敗":"解析中"}</span></div>}<p className="mt-2 text-[11px] leading-4 text-[#777]">画像は保存・送信されず、この端末内だけで処理されます。</p></section><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold sm:col-span-2">内容<input required className={inputClass} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例：ホテル代"/></label><label className="text-sm font-bold">金額<input required inputMode="numeric" className={inputClass} value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} placeholder="12000"/></label><div><label className="text-sm font-bold">支払った人</label><Select value={payer} onValueChange={setPayer}><SelectTrigger className="mt-2 h-12 w-full rounded-2xl"><SelectValue/></SelectTrigger><SelectContent>{members.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div><div className="sm:col-span-2"><label className="text-sm font-bold">割り方</label><Select value={mode} onValueChange={value=>setMode(value as Expense["splitMode"])}><SelectTrigger className="mt-2 h-12 w-full rounded-2xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="equal">均等に割る</SelectItem><SelectItem value="ratio">割合で割る</SelectItem><SelectItem value="custom">金額を指定する</SelectItem></SelectContent></Select></div><fieldset className="sm:col-span-2"><legend className="text-sm font-bold">対象メンバー</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{members.map(m=>{const checked=selected.includes(m.id);return <div key={m.id} className={`flex min-h-12 items-center gap-3 rounded-2xl border p-3 ${checked?"border-[#9EBFFF] bg-[#F2F6FF]":"border-[#DCE4EF]"}`}><Checkbox checked={checked} onCheckedChange={value=>setSelected(current=>value?[...current,m.id]:current.filter(id=>id!==m.id))}/><span className="min-w-0 flex-1 font-bold">{m.name}</span>{checked&&mode!=="equal"&&<input aria-label={`${m.name}の${mode==="ratio"?"割合":"金額"}`} inputMode="numeric" className="h-9 w-20 rounded-xl border border-[#BFCBDB] bg-white px-2 text-right" value={values[m.id]??""} onChange={e=>setValues({...values,[m.id]:e.target.value.replace(/\D/g,"")})} placeholder={mode==="ratio"?"1":"0"}/>}</div>})}</div></fieldset></div>{error&&<p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<DialogFooter className="mt-6"><Button type="button" variant="ghost" onClick={()=>onOpenChange(false)}>キャンセル</Button><Button type="submit" disabled={ocrState==="reading"} className="rounded-xl bg-[#155DFC]">追加して保存</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ShareDialog({open,onOpenChange,record,editToken}:{open:boolean;onOpenChange:(value:boolean)=>void;record:GroupRecord;editToken:string}){
  const [copied,setCopied]=useState(""); const origin=typeof location==="undefined"?"":location.origin; const dataKey=typeof localStorage==="undefined"?"":localStorage.getItem(`warinchu:key:${record.id}`)??""; const baseUrl=`${origin}/?group=${encodeURIComponent(record.id)}`; const viewUrl=dataKey?`${baseUrl}#key=${encodeURIComponent(dataKey)}`:baseUrl; const editUrl=editToken&&dataKey?`${viewUrl}&edit=${encodeURIComponent(editToken)}`:"";
  async function copy(value:string,label:string){await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(""),1600);}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-[26px]"><DialogHeader><DialogTitle className="text-2xl font-black">リンクを共有</DialogTitle><DialogDescription>相手に許可する操作に合わせてリンクを選んでください。</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-2xl border border-[#DCE4EF] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black">閲覧用リンク</p><p className="mt-1 text-sm text-[#708099]">支払いや精算結果を見るだけ</p></div><Button variant="outline" onClick={()=>void copy(viewUrl,"view")}><Copy/>{copied==="view"?"コピー済み":"コピー"}</Button></div></div>{editUrl&&<div className="rounded-2xl border border-[#B9CDF2] bg-[#F2F6FF] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black">編集用リンク</p><p className="mt-1 text-sm text-[#56719A]">支払いの追加・削除ができる</p></div><Button onClick={()=>void copy(editUrl,"edit")}><Copy/>{copied==="edit"?"コピー済み":"コピー"}</Button></div></div>}</div><p className="text-xs leading-5 text-[#7A879A]">リンクには明細を開くための秘密鍵が含まれます。編集用リンクは信頼できるメンバーだけに送ってください。</p></DialogContent></Dialog>;
}
