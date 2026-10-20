'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LogIn, 
  LogOut, 
  LayoutDashboard, 
  Server, 
  Users, 
  Sparkles, 
  Menu, 
  X, 
  ArrowRight, 
  ShieldCheck, 
  Radio, 
  Gamepad2, 
  HardDrive,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { SettingsModal } from '@/components/SettingsModal';
import { AccountModal } from '@/components/AccountModal';
import { MicrosoftAuthModal } from '@/components/MicrosoftAuthModal';
import { useDaemonSocket } from '@/lib/useDaemonSocket';
import { BedrockAccount } from '@/types';
import { loadAccountsFromSupabase, syncAllToSupabase, deleteAccountFromSupabase } from '@/lib/supabaseSync';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [secretCode, setSecretCode] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountsOpen, setIsAccountsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'accounts'>('dashboard');

  // Accounts state & pending verification guard
  const [accounts, setAccounts] = useState<BedrockAccount[]>([]);
  const [pendingTarget, setPendingTarget] = useState<{ id: string; expectedIgn?: string } | null>(null);
  const [msAuthError, setMsAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Daemon Account Verification Callback
  const handleAccountVerified = useCallback(
    (payload: { botId: string; email: string; ign: string; uuid?: string }) => {
      setMsAuthError(null);
      const verifiedIgn = payload.ign.trim();

      // Guard: Check if a specific target IGN was requested
      if (pendingTarget?.expectedIgn) {
        const expected = pendingTarget.expectedIgn.trim().toLowerCase();
        if (verifiedIgn.toLowerCase() !== expected) {
          const errMsg = `Account mismatch: Signed in as '${verifiedIgn}', but target was '${pendingTarget.expectedIgn}'.`;
          setMsAuthError(errMsg);
          showToast(errMsg, 'error');

          setAccounts((prev) =>
            prev.map((a) =>
              a.id === payload.botId || a.id === pendingTarget.id
                ? { ...a, authError: errMsg, verified: false }
                : a
            )
          );
          return;
        }
      }

      setAccounts((prev) => {
        const existingIndex = prev.findIndex(
          (a) => a.id === payload.botId || a.ign?.toLowerCase() === verifiedIgn.toLowerCase()
        );
        let updated: BedrockAccount[];
        if (existingIndex >= 0) {
          updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ign: verifiedIgn,
            username: payload.email,
            uuid: payload.uuid,
            verified: true,
            authError: undefined,
          };
        } else {
          updated = [
            ...prev,
            {
              id: payload.botId || `acc_${Date.now()}`,
              username: payload.email,
              ign: verifiedIgn,
              auth_type: 'microsoft',
              uuid: payload.uuid,
              verified: true,
              addedAt: Date.now(),
            },
          ];
        }

        if (currentUser) {
          syncAllToSupabase(currentUser, updated);
        }
        return updated;
      });

      setPendingTarget(null);
      showToast(`Verified Bedrock account: @${verifiedIgn}`, 'success');
    },
    [currentUser, pendingTarget, showToast]
  );

  const {
    status: daemonStatus,
    daemonUrl,
    setDaemonUrl,
    authToken,
    setAuthToken,
    latency,
    reconnect,
    restartDaemon,
    verifyAccount,
    msAuthData,
    setMsAuthData,
  } = useDaemonSocket(currentUser, handleAccountVerified);

  // Load saved session, secretCode, and Supabase accounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('pebbleafk_current_user');
      if (savedUser) {
        setCurrentUser(savedUser);
        const cachedSecret = localStorage.getItem(`pebbleafk_secret_${savedUser.toLowerCase()}`) || '';
        if (cachedSecret) {
          setSecretCode(cachedSecret);
        } else {
          fetch(`/api/auth?username=${encodeURIComponent(savedUser)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.secretCode) {
                setSecretCode(data.secretCode);
                localStorage.setItem(`pebbleafk_secret_${savedUser.toLowerCase()}`, data.secretCode);
              }
            })
            .catch(() => {});
        }

        // Load accounts from Supabase
        loadAccountsFromSupabase(savedUser).then((accs) => {
          if (accs && accs.length > 0) {
            setAccounts(accs);
          }
        });
      }
    }
  }, []);

  const handleAuthSuccess = (username: string, receivedSecret?: string) => {
    setCurrentUser(username);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pebbleafk_current_user', username);
      if (receivedSecret) {
        setSecretCode(receivedSecret);
        localStorage.setItem(`pebbleafk_secret_${username.toLowerCase()}`, receivedSecret);
      } else {
        fetch(`/api/auth?username=${encodeURIComponent(username)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.secretCode) {
              setSecretCode(data.secretCode);
              localStorage.setItem(`pebbleafk_secret_${username.toLowerCase()}`, data.secretCode);
            }
          })
          .catch(() => {});
      }
    }

    // Load accounts for new user
    loadAccountsFromSupabase(username).then((accs) => {
      setAccounts(accs || []);
    });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSecretCode('');
    setAccounts([]);
    setIsMobileSidebarOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pebbleafk_current_user');
    }
  };

  // 1-Click Termux Command with exact secretCode
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

  // Start Microsoft OAuth login via daemon
  const handleStartMicrosoftLogin = async (target?: BedrockAccount | string) => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    if (accounts.filter((a) => a.verified).length >= 5 && !target) {
      showToast('Maximum account limit (5 accounts) reached.', 'error');
      return;
    }

    if (daemonStatus !== 'AUTHENTICATED') {
      showToast('Termux daemon is offline! Click the daemon circle in the top right to start it.', 'error');
      setIsSettingsOpen(true);
      return;
    }

    setIsAccountsOpen(false);
    setMsAuthError(null);

    const targetId = typeof target === 'object' && target ? target.id : `acc_${Math.random().toString(36).substring(2, 9)}`;
    const expectedIgn = typeof target === 'string' ? target : target?.expectedIgn || target?.ign;
    const rawTargetEmail = typeof target === 'string' ? target : (target?.expectedIgn || target?.ign || (!target?.username?.includes('@') ? target?.username : null) || '');
    const targetEmail = rawTargetEmail.toLowerCase() === 'new_account' ? '' : rawTargetEmail;

    setPendingTarget({ id: targetId, expectedIgn });
    showToast('Requesting Microsoft sign-in via Termux daemon...', 'info');
    verifyAccount(targetId, targetEmail);
  };

  // Delete / Unlink Account
  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (acc && currentUser) {
      const ign = acc.ign || acc.username;
      await deleteAccountFromSupabase(currentUser, ign);
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    showToast('Bedrock account unlinked.', 'info');
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

  const verifiedAccountsCount = accounts.filter((a) => a.verified).length;

  // 2. LOGGED-IN VIEW: Matching Image 2
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-70 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border ${
              toast.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                : toast.type === 'error'
                ? 'bg-rose-900 text-rose-100 border-rose-700'
                : 'bg-slate-900 text-slate-100 border-slate-700'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Mobile Top Header Bar */}
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

      {/* Main Layout Container */}
      <div className="flex-1 flex flex-col md:flex-row md:min-h-screen">
        {/* Mobile Backdrop Overlay */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          />
        )}

        {/* LEFT SIDEBAR */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-2xl md:shadow-none transition-transform duration-200 ease-in-out ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div>
            {/* Logo Bar inside Sidebar */}
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
                  setIsAccountsOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isAccountsOpen
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
                  {verifiedAccountsCount}/5
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
          {/* Desktop Top Header Bar */}
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
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Hero Banner */}
              <div className="relative overflow-hidden rounded-3xl bg-white p-6 sm:p-8 border border-slate-200/90 shadow-xs">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PebbleAFK v1.0 Bedrock Core • 24/7 Mobile AFK Engine</span>
                  </div>

                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900">
                    Bedrock AFK Operations Hub
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
                    Run headless Minecraft Bedrock bots directly on Android via Termux or remote background daemons.
                    Automate farming, keep chunks loaded, and manage multiple accounts around the clock.
                  </p>

                  <div className="flex items-center gap-3 pt-2 flex-wrap">
                    <button
                      onClick={() => setIsAccountsOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Manage Bedrock Accounts ({verifiedAccountsCount}/5)</span>
                    </button>

                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Radio className="w-4 h-4 text-emerald-600" />
                      <span>Termux Daemon Bridge</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Daemon</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${daemonStatus === 'AUTHENTICATED' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    <span className="text-xs font-bold text-slate-900">
                      {daemonStatus === 'AUTHENTICATED' ? 'Online' : 'Standby'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Active Bots</span>
                  <div className="flex items-center gap-1.5">
                    <Gamepad2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">0 Running</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsAccountsOpen(true)}
                  className="p-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 shadow-2xs space-y-1 text-left transition cursor-pointer"
                >
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Bedrock Accounts</span>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-bold text-slate-900">{verifiedAccountsCount} / 5</span>
                  </div>
                </button>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Engine Protocol</span>
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-sky-600" />
                    <span className="text-xs font-bold text-slate-900">RakNet UDP</span>
                  </div>
                </div>
              </div>

              {/* Server Profiles Placeholder */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Server className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">No Server Profiles Yet</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Server profiles and multi-bot management are being configured. Click the button above to link your Bedrock accounts!
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Account Management Modal */}
      <AccountModal
        isOpen={isAccountsOpen}
        onClose={() => setIsAccountsOpen(false)}
        accounts={accounts}
        onStartMicrosoftLogin={handleStartMicrosoftLogin}
        onDeleteAccount={handleDeleteAccount}
      />

      {/* Microsoft OAuth Device Code Modal */}
      {msAuthData && (
        <MicrosoftAuthModal
          authData={msAuthData}
          onClose={() => {
            setMsAuthData(null);
            setPendingTarget(null);
          }}
          errorMessage={msAuthError}
        />
      )}

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
