'use client';

export default function Home() {
  return (
    <main className="min-h-screen bg-grid-slate flex flex-col items-center justify-center p-6">
      <div className="glass-panel p-8 rounded-2xl border border-slate-200/80 shadow-xl max-w-lg w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto text-3xl font-black">
          🪨
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          PebbleAFK
        </h1>
        <p className="text-sm text-slate-500">
          Minecraft Bedrock 24/7 AFK Bot Manager
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Next.js Frontend Ready
        </div>
      </div>
    </main>
  );
}
