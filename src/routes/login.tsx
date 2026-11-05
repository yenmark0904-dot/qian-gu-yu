import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm">
        <p className="font-serif text-3xl tracking-widest">千古遇</p>
        <p className="mt-2 text-sm text-muted">這款遊戲不用登入。圖卡存在這台裝置上。</p>
        <Link to="/" className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-gold text-bg">
          回到召喚
        </Link>
      </div>
    </main>
  );
}