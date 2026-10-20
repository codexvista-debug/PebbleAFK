'use client';

import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  LogIn, 
  LogOut, 
  LayoutDashboard, 
  Server, 
  Users, 
  ShieldCheck, 
  Activity, 
  Wifi, 
  WifiOff, 
  ExternalLink,
  ChevronRight,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { DaemonModal } from '@/components/DaemonModal';
import { useDaemonSocket } from '@/lib/useDaemonSocket';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDaemonModalOpen, setIsDaemonModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'accounts'>('dashboard');

  // Load saved session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pebbleafk_current_user');
      if (saved) setCurrentUser(saved);
    }
  }, []);

  const handleAuthSuccess = (username: string) => {
    setCurrentUser(username);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pebbleafk_current_user', username);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
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
  } = useDaemonSocket(currentUser);

  // Status dot color for the daemon indicator
  const getDaemonRingStyle = () => {
    switch (daemonStatus) {
      case 'AUTHENTICATED':
        return 'border-emerald-400 bg-emerald-500/10 text-emerald-600 shadow-emerald-500/20';
      case 'CONNECTED':
        return 'border-amber-400 bg-amber-500/10 text-amber-600 shadow-amber-500/20';
      case 'CONNECTING':
        return 'border-sky-400 bg-sky-500/10 text-sky-600 shadow-sky-500/20 animate-pulse';
      case 'AUTH_ERROR':
        return 'border-red-400 bg-red-500/10 text-red-600 shadow-red-500/20';
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
        return 'bg-red-500';
      default:
        return 'bg-slate-400';
    }
  };

  // 1. UNLOGGED VIEW: Main page matching Image 1
  if (!currentUser) {
    return (
      <main className="min-h-screen bg-grid-slate flex flex-col items-center justify-center p-4">
        <div className="glass-panel p-8 md:p-10 rounded-2xl border border-slate-200/90 shadow-2xl max-w-md w-full text-center space-y-6">
          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto text-white text-3xl font-black shadow-lg shadow-emerald-600/25">
            P
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              PebbleAFK
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              24/7 Pure Bedrock AFK bot powered by Termux / Node.js. Sign in with your username to manage server profiles &amp; bots.
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

  // 2. LOGGED-IN VIEW: Matching Image 2 with Header, Sidebar, and Top-Right Daemon Icon
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 py-2.5 flex items-center justify-between shadow-2xs">
        {/* Left: Brand + Breadcrumb */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-white text-base shadow-sm shadow-emerald-500/20">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm tracking-tight">PebbleAFK</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  v1.0 Bedrock Core
                </span>
                <span className={`w-2 h-2 rounded-full ${daemonStatus === 'AUTHENTICATED' ? 'bg-emerald-500' : 'bg-red-400'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Focused Daemon Status Icon */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDaemonModalOpen(true)}
            className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center transition shadow-sm hover:scale-105 cursor-pointer ${getDaemonRingStyle()}`}
            title={`Daemon: ${daemonStatus} (${daemonUrl}) - Click to configure`}
          >
            <span className={`w-3 h-3 rounded-full ${getDaemonInnerDot()}`} />
          </button>
        </div>
      </header>

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-56 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 p-3">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-100 text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-600" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('servers')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'servers'
                  ? 'bg-slate-100 text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Server className="w-4 h-4 text-slate-400" />
              <span>Servers</span>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-slate-100 text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Accounts</span>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                0/5
              </span>
            </button>
          </div>

          {/* User Profile + Logout at Bottom */}
          <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between">
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Main Content Area: Focused on Daemon Connection */}
        <main className="flex-1 bg-grid-slate p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Daemon Primary Focus Card */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    daemonStatus === 'AUTHENTICATED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}>
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Bedrock Daemon Bridge</h2>
                    <p className="text-xs text-slate-500 font-mono">
                      {daemonUrl}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDaemonModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  Configure
                </button>
              </div>

              {/* Status details bar */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">Status:</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    daemonStatus === 'AUTHENTICATED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : daemonStatus === 'CONNECTING'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getDaemonInnerDot()}`} />
                    {daemonStatus}
                  </span>
                </div>

                {latency !== null && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Activity className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-mono">{latency}ms latency</span>
                  </div>
                )}

                <button
                  onClick={reconnect}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 text-[11px] transition cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reconnect</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <p>
                  💡 <strong>Tip:</strong> Click the round status indicator in the top-right header at any time to configure your daemon URL or check connection health.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Daemon Settings Modal */}
      <DaemonModal
        isOpen={isDaemonModalOpen}
        onClose={() => setIsDaemonModalOpen(false)}
        status={daemonStatus}
        daemonUrl={daemonUrl}
        onUpdateDaemonUrl={setDaemonUrl}
        authToken={authToken}
        onUpdateAuthToken={setAuthToken}
        latency={latency}
        onReconnect={reconnect}
      />
    </div>
  );
}
