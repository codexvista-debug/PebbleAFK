'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  LogIn, 
  LogOut, 
  Shield, 
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
  MinusCircle,
  Info,
  Trash2,
  RefreshCw,
  Search,
  Copy,
  Plus,
  Minus,
  Play,
  Square,
  Clock,
  Pin,
  FileText,
  Home as HomeIcon,
  MessageSquare,
  Sliders,
  Send,
  ChevronDown,
  AlertTriangle,
  RotateCcw,
  RotateCw,
  CornerDownLeft,
  Terminal,
  ArrowUp,
  ArrowDownToLine,
  Activity,
  Gift
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { SettingsModal } from '@/components/SettingsModal';
import { TermuxConsoleModal } from '@/components/TermuxConsoleModal';
import { TermuxStreamPage } from '@/components/TermuxStreamPage';
import { FreshSmpDiagnosticsPage } from '@/components/FreshSmpDiagnosticsPage';
import { ConfirmModal } from '@/components/ConfirmModal';
import { MicrosoftAuthModal } from '@/components/MicrosoftAuthModal';
import { ServerProfileModal } from '@/components/ServerProfileModal';
import { DangerousSettingsModal } from '@/components/DangerousSettingsModal';
import { AccountLogsModal } from '@/components/AccountLogsModal';
import { ServerLogo } from '@/components/ServerLogo';
import { RelativeTime } from '@/components/RelativeTime';
import { MinecraftText } from '@/components/MinecraftText';
import { useDaemonSocket } from '@/lib/useDaemonSocket';
import { BedrockAccount, ServerProfile, BotSettings, ChatMessage, BotLifecycleState, PlayerLogEntry, PlayerLogType, MAX_BEDROCK_ACCOUNTS, DEFAULT_BOT_SETTINGS, FRESHSMP_DEFAULT_BOT_SETTINGS } from '@/types';

const getPlayerSkinHeadUrl = (name: string, size = 32) => {
  const clean = (name || 'Steve').replace(/^@/, '').trim();
  return `https://crafthead.net/helm/${encodeURIComponent(clean)}/${size}`;
};

type MinecraftStatusTone = 'stable' | 'unstable' | 'offline';

function MinecraftStatusIcon({ tone }: { tone: MinecraftStatusTone }) {
  const pixels = tone === 'stable'
    ? ['bg-lime-300', 'bg-emerald-400', 'bg-emerald-700', 'bg-amber-800']
    : tone === 'unstable'
      ? ['bg-amber-300', 'bg-red-400', 'bg-rose-700', 'bg-stone-900']
      : ['bg-stone-300', 'bg-stone-400', 'bg-stone-600', 'bg-stone-800'];

  return (
    <span className="grid h-4 w-4 shrink-0 grid-cols-2 grid-rows-2 gap-px border border-[#171512] bg-[#171512] p-px shadow-[0_1px_0_rgba(255,255,255,.35)]" aria-hidden="true">
      {pixels.map((pixel, index) => <span key={index} className={pixel} />)}
    </span>
  );
}

/* Authentic Minecraft Pixel Art Icons for Sidebar Navigation */
function MinecraftCraftingTableIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" fill="#6d4827" />
      <rect x="0" y="0" width="16" height="1" fill="#9c6e3b" />
      <rect x="0" y="0" width="1" height="16" fill="#9c6e3b" />
      <rect x="15" y="0" width="1" height="16" fill="#3f2711" />
      <rect x="0" y="15" width="16" height="1" fill="#3f2711" />
      <rect x="2" y="2" width="12" height="12" fill="#523418" />
      <rect x="3" y="3" width="4" height="4" fill="#a4723d" />
      <rect x="9" y="3" width="4" height="4" fill="#a4723d" />
      <rect x="3" y="9" width="4" height="4" fill="#8a5b2a" />
      <rect x="9" y="9" width="4" height="4" fill="#8a5b2a" />
      <rect x="3" y="3" width="1" height="4" fill="#d19c5c" />
      <rect x="3" y="3" width="4" height="1" fill="#d19c5c" />
      <rect x="9" y="3" width="1" height="4" fill="#d19c5c" />
      <rect x="9" y="3" width="4" height="1" fill="#d19c5c" />
      <rect x="5" y="5" width="2" height="2" fill="#3a2512" />
      <rect x="11" y="5" width="2" height="2" fill="#3a2512" />
    </svg>
  );
}

function MinecraftCommandBlockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="16" height="16" fill="#462c1b" />
      <rect x="1" y="1" width="14" height="14" fill="#b96e42" />
      <rect x="1" y="1" width="14" height="1" fill="#df8b5b" />
      <rect x="1" y="1" width="1" height="14" fill="#df8b5b" />
      <rect x="14" y="1" width="1" height="14" fill="#7d4323" />
      <rect x="1" y="14" width="14" height="1" fill="#7d4323" />
      <rect x="3" y="3" width="10" height="10" fill="#67391d" />
      <rect x="4" y="4" width="8" height="8" fill="#351a0b" />
      <rect x="5" y="5" width="6" height="6" fill="#13a89e" />
      <rect x="6" y="6" width="4" height="4" fill="#5cf2e5" />
      <rect x="7" y="7" width="2" height="2" fill="#ffffff" />
      <rect x="2" y="2" width="1" height="1" fill="#ffd199" />
      <rect x="13" y="2" width="1" height="1" fill="#ffd199" />
      <rect x="2" y="13" width="1" height="1" fill="#ffd199" />
      <rect x="13" y="13" width="1" height="1" fill="#ffd199" />
    </svg>
  );
}

function MinecraftHeartIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 1h3v1h1v1h2V2h1V1h3v1h1v3h-1v2h-1v2h-1v2h-1v1h-1v1h-2v-1H6v-1H5v-2H4V7H3V5H2V2h1V1z" fill="#000000" />
      <path d="M3 2h3v1h1v2H6V4H3V2zm7 0h3v2h-3V3h-1V2h1zm-5 4h1v2H5V6zm6 0h1v2h-1V6zm-4 4h1v1H7v-1zm2 0h1v1H9v-1z" fill="#660000" />
      <path d="M4 3h2v2H4V3zm6 0h2v2h-2V3zM3 4h10v1H3V4zm1 1h8v2H4V5zm1 2h6v2H5V7zm1 2h4v1H6V9zm1 1h2v1H7v-1z" fill="#e01616" />
      <rect x="4" y="2" width="1" height="2" fill="#ffffff" />
      <rect x="5" y="2" width="1" height="1" fill="#ffffff" />
      <rect x="4" y="3" width="2" height="1" fill="#ff8a8a" />
    </svg>
  );
}

function MinecraftEnderChestIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" fill="#0e171b" />
      <rect x="2" y="1" width="12" height="14" fill="#0e171b" />
      <rect x="2" y="2" width="12" height="12" fill="#1b2b32" />
      <rect x="2" y="2" width="12" height="1" fill="#2d4854" />
      <rect x="2" y="2" width="1" height="12" fill="#2d4854" />
      <rect x="13" y="2" width="1" height="12" fill="#090f12" />
      <rect x="2" y="13" width="12" height="1" fill="#090f12" />
      <rect x="2" y="6" width="12" height="1" fill="#090f12" />
      <rect x="6" y="5" width="4" height="4" fill="#0b5e55" />
      <rect x="7" y="5" width="2" height="4" fill="#1fe4c8" />
      <rect x="6" y="6" width="4" height="2" fill="#1fe4c8" />
      <rect x="7" y="6" width="2" height="2" fill="#ffffff" />
      <rect x="7.5" y="6" width="1" height="2" fill="#083832" />
    </svg>
  );
}

function MinecraftSteveIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" fill="#1b120c" />
      <rect x="2" y="2" width="12" height="5" fill="#462d1d" />
      <rect x="2" y="7" width="2" height="3" fill="#462d1d" />
      <rect x="12" y="7" width="2" height="3" fill="#462d1d" />
      <rect x="3" y="3" width="10" height="2" fill="#2e1b0f" />
      <rect x="4" y="6" width="8" height="7" fill="#bd8b72" />
      <rect x="4" y="7" width="8" height="5" fill="#cda085" />
      <rect x="7" y="9" width="2" height="1" fill="#a46d54" />
      <rect x="3" y="7" width="3" height="2" fill="#ffffff" />
      <rect x="10" y="7" width="3" height="2" fill="#ffffff" />
      <rect x="4" y="7" width="2" height="2" fill="#2e428b" />
      <rect x="10" y="7" width="2" height="2" fill="#2e428b" />
      <rect x="6" y="11" width="4" height="1" fill="#754832" />
      <rect x="5" y="10" width="1" height="2" fill="#50301e" />
      <rect x="10" y="10" width="1" height="2" fill="#50301e" />
      <rect x="5" y="12" width="6" height="1" fill="#50301e" />
    </svg>
  );
}

function MinecraftCompassIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="4" y="1" width="8" height="14" fill="#2b2b2b" />
      <rect x="1" y="4" width="14" height="8" fill="#2b2b2b" />
      <rect x="2" y="2" width="12" height="12" fill="#2b2b2b" />
      <rect x="4" y="2" width="8" height="12" fill="#808080" />
      <rect x="2" y="4" width="12" height="8" fill="#808080" />
      <rect x="3" y="3" width="10" height="10" fill="#a6a6a6" />
      <rect x="4" y="4" width="8" height="8" fill="#141414" />
      <rect x="7" y="3" width="2" height="5" fill="#ff2222" />
      <rect x="6" y="5" width="4" height="2" fill="#cc1111" />
      <rect x="7" y="3" width="1" height="4" fill="#ff7777" />
      <rect x="7" y="8" width="2" height="5" fill="#cccccc" />
      <rect x="6" y="9" width="4" height="2" fill="#999999" />
      <rect x="7" y="9" width="1" height="3" fill="#ffffff" />
      <rect x="7" y="7" width="2" height="2" fill="#ffd700" />
    </svg>
  );
}

function MinecraftBookQuillIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="3" width="9" height="11" fill="#4d2411" />
      <rect x="3" y="4" width="8" height="10" fill="#7a3d1d" />
      <rect x="4" y="5" width="6" height="8" fill="#ded2b6" />
      <rect x="5" y="6" width="5" height="6" fill="#fffcf2" />
      <rect x="6" y="7" width="3" height="1" fill="#4a3e2c" />
      <rect x="6" y="9" width="3" height="1" fill="#4a3e2c" />
      <rect x="10" y="8" width="2" height="2" fill="#e6b800" />
      <rect x="9" y="1" width="2" height="2" fill="#ffffff" />
      <rect x="10" y="2" width="2" height="3" fill="#ffffff" />
      <rect x="11" y="3" width="2" height="4" fill="#d9d9d9" />
      <rect x="10" y="6" width="2" height="3" fill="#b3b3b3" />
      <rect x="9" y="8" width="2" height="3" fill="#332211" />
      <rect x="8" y="11" width="1" height="2" fill="#111111" />
      <rect x="12" y="4" width="1" height="2" fill="#9b4fd1" />
    </svg>
  );
}

function MinecraftRepeaterIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" fill="#3d3d3d" />
      <rect x="2" y="3" width="12" height="10" fill="#6e6e6e" />
      <rect x="2" y="3" width="12" height="1" fill="#8f8f8f" />
      <rect x="2" y="3" width="1" height="10" fill="#8f8f8f" />
      <rect x="4" y="5" width="2" height="1" fill="#525252" />
      <rect x="10" y="9" width="2" height="1" fill="#525252" />
      <rect x="7" y="11" width="2" height="1" fill="#8f8f8f" />
      <rect x="7" y="4" width="2" height="7" fill="#2b2b2b" />
      <rect x="6" y="5" width="4" height="1" fill="#2b2b2b" />
      <rect x="4" y="6" width="2" height="4" fill="#3b2011" />
      <rect x="4" y="4" width="2" height="2" fill="#ff1f1f" />
      <rect x="4.5" y="4.5" width="1" height="1" fill="#ffffff" />
      <rect x="10" y="8" width="2" height="4" fill="#3b2011" />
      <rect x="10" y="6" width="2" height="2" fill="#ff1f1f" />
      <rect x="10.5" y="6.5" width="1" height="1" fill="#ffffff" />
    </svg>
  );
}
import { 
  loadAccountsFromSupabase, 
  syncAllToSupabase, 
  deleteAccountFromSupabase,
  loadServersFromSupabase,
  saveServersToSupabase,
  saveAccountLogsToSupabase,
  loadAccountLogsFromSupabase,
  updateAccountConnectionState
} from '@/lib/supabaseSync';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [secretCode, setSecretCode] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'termux_stream' | 'diagnostics' | 'servers' | 'accounts'>('dashboard');

  // Accounts state & unlink confirmation
  const [accounts, setAccounts] = useState<BedrockAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [sessionStartTimes, setSessionStartTimes] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = localStorage.getItem('pebbleafk_current_user') || 'guest';
        const saved = localStorage.getItem(`pebbleafk_sessions_${u}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [copiedIgnId, setCopiedIgnId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<BedrockAccount | null>(null);
  const microsoftSignInWindowRef = useRef<Window | null>(null);
  const pendingMicrosoftSignInUrlRef = useRef<string | null>(null);
  const microsoftSignOutReadyRef = useRef(false);
  const microsoftSignOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [smartAdjustNotices, setSmartAdjustNotices] = useState<Array<{ id: string; username: string; message: string }>>([]);
  const smartAdjustNoticeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const adjustingAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const notice of smartAdjustNotices) {
      const username = notice.username.replace(/^@/, '').trim().toLowerCase();
      for (const account of accounts) {
        const names = [account.username, account.ign].filter(Boolean).map((name) => name!.replace(/^@/, '').trim().toLowerCase());
        if (names.includes(username)) ids.add(account.id);
      }
    }
    return ids;
  }, [smartAdjustNotices, accounts]);
  const seenSmartAdjustEventsRef = useRef<Set<string>>(new Set());
  const seededSmartAdjustBotsRef = useRef<Set<string>>(new Set());

  // Live 1-second ticker for precise uptime formatting
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Servers state & active views (Matching PocketAFK)
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'connect' | 'chat' | 'settings'>('connect');
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  const [isDangerousSettingsOpen, setIsDangerousSettingsOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedLogsAccount, setSelectedLogsAccount] = useState<BedrockAccount | null>(null);
  const [isAccountLogsOpen, setIsAccountLogsOpen] = useState(false);
  const [isTermuxConsoleOpen, setIsTermuxConsoleOpen] = useState(false);
  const [pinnedAccountIds, setPinnedAccountIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = localStorage.getItem('pebbleafk_current_user') || 'guest';
        const saved = localStorage.getItem(`pebbleafk_pinned_${u}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [accountLogsMap, setAccountLogsMap] = useState<Record<string, PlayerLogEntry[]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = localStorage.getItem('pebbleafk_current_user') || 'guest';
        const saved = localStorage.getItem(`pebbleafk_player_logs_${u}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });
  const [chatInput, setChatInput] = useState('');
  const [selectedChatAccountId, setSelectedChatAccountId] = useState<string>('');
  const [chatSourceTooltipId, setChatSourceTooltipId] = useState<string | null>(null);
  const [chatAutoScroll, setChatAutoScroll] = useState(true);
  const [isChatAccountDropdownOpen, setIsChatAccountDropdownOpen] = useState(false);
  const [stablePayUsernameDraft, setStablePayUsernameDraft] = useState('');
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleTogglePin = (accId: string) => {
    setPinnedAccountIds((prev) => {
      const next = prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId];
      if (typeof window !== 'undefined') {
        const u = currentUser || 'guest';
        localStorage.setItem(`pebbleafk_pinned_${u}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Player Audit & Connection Logs Handlers
  const addPlayerLog = useCallback(
    (
      accountName: string,
      serverHost: string,
      type: PlayerLogType,
      message: string,
      details?: string,
      status: 'info' | 'success' | 'warning' | 'error' = 'info'
    ) => {
      if (!accountName) return;
      const cleanName = accountName.replace(/^@/, '').trim();
      const newEntry: PlayerLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        accountName: cleanName,
        serverHost: serverHost || 'Configured Server',
        timestamp: Date.now(),
        type,
        message,
        details,
        status,
      };

      setAccountLogsMap((prev) => {
        const currentList = prev[cleanName] || [];
        if (
          currentList.length > 0 &&
          Date.now() - currentList[0].timestamp < 3000 &&
          (currentList[0].message === message ||
            (type === 'disconnected' && currentList[0].type === 'disconnected'))
        ) {
          return prev;
        }
        const updatedList = [newEntry, ...currentList].slice(0, 150);
        const updatedMap = { ...prev, [cleanName]: updatedList };

        if (typeof window !== 'undefined') {
          const u = currentUser || 'guest';
          try {
            localStorage.setItem(`pebbleafk_player_logs_${u}`, JSON.stringify(updatedMap));
          } catch (e) {}
        }

        if (currentUser) {
          saveAccountLogsToSupabase(currentUser, cleanName, updatedList).catch(() => {});
        }

        return updatedMap;
      });
    },
    [currentUser]
  );

  const handleOpenAccountLogs = async (acc: BedrockAccount) => {
    setSelectedLogsAccount(acc);
    setIsAccountLogsOpen(true);
    const cleanName = (acc.ign || acc.expectedIgn || acc.username || '').replace(/^@/, '').trim();
    if (currentUser && cleanName) {
      try {
        const remoteLogs = await loadAccountLogsFromSupabase(currentUser, cleanName);
        if (remoteLogs && remoteLogs.length > 0) {
          setAccountLogsMap((prev) => {
            const current = prev[cleanName] || [];
            const map = new Map<string, PlayerLogEntry>();
            [...current, ...remoteLogs].forEach((l) => map.set(l.id, l));
            const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 150);
            return { ...prev, [cleanName]: merged };
          });
        }
      } catch (_) {}
    }
  };

  const handleClearAccountLogs = () => {
    if (!selectedLogsAccount) return;
    const cleanName = (selectedLogsAccount.ign || selectedLogsAccount.expectedIgn || selectedLogsAccount.username || '').replace(/^@/, '').trim();
    setAccountLogsMap((prev) => {
      const updated = { ...prev, [cleanName]: [] };
      if (typeof window !== 'undefined') {
        const u = currentUser || 'guest';
        localStorage.setItem(`pebbleafk_player_logs_${u}`, JSON.stringify(updated));
      }
      return updated;
    });
    if (currentUser) {
      saveAccountLogsToSupabase(currentUser, cleanName, []).catch(() => {});
    }
    showToast(`Logs cleared for @${cleanName}`, 'info');
  };

  const getStatusBadge = (state: BotLifecycleState) => {
    switch (state) {
      case 'SPAWNED':
      case 'LOGGED_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs group-hover:bg-emerald-200 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        );
      case 'CONNECTING':
      case 'RECONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs group-hover:bg-amber-200 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Connecting...
          </span>
        );
      case 'KICKED':
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs group-hover:bg-rose-200 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            {state === 'KICKED' ? 'Kicked' : 'Error'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300/80 shadow-2xs group-hover:bg-slate-200 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Offline
          </span>
        );
    }
  };

  const getFreshSmpStatusBadge = (stable: boolean, phase?: string) => {
    const label = stable ? 'STABLE' : phase === 'lobby' ? 'IN LOBBY' : 'UNSTABLE';
    const stableClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs group-hover:bg-emerald-200';
    const lobbyClass = 'bg-slate-100 text-slate-600 border-slate-300/80 shadow-2xs group-hover:bg-slate-200';
    const unstableClass = 'bg-rose-100 text-rose-700 border-rose-200 shadow-2xs group-hover:bg-rose-200';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition ${stable ? stableClass : phase === 'lobby' ? lobbyClass : unstableClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${stable ? 'bg-emerald-500' : phase === 'lobby' ? 'bg-slate-400' : 'bg-rose-500'}`} />
        {label}
      </span>
    );
  };

  // Daemon Account Verification Callback
  const handleAccountVerified = useCallback(
    (payload: { botId: string; email: string; ign: string; uuid?: string; avatarUrl?: string }) => {
      setMsAuthError(null);
      const verifiedIgn = payload.ign.trim();

      if (!verifiedIgn || verifiedIgn.startsWith('bedrock_user_')) {
        showToast('Verification failed: Could not retrieve real Xbox Gamertag.', 'error');
        return;
      }

      setAccounts((prev) => {
        // Remove any old placeholder account with bedrock_user_
        const filtered = prev.filter((a) => !a.ign?.startsWith('bedrock_user_') && !a.username?.startsWith('bedrock_user_'));
        const existingIndex = filtered.findIndex(
          (a) => a.id === payload.botId || a.ign?.toLowerCase() === verifiedIgn.toLowerCase()
        );
        let updated: BedrockAccount[];
        if (existingIndex >= 0) {
          updated = [...filtered];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ign: verifiedIgn,
            username: payload.email,
            uuid: payload.uuid,
            avatarUrl: payload.avatarUrl,
            verified: true,
            authError: undefined,
          };
        } else {
          updated = [
            ...filtered,
            {
              id: payload.botId || `acc_${Date.now()}`,
              username: payload.email,
              ign: verifiedIgn,
              auth_type: 'microsoft',
              uuid: payload.uuid,
              avatarUrl: payload.avatarUrl,
              verified: true,
              addedAt: Date.now(),
            },
          ];
        }

        if (currentUser) {
          syncAllToSupabase(currentUser, updated);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`pebbleafk_accounts_${currentUser.toLowerCase()}`, JSON.stringify(updated));
          }
        }
        return updated;
      });

      showToast(`Verified Bedrock account: @${verifiedIgn}`, 'success');
    },
    [currentUser, showToast]
  );

  const {
    status: daemonStatus,
    daemonUrl,
    setDaemonUrl,
    authToken,
    setAuthToken,
    latency,
    botStates,
    botReasons,
    telemetries,
    bossBarsByBot,
    messagesByBot,
    activityLogs,
    freshSmpDiagnostics,
    deviceSessions,
    disconnectDeviceSession,
    reconnect,
    reconnectNow,
    restartDaemon,
    updateDaemon,
    shutdownDaemon,
    verifyAccount,
    msAuthData,
    setMsAuthData,
    msAuthError,
    setMsAuthError,
    sendChat,
    terminalLogs,
    terminalHistoryError,
    daemonStartedAt,
    lastDaemonDisconnectedAt,
    fetchTerminalLogs,
    fetchTerminalHistory,
    clearTerminalLogs,
    startBot,
    updateBotSettings,
    stopBot,
  } = useDaemonSocket(currentUser, handleAccountVerified);

  useEffect(() => {
    const diagnostics = Object.values(freshSmpDiagnostics);
    if (diagnostics.length === 0) return;

    diagnostics.forEach((diagnostic) => {
      const botKey = diagnostic.botId.toLowerCase();
      // Each bot's first snapshot is historical sync data, not a new action.
      if (!seededSmartAdjustBotsRef.current.has(botKey)) {
        diagnostic.events.forEach((event) => seenSmartAdjustEventsRef.current.add(`${botKey}:${event.id}`));
        seededSmartAdjustBotsRef.current.add(botKey);
        return;
      }

      diagnostic.events.forEach((event) => {
        const eventKey = `${botKey}:${event.id}`;
        if (seenSmartAdjustEventsRef.current.has(eventKey)) return;
        seenSmartAdjustEventsRef.current.add(eventKey);

        const message = event.message || '';
        const normalized = message.toLowerCase();
        const isSmartAdjustment =
          normalized.includes('recovery cycle') ||
          normalized.includes('scheduling a cautious /lifesteal retry') ||
          normalized.includes('retrying /lifesteal in');
        if (!isSmartAdjustment) return;

        const noticeId = `${eventKey}:${event.timestamp}`;
        setSmartAdjustNotices((previous) => [...previous.filter((notice) => notice.id !== noticeId), {
          id: noticeId,
          username: diagnostic.username,
          message,
        }].slice(-3));
        const timer = setTimeout(() => {
          setSmartAdjustNotices((previous) => previous.filter((notice) => notice.id !== noticeId));
          smartAdjustNoticeTimersRef.current.delete(noticeId);
        }, 8_000);
        smartAdjustNoticeTimersRef.current.set(noticeId, timer);
      });
    });
  }, [freshSmpDiagnostics]);

  useEffect(() => () => {
    smartAdjustNoticeTimersRef.current.forEach((timer) => clearTimeout(timer));
    smartAdjustNoticeTimersRef.current.clear();
  }, []);

  // Load saved session, secretCode, and Supabase accounts
  useEffect(() => {
    try {
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

          // Instant load from localStorage cache
          const cachedAccs = localStorage.getItem(`pebbleafk_accounts_${savedUser.toLowerCase()}`);
          if (cachedAccs) {
            try {
              const parsed = JSON.parse(cachedAccs);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setAccounts(parsed);
              }
            } catch (_) {}
          }

          const cachedSrvs = localStorage.getItem(`pebbleafk_servers_${savedUser.toLowerCase()}`);
          if (cachedSrvs) {
            try {
              const parsed = JSON.parse(cachedSrvs);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setServers(parsed);
                setActiveServerId((prev) => prev || parsed[0].id);
              }
            } catch (_) {}
          }

          // Load accounts from Supabase (filter out any old dummy names)
          loadAccountsFromSupabase(savedUser).then((accs) => {
            if (accs && accs.length > 0) {
              const cleanAccs = accs.filter((a) => !a.ign?.startsWith('bedrock_user_') && !a.username?.startsWith('bedrock_user_'));
              setAccounts(cleanAccs);
              localStorage.setItem(`pebbleafk_accounts_${savedUser.toLowerCase()}`, JSON.stringify(cleanAccs));
            }
          });

          // Load server profiles from Supabase
          loadServersFromSupabase(savedUser).then((srvs) => {
            if (srvs && srvs.length > 0) {
              setServers(srvs);
              setActiveServerId((prev) => prev || srvs[0].id);
              localStorage.setItem(`pebbleafk_servers_${savedUser.toLowerCase()}`, JSON.stringify(srvs));
            }
          });
        }
      }
    } catch (error) {
      console.warn('Could not restore the saved PebbleAFK session.', error);
    } finally {
      setSessionRestored(true);
    }
  }, []);

  const handleAuthSuccess = (username: string, receivedSecret?: string) => {
    // Reset state from previous user
    clearTerminalLogs();
    setAccounts([]);
    setServers([]);
    setSessionStartTimes({});
    setActiveServerId(null);
    setSelectedAccountIds([]);
    setSelectedLogsAccount(null);
    setAccountLogsMap({});

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
      const cleanAccs = (accs || []).filter((a) => !a.ign?.startsWith('bedrock_user_') && !a.username?.startsWith('bedrock_user_'));
      setAccounts(cleanAccs);
    });

    // Load servers for new user
    loadServersFromSupabase(username).then((srvs) => {
      if (srvs && srvs.length > 0) {
        setServers(srvs);
        setActiveServerId(srvs[0].id);
      }
    });
  };

  const handleLogout = () => {
    clearTerminalLogs();
    setCurrentUser(null);
    setSecretCode('');
    setAccounts([]);
    setServers([]);
    setSessionStartTimes({});
    setActiveServerId(null);
    setSelectedAccountIds([]);
    setSelectedLogsAccount(null);
    setAccountLogsMap({});
    setActiveTab('dashboard');
    setIsMobileSidebarOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pebbleafk_current_user');
    }
  };

  // Continuous background cross-device sync for accounts and server profiles
  const isSyncingRef = useRef(false);
  const syncRemoteState = useCallback(async (userToSync?: string) => {
    const user = (userToSync || currentUser || '').trim();
    if (!user || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      // 1. Sync accounts from Supabase
      const remoteAccs = await loadAccountsFromSupabase(user);
      if (Array.isArray(remoteAccs)) {
        const cleanAccs = remoteAccs.filter((a) => !a.ign?.startsWith('bedrock_user_') && !a.username?.startsWith('bedrock_user_'));
        setAccounts((prev) => {
          const prevKey = JSON.stringify(prev);
          const newKey = JSON.stringify(cleanAccs);
          if (prevKey !== newKey) {
            if (typeof window !== 'undefined') {
              localStorage.setItem(`pebbleafk_accounts_${user.toLowerCase()}`, JSON.stringify(cleanAccs));
            }
            return cleanAccs;
          }
          return prev;
        });
      }

      // 2. Sync server profiles from Supabase
      const remoteServers = await loadServersFromSupabase(user);
      if (Array.isArray(remoteServers) && remoteServers.length > 0) {
        setServers((prev) => {
          const prevKey = JSON.stringify(prev);
          const newKey = JSON.stringify(remoteServers);
          if (prevKey !== newKey) {
            if (typeof window !== 'undefined') {
              localStorage.setItem(`pebbleafk_servers_${user.toLowerCase()}`, JSON.stringify(remoteServers));
            }
            return remoteServers;
          }
          return prev;
        });
        setActiveServerId((prev) => prev || remoteServers[0].id);
      }
    } catch (_) {
    } finally {
      isSyncingRef.current = false;
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    syncRemoteState(currentUser);

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        syncRemoteState(currentUser);
      }
    }, 3000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncRemoteState(currentUser);
      }
    };
    const onFocus = () => {
      syncRemoteState(currentUser);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser, syncRemoteState]);

  // 1-Click Termux Command with exact secretCode
  const termux1ClickCmd = currentUser
    ? `curl -sL https://pebbleafk.vercel.app/install | bash -s -- ${currentUser}${secretCode ? ` ${secretCode}` : ''}`
    : 'curl -sL https://pebbleafk.vercel.app/install | bash';

  // Track socket values via refs to avoid re-triggering tunnel sync effect
  const daemonStatusRef = useRef(daemonStatus);
  daemonStatusRef.current = daemonStatus;
  const daemonUrlRef = useRef(daemonUrl);
  daemonUrlRef.current = daemonUrl;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const tunnelRegistrationRef = useRef({ username: '', updatedAt: 0 });

  // Auto-sync tunnel from Termux via /api/tunnel (Zero-delay fast polling & instant tab wakeup)
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    let tunnelCheckInFlight = false;

    const checkTunnel = async () => {
      if (tunnelCheckInFlight) return;
      tunnelCheckInFlight = true;
      try {
        const res = await fetch(`/api/tunnel?username=${encodeURIComponent(currentUser)}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          const targetUrl = (data?.url || data?.tunnel_url || '').trim();
          const targetToken = (data?.token || secretCode || authTokenRef.current || '').trim();
          if (targetUrl && targetUrl.startsWith('wss://')) {
            const cleanTarget = targetUrl.replace(/\/+$/, '');
            const cleanCurrent = (daemonUrlRef.current || '').trim().replace(/\/+$/, '');
            const username = currentUser.trim().toLowerCase();
            if (tunnelRegistrationRef.current.username !== username) {
              const storedUpdatedAt = typeof window !== 'undefined'
                ? Number(localStorage.getItem(`pebbleafk_tunnel_updated_at_${username}`) || 0)
                : 0;
              tunnelRegistrationRef.current = { username, updatedAt: storedUpdatedAt };
            }

            const updatedAt = Number(data?.updatedAt);
            const lastAcceptedAt = tunnelRegistrationRef.current.updatedAt;
            const isNewerTermuxRegistration = Number.isFinite(updatedAt) && updatedAt > lastAcceptedAt;
            const isSameRegistration = updatedAt === lastAcceptedAt && cleanTarget === cleanCurrent;
            const isDisconnected = daemonStatusRef.current === 'DISCONNECTED' || daemonStatusRef.current === 'AUTH_ERROR';

            // Accept registration if:
            // 1. Termux published a newer timestamp, OR
            // 2. We are currently DISCONNECTED and this tunnel is reported live with a valid URL, OR
            // 3. It's the active registration
            if (isNewerTermuxRegistration || (isDisconnected && data?.isLive && cleanTarget) || isSameRegistration) {
              if (isNewerTermuxRegistration || isDisconnected) {
                tunnelRegistrationRef.current = { username, updatedAt: updatedAt || Date.now() };
                if (typeof window !== 'undefined') {
                  localStorage.setItem(`pebbleafk_tunnel_updated_at_${username}`, String(updatedAt || Date.now()));
                }
              }
              if (cleanTarget !== cleanCurrent) {
                setDaemonUrl(cleanTarget);
                reconnect(true);
              } else if (isDisconnected) {
                // Target URL is already saved and socket is disconnected; allow gentle reconnect without killing connecting handshake
                reconnect(false);
              }
              if (targetToken) setAuthToken(targetToken);
            }
          }
        }
      } catch (_) {
        // Keep tunnel discovery running through transient network/API errors.
      } finally {
        tunnelCheckInFlight = false;
      }
    };

    checkTunnel();

    // Discover a freshly launched Termux tunnel quickly, without overlapping
    // slow API requests while the dashboard is waiting to authenticate.
    const pollInterval = (daemonStatus === 'AUTHENTICATED' && !isSettingsOpen) ? 8000 : 750;
    const interval = setInterval(checkTunnel, pollInterval);

    // Instant trigger when user switches back from Termux to the browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTunnel();
      }
    };
    const handleFocus = () => {
      checkTunnel();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser, daemonStatus, isSettingsOpen, secretCode, setDaemonUrl, setAuthToken, reconnect]);

  // Load this PebbleAFK user's retained daemon history when opening the stream.
  useEffect(() => {
    if (activeTab === 'termux_stream' && daemonStatus === 'AUTHENTICATED') {
      void fetchTerminalHistory();
      fetchTerminalLogs();
    }
  }, [activeTab, daemonStatus, fetchTerminalHistory, fetchTerminalLogs]);

  // Microsoft OAuth Device Code Sign-In (Exact same flow as PocketAFK)
  const handleStartMicrosoftLogin = (target?: BedrockAccount | string) => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    if (accounts.filter((a) => a.verified).length >= MAX_BEDROCK_ACCOUNTS && !target) {
      showToast(`Maximum account limit (${MAX_BEDROCK_ACCOUNTS} accounts) reached.`, 'error');
      return;
    }

    if (daemonStatus !== 'AUTHENTICATED') {
      showToast('Termux daemon is offline! Click the circular daemon icon in the top right to start it.', 'error');
      setIsSettingsOpen(true);
      return;
    }

    setMsAuthError(null);
    const targetId = typeof target === 'object' && target ? target.id : `acc_${Math.random().toString(36).substring(2, 9)}`;
    const targetEmail = typeof target === 'string' ? target : (target?.username || '');
    const targetAuthCacheKey = typeof target === 'object' && target?.uuid
      ? `xuid_${target.uuid}`
      : undefined;

    const shouldSignOutFirst = !target;

    // Only new-account creation signs out first. Open the tab synchronously in the
    // click gesture so popup blockers allow the Microsoft logout/sign-in sequence.
    if (shouldSignOutFirst) {
      try {
        microsoftSignInWindowRef.current?.close();
        if (microsoftSignOutTimerRef.current) clearTimeout(microsoftSignOutTimerRef.current);
        pendingMicrosoftSignInUrlRef.current = null;
        microsoftSignOutReadyRef.current = false;
        const authWindow = window.open('about:blank', '_blank');
        microsoftSignInWindowRef.current = authWindow;
        if (authWindow) {
          authWindow.document.title = 'Signing out of Microsoft';
          authWindow.document.body.innerHTML = '<main style="font:16px system-ui;padding:2rem;color:#334155"><h2>Signing out of Microsoft…</h2><p>This signs out Microsoft web pages in this browser before the new account sign-in opens.</p></main>';
          authWindow.location.href = 'https://login.live.com/logout.srf';
          microsoftSignOutTimerRef.current = setTimeout(() => {
            microsoftSignOutReadyRef.current = true;
            const signInUrl = pendingMicrosoftSignInUrlRef.current;
            if (signInUrl && !authWindow.closed) {
              authWindow.location.href = signInUrl;
              authWindow.focus();
              pendingMicrosoftSignInUrlRef.current = null;
            }
          }, 3000);
        }
      } catch {
        microsoftSignInWindowRef.current = null;
      }
    }

    showToast(
      !shouldSignOutFirst || microsoftSignInWindowRef.current
        ? 'Requesting Microsoft sign-in via Termux daemon...'
        : 'Microsoft sign-out tab was blocked. Use Sign Out of Microsoft, then Open Microsoft Sign-In in the verification dialog.',
      'info'
    );
    verifyAccount(targetId, targetEmail, targetAuthCacheKey);
  };

  useEffect(() => {
    const signInWindow = microsoftSignInWindowRef.current;
    if (msAuthData?.url && signInWindow && !signInWindow.closed) {
      pendingMicrosoftSignInUrlRef.current = msAuthData.url;
      if (microsoftSignOutReadyRef.current) {
        signInWindow.location.href = msAuthData.url;
        signInWindow.focus();
        pendingMicrosoftSignInUrlRef.current = null;
      }
    } else if (!msAuthData && signInWindow && !signInWindow.closed) {
      // The user cancelled or verification completed; don't leave the auth tab open.
      signInWindow.close();
      microsoftSignInWindowRef.current = null;
      pendingMicrosoftSignInUrlRef.current = null;
      if (microsoftSignOutTimerRef.current) {
        clearTimeout(microsoftSignOutTimerRef.current);
        microsoftSignOutTimerRef.current = null;
      }
    }
  }, [msAuthData]);

  // Delete / Unlink Account
  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (acc && currentUser) {
      const ign = acc.ign || acc.username;
      await deleteAccountFromSupabase(currentUser, ign);
    }
    setAccounts((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      if (currentUser && typeof window !== 'undefined') {
        localStorage.setItem(`pebbleafk_accounts_${currentUser.toLowerCase()}`, JSON.stringify(updated));
      }
      return updated;
    });
    showToast('Bedrock account unlinked.', 'info');
  };

  // Active selected server profile
  const activeServer = servers.find((s) => s.id === activeServerId) || servers[0] || null;
  const activeServerIsFreshSmp = Boolean(activeServer && /freshsmp/i.test(`${activeServer.name} ${activeServer.serverHost}`));
  const subserverJoinCommandEnabled = activeServer?.settings?.subserverJoinCommandEnabled ?? activeServerIsFreshSmp;
  const subserverJoinCommand = activeServer?.settings?.subserverJoinCommand ?? (activeServerIsFreshSmp ? FRESHSMP_DEFAULT_BOT_SETTINGS.subserverJoinCommand : DEFAULT_BOT_SETTINGS.subserverJoinCommand);
  const subserverJoinCommandDelay = activeServer?.settings?.subserverJoinCommandDelay ?? (activeServerIsFreshSmp ? FRESHSMP_DEFAULT_BOT_SETTINGS.subserverJoinCommandDelay : DEFAULT_BOT_SETTINGS.subserverJoinCommandDelay);
  const stableRewardEnabled = activeServer?.settings?.stableRewardEnabled ?? activeServerIsFreshSmp;
  const stablePayEnabled = activeServer?.settings?.stablePayEnabled ?? false;

  useEffect(() => {
    setStablePayUsernameDraft(activeServer?.settings?.stablePayUsername || '');
  }, [activeServer?.id, activeServer?.settings?.stablePayUsername]);

  const [gatewayStatus, setGatewayStatus] = useState<{ online: boolean; checking: boolean; version?: string } | null>(null);

  useEffect(() => {
    if (!activeServer?.serverHost) {
      setGatewayStatus(null);
      return;
    }
    setGatewayStatus({ online: true, checking: true });
    const cleanH = activeServer.serverHost.trim();
    const cleanP = activeServer.serverPort || 19132;
    fetch(`/api/check-bedrock?host=${encodeURIComponent(cleanH)}&port=${encodeURIComponent(cleanP)}`)
      .then((r) => r.json())
      .then((d) => {
        setGatewayStatus({ online: Boolean(d.online), checking: false, version: d.version });
      })
      .catch(() => {
        setGatewayStatus({ online: true, checking: false });
      });
  }, [activeServer?.id, activeServer?.serverHost, activeServer?.serverPort]);

  // Save server profile to state & Supabase
  const handleSaveServer = async (profile: ServerProfile) => {
    const existingProfile = servers.find((server) => server.id === profile.id);
    const normalizedHost = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');
    const supportedHosts = new Set(['play.freshsmp.fun', 'bedrock.donutsmp.net']);
    if (!existingProfile && !supportedHosts.has(normalizedHost(profile.serverHost))) {
      throw new Error('Only FreshSMP and DonutSMP profiles can be created right now.');
    }
    const duplicate = servers.find((server) => server.id !== profile.id && (
      normalizedHost(server.serverHost) === normalizedHost(profile.serverHost) ||
      (server.name || '').trim().toLowerCase() === profile.name.trim().toLowerCase()
    ));
    if (duplicate) {
      throw new Error(`${profile.name} already has a server profile on this account.`);
    }

    setServers((prev) => {
      const idx = prev.findIndex((s) => s.id === profile.id);
      let updated: ServerProfile[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = profile;
      } else {
        updated = [...prev, profile];
      }
      if (currentUser) {
        saveServersToSupabase(currentUser, updated);
        localStorage.setItem(`pebbleafk_servers_${currentUser.toLowerCase()}`, JSON.stringify(updated));
      }
      return updated;
    });
    if (!activeServerId) {
      setActiveServerId(profile.id);
    }
    showToast(`Server profile "${profile.name}" saved.`, 'success');
  };

  // Delete server profile from state & Supabase
  const handleDeleteServer = async (serverId: string) => {
    const srv = servers.find((s) => s.id === serverId);
    const updated = servers.filter((s) => s.id !== serverId);
    setServers(updated);
    if (currentUser) {
      await saveServersToSupabase(currentUser, updated);
      localStorage.setItem(`pebbleafk_servers_${currentUser.toLowerCase()}`, JSON.stringify(updated));
    }
    if (activeServerId === serverId) {
      setActiveServerId(updated[0]?.id || null);
    }
    setIsDangerousSettingsOpen(false);
    showToast(`Server profile "${srv?.name || ''}" deleted.`, 'info');
  };

  // Update field on active server profile
  const handleUpdateActiveServer = (partial: Partial<ServerProfile>) => {
    if (!activeServer) return;
    const updated: ServerProfile = { ...activeServer, ...partial };
    handleSaveServer(updated);
  };

  // Update server settings together so paired fields (for example payee + enabled)
  // are saved and sent to connected bots as one coherent configuration.
  const handleUpdateServerSettings = (partialSettings: Partial<BotSettings>) => {
    if (!activeServer) return;
    const isFreshSmp = /freshsmp/i.test(activeServer.name) || /(?:^|\.)freshsmp\.fun$/i.test(activeServer.serverHost);
    const updatedSettings: BotSettings = {
      ...(isFreshSmp ? FRESHSMP_DEFAULT_BOT_SETTINGS : DEFAULT_BOT_SETTINGS),
      ...(activeServer.settings || {}),
      ...partialSettings,
    };
    handleUpdateActiveServer({ settings: updatedSettings });
    const accountIds = Array.isArray(activeServer.assignedAccountIds)
      ? activeServer.assignedAccountIds
      : (activeServer.accountId ? [activeServer.accountId] : []);
    accountIds.forEach((accountId) => {
      updateBotSettings(`${activeServer.id}__${accountId}`, updatedSettings);
    });
  };

  const handleUpdateServerSetting = (key: keyof BotSettings, value: any) => {
    handleUpdateServerSettings({ [key]: value });
  };

  // Accounts assigned to current Server Profile (strictly filtered to existing accounts, plus active bots reported by daemon)
  const profileAccountIds = useMemo(() => {
    if (!activeServer) return [];
    const validAccountIds = new Set(accounts.map((a) => a.id));
    const result = new Set<string>();
    if (Array.isArray(activeServer.assignedAccountIds)) {
      activeServer.assignedAccountIds.forEach((id) => {
        if (validAccountIds.has(id)) result.add(id);
      });
    }
    if (activeServer.accountId && validAccountIds.has(activeServer.accountId)) {
      result.add(activeServer.accountId);
    }
    // Also include any account actively reporting SPAWNED, LOGGED_IN, or CONNECTING for this server
    if (daemonStatus === 'AUTHENTICATED') {
      accounts.forEach((acc) => {
        const st = botStates[`${activeServer.id}__${acc.id}`] || botStates[acc.id];
        if (st === 'SPAWNED' || st === 'LOGGED_IN' || st === 'CONNECTING') {
          result.add(acc.id);
        }
      });
    }
    return Array.from(result);
  }, [activeServer, accounts, daemonStatus, botStates]);

  const assignedAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (!profileAccountIds.includes(a.id)) return false;
      const q = accountFilter.toLowerCase().trim();
      if (!q) return true;
      const ign = (a.ign || a.username).toLowerCase();
      return ign.includes(q);
    });
  }, [accounts, profileAccountIds, accountFilter]);

  useEffect(() => {
    const chatAccounts = assignedAccounts.length > 0 ? assignedAccounts : accounts;
    if (chatAccounts.length === 0) {
      if (selectedChatAccountId) setSelectedChatAccountId('');
      return;
    }
    if (selectedChatAccountId === '__ALL__') return;
    if (!chatAccounts.some((account) => account.id === selectedChatAccountId)) {
      setSelectedChatAccountId(chatAccounts[0].id);
    }
  }, [assignedAccounts, accounts, selectedChatAccountId]);

  const availableAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (profileAccountIds.includes(a.id)) return false;
      const q = accountFilter.toLowerCase().trim();
      if (!q) return true;
      const ign = (a.ign || a.username).toLowerCase();
      return ign.includes(q);
    });
  }, [accounts, profileAccountIds, accountFilter]);

  // Reset selection when changing active server
  useEffect(() => {
    setSelectedAccountIds([]);
  }, [activeServerId]);


  // Human readable uptime formatting
  const formatUptime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    if (m > 0) {
      return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    return `${s}s`;
  };

  // Sync session start times when bot state changes
  useEffect(() => {
    if (daemonStatus !== 'AUTHENTICATED') return;
    setSessionStartTimes((prev) => {
      const next = { ...prev };
      let changed = false;
      const now = Date.now();
      Object.entries(botStates).forEach(([botId, st]) => {
        if (st === 'SPAWNED' || st === 'LOGGED_IN') {
          if (!next[botId]) {
            next[botId] = now;
            changed = true;
          }
        } else if (st === 'DISCONNECTED' || st === 'ERROR' || st === 'KICKED') {
          if (next[botId]) {
            delete next[botId];
            changed = true;
          }
        }
      });
      if (changed) {
        if (typeof window !== 'undefined') {
          const u = currentUser || 'guest';
          localStorage.setItem(`pebbleafk_sessions_${u}`, JSON.stringify(next));
        }
        return next;
      }
      return prev;
    });
  }, [botStates, daemonStatus, currentUser]);

  // Add / Remove account to/from active server profile (NEVER deletes from global accounts list)
  const handleRemoveAccountFromProfile = (accId: string) => {
    if (!activeServer) return;
    const targetAcc = accounts.find((a) => a.id === accId);
    const botId = `${activeServer.id}__${accId}`;
    stopBot(botId);
    setSessionStartTimes((prev) => {
      const next = { ...prev };
      delete next[botId];
      return next;
    });
    const updatedIds = profileAccountIds.filter((id) => id !== accId);
    const updatedServer: ServerProfile = {
      ...activeServer,
      assignedAccountIds: updatedIds,
      accountId: activeServer.accountId === accId ? (updatedIds[0] || '') : activeServer.accountId,
    };
    handleSaveServer(updatedServer);
    setSelectedAccountIds((prev) => prev.filter((id) => id !== accId));
    showToast(`Removed @${targetAcc?.ign || targetAcc?.username || 'account'} from ${activeServer.name}`, 'info');
  };

  const handleAddAccountToProfile = (accId: string) => {
    if (!activeServer) return;
    const targetAcc = accounts.find((a) => a.id === accId);
    const updatedIds = Array.from(new Set([...profileAccountIds, accId]));
    const updatedServer: ServerProfile = {
      ...activeServer,
      assignedAccountIds: updatedIds,
      accountId: activeServer.accountId || accId,
    };
    handleSaveServer(updatedServer);
    showToast(`Added @${targetAcc?.ign || targetAcc?.username || 'account'} to ${activeServer.name}`, 'success');
  };

  const isActiveServerRunning = daemonStatus === 'AUTHENTICATED' && assignedAccounts.some((acc) => {
    const botId = `${activeServer?.id}__${acc.id}`;
    const st = botStates[botId];
    return st === 'SPAWNED' || st === 'LOGGED_IN' || st === 'CONNECTING';
  });
  const connectedAccountCount = daemonStatus === 'AUTHENTICATED' ? accounts.filter((acc) => profileAccountIds.includes(acc.id)).filter((acc) => {
    const botId = `${activeServer?.id}__${acc.id}`;
    const st = botStates[botId] || botStates[acc.id];
    return st === 'SPAWNED' || st === 'LOGGED_IN';
  }).length : 0;

  // Connect / Disconnect individual account to server
  const handleConnectAccount = (acc: BedrockAccount, srv: ServerProfile) => {
    if (daemonStatus !== 'AUTHENTICATED') {
      showToast('Termux daemon is offline! Click the daemon circle in the top right to start it.', 'error');
      setIsSettingsOpen(true);
      return;
    }
    const botId = `${srv.id}__${acc.id}`;
    const now = Date.now();
    setSessionStartTimes((prev) => {
      const next = { ...prev, [botId]: now };
      if (typeof window !== 'undefined') {
        const u = currentUser || 'guest';
        localStorage.setItem(`pebbleafk_sessions_${u}`, JSON.stringify(next));
      }
      return next;
    });
    const ign = acc.ign || acc.username;
    addPlayerLog(
      ign,
      srv.serverHost,
      'connecting',
      `Manual connection initiated: @${ign} -> ${srv.serverHost}:${srv.serverPort || 19132}`,
      `Protocol: ${srv.serverVersion || 'auto'}`,
      'info'
    );
    const isFreshSmp = /freshsmp/i.test(srv.serverHost) || /freshsmp/i.test(srv.name);
    const effectiveSettings: BotSettings = {
      ...(isFreshSmp ? FRESHSMP_DEFAULT_BOT_SETTINGS : DEFAULT_BOT_SETTINGS),
      ...(srv.settings || {}),
    };
    if (isFreshSmp) {
      effectiveSettings.joinCommandEnabled = true;
      if (!effectiveSettings.joinCommand) effectiveSettings.joinCommand = '/lifesteal';
      if (!effectiveSettings.joinCommandDelay || effectiveSettings.joinCommandDelay < 8) {
        effectiveSettings.joinCommandDelay = 10;
      }
    }
    const botConfig = {
      id: botId,
      username: acc.ign || acc.username,
      authCacheKey: acc.uuid ? `xuid_${acc.uuid}` : undefined,
      host: srv.serverHost,
      port: srv.serverPort || 19132,
      version: srv.serverVersion || 'auto',
      authType: 'microsoft',
      autoReconnect: srv.autoReconnect,
      settings: effectiveSettings,
    };
    startBot(botConfig);
  };

  const handleDisconnectAccount = (acc: BedrockAccount, srv: ServerProfile) => {
    const botId = `${srv.id}__${acc.id}`;
    stopBot(botId);
    setSessionStartTimes((prev) => {
      const next = { ...prev };
      delete next[botId];
      if (typeof window !== 'undefined') {
        const u = currentUser || 'guest';
        localStorage.setItem(`pebbleafk_sessions_${u}`, JSON.stringify(next));
      }
      return next;
    });
    const ign = acc.ign || acc.username;
    addPlayerLog(
      ign,
      srv.serverHost,
      'disconnected',
      `Bot session disconnected by user.`,
      undefined,
      'warning'
    );
  };

  // Automatic live bot lifecycle logging
  const prevBotStatesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (daemonStatus !== 'AUTHENTICATED') return;
    Object.entries(botStates).forEach(([botKey, st]) => {
      const prevSt = prevBotStatesRef.current[botKey];
      if (prevSt === st) return;

      const parts = botKey.split('__');
      if (parts.length === 2) {
        const [sId, aId] = parts;
        const srv = servers.find((s) => s.id === sId);
        const acc = accounts.find((a) => a.id === aId || a.ign === aId);
        if (srv && acc) {
          const ign = acc.ign || acc.username;
          if (st === 'SPAWNED' || st === 'LOGGED_IN') {
            if (currentUser) {
              updateAccountConnectionState(currentUser, ign, true);
            }
            addPlayerLog(
              ign,
              srv.serverHost,
              'spawned',
              `Spawned into world successfully on ${srv.serverHost}. AFK engine active.`,
              undefined,
              'success'
            );
          } else if (st === 'CONNECTING' || st === 'RECONNECTING') {
            addPlayerLog(
              ign,
              srv.serverHost,
              'connecting',
              `Attempting RakNet connection to ${srv.serverHost}:${srv.serverPort || 19132}...`,
              undefined,
              'info'
            );
          } else if (st === 'KICKED') {
            if (currentUser) {
              updateAccountConnectionState(currentUser, ign, false);
            }
            const reason = botReasons[botKey] ? `: ${botReasons[botKey]}` : '';
            addPlayerLog(ign, srv.serverHost, 'kicked', `Kicked from ${srv.serverHost}${reason}`, undefined, 'error');
          } else if (st === 'ERROR') {
            if (currentUser) {
              updateAccountConnectionState(currentUser, ign, false);
            }
            const reason = botReasons[botKey] ? `: ${botReasons[botKey]}` : '';
            addPlayerLog(ign, srv.serverHost, 'error', `Connection error (${srv.serverHost})${reason}`, undefined, 'error');
          } else if (st === 'DISCONNECTED' && prevSt && prevSt !== 'DISCONNECTED') {
            if (currentUser) {
              updateAccountConnectionState(currentUser, ign, false);
            }
            const reason = botReasons[botKey] ? `: ${botReasons[botKey]}` : '';
            addPlayerLog(ign, srv.serverHost, 'disconnected', `Disconnected from ${srv.serverHost}${reason}`, undefined, 'warning');
          }
        }
      }
    });
    prevBotStatesRef.current = { ...botStates };
  }, [botStates, botReasons, daemonStatus, servers, accounts, addPlayerLog, currentUser]);

  // Sync real-time daemon activity logs (version negotiation, UDP probe, errors) into Player Logs
  const prevActivityLogLenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    Object.entries(activityLogs).forEach(([botId, logs]) => {
      const prevLen = prevActivityLogLenRef.current[botId] || 0;
      if (logs.length > prevLen) {
        const newLogs = logs.slice(prevLen);
        const [srvId, accId] = botId.includes('__') ? botId.split('__') : ['', botId];
        const srv = servers.find((s) => s.id === srvId) || activeServer;
        const acc = accounts.find((a) => a.id === accId);
        const ign = acc?.username || 'Player';
        const host = srv?.serverHost || 'Bedrock Server';

        newLogs.forEach((item) => {
          let category: 'info' | 'error' | 'warning' | 'success' = 'info';
          let logType: PlayerLogType = 'info';
          const typeStr = item.type as string;

          if (typeStr === 'error' || (item.type === 'status' && item.message.toLowerCase().includes('error'))) {
            category = 'error';
            logType = 'error';
          } else if (item.type === 'warning') {
            category = 'warning';
            logType = 'warning';
          } else if (typeStr === 'warning' || (item.type === 'status' && item.message.includes('⚠️'))) {
            category = 'warning';
            logType = 'info';
          } else if (item.type === 'spawn') {
            category = 'success';
            logType = 'spawned';
          } else if (item.type === 'connect' || item.message.includes('joined') || item.message.includes('verified') || item.message.includes('✓')) {
            category = 'success';
            logType = 'connected';
          } else if (item.type === 'disconnect') {
            category = 'warning';
            logType = 'disconnected';
          } else if (item.type === 'chat') {
            category = 'info';
            logType = 'chat';
          }

          addPlayerLog(ign, host, logType, item.message, undefined, category);
        });
        prevActivityLogLenRef.current[botId] = logs.length;
      }
    });
  }, [activityLogs, servers, activeServer, accounts, addPlayerLog]);

  // Connect / Disconnect all checked accounts
  const handleConnectSelected = () => {
    if (!activeServer) return;
    const targetAccounts = assignedAccounts.filter((a) => selectedAccountIds.includes(a.id));
    if (targetAccounts.length === 0) {
      showToast('Please select at least one assigned Bedrock account.', 'error');
      return;
    }
    // Stagger multiple bot connections by 7.0s to avoid server login rate limiting
    targetAccounts.forEach((acc, idx) => {
      if (idx === 0) {
        handleConnectAccount(acc, activeServer);
      } else {
        setTimeout(() => {
          handleConnectAccount(acc, activeServer);
        }, idx * 7000);
      }
    });
  };

  const handleDisconnectSelected = () => {
    if (!activeServer) return;
    const targetAccounts = assignedAccounts.filter((a) => selectedAccountIds.includes(a.id));
    targetAccounts.forEach((acc) => handleDisconnectAccount(acc, activeServer));
  };

  // Select all toggle
  const handleToggleSelectAll = () => {
    if (selectedAccountIds.length > 0 && selectedAccountIds.length === assignedAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(assignedAccounts.map((a) => a.id));
    }
  };

  const handleToggleSelectAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((aId) => aId !== id) : [...prev, id]
    );
  };

  // Restore this user's chat scrolling preference (on by default).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) {
      setChatAutoScroll(true);
      return;
    }
    const saved = localStorage.getItem(`pebbleafk_chat_autoscroll_${currentUser.toLowerCase()}`);
    setChatAutoScroll(saved === null ? true : saved === 'true');
  }, [currentUser]);

  // Keep the selected chat pinned to the newest message when auto-scroll is enabled.
  useEffect(() => {
    if (activeSubTab === 'chat' && chatAutoScroll && chatScrollContainerRef.current) {
      const container = chatScrollContainerRef.current;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messagesByBot, activeSubTab, activeServerId, selectedChatAccountId, chatAutoScroll]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeServer) return;
    const msg = chatInput.trim();

    if (selectedChatAccountId === '__ALL__') {
      const targetAccs = assignedAccounts.length > 0 ? assignedAccounts : accounts;
      const onlineAccs = targetAccs.filter((acc) => {
        const bId = `${activeServer.id}__${acc.id}`;
        const st = botStates[bId] || botStates[acc.id];
        return daemonStatus === 'AUTHENTICATED' && (st === 'SPAWNED' || st === 'LOGGED_IN');
      });
      const toSend = onlineAccs.length > 0 ? onlineAccs : targetAccs;
      toSend.forEach((acc, idx) => {
        setTimeout(() => {
          sendChat(`${activeServer.id}__${acc.id}`, msg);
        }, idx * 150);
      });
      setChatInput('');
      return;
    }

    const chatAccountId = selectedChatAccountId || assignedAccounts[0]?.id || accounts[0]?.id;
    if (!chatAccountId) return;
    sendChat(`${activeServer.id}__${chatAccountId}`, msg);
    setChatInput('');
  };

  // 1. UNLOGGED VIEW: Main page
  if (!sessionRestored) {
    return (
      <main className="mc-boot-scene min-h-screen flex items-center justify-center p-6">
        <div className="mc-loading-card">
          <img src="/nav/pebbleafk-pickaxe.png" alt="" className="mc-loading-mark mc-brand-art" />
          <div className="mc-loading-blocks" aria-hidden="true"><i /><i /><i /></div>
          <span className="mc-loading-title">Loading your world…</span>
          <span className="mc-loading-caption">RESTORING YOUR CONTROL DECK</span>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="mc-login-scene min-h-screen flex flex-col p-4 sm:p-7 lg:p-10">
        <div className="mc-login-topbar mx-auto w-full max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/nav/pebbleafk-pickaxe.png" alt="" className="mc-brand-mark mc-brand-art" />
            <div>
              <div className="mc-brand-name">PebbleAFK</div>
              <div className="mc-brand-caption">BEDROCK CONTROL DECK</div>
            </div>
          </div>
          <span className="mc-edition-chip"><Radio className="w-3.5 h-3.5" /> MADE FOR BEDROCK</span>
        </div>

        <section className="mc-login-hero mx-auto my-auto w-full max-w-7xl">
          <div className="mc-login-copy">
            <span className="mc-eyebrow"><span className="mc-eyebrow-block" /> YOUR WORLD, UNDER CONTROL</span>
            <h1>Keep your world <span>moving.</span></h1>
            <p>One home for your Bedrock accounts, server profiles, live chat, and the Termux daemon that keeps your crew online.</p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="mc-button-primary flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in or create an account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="mc-login-footnote"><ShieldCheck className="w-4 h-4" /> Your server credentials stay in your control.</div>
          </div>

          <div className="mc-login-world" aria-label="Pixel-art Overworld landscape">
            <div className="mc-world-glow" />
            <div className="mc-world-plaque">
              <span className="mc-plaque-label"><span className="mc-status-dot" /> BEDROCK AFK CREW</span>
              <h2>Adventure<br />doesn’t have to log off.</h2>
              <p>Manage your worlds from one cozy control room.</p>
              <div className="mc-block-row" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
            <span className="mc-world-signature">PEBBLEAFK · BEDROCK CORE</span>
          </div>
        </section>

        <div className="mc-login-footer mx-auto w-full max-w-7xl">
          <span>BUILT FOR YOUR LITTLE CORNER OF THE OVERWORLD</span>
          <span>PEBBLEAFK <span className="mc-footer-separator">/</span> BEDROCK CORE</span>
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

  // 2. LOGGED-IN VIEW
  return (
    <div className="mc-surface minecraft-shell h-[100dvh] min-h-0 overflow-hidden bg-slate-50 flex flex-col">
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

      {smartAdjustNotices.length > 0 && (
        <div className="mc-signet-notifications" aria-live="polite" aria-label="Signet recovery notifications">
          {smartAdjustNotices.map((notice) => (
            <div key={notice.id} className="mc-signet-notification animate-in fade-in slide-in-from-top-2 duration-200" role="status">
              <div className="mc-signet-notification__icon" aria-hidden="true">
                <RotateCw className="h-5 w-5 animate-spin [animation-duration:3s]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mc-signet-notification__eyebrow">PEBBLEAFK · SIGNET RECOVERY</div>
                <div className="mc-signet-notification__title">Signet is fixing the account <span>@{notice.username}</span></div>
                <p className="mc-signet-notification__details">{notice.message}</p>
              </div>
              <button
                type="button"
                aria-label={`Dismiss Signet notification for ${notice.username}`}
                onClick={() => {
                  const timer = smartAdjustNoticeTimersRef.current.get(notice.id);
                  if (timer) clearTimeout(timer);
                  smartAdjustNoticeTimersRef.current.delete(notice.id);
                  setSmartAdjustNotices((previous) => previous.filter((item) => item.id !== notice.id));
                }}
                className="mc-signet-notification__dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Top Header Bar */}
      <div className="mc-mobile-topbar md:hidden flex items-center justify-between p-3.5 bg-white border-b border-slate-200/90 shrink-0 sticky top-0 z-30 shadow-2xs">
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

          {activeTab === 'servers' && activeServer ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <ServerLogo host={activeServer.serverHost} name={activeServer.name} size="w-6 h-6" />
              <span className="font-extrabold text-sm text-slate-900 tracking-tight truncate max-w-[120px] xs:max-w-[160px]">
                {activeServer.name}
              </span>
              <span className="text-slate-300 font-normal">/</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${
                  activeSubTab === 'connect'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : activeSubTab === 'chat'
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}
              >
                {activeSubTab === 'connect' ? 'Connect' : activeSubTab === 'chat' ? 'Chat' : 'Settings'}
              </span>
            </div>
          ) : activeTab === 'accounts' ? (
            <div className="flex items-center gap-2">
              <img src="/nav/accounts-player-heads.png" alt="" className="mc-topbar-art" />
              <span className="font-black text-sm text-slate-900 tracking-tight">Accounts</span>
            </div>
          ) : activeTab === 'termux_stream' ? (
            <div className="flex items-center gap-2">
              <img src="/nav/terminal-crystal.png" alt="" className="mc-topbar-art" />
              <span className="font-black text-sm text-slate-900 tracking-tight">Termux Stream</span>
            </div>
          ) : activeTab === 'diagnostics' ? (
            <div className="flex items-center gap-2">
              <img src="/nav/diagnostics-heart.png" alt="" className="mc-topbar-art" />
              <span className="font-black text-sm text-slate-900 tracking-tight">Diagnostics</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <img src="/nav/pebbleafk-pickaxe.png" alt="" className="mc-topbar-art" />
              <div>
                <span className="font-black text-sm text-slate-900 tracking-tight">Dashboard</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Daemon status circle on mobile */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-0 bg-transparent p-0 shadow-none transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400 cursor-pointer"
            title={`Termux Daemon: ${daemonStatus}`}
            aria-label={`Termux daemon ${daemonStatus === 'AUTHENTICATED' ? 'online' : 'inactive'}; open settings`}
          >
            <img
              src={daemonStatus === 'AUTHENTICATED' ? '/nav/daemon-allay-active.png' : '/nav/daemon-allay-inactive.png'}
              alt=""
              className="h-10 w-10 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,.45)]"
            />
          </button>
        </div>
      </div>

      {/* Main Layout Container */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Mobile Backdrop Overlay */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          />
        )}

        {/* LEFT SIDEBAR */}
        <aside
          className={`mc-sidebar fixed md:static inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-2xl md:shadow-none transition-transform duration-200 ease-in-out ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div>
            {/* Logo Bar inside Sidebar */}
            <div className="mc-brandbar p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsMobileSidebarOpen(false);
                }}
                className="flex items-center gap-2.5 text-left group hover:opacity-90 transition cursor-pointer"
                title="Go to PebbleAFK Dashboard"
              >
                <img src="/nav/pebbleafk-pickaxe.png" alt="" className="mc-brand-art group-hover:scale-110 transition-transform" />
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
                className="mc-sidebar-action mc-sidebar-action--close md:hidden"
                title="Close navigation"
                aria-label="Close navigation"
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition cursor-pointer group ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <img src="/nav/dashboard-crafting.png" alt="" className="mc-nav-block mc-nav-art" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('termux_stream');
                  setIsMobileSidebarOpen(false);
                  fetchTerminalLogs();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition cursor-pointer group ${
                  activeTab === 'termux_stream'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img src="/nav/terminal-crystal.png" alt="" className="mc-nav-block mc-nav-art" />
                  <span>Termux Stream</span>
                </div>
                <span className={`w-2 h-2 rounded-full ${daemonStatus === 'AUTHENTICATED' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              </button>

              <button
                onClick={() => {
                  setActiveTab('diagnostics');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition cursor-pointer group ${
                  activeTab === 'diagnostics'
                    ? 'bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <img src="/nav/diagnostics-heart.png" alt="" className="mc-nav-block mc-nav-art" />
                <span>Diagnostics</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('servers');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition cursor-pointer group ${
                  activeTab === 'servers'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <img src="/nav/servers-ender-chest.png" alt="" className="mc-nav-block mc-nav-art" />
                <span>Servers</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('accounts');
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition cursor-pointer group ${
                  activeTab === 'accounts'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img src="/nav/accounts-player-heads.png" alt="" className="mc-nav-block mc-nav-art" />
                  <span>Accounts</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                  {verifiedAccountsCount}/{MAX_BEDROCK_ACCOUNTS}
                </span>
              </button>
            </div>

            {/* SERVER PROFILES List (Matching Image 1 & 2) */}
            <div className="px-3 pt-3 pb-2 border-t border-slate-100 flex-1 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Server Profiles</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingServer(null);
                    setIsServerModalOpen(true);
                  }}
                  className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-500 hover:text-emerald-700 transition cursor-pointer"
                  title="Add Bedrock Server Profile"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {servers.length === 0 ? (
                <div className="px-2 py-3 text-center">
                  <p className="text-[11px] text-slate-400">No server profiles yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingServer(null);
                      setIsServerModalOpen(true);
                    }}
                    className="mt-1.5 text-xs text-emerald-600 font-bold hover:underline cursor-pointer"
                  >
                    + Add a server
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {servers.map((srv) => {
                    const isSelected = activeTab === 'servers' && activeServer?.id === srv.id;
                    const srvAssignedIds = Array.isArray(srv.assignedAccountIds)
                      ? srv.assignedAccountIds
                      : (srv.accountId ? [srv.accountId] : []);
                    const srvAssignedCount = accounts.filter((a) => srvAssignedIds.includes(a.id)).length;
                    const onlineCount = daemonStatus === 'AUTHENTICATED' ? (() => {
                      const fromAssigned = accounts.filter(
                        (acc) =>
                          srvAssignedIds.includes(acc.id) &&
                          (botStates[`${srv.id}__${acc.id}`] === 'SPAWNED' ||
                           botStates[`${srv.id}__${acc.id}`] === 'LOGGED_IN' ||
                           botStates[acc.id] === 'SPAWNED' ||
                           botStates[acc.id] === 'LOGGED_IN')
                      ).length;
                      const fromBotStates = Object.entries(botStates).filter(([key, state]) =>
                        (state === 'SPAWNED' || state === 'LOGGED_IN') &&
                        (key.startsWith(`${srv.id}__`) || srvAssignedIds.includes(key))
                      ).length;
                      return Math.max(fromAssigned, fromBotStates);
                    })() : 0;
                    const totalSlots = Math.max(srvAssignedCount, onlineCount);

                    return (
                      <div key={srv.id} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveServerId(srv.id);
                            setActiveTab('servers');
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer group ${
                            isSelected
                              ? 'bg-emerald-50 text-white border border-emerald-300 shadow-2xs'
                              : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ServerLogo host={srv.serverHost} name={srv.name} size="w-5 h-5" />
                            <span className="truncate">{srv.name}</span>
                          </div>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                            onlineCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Radio className={`w-2.5 h-2.5 ${onlineCount > 0 ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                            <span>{onlineCount}/{totalSlots}</span>
                          </span>
                        </button>

                        {/* Sub-navigation under active profile: Connect, Chat, Settings */}
                        {isSelected && (
                          <div className="ml-3 pl-3 border-l-2 border-emerald-200/80 space-y-1 pt-0.5 pb-1">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('connect');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer group ${
                                activeSubTab === 'connect'
                                  ? 'bg-emerald-100/60 text-emerald-900 border border-emerald-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <img src="/nav/connect-compass.png" alt="" className="mc-nav-mini-block mc-mini-nav-art" />
                              <span>Connect</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('chat');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer group ${
                                activeSubTab === 'chat'
                                  ? 'bg-sky-50 text-sky-900 border border-sky-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <img src="/nav/chat-book-quill.png" alt="" className="mc-nav-mini-block mc-mini-nav-art" />
                              <span>Chat</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('settings');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer group ${
                                activeSubTab === 'settings'
                                  ? 'bg-slate-200/80 text-slate-900 border border-slate-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <img src="/nav/settings-repeater.png" alt="" className="mc-nav-mini-block mc-mini-nav-art" />
                              <span>Settings</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* User Profile + Logout at Bottom */}
          <div className="mc-sidebar-footer p-3 border-t border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="mc-sidebar-user inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-extrabold truncate max-w-[170px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">@{currentUser}</span>
              </div>
              {currentUser?.toLowerCase() === 'chief' && (
                <Link
                  href="/chief"
                  className="mc-sidebar-role text-[9px] font-black uppercase px-2 py-1 transition shrink-0"
                  title="Chief Admin Panel"
                >
                  ADMIN
                </Link>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentUser?.toLowerCase() === 'chief' && (
                <Link
                  href="/chief"
                  className="mc-sidebar-action mc-sidebar-action--admin"
                  title="Open Chief Admin Console"
                  aria-label="Open Chief Admin Console"
                >
                  <Shield className="w-4 h-4" />
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="mc-sidebar-action mc-sidebar-action--logout"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Desktop Header + Main View Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Desktop Top Header Bar */}
          <header className="mc-desktop-topbar hidden md:flex shrink-0 sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-6 py-2.5 items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              {activeTab === 'servers' && activeServer ? (
                <>
                  <div className="flex items-center gap-2">
                    <ServerLogo host={activeServer.serverHost} name={activeServer.name} size="w-5 h-5" />
                    <span className="text-slate-850 font-extrabold">{activeServer.name}</span>
                  </div>
                  <span className="text-slate-300 font-normal">/</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border shadow-2xs ${
                      activeSubTab === 'connect'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : activeSubTab === 'chat'
                        ? 'bg-sky-50 text-sky-800 border-sky-300'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    {activeSubTab}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold text-slate-800">Bedrock Core</span>
                  <span>/</span>
                  <span className="capitalize">
                    {activeTab === 'termux_stream' ? 'Termux Stream' : activeTab}
                  </span>
                </>
              )}
            </div>

            {/* Right: Daemon Status Icon */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsSettingsOpen(true)}
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-0 bg-transparent p-0 shadow-none transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400 cursor-pointer"
                title={`Termux Daemon: ${daemonStatus} - Click for 1-Click launcher & settings`}
                aria-label={`Termux daemon ${daemonStatus === 'AUTHENTICATED' ? 'online' : 'inactive'}; open settings`}
              >
                <img
                  src={daemonStatus === 'AUTHENTICATED' ? '/nav/daemon-allay-active.png' : '/nav/daemon-allay-inactive.png'}
                  alt=""
                  className="h-10 w-10 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,.45)]"
                />
              </button>
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main className={`mc-workspace flex-1 min-h-0 min-w-0 w-full bg-grid-slate overflow-x-hidden ${
            activeTab === 'termux_stream' || (activeTab === 'servers' && activeSubTab === 'chat' && activeServer)
              ? 'flex flex-col overflow-y-hidden p-2 sm:p-4'
              : 'overflow-y-auto p-3 sm:p-6'
          }`}>
            {/* VIEW 1: DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <div className="max-w-4xl mx-auto space-y-6">
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
                    onClick={() => setActiveTab('accounts')}
                    className="p-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 shadow-2xs space-y-1 text-left transition cursor-pointer"
                  >
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Bedrock Accounts</span>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-bold text-slate-900">{verifiedAccountsCount} / {MAX_BEDROCK_ACCOUNTS}</span>
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

                <section className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">Browser devices</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Known PC/mobile sessions stay listed while their browsers sleep; remove one to forget that device. Termux bots keep running.</p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${daemonStatus === 'AUTHENTICATED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {daemonStatus === 'AUTHENTICATED' ? `${deviceSessions.filter((session) => session.connected).length} online · ${deviceSessions.length} known` : 'Daemon reconnecting'}
                    </span>
                  </div>
                  {daemonStatus !== 'AUTHENTICATED' && (
                    <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-slate-100">
                      <p className="text-xs text-slate-500">Session controls are unavailable until the daemon socket reconnects.</p>
                      <button type="button" onClick={reconnectNow} className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">Reconnect now</button>
                    </div>
                  )}
                  {deviceSessions.length === 0 ? (
                    <p className="px-5 py-4 text-xs text-slate-500">No browser sockets are currently connected.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {deviceSessions.map((session) => (
                        <div key={session.sessionId} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${session.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800">{session.label}</p>
                              <p className="text-[10px] text-slate-500 truncate" title={session.userAgent}>{session.connected ? `Online · ${session.ip}` : `Offline · last seen ${new Date(session.lastSeenAt).toLocaleString()}`}</p>
                            </div>
                          </div>
                          <button type="button" disabled={daemonStatus !== 'AUTHENTICATED'} onClick={() => disconnectDeviceSession(session.sessionId)} className="shrink-0 px-3 py-1.5 rounded-lg border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* VIEW 2: SEPARATE ACCOUNTS PAGE (Matches PocketAFK Design) */}
            {activeTab === 'accounts' && (
              <div className="max-w-5xl mx-auto space-y-5">
                {/* Top Pill Breadcrumb */}
                <div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-200/70 text-slate-700 font-extrabold text-[10px] tracking-wider uppercase">
                    ACCOUNTS
                  </span>
                </div>

                {/* Page Title & Action Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Accounts</h1>
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
                        {verifiedAccountsCount}/{MAX_BEDROCK_ACCOUNTS}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Manage all your verified Microsoft Bedrock Minecraft accounts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      disabled={verifiedAccountsCount >= MAX_BEDROCK_ACCOUNTS}
                      onClick={() => handleStartMicrosoftLogin()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition shadow-xs cursor-pointer active:scale-95"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Add Account</span>
                    </button>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={accountFilter}
                        onChange={(e) => setAccountFilter(e.target.value)}
                        className="pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition shadow-2xs w-44 sm:w-56 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Accounts Container */}
                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  {accounts
                    .filter((a) => {
                      const q = accountFilter.toLowerCase().trim();
                      if (!q) return true;
                      return (a.ign || a.username).toLowerCase().includes(q);
                    }).length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      <div className="space-y-3 max-w-sm mx-auto">
                        <Users className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs font-semibold text-slate-700">No Bedrock accounts linked yet.</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Click &ldquo;+ Add Account&rdquo; above to authenticate and link your official Bedrock Microsoft account.
                        </p>
                        <button
                          onClick={() => handleStartMicrosoftLogin()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> + Add Account
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Mobile View: All elements appear in one view for each item and wrap cleanly without horizontal scroll */}
                      <div className="md:hidden divide-y divide-slate-100">
                        {accounts
                          .filter((a) => {
                            const q = accountFilter.toLowerCase().trim();
                            if (!q) return true;
                            return (a.ign || a.username).toLowerCase().includes(q);
                          })
                          .map((acc) => {
                            const displayName = acc.ign || acc.username || 'BedrockPlayer';
                            const primaryAvatarUrl = getPlayerSkinHeadUrl(displayName, 36);
                            const dateAddedStr = acc.addedAt
                              ? new Date(acc.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                                ', ' +
                                new Date(acc.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                              : 'Recent';

                            return (
                              <div key={acc.id} className="p-4 hover:bg-slate-50/70 transition space-y-3">
                                {/* Top Row: Avatar, Gamertag, Badges & Status */}
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shrink-0 shadow-2xs">
                                      <img
                                        src={primaryAvatarUrl}
                                        alt={displayName}
                                        className="w-full h-full object-cover [image-rendering:pixelated]"
                                        onError={(e) => {
                                          const img = e.currentTarget as HTMLImageElement;
                                          if (!img.src.includes('mc-heads')) {
                                            img.src = `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/32`;
                                          } else if (!img.src.includes('minotar')) {
                                            img.src = `https://minotar.net/helm/${encodeURIComponent(displayName)}/32`;
                                          } else {
                                            img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                                        <span className="truncate">{displayName}</span>
                                        {acc.authError ? (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                                            Mismatch
                                          </span>
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(displayName);
                                            setCopiedIgnId(acc.id);
                                            setTimeout(() => setCopiedIgnId(null), 1500);
                                          }}
                                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                                          title="Copy Gamertag"
                                        >
                                          {copiedIgnId === acc.id ? (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </button>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-medium block">
                                        Bedrock Edition
                                      </span>
                                    </div>
                                  </div>

                                  {/* Status Badge */}
                                  <div className="shrink-0">
                                    {acc.authError ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                        <AlertCircle className="w-3 h-3 text-rose-600" />
                                        Failed
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Working
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Bottom Row: Connections, Date Added, and Wrapped Actions */}
                                <div className="pt-2.5 border-t border-slate-100/90 flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium flex-wrap">
                                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-slate-600 text-[10px] font-bold">
                                      1 Connection
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-400 text-[10px]">{dateAddedStr}</span>
                                  </div>

                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {acc.authError && (
                                      <button
                                        onClick={() => handleStartMicrosoftLogin(acc.username || acc.ign)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition text-[11px] font-bold cursor-pointer"
                                        title="Re-verify with Microsoft"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Re-verify</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(displayName);
                                        setCopiedIgnId(acc.id);
                                        setTimeout(() => setCopiedIgnId(null), 1500);
                                      }}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200/80 transition cursor-pointer"
                                      title="Copy Gamertag"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => setDeletingAccount(acc)}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-600 bg-rose-50/80 hover:bg-rose-100 border border-rose-200/70 transition text-[11px] font-bold cursor-pointer"
                                      title="Unlink Bedrock Account"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Unlink</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Desktop View: Full Table */}
                      <div className="hidden md:block overflow-x-auto touch-pan-x">
                        <table className="w-full text-left text-xs min-w-[720px]">
                          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider font-extrabold">
                            <tr>
                              <th className="p-4 pl-6">Account Name</th>
                              <th className="p-4">Account Access</th>
                              <th className="p-4">Connections</th>
                              <th className="p-4">Date Added</th>
                              <th className="p-4 pr-6 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {accounts
                              .filter((a) => {
                                const q = accountFilter.toLowerCase().trim();
                                if (!q) return true;
                                return (a.ign || a.username).toLowerCase().includes(q);
                              })
                              .map((acc) => {
                                const displayName = acc.ign || acc.username || 'BedrockPlayer';
                                const rawName = displayName.includes('@') ? displayName.split('@')[0] : displayName;
                                const primaryAvatarUrl = getPlayerSkinHeadUrl(displayName, 36);
                                const dateAddedStr = acc.addedAt
                                  ? new Date(acc.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                                    ', ' +
                                    new Date(acc.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                                  : 'Recent';

                                return (
                                  <tr key={acc.id} className="hover:bg-slate-50/70 transition">
                                    {/* Account Name + Skin */}
                                    <td className="p-4 pl-6">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shrink-0 shadow-2xs">
                                          <img
                                            src={primaryAvatarUrl}
                                            alt={displayName}
                                            className="w-full h-full object-cover [image-rendering:pixelated]"
                                            onError={(e) => {
                                              const img = e.currentTarget as HTMLImageElement;
                                              if (!img.src.includes('mc-heads')) {
                                                img.src = `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/32`;
                                              } else if (!img.src.includes('minotar')) {
                                                img.src = `https://minotar.net/helm/${encodeURIComponent(displayName)}/32`;
                                              } else {
                                                img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                              }
                                            }}
                                          />
                                        </div>
                                        <div>
                                          <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                                            <span>{displayName}</span>
                                            {acc.authError ? (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                                                Mismatch
                                              </span>
                                            ) : (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(displayName);
                                                setCopiedIgnId(acc.id);
                                                setTimeout(() => setCopiedIgnId(null), 1500);
                                              }}
                                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                              title="Copy Gamertag"
                                            >
                                              {copiedIgnId === acc.id ? (
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              ) : (
                                                <Copy className="w-3 h-3" />
                                              )}
                                            </button>
                                          </div>
                                          <span className="text-[10px] text-slate-400 font-medium">
                                            Bedrock Edition
                                          </span>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Account Access */}
                                    <td className="p-4">
                                      {acc.authError ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                          <AlertCircle className="w-3 h-3 text-rose-600" />
                                          Verification Failed
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                          Working
                                        </span>
                                      )}
                                    </td>

                                    {/* Connections */}
                                    <td className="p-4">
                                      <span className="font-mono text-xs font-semibold text-slate-700">
                                        1
                                      </span>
                                    </td>

                                    {/* Date Added */}
                                    <td className="p-4">
                                      <span className="text-xs text-slate-500 font-medium">
                                        {dateAddedStr}
                                      </span>
                                    </td>

                                    {/* Actions */}
                                    <td className="p-4 pr-6 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {acc.authError && (
                                          <button
                                            onClick={() => handleStartMicrosoftLogin(acc.username || acc.ign)}
                                            className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                                            title="Re-verify with Microsoft"
                                          >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(displayName);
                                            setCopiedIgnId(acc.id);
                                            setTimeout(() => setCopiedIgnId(null), 1500);
                                          }}
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                          title="Copy Gamertag"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          onClick={() => setDeletingAccount(acc)}
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                          title="Unlink Bedrock Account"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 2: TERMUX LIVE STREAM (DEDICATED FULL PAGE - 100% LIGHT MODE) */}
            {activeTab === 'termux_stream' && (
              <TermuxStreamPage
                logs={terminalLogs}
                historyError={terminalHistoryError}
                isOnline={daemonStatus === 'AUTHENTICATED'}
                daemonStartedAt={daemonStartedAt}
                lastDisconnectedAt={lastDaemonDisconnectedAt}
                now={nowTick}
                onFetchLogs={fetchTerminalLogs}
                onClearLogs={clearTerminalLogs}
                onRestartDaemon={restartDaemon}
                onUpdateDaemon={updateDaemon}
                onShutdownDaemon={shutdownDaemon}
                termuxCommand={termux1ClickCmd}
                pebbleUsername={currentUser || undefined}
              />
            )}

            {activeTab === 'diagnostics' && (
              <FreshSmpDiagnosticsPage
                servers={servers}
                accounts={accounts}
                diagnostics={freshSmpDiagnostics}
                botStates={botStates}
                botReasons={botReasons}
                now={nowTick}
              />
            )}

            {/* VIEW 3: SERVERS VIEW (CONNECT, CHAT, SETTINGS) */}
            {activeTab === 'servers' && (
              <div className={`w-full min-w-0 max-w-6xl mx-auto ${
                activeSubTab === 'chat' && activeServer ? 'h-full min-h-0 flex flex-col' : 'space-y-4 sm:space-y-6'
              }`}>
                {!activeServer ? (
                  /* Empty state when no server profile exists */
                  <div className="p-12 rounded-3xl bg-white border border-slate-200/90 shadow-xs text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                      <Server className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-sm mx-auto">
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">No Server Profiles Yet</h2>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Create a profile for the Bedrock server (port 19132) you want your bot accounts to join and keep online.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingServer(null);
                        setIsServerModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Create Bedrock Server Profile</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* SUBTAB 1: CONNECT */}
                    {activeSubTab === 'connect' && (
                      <div className="space-y-4">
                        {/* Top Action Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleConnectSelected}
                              disabled={daemonStatus !== 'AUTHENTICATED' || selectedAccountIds.length === 0}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Connect Selected</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleDisconnectSelected}
                              disabled={!isActiveServerRunning}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>Disconnect Selected</span>
                            </button>
                          </div>

                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Filter accounts..."
                              value={accountFilter}
                              onChange={(e) => setAccountFilter(e.target.value)}
                              className="pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition shadow-2xs font-medium w-48 sm:w-56"
                            />
                          </div>
                        </div>

                        {/* Bedrock UDP Gateway Status Alert */}
                        {gatewayStatus && !gatewayStatus.checking && !gatewayStatus.online && (
                          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5 shadow-2xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold">Bedrock status probe got no reply: {activeServer.serverHost}:{activeServer.serverPort || 19132}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">Unverified</span>
                              </div>
                              <p className="text-[11px] text-amber-800 leading-relaxed">
                                {connectedAccountCount > 0
                                  ? `${connectedAccountCount} account${connectedAccountCount === 1 ? ' is' : 's are'} currently connected, so this public ping result does not indicate a global outage. A Lifesteal timeout is an account-specific subserver transfer/queue failure; check that account's logs.`
                                  : 'A third-party public status check did not receive a Bedrock ping response. Some servers filter status probes, so this alone cannot confirm an outage; verify with an account connection and its daemon logs.'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Accounts List for this Server Profile (Responsive Mobile Cards + Desktop Table) */}
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                          {/* Mobile Select All Header */}
                          {assignedAccounts.length > 0 && (
                            <div className="md:hidden px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={assignedAccounts.length > 0 && selectedAccountIds.length === assignedAccounts.length}
                                  onChange={handleToggleSelectAll}
                                  className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
                                />
                                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                                  Select All ({selectedAccountIds.length}/{assignedAccounts.length})
                                </span>
                              </label>
                              {selectedAccountIds.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedAccountIds([])}
                                  className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition"
                                >
                                  Deselect
                                </button>
                              )}
                            </div>
                          )}

                          {/* 1. Mobile Cards View: 100% visible in one go with zero horizontal scrolling */}
                          <div className="block md:hidden divide-y divide-slate-100">
                            {assignedAccounts.length === 0 ? (
                              <div className="p-6 text-center text-slate-500 space-y-2">
                                <p className="text-xs font-semibold">No accounts assigned to this server profile yet.</p>
                                {availableAccounts.length > 0 && (
                                  <p className="text-[11px] text-slate-400">Tap &ldquo;+ Add to Profile&rdquo; below on any available account.</p>
                                )}
                                {accounts.length === 0 && (
                                  <button
                                    onClick={() => handleStartMicrosoftLogin()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-xs mt-2"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Link Bedrock Microsoft Account
                                  </button>
                                )}
                              </div>
                            ) : (
                              assignedAccounts.map((acc) => {
                                const botId = `${activeServer.id}__${acc.id}`;
                                const isDaemonLive = daemonStatus === 'AUTHENTICATED';
                                const botState = isDaemonLive ? (botStates[botId] || botStates[acc.id] || 'DISCONNECTED') : 'DISCONNECTED';
                                const isConnected = isDaemonLive && (botState === 'SPAWNED' || botState === 'LOGGED_IN');
                                const isConnecting = isDaemonLive && (botState === 'CONNECTING' || botState === 'RECONNECTING');
                                const isChecked = selectedAccountIds.includes(acc.id);
                                const isBeingAdjusted = adjustingAccountIds.has(acc.id);

                                const srvStart = sessionStartTimes[botId];
                                const localSec = srvStart ? Math.max(0, Math.floor((nowTick - srvStart) / 1000)) : 0;
                                const srvTel = telemetries?.[botId];
                                const daemonUptime =
                                  srvTel && typeof srvTel.uptime === 'number' && srvTel.uptime > 0
                                    ? srvTel.uptime
                                    : srvTel && typeof srvTel.connectedAt === 'number' && srvTel.connectedAt > 0
                                    ? Math.max(0, Math.floor((nowTick - srvTel.connectedAt) / 1000))
                                    : 0;
                                const freshSmpDiagnostic = activeServerIsFreshSmp ? freshSmpDiagnostics[botId] : undefined;
                                const lifestealStartedAt = freshSmpDiagnostic?.lifestealSessionStartedAt;
                                const isFreshSmpStable = Boolean(isConnected && freshSmpDiagnostic?.phase === 'lifesteal' &&
                                  typeof lifestealStartedAt === 'number' && nowTick - lifestealStartedAt >= 60_000);
                                const accountUptime = activeServerIsFreshSmp
                                  ? (isFreshSmpStable && typeof lifestealStartedAt === 'number' ? Math.floor((nowTick - lifestealStartedAt - 60_000) / 1000) : 0)
                                  : ((daemonStatus === 'AUTHENTICATED' && isConnected) ? Math.max(daemonUptime, localSec) : 0);

                                return (
                                  <div
                                    key={acc.id}
                                    className={`p-3 space-y-2.5 transition ${isBeingAdjusted ? 'mc-adjusting-card rounded-xl border-2 border-emerald-400/90' : isChecked ? 'bg-emerald-50/40' : 'bg-white'}`}
                                  >
                                    {/* Top Row: Checkbox, Avatar, Name & Badges, Pin */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleToggleSelectAccount(acc.id)}
                                          className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
                                        />
                                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                          <img
                                            src={getPlayerSkinHeadUrl(acc.ign || acc.username, 32)}
                                            alt="Skin"
                                            className="w-full h-full object-cover [image-rendering:pixelated]"
                                            onError={(e) => {
                                              const img = e.currentTarget as HTMLImageElement;
                                              const clean = (acc.ign || acc.username || 'Steve').replace(/^@/, '').trim();
                                              if (!img.src.includes('mc-heads')) {
                                                img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/32`;
                                              } else {
                                                img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                              }
                                            }}
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="font-bold text-slate-900 font-mono text-xs flex items-center gap-1">
                                            <span className="truncate">@{acc.ign || acc.username}</span>
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenAccountLogs(acc);
                                              }}
                                              className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 transition cursor-pointer shadow-2xs shrink-0"
                                              title="View connection & audit logs"
                                            >
                                              <FileText className="w-3 h-3 text-slate-500 hover:text-emerald-600" />
                                            </button>
                                          </div>
                                          <div className="text-[10px] text-slate-400">Bedrock Edition</div>
                                        </div>
                                      </div>

                                      {/* Pin Action */}
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePin(acc.id)}
                                        className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                                          pinnedAccountIds.includes(acc.id)
                                            ? 'text-amber-600 bg-amber-50'
                                            : 'text-slate-400 hover:text-slate-700'
                                        }`}
                                        title={pinnedAccountIds.includes(acc.id) ? 'Unpin' : 'Pin'}
                                      >
                                        <Pin className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Bottom Row: Status Badge (clickable), Uptime, Connect/Disconnect button, Remove from Profile (-) */}
                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!activeServer) return;
                                            if (daemonStatus !== 'AUTHENTICATED') {
                                              showToast('Cannot toggle: Termux daemon is offline. Start daemon first.', 'error');
                                              return;
                                            }
                                            if (isConnected || isConnecting) {
                                              handleDisconnectAccount(acc, activeServer);
                                            } else {
                                              handleConnectAccount(acc, activeServer);
                                            }
                                          }}
                                          className="inline-flex items-center cursor-pointer active:scale-95 transition"
                                          title={isConnected ? 'Click to disconnect' : 'Click to connect'}
                                        >
                                          {activeServerIsFreshSmp && isConnected
                                            ? getFreshSmpStatusBadge(isFreshSmpStable, freshSmpDiagnostic?.phase)
                                            : getStatusBadge(botState as BotLifecycleState)}
                                        </button>

                                        {/* Live Uptime */}
                                        {isConnected && (!activeServerIsFreshSmp || isFreshSmpStable) ? (
                                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-mono text-[11px] font-bold">
                                            <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                                            <span>{formatUptime(accountUptime)}</span>
                                          </div>
                                        ) : (
                                          <span className="text-[11px] font-mono text-slate-400 font-medium px-1">-</span>
                                        )}
                                      </div>

                                      {/* Quick Action Buttons */}
                                      <div className="flex items-center gap-1.5">
                                        {/* Remove from server profile button */}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveAccountFromProfile(acc.id)}
                                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition cursor-pointer shadow-2xs"
                                          title="Remove from this server profile"
                                          aria-label="Remove from this server profile"
                                        >
                                          <Minus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* 2. Desktop Table View */}
                          <div className="hidden md:block overflow-x-auto touch-pan-x">
                            <table className="w-full text-left text-xs min-w-[580px]">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-bold">
                                <tr>
                                  <th className="p-3 w-8 text-center">
                                    <input
                                      type="checkbox"
                                      checked={assignedAccounts.length > 0 && selectedAccountIds.length === assignedAccounts.length}
                                      onChange={handleToggleSelectAll}
                                      className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
                                    />
                                  </th>
                                  <th className="p-3">Account Name</th>
                                  <th className="p-3">Status</th>
                                  <th className="p-3">Uptime</th>
                                  <th className="p-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {assignedAccounts.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                      <div className="space-y-2">
                                        <p className="text-xs font-semibold">No accounts assigned to this server profile yet.</p>
                                        {availableAccounts.length > 0 && (
                                          <p className="text-[11px] text-slate-400">Click &ldquo;+ Add to Profile&rdquo; below on any available account to assign it.</p>
                                        )}
                                        {accounts.length === 0 && (
                                          <button
                                            onClick={() => handleStartMicrosoftLogin()}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                                          >
                                            <Plus className="w-3.5 h-3.5" /> Link Bedrock Microsoft Account
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  assignedAccounts.map((acc) => {
                                    const botId = `${activeServer.id}__${acc.id}`;
                                    const isDaemonLive = daemonStatus === 'AUTHENTICATED';
                                    const botState = isDaemonLive ? (botStates[botId] || botStates[acc.id] || 'DISCONNECTED') : 'DISCONNECTED';
                                    const isConnected = isDaemonLive && (botState === 'SPAWNED' || botState === 'LOGGED_IN');
                                    const isConnecting = isDaemonLive && (botState === 'CONNECTING' || botState === 'RECONNECTING');
                                    const isChecked = selectedAccountIds.includes(acc.id);
                                    const isBeingAdjusted = adjustingAccountIds.has(acc.id);

                                    const srvStart = sessionStartTimes[botId];
                                    const localSec = srvStart ? Math.max(0, Math.floor((nowTick - srvStart) / 1000)) : 0;
                                    const srvTel = telemetries?.[botId];
                                    const daemonUptime =
                                      srvTel && typeof srvTel.uptime === 'number' && srvTel.uptime > 0
                                        ? srvTel.uptime
                                        : srvTel && typeof srvTel.connectedAt === 'number' && srvTel.connectedAt > 0
                                        ? Math.max(0, Math.floor((nowTick - srvTel.connectedAt) / 1000))
                                        : 0;
                                    const freshSmpDiagnostic = activeServerIsFreshSmp ? freshSmpDiagnostics[botId] : undefined;
                                    const lifestealStartedAt = freshSmpDiagnostic?.lifestealSessionStartedAt;
                                    const isFreshSmpStable = Boolean(isConnected && freshSmpDiagnostic?.phase === 'lifesteal' &&
                                      typeof lifestealStartedAt === 'number' && nowTick - lifestealStartedAt >= 60_000);
                                    const accountUptime = activeServerIsFreshSmp
                                      ? (isFreshSmpStable && typeof lifestealStartedAt === 'number' ? Math.floor((nowTick - lifestealStartedAt - 60_000) / 1000) : 0)
                                      : ((daemonStatus === 'AUTHENTICATED' && isConnected) ? Math.max(daemonUptime, localSec) : 0);

                                    return (
                                      <tr
                                        key={acc.id}
                                        className={`hover:bg-slate-50/80 transition ${
                                          isBeingAdjusted ? 'mc-adjusting-card' : isChecked ? 'bg-emerald-50/30' : ''
                                        }`}
                                      >
                                        <td className="p-3 text-center">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleToggleSelectAccount(acc.id)}
                                            className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
                                          />
                                        </td>
                                        <td className="p-3">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                              <img
                                                src={getPlayerSkinHeadUrl(acc.ign || acc.username, 32)}
                                                alt="Skin"
                                                className="w-full h-full object-cover [image-rendering:pixelated]"
                                                onError={(e) => {
                                                  const img = e.currentTarget as HTMLImageElement;
                                                  const clean = (acc.ign || acc.username || 'Steve').replace(/^@/, '').trim();
                                                  if (!img.src.includes('mc-heads')) {
                                                    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/32`;
                                                  } else {
                                                    img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                                  }
                                                }}
                                              />
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-900 font-mono flex items-center gap-1.5">
                                                <span>@{acc.ign || acc.username}</span>
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenAccountLogs(acc);
                                                  }}
                                                  className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition cursor-pointer shadow-2xs ml-0.5 group"
                                                  title="View connection & audit logs for this account"
                                                >
                                                  <FileText className="w-3 h-3 group-hover:scale-110 transition-transform text-slate-500 hover:text-emerald-600" />
                                                </button>
                                              </div>
                                              <div className="text-[10px] text-slate-400">
                                                Bedrock Edition
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="p-3">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!activeServer) return;
                                              if (daemonStatus !== 'AUTHENTICATED') {
                                                showToast('Cannot toggle: Termux daemon is offline. Start daemon first.', 'error');
                                                return;
                                              }
                                              if (isConnected || isConnecting) {
                                                handleDisconnectAccount(acc, activeServer);
                                              } else {
                                                handleConnectAccount(acc, activeServer);
                                              }
                                            }}
                                            className="group inline-flex items-center transition-all duration-150 transform hover:scale-105 active:scale-95 cursor-pointer focus:outline-none"
                                            title={
                                              isConnected
                                                ? `Online • Click to disconnect @${acc.ign || acc.username}`
                                                : isConnecting
                                                ? `Connecting • Click to disconnect @${acc.ign || acc.username}`
                                                : `Offline • Click to connect @${acc.ign || acc.username}`
                                            }
                                          >
                                            {activeServerIsFreshSmp && isConnected
                                              ? getFreshSmpStatusBadge(isFreshSmpStable, freshSmpDiagnostic?.phase)
                                              : getStatusBadge(botState as BotLifecycleState)}
                                          </button>
                                        </td>
                                        <td className="p-3">
                                          {isConnected && (!activeServerIsFreshSmp || isFreshSmpStable) ? (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-mono text-xs font-bold shadow-2xs">
                                              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                              <span>{formatUptime(accountUptime)}</span>
                                            </div>
                                          ) : (
                                            <span className="text-xs font-mono text-slate-400 font-medium px-2">-</span>
                                          )}
                                        </td>
                                        <td className="p-3 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => handleTogglePin(acc.id)}
                                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                                pinnedAccountIds.includes(acc.id)
                                                  ? 'text-amber-600 bg-amber-50'
                                                  : 'text-slate-400 hover:text-slate-700'
                                              }`}
                                              title={pinnedAccountIds.includes(acc.id) ? 'Unpin' : 'Pin'}
                                            >
                                              <Pin className="w-3.5 h-3.5" />
                                            </button>

                                            {/* Remove from server profile (-) */}
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveAccountFromProfile(acc.id)}
                                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer border border-transparent hover:border-rose-200"
                                              title="Remove from this server profile"
                                            >
                                              <Minus className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Available Accounts to Add (+) to this Server Profile */}
                        {availableAccounts.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-xs font-bold text-slate-700">Available Accounts (Not in this profile)</span>
                              <span className="text-[11px] text-slate-400 font-medium">Click &ldquo;+ Add to Profile&rdquo; to assign</span>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                              {/* Mobile Available Accounts List */}
                              <div className="block md:hidden divide-y divide-slate-100">
                                {availableAccounts.map((acc) => (
                                  <div key={acc.id} className="p-3 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                        <img
                                          src={getPlayerSkinHeadUrl(acc.ign || acc.username, 32)}
                                          alt="Skin"
                                          className="w-full h-full object-cover [image-rendering:pixelated]"
                                          onError={(e) => {
                                            const img = e.currentTarget as HTMLImageElement;
                                            const clean = (acc.ign || acc.username || 'Steve').replace(/^@/, '').trim();
                                            if (!img.src.includes('mc-heads')) {
                                              img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/32`;
                                            } else {
                                              img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                            }
                                          }}
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-900 flex items-center gap-1 font-mono text-xs">
                                          <span className="truncate">@{acc.ign || acc.username}</span>
                                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        </div>
                                        <div className="text-[10px] text-slate-400">Bedrock Edition</div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleAddAccountToProfile(acc.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer shadow-2xs shrink-0 active:scale-95"
                                      title="Add to this server profile"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Add to Profile</span>
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Desktop Available Accounts Table */}
                              <div className="hidden md:block overflow-x-auto touch-pan-x">
                                <table className="w-full text-left text-xs min-w-[480px]">
                                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-bold">
                                    <tr>
                                      <th className="p-3">Account Name</th>
                                      <th className="p-3 text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {availableAccounts.map((acc) => (
                                      <tr key={acc.id} className="hover:bg-slate-50/80 transition">
                                        <td className="p-3">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                              <img
                                                src={getPlayerSkinHeadUrl(acc.ign || acc.username, 32)}
                                                alt="Skin"
                                                className="w-full h-full object-cover [image-rendering:pixelated]"
                                                onError={(e) => {
                                                  const img = e.currentTarget as HTMLImageElement;
                                                  const clean = (acc.ign || acc.username || 'Steve').replace(/^@/, '').trim();
                                                  if (!img.src.includes('mc-heads')) {
                                                    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/32`;
                                                  } else {
                                                    img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                                  }
                                                }}
                                              />
                                            </div>
                                            <div className="font-bold text-slate-900 flex items-center gap-1.5 font-mono">
                                              <span>@{acc.ign || acc.username}</span>
                                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenAccountLogs(acc);
                                                }}
                                                className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition cursor-pointer shadow-2xs ml-0.5 group"
                                                title="View connection & audit logs for this account"
                                              >
                                                <FileText className="w-3 h-3 group-hover:scale-110 transition-transform text-slate-500 hover:text-emerald-600" />
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="p-3 text-right">
                                          <button
                                            type="button"
                                            onClick={() => handleAddAccountToProfile(acc.id)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer shadow-2xs"
                                            title="Add to this server profile"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Add to Profile</span>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Add Account Button at Bottom of Table */}
                        <div className="flex justify-start pt-1">
                          <button
                            type="button"
                            disabled={verifiedAccountsCount >= MAX_BEDROCK_ACCOUNTS}
                            onClick={() => handleStartMicrosoftLogin()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-emerald-700 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-40"
                          >
                            <Plus className="w-4 h-4" /> Link Another Microsoft Bedrock Account ({verifiedAccountsCount}/{MAX_BEDROCK_ACCOUNTS})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SUBTAB 2: CHAT (Matching PocketAFK Image 3 Pixel-Perfect!) */}
                    {activeSubTab === 'chat' && (() => {
                      const targetAccounts = assignedAccounts.length > 0 ? assignedAccounts : accounts;
                      const isFreshSmpProfile = `${activeServer.name} ${activeServer.serverHost}`.toLowerCase().includes('freshsmp');
                      const isAccountStable = (account: BedrockAccount) => {
                        if (!isFreshSmpProfile) return false;
                        const diagnostic = freshSmpDiagnostics[`${activeServer.id}__${account.id}`];
                        const sessionStartedAt = diagnostic?.lifestealSessionStartedAt;
                        return diagnostic?.phase === 'lifesteal' && typeof sessionStartedAt === 'number' &&
                          nowTick - sessionStartedAt >= 60_000;
                      };
                      const getAccountStabilityBucket = (account: BedrockAccount): 'stable' | 'unstable' | 'offline' => {
                        const botId = `${activeServer.id}__${account.id}`;
                        const state = botStates[botId] || botStates[account.id];
                        if (daemonStatus !== 'AUTHENTICATED' || !state || state === 'DISCONNECTED' || state === 'ERROR' || state === 'KICKED') return 'offline';
                        if (isFreshSmpProfile) return isAccountStable(account) ? 'stable' : 'unstable';
                        return state === 'SPAWNED' || state === 'LOGGED_IN' ? 'stable' : 'unstable';
                      };
                      const stabilityCounts = targetAccounts.reduce((counts, account) => {
                        counts[getAccountStabilityBucket(account)] += 1;
                        return counts;
                      }, { stable: 0, unstable: 0, offline: 0 });
                      const isAllSelected = selectedChatAccountId === '__ALL__';
                      const selectedAccountId = isAllSelected
                        ? '__ALL__'
                        : (targetAccounts.some((a) => a.id === selectedChatAccountId)
                          ? selectedChatAccountId
                          : targetAccounts[0]?.id || '');
                      const selectedAccount = isAllSelected ? null : (targetAccounts.find((a) => a.id === selectedAccountId) || null);
                      const selectedBotId = selectedAccount ? `${activeServer.id}__${selectedAccountId}` : '';
                      const selectedBossBar = selectedAccount ? bossBarsByBot[selectedBotId] : null;

                      const isSelectedOnline = isAllSelected
                        ? targetAccounts.some((acc) => {
                            const bId = `${activeServer.id}__${acc.id}`;
                            const st = botStates[bId] || botStates[acc.id];
                            return daemonStatus === 'AUTHENTICATED' && (st === 'SPAWNED' || st === 'LOGGED_IN');
                          })
                        : (selectedAccount ? (() => {
                            const bId = `${activeServer.id}__${selectedAccount.id}`;
                            const st = botStates[bId];
                            return daemonStatus === 'AUTHENTICATED' && (st === 'SPAWNED' || st === 'LOGGED_IN');
                          })() : false);

                      // Collect chat messages
                      let chatList: ChatMessage[] = isAllSelected
                        ? targetAccounts.flatMap((acc) => messagesByBot[`${activeServer.id}__${acc.id}`] || [])
                        : (selectedAccountId
                          ? [...(messagesByBot[`${activeServer.id}__${selectedAccountId}`] || [])]
                          : []);

                      chatList.sort((a, b) => a.timestamp - b.timestamp);

                      const recentOwnMessages = new Map<string, number>();
                      const ownNames = new Set(
                        [selectedAccount?.username, selectedAccount?.ign]
                          .filter((name): name is string => Boolean(name))
                          .map((name) => name.replace(/^_+/, '').toLowerCase())
                      );
                      if (!isAllSelected) {
                        // Remove duplicate cached rows from the older optimistic
                        // send path when the server echo arrived a moment later.
                        const seen = new Set<string>();
                        chatList = chatList.filter((m) => {
                          const key = `${m.timestamp}__${m.raw}`;
                          if (seen.has(key)) return false;
                          seen.add(key);

                          const sender = (m.sender || '').replace(/^_+/, '').toLowerCase();
                          const belongsToSelectedAccount = Boolean(
                            m.type === 'chat' &&
                            selectedAccount &&
                            m.accountUsername?.toLowerCase() === selectedAccount.username.toLowerCase() &&
                            ownNames.has(sender)
                          );
                          if (belongsToSelectedAccount) {
                            const ownMessageKey = `${sender}__${m.raw}`;
                            const previousTimestamp = recentOwnMessages.get(ownMessageKey);
                            if (previousTimestamp !== undefined && m.timestamp - previousTimestamp <= 4_000) return false;
                            recentOwnMessages.set(ownMessageKey, m.timestamp);
                          }

                          return true;
                        });
                      } else {
                        // Every bot receives its own copy of a shared server
                        // broadcast. Collapse only close-in-time matches from
                        // different accounts, retaining all receiving accounts
                        // so their skin heads can be shown beside the timestamp.
                        const accountIdByBotId = new Map(
                          targetAccounts.flatMap((account) => [
                            [`${activeServer.id}__${account.id}`, account.id] as const,
                            [account.id, account.id] as const,
                          ])
                        );
                        const groupsByFingerprint = new Map<string, ChatMessage[]>();
                        const mergedMessages: ChatMessage[] = [];

                        for (const message of chatList) {
                          const sourceAccountId = accountIdByBotId.get(message.botId);
                          if (!sourceAccountId) {
                            mergedMessages.push(message);
                            continue;
                          }

                          const content = (message.formattedText || message.raw || '')
                            .replace(/(?:§|&)x(?:(?:§|&)[0-9a-fA-F]){6}/gi, '')
                            .replace(/(?:§|&)[0-9a-zA-Z]/gi, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .toLowerCase();
                          const fingerprint = `${message.serverId || activeServer.id}|${message.type}|${(message.sender || '').toLowerCase()}|${content}`;
                          const possibleMatches = groupsByFingerprint.get(fingerprint) || [];
                          const match = possibleMatches.find((group) =>
                            Math.abs(message.timestamp - group.timestamp) <= 3000 &&
                            !(group.sourceAccountIds || []).includes(sourceAccountId)
                          );

                          if (match) {
                            match.sourceAccountIds = [...(match.sourceAccountIds || []), sourceAccountId];
                          } else {
                            const groupedMessage: ChatMessage = {
                              ...message,
                              sourceAccountIds: [sourceAccountId],
                            };
                            mergedMessages.push(groupedMessage);
                            groupsByFingerprint.set(fingerprint, [...possibleMatches, groupedMessage]);
                          }
                        }

                        chatList = mergedMessages;
                      }

                      return (
                        <div className="w-full min-w-0 flex-1 min-h-0 flex flex-col">
                          {/* 2. Main Chat Box Container (Matching Image 3) */}
                          <div className="w-full min-w-0 flex-1 min-h-0 bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs flex flex-col">
                            {/* Card Header: Shows account skin head and username (or head stack for All Accounts) */}
                              <div className="shrink-0 px-2.5 sm:px-5 py-1.5 sm:py-3 border-b border-slate-200 flex items-center justify-between gap-2 sm:gap-3 bg-slate-50/60">
                              <div className="flex-1 min-w-0 flex items-center mr-2 sm:mr-3">
                                {isAllSelected ? (
                                  <div className="mc-status-strip flex w-fit max-w-full flex-nowrap items-center gap-1 sm:gap-2" role="group" aria-label="All account status counts">
                                    <button
                                      type="button"
                                      title={`${stabilityCounts.stable} stable accounts`}
                                      aria-label={`${stabilityCounts.stable} stable accounts`}
                                      className="mc-status-pill mc-status-pill--stable"
                                    >
                                      <MinecraftStatusIcon tone="stable" />
                                      <span className="mc-status-pill-label">Stable</span>
                                      <span className="mc-status-pill-count">{stabilityCounts.stable}</span>
                                    </button>
                                    <button
                                      type="button"
                                      title={`${stabilityCounts.unstable} unstable, connecting, or in-lobby accounts`}
                                      aria-label={`${stabilityCounts.unstable} unstable, connecting, or in-lobby accounts`}
                                      className="mc-status-pill mc-status-pill--unstable"
                                    >
                                      <MinecraftStatusIcon tone="unstable" />
                                      <span className="mc-status-pill-label">Unstable</span>
                                      <span className="mc-status-pill-count">{stabilityCounts.unstable}</span>
                                    </button>
                                    <button
                                      type="button"
                                      title={`${stabilityCounts.offline} offline accounts`}
                                      aria-label={`${stabilityCounts.offline} offline accounts`}
                                      className="mc-status-pill mc-status-pill--offline"
                                    >
                                      <MinecraftStatusIcon tone="offline" />
                                      <span className="mc-status-pill-label">Offline</span>
                                      <span className="mc-status-pill-count">{stabilityCounts.offline}</span>
                                    </button>
                                  </div>
                                ) : selectedAccount ? (
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shrink-0 shadow-2xs">
                                      <img
                                        src={getPlayerSkinHeadUrl(selectedAccount.ign || selectedAccount.username, 32)}
                                        alt={selectedAccount.ign || selectedAccount.username}
                                        className="w-full h-full object-cover [image-rendering:pixelated]"
                                        onError={(e) => {
                                          const img = e.currentTarget as HTMLImageElement;
                                          if (!img.src.includes('mc-heads')) {
                                            img.src = `https://mc-heads.net/avatar/${encodeURIComponent(selectedAccount.ign || selectedAccount.username)}/32`;
                                          } else if (!img.src.includes('minotar')) {
                                            img.src = `https://minotar.net/helm/${encodeURIComponent(selectedAccount.ign || selectedAccount.username)}/32`;
                                          } else {
                                            img.src = 'https://minotar.net/helm/MHF_Steve/32.png';
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-black text-sm text-slate-900 leading-none truncate flex items-center gap-1.5">
                                        <span>{selectedAccount.ign || selectedAccount.username}</span>
                                        {selectedAccount.authError ? (
                                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-100 text-rose-700">
                                            Mismatch
                                          </span>
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        )}
                                      </h3>
                                      <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5 truncate">
                                        {isSelectedOnline ? (
                                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            In-Game
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">Offline</span>
                                        )}
                                        <span className="text-slate-300">•</span>
                                        {isFreshSmpProfile ? (
                                          <span
                                            title={isAccountStable(selectedAccount)
                                              ? 'Connected in FreshSMP Lifesteal for at least one minute'
                                              : 'Not yet confirmed in FreshSMP Lifesteal for one continuous minute'}
                                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-extrabold tracking-wide ${
                                              isAccountStable(selectedAccount)
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-rose-50 text-rose-700 border-rose-200'
                                            }`}
                                          >
                                            {isAccountStable(selectedAccount) ? 'STABLE' : 'UNSTABLE'}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">Bedrock Edition</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 font-mono font-bold text-xs shrink-0 shadow-2xs">
                                      &gt;_
                                    </div>
                                    <div>
                                      <h3 className="font-black text-sm text-slate-900 leading-none">{activeServer.name}</h3>
                                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                                        {activeServer.serverHost}:{activeServer.serverPort || 19132}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={chatAutoScroll}
                                aria-label="Automatically scroll chat to new messages"
                                onClick={() => {
                                  const nextValue = !chatAutoScroll;
                                  setChatAutoScroll(nextValue);
                                  if (typeof window !== 'undefined' && currentUser) {
                                    try {
                                      localStorage.setItem(`pebbleafk_chat_autoscroll_${currentUser.toLowerCase()}`, String(nextValue));
                                    } catch (_) {}
                                  }
                                }}
                                className={`mc-chat-scroll-toggle shrink-0 ${chatAutoScroll ? 'is-active' : 'is-inactive'}`}
                                title={chatAutoScroll ? 'Auto-scroll is on' : 'Auto-scroll is off'}
                              >
                                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>

                            {!isAllSelected && selectedBossBar?.visible && selectedBossBar.title && (
                              <div className="relative shrink-0 overflow-hidden border-b border-amber-400/60 bg-gradient-to-r from-[#26231f] via-[#30271d] to-[#25231f] px-3 py-1.5 sm:px-4 sm:py-2 shadow-inner" role="status" aria-label="AFK reward boss bar">
                                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-200/80 bg-gradient-to-b from-amber-300 to-orange-500 text-amber-950 shadow-[0_1.5px_0_#8d4f24]">
                                    <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                                  </div>
                                  <div className="shrink-0 min-w-0 truncate text-xs sm:text-[13px] font-extrabold leading-none text-[#fff8ec]">
                                    <MinecraftText text={selectedBossBar.title} palette="dark" />
                                  </div>
                                  {typeof selectedBossBar.progress === 'number' && (
                                    <>
                                      <div className="flex-1 min-w-[50px] h-2 sm:h-2.5 overflow-hidden rounded-full border border-amber-200/30 bg-[#171512] p-0.5">
                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-amber-300 shadow-[0_0_8px_rgba(163,230,53,.35)] transition-[width] duration-500" style={{ width: `${Math.round(selectedBossBar.progress * 100)}%` }} />
                                      </div>
                                      <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-300/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-black tabular-nums text-amber-200">
                                        {Math.round(selectedBossBar.progress * 100)}%
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Chat Messages Stream Area (Spacious layout matching PocketAFK) */}
                            <div ref={chatScrollContainerRef} className="flex-1 min-h-0 p-3 sm:p-5 min-w-0 overflow-y-auto overflow-x-hidden space-y-3 font-mono text-[13px] bg-white overscroll-contain touch-pan-y">
                              {chatList.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                                  <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 shadow-2xs">
                                    <MessageSquare className="w-5 h-5 text-slate-400" />
                                  </div>
                                  <p className="text-[13px] font-bold text-slate-700">No chat messages received yet.</p>
                                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                                    In-game chat and system logs will stream here in real-time.
                                  </p>
                                  <div className="pt-2">
                                    {isSelectedOnline ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Bot is currently connected
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        Bot is currently disconnected
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {chatList.map((m) => {
                                    if (m.type === 'session_divider') {
                                      return (
                                        <div key={m.id} className="flex items-center gap-3 py-2 px-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                                          <span className="h-px flex-1 bg-emerald-200" />
                                          <span>New session started</span>
                                          <RelativeTime timestamp={m.timestamp} className="normal-case tracking-normal text-slate-400" />
                                          <span className="h-px flex-1 bg-emerald-200" />
                                        </div>
                                      );
                                    }

                                    const rawOrFormatted = m.raw || m.formattedText || '';
                                    let effectiveSender = m.sender || 'Server';
                                    let effectiveMessage = m.raw || m.formattedText || '';
                                    let isPlayer = m.type === 'chat' && m.sender !== 'System' && m.sender !== 'Server';

                                    // Dynamic sender recognition for server broadcasts / FreshSMP ▶ formats
                                    if (!isPlayer) {
                                      const stripped = rawOrFormatted
                                        .replace(/(?:§|&)x(?:(?:§|&)[0-9a-fA-F]){6}/gi, '')
                                        .replace(/(?:§|&)[0-9a-zA-Z]/gi, '')
                                        .replace(/§+/g, '')
                                        .trim();
                                      const matchAngle = stripped.match(/^<([a-zA-Z0-9_]{3,16})>\s*([\s\S]*)$/);
                                      const matchSeparator = stripped.match(/^(?:\[?[a-zA-Z0-9_+\- ]+\]?\s+)?([a-zA-Z0-9_]{3,16})\s*[▶:»>]\s*([\s\S]*)$/);

                                      if (matchAngle) {
                                        effectiveSender = matchAngle[1];
                                        effectiveMessage = matchAngle[2];
                                        isPlayer = true;
                                      } else if (matchSeparator) {
                                        effectiveSender = matchSeparator[1];
                                        effectiveMessage = matchSeparator[2];
                                        isPlayer = true;
                                      }
                                    }

                                    const cleanSender = effectiveSender;
                                    const receivedByAccounts = isAllSelected
                                      ? (m.sourceAccountIds || [])
                                        .map((accountId) => targetAccounts.find((account) => account.id === accountId))
                                        .filter((account): account is BedrockAccount => Boolean(account))
                                      : [];

                                    return (
                                      <div key={m.id} className="flex items-start gap-2.5 py-1 text-[13px] hover:bg-slate-50/80 rounded-lg px-2 transition">
                                        {isPlayer ? (
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <div className="w-[18px] h-[18px] rounded-xs overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                              <img
                                                src={getPlayerSkinHeadUrl(cleanSender, 24)}
                                                alt={cleanSender}
                                                className="w-full h-full object-cover [image-rendering:pixelated]"
                                                onError={(e) => {
                                                  const img = e.currentTarget as HTMLImageElement;
                                                  if (!img.src.includes('mc-heads')) {
                                                    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(cleanSender)}/24`;
                                                  } else {
                                                    img.src = 'https://minotar.net/helm/MHF_Steve/24.png';
                                                  }
                                                }}
                                              />
                                            </div>
                                            <span className="font-bold text-emerald-700 font-mono">
                                              &lt;{cleanSender}&gt;
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/90 font-mono shrink-0">
                                            [{cleanSender}]
                                          </span>
                                        )}

                                        <div className="min-w-0 flex-1 flex flex-col">
                                          <span className="text-slate-800 break-all font-mono leading-relaxed">
                                            <MinecraftText text={effectiveMessage} />
                                          </span>
                                          <span className="mt-0.5 self-end inline-flex items-center gap-1 text-[9px] leading-3 text-slate-400 select-none font-mono shrink-0">
                                            {receivedByAccounts.map((account) => (
                                              <button
                                                type="button"
                                                key={account.id}
                                                title={`Received by @${account.ign || account.username}`}
                                                aria-label={`Received by @${account.ign || account.username}`}
                                                onClick={() => setChatSourceTooltipId((current) => current === account.id ? null : account.id)}
                                                className="relative inline-flex h-[13px] w-[13px] -translate-y-px overflow-visible rounded-[3px] border border-slate-300/80 bg-slate-100 p-0 opacity-90"
                                              >
                                                <img
                                                  src={getPlayerSkinHeadUrl(account.ign || account.username, 20)}
                                                  alt=""
                                                  className="h-full w-full object-cover [image-rendering:pixelated]"
                                                  onError={(e) => {
                                                    const img = e.currentTarget as HTMLImageElement;
                                                    const clean = (account.ign || account.username || 'Steve').replace(/^@/, '').trim();
                                                    if (!img.src.includes('mc-heads')) {
                                                      img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/20`;
                                                    } else {
                                                      img.src = 'https://minotar.net/helm/MHF_Steve/20.png';
                                                    }
                                                  }}
                                                />
                                                {chatSourceTooltipId === account.id && (
                                                  <span className="absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded-md border border-slate-200 bg-slate-900 px-1.5 py-1 text-[10px] font-medium leading-none text-white shadow-lg">
                                                    @{account.ign || account.username}
                                                  </span>
                                                )}
                                              </button>
                                            ))}
                                            <RelativeTime timestamp={m.timestamp} className="text-[9px] leading-3 text-slate-400 select-none font-mono" />
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          </div>

                          {/* 3. Bottom Chat Input Bar (Matching Image 3) */}
                          <form onSubmit={handleSendChat} className="mt-2 w-full min-w-0 shrink-0 flex items-center gap-1 sm:gap-2">
                            <div className="min-w-0 min-h-12 flex-1 flex items-center bg-white border border-slate-200/90 rounded-2xl shadow-2xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition px-2 sm:px-3.5 py-1.5 gap-1 sm:gap-2">
                              <span className="text-emerald-600 font-mono font-black text-sm select-none pl-1">&gt;</span>
                              <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                disabled={!isSelectedOnline}
                                placeholder={
                                  isSelectedOnline
                                    ? "Send a message or command (e.g. /spawn)..."
                                    : "Bot offline [connect bot to send chat messages]..."
                                }
                                className="min-w-0 flex-1 bg-transparent border-none text-base sm:text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none font-medium py-2 sm:py-1.5"
                              />
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setIsChatAccountDropdownOpen(!isChatAccountDropdownOpen)}
                                  className="flex w-[58px] sm:w-auto max-w-[154px] sm:max-w-none justify-center items-center gap-1 sm:gap-1.5 px-1 sm:px-2.5 py-2 sm:py-1 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 text-[12px] sm:text-[13px] font-bold transition cursor-pointer select-none"
                                  disabled={!selectedAccount && !isAllSelected}
                                  aria-expanded={isChatAccountDropdownOpen}
                                  aria-haspopup="listbox"
                                  aria-label={`Select chat account${isAllSelected ? ', currently All Accounts' : (selectedAccount ? `, currently @${selectedAccount.ign || selectedAccount.username}` : '')}`}
                                  title={isAllSelected ? 'Chat as All Accounts' : (selectedAccount ? `Chat as @${selectedAccount.ign || selectedAccount.username}` : 'Select chat account')}
                                >
                                  {isAllSelected ? (
                                    <>
                                      <div className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                        <Users className="w-3.5 h-3.5" />
                                      </div>
                                      <span className="hidden max-w-[82px] sm:max-w-[150px] truncate whitespace-nowrap font-mono sm:inline">All Accounts</span>
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${isSelectedOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                    </>
                                  ) : selectedAccount ? (
                                    <>
                                      <div className="w-5 h-5 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                        <img
                                          src={getPlayerSkinHeadUrl(selectedAccount.ign || selectedAccount.username, 24)}
                                          alt=""
                                          className="w-full h-full object-cover [image-rendering:pixelated]"
                                          onError={(e) => {
                                            const img = e.currentTarget as HTMLImageElement;
                                            const clean = (selectedAccount.ign || selectedAccount.username || 'Steve').replace(/^@/, '').trim();
                                            if (!img.src.includes('mc-heads')) {
                                              img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/24`;
                                            } else {
                                              img.src = 'https://minotar.net/helm/MHF_Steve/24.png';
                                            }
                                          }}
                                        />
                                      </div>
                                      <span className="hidden max-w-[82px] sm:max-w-[150px] truncate whitespace-nowrap font-mono sm:inline">@{selectedAccount.ign || selectedAccount.username}</span>
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${isSelectedOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                    </>
                                  ) : (
                                    <>
                                      <Users className="w-3.5 h-3.5 text-slate-500" />
                                      <span className="font-mono">Select account</span>
                                    </>
                                  )}
                                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isChatAccountDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isChatAccountDropdownOpen && (
                                  <div role="listbox" className="absolute bottom-full right-0 mb-2 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in duration-100">
                                    {/* All Accounts Option */}
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={isAllSelected}
                                      onClick={() => {
                                        setSelectedChatAccountId('__ALL__');
                                        setIsChatAccountDropdownOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold transition cursor-pointer border-b border-slate-100 mb-0.5 ${
                                        isAllSelected ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                          <Users className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="font-mono truncate">All Accounts</span>
                                      </div>
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                                        targetAccounts.some((a) => {
                                          const bId = `${activeServer.id}__${a.id}`;
                                          const st = botStates[bId] || botStates[a.id];
                                          return daemonStatus === 'AUTHENTICATED' && (st === 'SPAWNED' || st === 'LOGGED_IN');
                                        }) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                      }`} />
                                    </button>

                                    {targetAccounts.map((acc) => {
                                      const bId = `${activeServer.id}__${acc.id}`;
                                      const st = botStates[bId];
                                      const isLive = daemonStatus === 'AUTHENTICATED' && (st === 'SPAWNED' || st === 'LOGGED_IN');
                                      const isSel = selectedAccountId === acc.id;
                                      const isStable = isAccountStable(acc);

                                      return (
                                        <button
                                          key={acc.id}
                                          type="button"
                                          role="option"
                                          aria-selected={isSel}
                                          onClick={() => {
                                            setSelectedChatAccountId(acc.id);
                                            setIsChatAccountDropdownOpen(false);
                                          }}
                                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold transition cursor-pointer ${
                                            isFreshSmpProfile && !isStable
                                              ? (isSel ? 'bg-rose-100 text-rose-800' : 'bg-rose-50/70 text-rose-800 hover:bg-rose-100')
                                              : (isSel ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50')
                                          }`}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-5 h-5 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                              <img
                                                src={getPlayerSkinHeadUrl(acc.ign || acc.username, 24)}
                                                alt=""
                                                className="w-full h-full object-cover [image-rendering:pixelated]"
                                                onError={(e) => {
                                                  const img = e.currentTarget as HTMLImageElement;
                                                  const clean = (acc.ign || acc.username || 'Steve').replace(/^@/, '').trim();
                                                  if (!img.src.includes('mc-heads')) {
                                                    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(clean)}/24`;
                                                  } else {
                                                    img.src = 'https://minotar.net/helm/MHF_Steve/24.png';
                                                  }
                                                }}
                                              />
                                            </div>
                                            <span className="font-mono truncate">@{acc.ign || acc.username}</span>
                                          </div>
                                          {isFreshSmpProfile ? (
                                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[9px] font-extrabold tracking-wide ${
                                              isStable
                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                : 'bg-rose-100 text-rose-700 border-rose-200'
                                            }`}>
                                              {isStable ? 'STABLE' : 'UNSTABLE'}
                                            </span>
                                          ) : (
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={!isSelectedOnline || !chatInput.trim()}
                              className="w-11 h-11 sm:w-auto sm:h-auto justify-center px-0 sm:px-5 py-0 sm:py-2.5 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[13px] transition shadow-xs cursor-pointer flex items-center gap-2 shrink-0"
                              aria-label="Send chat message"
                              title="Send message"
                            >
                              <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Send</span>
                              <CornerDownLeft className="hidden sm:block w-3 h-3 text-emerald-200 select-none" />
                            </button>
                          </form>
                        </div>
                      );
                    })()}

                    {/* SUBTAB 3: SETTINGS (Matching Image 2 pixel-perfect!) */}
                    {activeSubTab === 'settings' && (
                      <div className="max-w-2xl space-y-6">
                        <div>
                          <h2 className="text-lg font-black text-slate-900 tracking-tight">Settings</h2>
                          <p className="text-xs text-slate-500">
                            Configure connection details, anti-AFK intervals, and survival automations.
                          </p>
                        </div>

                        {/* Card 1: Server Information */}
                        <div className="mc-settings-panel p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-xs">
                          <h3 className="flex items-center gap-2.5 font-bold text-sm text-slate-900">
                            <ServerLogo host={activeServer.serverHost} name={activeServer.name} size="w-7 h-7" />
                            <span>Server information</span>
                          </h3>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Profile name</label>
                            <input
                              type="text"
                              value={activeServer.name}
                              onChange={(e) => handleUpdateActiveServer({ name: e.target.value })}
                              className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600">Server IP</label>
                            <input
                              type="text"
                              value={activeServer.serverHost}
                              onChange={(e) => handleUpdateActiveServer({ serverHost: e.target.value })}
                              className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono font-medium"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600">Bedrock version</label>
                              <div className="relative">
                                <select
                                  value={activeServer.serverVersion || 'auto'}
                                  onChange={(e) => handleUpdateActiveServer({ serverVersion: e.target.value })}
                                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none"
                                >
                                  <option value="auto">Auto Detect (server ping)</option>
                                  <option value="1.26.30">1.26.30 (Bedrock 26.x)</option>
                                  <option value="1.26.51">1.26.51 (Bedrock Preview)</option>
                                  <option value="1.21.50">1.21.50 (Bedrock 1.21 Stable)</option>
                                  <option value="1.21.40">1.21.40</option>
                                  <option value="1.21.30">1.21.30</option>
                                  <option value="1.21.20">1.21.20</option>
                                  <option value="1.21.2">1.21.2</option>
                                  <option value="1.21.0">1.21.0</option>
                                  <option value="1.20.80">1.20.80</option>
                                  <option value="1.20.70">1.20.70</option>
                                  <option value="1.20.60">1.20.60</option>
                                  <option value="1.20.50">1.20.50</option>
                                  <option value="1.20.40">1.20.40</option>
                                  <option value="1.20.30">1.20.30</option>
                                  <option value="1.20.10">1.20.10</option>
                                  <option value="1.20.0">1.20.0</option>
                                </select>
                                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                                  ▼
                                </div>
                              </div>
                              {(!activeServer.serverVersion || activeServer.serverVersion === 'auto') && (
                                <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                                  ✓ Uses the server-advertised Bedrock protocol when available.
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600">Server Port</label>
                              <input
                                type="number"
                                value={activeServer.serverPort || 19132}
                                onChange={(e) => handleUpdateActiveServer({ serverPort: parseInt(e.target.value, 10) || 19132 })}
                                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono font-medium"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Extra Settings (Matching Image 2 pixel-perfect!) */}
                        <div className="mc-settings-panel p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-xs">
                          <h3 className="flex items-center gap-2.5 font-bold text-sm text-slate-900">
                            <img src="/nav/settings-repeater.png" alt="" aria-hidden="true" className="mc-settings-art" />
                            <span>Extra settings</span>
                          </h3>

                          <div className="space-y-4 divide-y divide-slate-100">
                            {/* Join delay */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex-1 pr-4">
                                <label className="text-xs font-bold text-slate-800 block">Join delay</label>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Delay before the bot connects to the server after launching.
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={300}
                                    value={activeServer.settings?.joinDelay ?? 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      handleUpdateServerSetting('joinDelay', val);
                                    }}
                                    className="w-10 bg-transparent text-xs font-mono font-bold text-slate-900 text-center focus:outline-none"
                                  />
                                  <span className="text-[11px] font-bold text-slate-400 select-none ml-1">sec</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentVal = (activeServer.settings?.joinDelay ?? 0) > 0;
                                    const newVal = currentVal ? 0 : 3;
                                    handleUpdateServerSetting('joinDelay', newVal);
                                  }}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    (activeServer.settings?.joinDelay ?? 0) > 0 ? 'bg-emerald-600' : 'bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                      (activeServer.settings?.joinDelay ?? 0) > 0 ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Optional command after each successful spawn */}
                            <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex-1 pr-4">
                                <label className="text-xs font-bold text-slate-800 block">Command on join</label>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Optional command after spawn. Applies on the next join and repeats after reconnect; leave disabled to send nothing.
                                </span>
                              </div>
                              <div className="flex w-full items-center gap-2 sm:w-auto sm:max-w-[440px]">
                                <input
                                  type="text"
                                  value={activeServer.settings?.joinCommand ?? ''}
                                  onChange={(e) => handleUpdateServerSetting('joinCommand', e.target.value)}
                                  disabled={!(activeServer.settings?.joinCommandEnabled ?? false)}
                                  placeholder="/lifesteal"
                                  aria-label="Command to run after joining"
                                  className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
                                />
                                <div className="flex shrink-0 items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-1" title="Delay after spawn">
                                  <input
                                    type="number"
                                    min={0}
                                    max={300}
                                    value={activeServer.settings?.joinCommandDelay ?? 3}
                                    onChange={(e) => {
                                      const seconds = Math.min(300, Math.max(0, parseInt(e.target.value, 10) || 0));
                                      handleUpdateServerSetting('joinCommandDelay', seconds);
                                    }}
                                    className="w-8 bg-transparent text-xs font-mono font-bold text-slate-900 text-center focus:outline-none"
                                    aria-label="Delay before running join command in seconds"
                                  />
                                  <span className="text-[11px] font-bold text-slate-400 select-none ml-1">sec</span>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={activeServer.settings?.joinCommandEnabled ?? false}
                                  aria-label="Enable command on join"
                                  onClick={() => handleUpdateServerSetting('joinCommandEnabled', !(activeServer.settings?.joinCommandEnabled ?? false))}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    activeServer.settings?.joinCommandEnabled ? 'bg-emerald-600' : 'bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                      activeServer.settings?.joinCommandEnabled ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            {activeServerIsFreshSmp && (
                              <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex-1 pr-4">
                                  <label className="text-xs font-bold text-slate-800 block">Command on subserver join</label>
                                  <span className="text-[11px] text-slate-400 block mt-0.5">
                                    Optional command after FreshSMP transfers the bot into Lifesteal. Delay starts after the subserver spawn.
                                  </span>
                                </div>
                                <div className="flex w-full items-center gap-2 sm:w-auto sm:max-w-[440px]">
                                  <input
                                    type="text"
                                    value={subserverJoinCommand}
                                    onChange={(e) => handleUpdateServerSetting('subserverJoinCommand', e.target.value)}
                                    disabled={!subserverJoinCommandEnabled}
                                    placeholder="/warp afk"
                                    aria-label="Command to run after joining a subserver"
                                    className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
                                  />
                                  <div className="flex shrink-0 items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-1" title="Delay after subserver spawn">
                                    <input
                                      type="number"
                                      min={0}
                                      max={300}
                                      value={subserverJoinCommandDelay}
                                      onChange={(e) => {
                                        const seconds = Math.min(300, Math.max(0, parseInt(e.target.value, 10) || 0));
                                        handleUpdateServerSetting('subserverJoinCommandDelay', seconds);
                                      }}
                                      className="w-8 bg-transparent text-xs font-mono font-bold text-slate-900 text-center focus:outline-none"
                                      aria-label="Delay before running subserver join command in seconds"
                                    />
                                    <span className="text-[11px] font-bold text-slate-400 select-none ml-1">sec</span>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={subserverJoinCommandEnabled}
                                    aria-label="Enable command on subserver join"
                                    onClick={() => handleUpdateServerSetting('subserverJoinCommandEnabled', !subserverJoinCommandEnabled)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${subserverJoinCommandEnabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
                                  >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${subserverJoinCommandEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {activeServerIsFreshSmp && (
                              <>
                                <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex-1 pr-4">
                                    <label className="text-xs font-bold text-slate-800 block">Scheduled command for stable accounts</label>
                                    <span className="text-[11px] text-slate-400 block mt-0.5">
                                      Runs only while an account is stable in Lifesteal, once every 5 minutes.
                                    </span>
                                  </div>
                                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                                    <code className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700">
                                      /afkrewards spin
                                    </code>
                                    <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-600">5 min</span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={stableRewardEnabled}
                                      aria-label="Enable /afkrewards spin for stable accounts"
                                      onClick={() => handleUpdateServerSetting('stableRewardEnabled', !stableRewardEnabled)}
                                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${stableRewardEnabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${stableRewardEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex-1 pr-4">
                                    <label className="text-xs font-bold text-slate-800 block">Pay main account at 10k balance</label>
                                    <span className="text-[11px] text-slate-400 block mt-0.5">
                                      Checks /bal every minute while stable. At 10k or more, waits 3 seconds, sends /pay twice with 3 seconds between.
                                    </span>
                                  </div>
                                  <div className="flex w-full items-center gap-2 sm:w-auto sm:max-w-[390px]">
                                    <input
                                      type="text"
                                      value={stablePayUsernameDraft}
                                      onChange={(event) => setStablePayUsernameDraft(event.target.value)}
                                      onBlur={() => {
                                        const username = stablePayUsernameDraft.trim().replace(/^@/, '');
                                        if (username !== (activeServer.settings?.stablePayUsername || '')) {
                                          handleUpdateServerSetting('stablePayUsername', username);
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') event.currentTarget.blur();
                                      }}
                                      placeholder="Main account username"
                                      aria-label="Main account username to receive payments"
                                      autoCapitalize="none"
                                      autoCorrect="off"
                                      spellCheck={false}
                                      className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                                    />
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={stablePayEnabled}
                                      aria-label="Enable automatic stable-account payments"
                                      title={!stablePayEnabled && !/^[A-Za-z0-9_]{3,16}$/.test(stablePayUsernameDraft.trim().replace(/^@/, '')) ? 'Enter a valid Minecraft username first' : 'Toggle automatic payments'}
                                      disabled={!stablePayEnabled && !/^[A-Za-z0-9_]{3,16}$/.test(stablePayUsernameDraft.trim().replace(/^@/, ''))}
                                      onClick={() => {
                                        const username = stablePayUsernameDraft.trim().replace(/^@/, '');
                                        handleUpdateServerSettings({ stablePayUsername: username, stablePayEnabled: !stablePayEnabled });
                                      }}
                                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${stablePayEnabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${stablePayEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Auto reconnect delay */}
                            <div className="flex items-center justify-between pt-3">
                              <div className="flex-1 pr-4">
                                <label className="text-xs font-bold text-slate-800 block">Auto reconnect delay</label>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Wait duration before attempting to reconnect after being disconnected or kicked.
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                                  <input
                                    type="number"
                                    min={1}
                                    max={300}
                                    value={Math.round((activeServer.settings?.autoReconnectDelay || 5000) / 1000)}
                                    onChange={(e) => {
                                      const sec = Math.max(1, parseInt(e.target.value, 10) || 5);
                                      const ms = sec * 1000;
                                      handleUpdateServerSetting('autoReconnectDelay', ms);
                                    }}
                                    className="w-10 bg-transparent text-xs font-mono font-bold text-slate-900 text-center focus:outline-none"
                                  />
                                  <span className="text-[11px] font-bold text-slate-400 select-none ml-1">sec</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const isEnabled = activeServer.autoReconnect ?? activeServer.settings?.autoReconnect ?? true;
                                    handleUpdateServerSetting('autoReconnect', !isEnabled);
                                    handleUpdateActiveServer({ autoReconnect: !isEnabled });
                                  }}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    (activeServer.autoReconnect ?? activeServer.settings?.autoReconnect ?? true)
                                      ? 'bg-emerald-600'
                                      : 'bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                      (activeServer.autoReconnect ?? activeServer.settings?.autoReconnect ?? true)
                                        ? 'translate-x-5'
                                        : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card 3: Dangerous Settings (Matching Image 2 pixel-perfect!) */}
                        <div className="mc-settings-panel p-5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                          <div>
                            <h3 className="flex items-center gap-2.5 font-bold text-sm text-slate-900">
                              <img src="/nav/diagnostics-heart.png" alt="" aria-hidden="true" className="mc-settings-art" />
                              <span>Dangerous settings</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Settings for this server profile that are easy to get wrong and hard to undo.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsDangerousSettingsOpen(true)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer shadow-2xs shrink-0"
                          >
                            Manage dangerous settings
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modern In-App Confirm Unlink Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingAccount)}
        title="Unlink Bedrock Account"
        message={`Are you sure you want to unlink @${deletingAccount?.ign || deletingAccount?.username}? This will remove it from PebbleAFK and Termux.`}
        confirmText="Unlink Account"
        cancelText="Cancel"
        isDestructive
        onConfirm={async () => {
          if (deletingAccount) {
            await handleDeleteAccount(deletingAccount.id);
          }
          setDeletingAccount(null);
        }}
        onCancel={() => setDeletingAccount(null)}
      />

      {/* Microsoft OAuth Device Code Modal (Exact same as PocketAFK) */}
      {msAuthData && (
        <MicrosoftAuthModal
          authData={msAuthData}
          accountEmail={msAuthData.targetEmail}
          onClose={() => {
            setMsAuthData(null);
            microsoftSignInWindowRef.current?.close();
            microsoftSignInWindowRef.current = null;
            pendingMicrosoftSignInUrlRef.current = null;
            if (microsoftSignOutTimerRef.current) {
              clearTimeout(microsoftSignOutTimerRef.current);
              microsoftSignOutTimerRef.current = null;
            }
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
        onUpdateDaemon={updateDaemon}
        onShutdownDaemon={shutdownDaemon}
        isDaemonOnline={daemonStatus === 'AUTHENTICATED'}
      />

      {/* Termux Live Console & Output Stream Modal */}
      <TermuxConsoleModal
        isOpen={isTermuxConsoleOpen}
        onClose={() => setIsTermuxConsoleOpen(false)}
        logs={terminalLogs}
        isOnline={daemonStatus === 'AUTHENTICATED'}
        onFetchLogs={fetchTerminalLogs}
        onClearLogs={clearTerminalLogs}
        onRestartDaemon={restartDaemon}
        onUpdateDaemon={updateDaemon}
        termuxCommand={termux1ClickCmd}
      />

      {/* Bedrock Server Profile Modal (Create / Edit) */}
      <ServerProfileModal
        isOpen={isServerModalOpen}
        onClose={() => {
          setIsServerModalOpen(false);
          setEditingServer(null);
        }}
        serverProfiles={servers}
        initialProfile={editingServer}
        currentUser={currentUser}
        onSaveProfile={handleSaveServer}
        onDeleteProfile={handleDeleteServer}
      />

      {/* Dangerous Settings Modal (Physics, Resource Packs, Delete Server) */}
      <DangerousSettingsModal
        isOpen={isDangerousSettingsOpen}
        onClose={() => setIsDangerousSettingsOpen(false)}
        server={activeServer}
        onToggleSetting={handleUpdateServerSetting}
        onDeleteServer={handleDeleteServer}
      />

      {/* Account Logs Modal (Audit logs, connection attempts, kicks, errors) */}
      <AccountLogsModal
        isOpen={isAccountLogsOpen}
        onClose={() => {
          setIsAccountLogsOpen(false);
          setSelectedLogsAccount(null);
        }}
        account={selectedLogsAccount}
        serverHost={activeServer?.serverHost}
        logs={
          selectedLogsAccount
            ? accountLogsMap[
                (
                  selectedLogsAccount.ign ||
                  selectedLogsAccount.expectedIgn ||
                  selectedLogsAccount.username ||
                  ''
                )
                  .replace(/^@/, '')
                  .trim()
              ] || []
            : []
        }
        onClearLogs={handleClearAccountLogs}
        isLiveConnected={Boolean(
          selectedLogsAccount &&
            activeServer &&
            (botStates[`${activeServer.id}__${selectedLogsAccount.id}`] === 'SPAWNED' ||
              botStates[`${activeServer.id}__${selectedLogsAccount.id}`] === 'LOGGED_IN' ||
              botStates[selectedLogsAccount.id] === 'SPAWNED' ||
              botStates[selectedLogsAccount.id] === 'LOGGED_IN')
        )}
      />
    </div>
  );
}
