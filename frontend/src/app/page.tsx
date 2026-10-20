'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  LogIn, 
  LogOut, 
  LayoutDashboard, 
  Server, 
  Users, 
  Terminal, 
  Check, 
  Copy, 
  Network, 
  Sparkles,
  Menu,
  X
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { SettingsModal } from '@/components/SettingsModal';
import { useDaemonSocket } from '@/lib/useDaemonSocket';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [secretCode, setSecretCode] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'accounts'>('dashboard');
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Load saved session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('pebbleafk_current_user');
      if (savedUser) {
        setCurrentUser(savedUser);
        const savedSecret = localStorage.getItem(`pebbleafk_secret_${savedUser.toLowerCase()}`) || '';
        setSecretCode(savedSecret);
      }
    }
  }, []);

  const handleAuthSuccess = (username: string) => {
    setCurrentUser(username);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pebbleafk_current_user', username);
      fetch(`/api/auth?username=${encodeURIComponent(username)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.secretCode) {
            setSecretCode(data.secretCode);
            localStorage.setItem(`pebbleafk_secret_${username.toLowerCase()}`, data.secretCode);
          }
        })
        .catch(() => {});
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSecretCode('');
    setIsMobileSidebarOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pebbleafk_current_user');
    }
  };

  const {
    status: daemonStatus,
    daemonUrl,
    setDaemonUrl,
    authToken,
    setAuthToken,
    latency,
    reconnect,
    restartDaemon,
  } = useDaemonSocket(currentUser);

  // 1-Click Termux Command
  const termux1ClickCmd = currentUser
    ? `curl -sL https://pebbleafk.vercel.app/install | bash -s -- ${currentUser}${secretCode ? ` ${secretCode}` : ''}`
    : 'curl -sL https://pebbleafk.vercel.app/install | bash';

  // Auto-sync tunnel from Termux via /api/tunnel
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    const checkTunnel = async () => {
      try {
        const res = await fetch(`/api/tunnel?username=${encodeURIComponent(currentUser)}`, { cache: 'no-store' });
        if (res.ok && isMounted) {
          const data = await res.json();
          const targetUrl = (data?.url || data?.tunnel_url || '').trim();
          const targetToken = (data?.token || secretCode || authToken || '').trim();
          if (targetUrl && targetUrl.startsWith('wss://') && targetUrl !== daemonUrl) {
            setDaemonUrl(targetUrl);
            if (targetToken) setAuthToken(targetToken);
          }
        }
      } catch (_) {}
    };

    checkTunnel();
    const interval = setInterval(checkTunnel, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser, daemonUrl, secretCode, authToken, setDaemonUrl, setAuthToken]);

  const handleCopyCmd = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(termux1ClickCmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    }
  };

  // Status dot style for daemon button
  const getDaemonRingStyle = () => {
    switch (daemonStatus) {
      case 'AUTHENTICATED':
        return 'border-emerald-300 bg-emerald-50 text-emerald-600 shadow-emerald-500/20';
      case 'CONNECTED':
        return 'border-amber-300 bg-amber-50 text-amber-600 shadow-amber-500/20';
      case 'CONNECTING':
        return 'border-sky-300 bg-sky-50 text-sky-600 shadow-sky-500/20 animate-pulse';
      case 'AUTH_ERROR':
        return 'border-rose-300 bg-rose-50 text-rose-600 shadow-rose-500/20';
      default:
        return 'border-slate-300 bg-slate-100 text-slate-400';
    }
  };

  const getDaemonInnerDot = () => {
    switch (daemonStatus) {
      case 'AUTHENTICATED':
        return 'bg-emerald-500 animate-pulse';
      case 'CONNECTED':
        return 'bg-amber-500 animate-pulse';
      case 'CONNECTING':
        return 'bg-sky-500 animate-ping';
      case 'AUTH_ERROR':
        return 'bg-rose-500';
      default:
        return 'bg-slate-400';
    }
  };

  // 1. UNLOGGED VIEW: Main page matching Image 1
  if (!currentUser) {
    return (
      <main className="min-h-screen bg-grid-slate flex flex-col items-center justify-center p-4">
        <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-2xl max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 border border-emerald-400 text-white flex items-center justify-center mx-auto text-3xl font-black shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-500/20">
            ⛏
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              PebbleAFK
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              24/7 Pure Bedrock AFK bot powered by Termux on Android. Sign in with your username to manage server profiles &amp; bots.
            </p>
          </div>

          <button
            onClick={() => setIsAuthOpen(true)}
            className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In / Register</span>
          </button>
        </div>

        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      </main>
    );
  }

  // 2. LOGGED-IN VIEW: Responsive layout matching Image 2
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Mobile Top Header Bar (Shown only on small screens) */}
      <div className="md:hidden flex items-center justify-between p-3.5 bg-white border-b border-slate-200/90 shrink-0 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 border border-emerald-400 text-white flex items-center justify-center font-black text-xs shadow-xs ring-2 ring-emerald-500/20">
              ⛏
            </div>
            <div>
              <span className="font-black text-sm text-slate-900 tracking-tight">PebbleAFK</span>
            </div>
          </div>
        </div>

        {/* Right Daemon status button on mobile */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition shadow-xs hover:scale-105 cursor-pointer ${getDaemonRingStyle()}`}
          title={`Termux Daemon: ${daemonStatus}`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${getDaemonInnerDot()}`} />
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row md:min-h-screen">
        {/* Mobile Backdrop Overlay */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          />
        )}

        {/* LEFT SIDEBAR (Slide-out drawer on mobile, permanent sidebar on desktop) */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-2xl md:shadow-none transition-transform duration-200 ease-in-out ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div>
            {/* Logo Bar inside Sidebar (Matching Image 2) */}
            <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsMobileSidebarOpen(false);
                }}
                className="flex items-center gap-2.5 text-left group hover:opacity-90 transition cursor-pointer"
                title="Go to PebbleAFK Dashboard"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 border border-emerald-400 text-white flex items-center justify-center font-black text-sm shadow-xs ring-2 ring-emerald-500/20 group-hover:scale-105 transition-transform">
                  ⛏
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-slate-900 tracking-tight group-hover:text-emerald-700 transition-colors">
                      PebbleAFK
                    </span>
                    <span className={`w-2 h-2 rounded-full ring-2 ${daemonStatus === 'AUTHENTICATED' ? 'bg-emerald-500 ring-emerald-500/30 animate-pulse' : 'bg-rose-500 ring-rose-500/30'}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-mono font-medium">v1.0 Bedrock Core</span>
                  </div>
                </div>
              </button>

              {/* Close Button on Mobile Drawer */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
                title="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Navigation Items */}
            <div className="p-3 space-y-1.5">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className={`p-1 rounded-lg ${activeTab === 'dashboard' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <LayoutDashboard className="w-4 h-4" />
                </div>
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('servers');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'servers'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                  <Server className="w-4 h-4" />
                </div>
                <span>Servers</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('accounts');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'accounts'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>Accounts</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                  0/5
                </span>
              </button>
            </div>
          </div>

          {/* User Profile + Logout at Bottom */}
          <div className="p-3 border-t border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-bold text-slate-900 truncate">
                @{currentUser}
              </span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200">
                BEDROCK
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Desktop Header + Main View Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop Top Header Bar (Hidden on Mobile) */}
          <header className="hidden md:flex sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-6 py-2.5 items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-bold text-slate-800">Bedrock Core</span>
              <span>/</span>
              <span>Dashboard</span>
            </div>

            {/* Right: Focused Daemon Status Icon */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition shadow-xs hover:scale-105 cursor-pointer ${getDaemonRingStyle()}`}
                title={`Termux Daemon: ${daemonStatus} - Click for 1-Click launcher & settings`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${getDaemonInnerDot()}`} />
              </button>
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main className="flex-1 bg-grid-slate p-3 sm:p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-5">
              {/* 1-Click Termux Launcher Card */}
              <div className="glass-panel p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 shadow-2xs shrink-0">
                      <Terminal className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Android Termux 1-Click Launcher</h2>
                      <p className="text-xs text-slate-500">Run this command on your phone to launch 24/7 Bedrock AFK</p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    daemonStatus === 'AUTHENTICATED'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${getDaemonInnerDot()}`} />
                    {daemonStatus === 'AUTHENTICATED' ? 'Daemon Online' : 'Standby'}
                  </span>
                </div>

                {/* Command Box */}
                <div className="bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 p-3.5 sm:p-4 rounded-2xl border border-emerald-200/90 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <span>📱</span> Copy &amp; paste into Termux:
                    </span>

                    <button
                      onClick={handleCopyCmd}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                    >
                      {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200/90 font-mono text-[11px] sm:text-xs text-slate-800 break-all select-all shadow-inner leading-relaxed">
                    {termux1ClickCmd}
                  </div>

                  <div className="text-[11px] text-slate-500 leading-relaxed flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      <strong className="text-emerald-700">Auto-Sync Enabled:</strong> Termux will automatically pair its secure Cloudflare tunnel to your account with zero manual copy-pasting.
                    </span>
                  </div>
                </div>

                {/* Latency and Tunnel status */}
                {daemonStatus === 'AUTHENTICATED' && (
                  <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900 flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Network className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono text-[11px] break-all">{daemonUrl}</span>
                    </div>
                    {latency !== null && (
                      <span className="font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                        {latency}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Settings / Termux Daemon Bridge Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        daemonUrl={daemonUrl}
        authToken={authToken}
        onSaveDaemonSettings={(url, token) => {
          setDaemonUrl(url);
          setAuthToken(token);
        }}
        termuxCommand={termux1ClickCmd}
        onRestartDaemon={restartDaemon}
        isDaemonOnline={daemonStatus === 'AUTHENTICATED'}
      />
    </div>
  );
}
