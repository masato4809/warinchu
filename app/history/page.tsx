import Link from "next/link";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { HistoryList } from "./history-list";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="app-shell min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-black underline underline-offset-4">← わりんちゅへ戻る</Link>
        <section className="neo-card mt-8 p-7 text-center sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border-2 border-black bg-[#f7d96d] text-2xl">🔐</div>
          <h1 className="mt-5 text-3xl font-black tracking-[-.05em]">過去の割り勘をまとめて確認</h1>
          <p className="mx-auto mt-4 max-w-lg leading-7 text-[#68645b]">ログインすると、この端末で開いた割り勘の履歴と、支払い済みかどうかを一覧で確認できます。ログインしなくても、これまで通り割り勘は使えます。</p>
          <a href={chatGPTSignInPath("/history")} target="_top" className="primary-button mt-7 inline-flex min-h-12 items-center justify-center px-6">ChatGPTでログイン</a>
          <p className="mt-4 text-xs leading-5 text-[#777]">氏名やメールアドレスは履歴画面に表示・保存しません。</p>
        </section>
      </div>
    </main>;
  }

  return <main className="app-shell min-h-screen px-5 py-8 sm:px-8">
    <div className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-black underline underline-offset-4">← わりんちゅへ戻る</Link>
        <a href={chatGPTSignOutPath("/")} target="_top" className="pill-button px-4 py-2 text-sm">ログアウト</a>
      </header>
      <div className="mt-8">
        <p className="eyebrow">ログイン中</p>
        <h1 className="mt-5 text-4xl font-black tracking-[-.06em]">割り勘の履歴</h1>
        <p className="mt-3 text-[#68645b]">支払い状況をひと目で確認できます。</p>
      </div>
      <HistoryList />
    </div>
  </main>;
}
