import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "わりんちゅ｜みんなの割り勘ノート",
  description: "登録不要。リンクを共有するだけで、みんなの立替と精算をまとめられます。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}<Link href="/history" className="history-shortcut">履歴・ログイン</Link></body>
    </html>
  );
}
