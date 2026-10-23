'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Shield,
  Users,
  Key,
  RefreshCw,
  MessageSquare,
  Trash2,
  Edit3,
  Check,
  X,
  ExternalLink,
  Lock,
  Server,
  Activity,
  Clock,
  Sparkles,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Power,
  Copy,
  ArrowRight,
  ChevronDown,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Filter,
  Radio,
  Wifi,
  WifiOff,
  Smartphone,
  Globe,
  BarChart3,
  LogOut,
  UserCheck,
  UserX,
  Menu,
} from 'lucide-react';
import { MinecraftChatMessage } from '@/components/MinecraftChatMessage';
import { FreshSmpDiagnosticState } from '@/types';

interface UserItem {
  id: string;
  username: string;
  accountCount: number;
  connectedCount: number;
  secretCode?: string;
  createdAt: string;
  tunnelUrl?: string;
  isTunnelActive?: boolean;
  daemonReachable?: boolean;
  daemonProbeAt?: number;
}

interface AdminTunnelItem {
  username: string;
  url: string;
  token?: string;
  updatedAt: number;
  isRecent: boolean;
  activeBots: number;
  daemonReachable?: boolean;
  probeAt?: number;
  authError?: string;
}

interface AccountItem {
  id: string;
  botId: string;
  serverId?: string;
  owner: string;
  ign: string;
  serverHost: string;
  serverPort: number;
  serverName?: string;
  isConnected: boolean;
  connectedAt?: number;
  runtimeState?: string;
  runtimeReason?: string;
  runtimeHost?: string;
  runtimePort?: number;
  runtimeUpdatedAt?: number;
  updatedAt?: string;
  createdAt?: string;
  settings?: any;
  daemonUrl?: string;
  registeredTunnel?: string;
  legitimacy?: {
    status: 'legit' | 'leak' | 'unverified' | 'offline';
    badge: string;
    description: string;
    isLegit: boolean;
  };
}

interface AdminStats {
  totalUsers: number;
  totalAccounts: number;
  totalConnected: number;
  totalTunnels?: number;
}

export default function ChiefAdminPage() {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalAccounts: 0,
    totalConnected: 0,
    totalTunnels: 0,
  });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [tunnels, setTunnels] = useState<AdminTunnelItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const fetchInFlightRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'accounts'>('accounts');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Search & Filter States
  const [userSearch, setUserSearch] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'online' | 'offline' | 'legit' | 'suspicious'>('online');
  const [accountUserFilter, setAccountUserFilter] = useState<string>('all');
  const [accountSortBy, setAccountSortBy] = useState<'username-asc' | 'username-desc' | 'online-first' | 'uptime' | 'recent'>('username-asc');

  // System Config States
  const [isRegistrationsPaused, setIsRegistrationsPaused] = useState<boolean>(false);
  const [isTogglingRegistrations, setIsTogglingRegistrations] = useState<boolean>(false);

  // Modal States
  const [resetPasswordUser, setResetPasswordUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(false);

  const [isCreateUserOpen, setIsCreateUserOpen] = useState<boolean>(false);
  const [createUsername, setCreateUsername] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'user' | 'account'; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Live timer for uptimes
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live Chat Map for Connected Bots: key -> array of up to 25 ChatMessage items
  const [liveChats, setLiveChats] = useState<Record<string, Array<{ text: string; raw?: string; message?: string; formatted?: string; formattedText?: string; sender?: string; id?: string; type?: string; timestamp: number }>>>({});
  const [freshSmpDiagnostics, setFreshSmpDiagnostics] = useState<Record<string, FreshSmpDiagnosticState>>({});
  const [freshSmpBossbarSince, setFreshSmpBossbarSince] = useState<Record<string, number>>({});
  const [daemonConnections, setDaemonConnections] = useState<Record<string, { state: 'connecting' | 'authenticating' | 'connected' | 'offline' | 'auth-error'; lastSeenAt?: number; error?: string }>>({});
  const daemonSocketsRef = useRef<Map<string, WebSocket>>(new Map());
  const desiredDaemonsRef = useRef<Map<string, { url: string; owner: string; secret?: string }>>(new Map());
  const daemonRetryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const daemonRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  const adminMonitorSessionIdsRef = useRef<Record<string, string>>({});
  const connectDaemonRef = useRef<((info: { url: string; owner: string; secret?: string }) => void) | null>(null);

  const getAdminMonitorSessionId = (owner: string) => {
    const ownerKey = owner.trim().toLowerCase();
    if (adminMonitorSessionIdsRef.current[ownerKey]) return adminMonitorSessionIdsRef.current[ownerKey];
    const storageKey = `pebbleafk_admin_monitor_session_${ownerKey}`;
    let sessionId = '';
    try {
      sessionId = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || '';
    } catch {}
    if (!sessionId) {
      sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
    try { localStorage.setItem(storageKey, sessionId); } catch {
      try { sessionStorage.setItem(storageKey, sessionId); } catch {}
    }
    adminMonitorSessionIdsRef.current[ownerKey] = sessionId;
    return sessionId;
  };

  // Keep one authenticated, reconnecting admin socket per daemon. All bot and
  // chat updates are keyed by the exact daemon bot ID (server profile + account).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Build user -> secret map
    const userSecretMap = new Map<string, string>();
    users.forEach((u) => {
      if (u.secretCode) {
        userSecretMap.set(u.username.toLowerCase(), u.secretCode);
      }
    });

    // Collect ALL live tunnels from registered tunnels list + accounts
    const targetTunnels = new Map<string, { url: string; owner: string; secret?: string }>();

    tunnels.forEach((t) => {
      const url = (t.url || '').trim().replace(/\/+$/, '');
      const owner = (t.username || '').trim().toLowerCase();
      if (url && (url.startsWith('ws://') || url.startsWith('wss://'))) {
        targetTunnels.set(url, {
          url,
          owner,
          secret: t.token || userSecretMap.get(owner) || '',
        });
      }
    });

    accounts.forEach((a) => {
      const url = (a.daemonUrl || a.registeredTunnel || '').trim().replace(/\/+$/, '');
      const owner = (a.owner || '').trim().toLowerCase();
      if (url && (url.startsWith('ws://') || url.startsWith('wss://'))) {
        if (!targetTunnels.has(url)) {
          targetTunnels.set(url, {
            url,
            owner,
            secret: userSecretMap.get(owner) || '',
          });
        }
      }
    });

    desiredDaemonsRef.current = targetTunnels;

    // Close sockets and cancel retries for tunnels that were removed.
    daemonSocketsRef.current.forEach((ws, url) => {
      if (!targetTunnels.has(url)) {
        try { ws.close(); } catch {}
        daemonSocketsRef.current.delete(url);
        const retry = daemonRetryTimersRef.current.get(url);
        if (retry) clearTimeout(retry);
        daemonRetryTimersRef.current.delete(url);
        daemonRetryAttemptsRef.current.delete(url);
      }
    });
    daemonRetryTimersRef.current.forEach((retry, url) => {
      if (!targetTunnels.has(url)) {
        clearTimeout(retry);
        daemonRetryTimersRef.current.delete(url);
      }
    });

    const connectDaemon = (info: { url: string; owner: string; secret?: string }) => {
      const { url } = info;
      if (!desiredDaemonsRef.current.has(url)) return;
      const pendingRetry = daemonRetryTimersRef.current.get(url);
      if (pendingRetry) {
        clearTimeout(pendingRetry);
        daemonRetryTimersRef.current.delete(url);
      }
      const existing = daemonSocketsRef.current.get(url);
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        const ws = new WebSocket(url);
        daemonSocketsRef.current.set(url, ws);
        let pingTimer: NodeJS.Timeout | null = null;
        let authTimer: ReturnType<typeof setTimeout> | null = null;
        let hasSynced = false;
        let authFailed = false;
        setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'connecting' } }));

        ws.onopen = () => {
          if (daemonSocketsRef.current.get(url) !== ws || !desiredDaemonsRef.current.has(url)) {
            try { ws.close(); } catch {}
            return;
          }
          setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'authenticating' } }));
          ws.send(JSON.stringify({
            type: 'AUTH',
            payload: {
              username: info.owner,
              token: info.secret || '',
              sessionId: getAdminMonitorSessionId(info.owner),
              clientType: 'admin-monitor',
            }
          }));
          authTimer = setTimeout(() => {
            if (daemonSocketsRef.current.get(url) !== ws) return;
            authFailed = true;
            setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'auth-error', error: 'Daemon did not confirm authentication.' } }));
            try { ws.close(); } catch {}
          }, 8000);

          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: 'PING' })); } catch {}
            }
          }, 10000);
        };

        ws.onmessage = (event) => {
          if (daemonSocketsRef.current.get(url) !== ws) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'AUTH_RESULT') {
              if (authTimer) clearTimeout(authTimer);
              if (data.payload?.success) {
                daemonRetryAttemptsRef.current.delete(url);
                setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'connected', lastSeenAt: Date.now() } }));
                if (!hasSynced && ws.readyState === WebSocket.OPEN) {
                  hasSynced = true;
                  ws.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
                }
              } else {
                authFailed = true;
                setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'auth-error', error: data.payload?.message || 'Daemon authentication failed.' } }));
                try { ws.close(); } catch {}
              }
            } else if (data.type === 'PONG') {
              setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'connected', lastSeenAt: Date.now() } }));
            } else if (data.type === 'BOT_STATE') {
              const p = data.payload;
              const accountId = String(p.accountId || '').toLowerCase().trim();
              const serverId = String(p.serverId || '').toLowerCase().trim();
              const reportedBotId = String(p.botId || (p.serverId && p.accountId ? `${p.serverId}__${p.accountId}` : '')).trim();
              if (!reportedBotId) return;
              const botId = reportedBotId.toLowerCase();
              const runtimeState = String(p.state || 'UNKNOWN').toUpperCase();
              const isOnline = runtimeState === 'SPAWNED' || runtimeState === 'LOGGED_IN';

              setAccounts((prev) => {
                let matched = false;
                const next = prev.map((acc) => {
                  const matchOwner = acc.owner.toLowerCase().trim() === info.owner.toLowerCase().trim();
                  const accountMatches = Boolean(accountId) && (acc.id.toLowerCase() === accountId.replace(/^acc_/, '') || `acc_${acc.id}`.toLowerCase() === accountId);
                  const exactBot = (acc.botId || '').toLowerCase() === botId;
                  const exactServerAccount = accountMatches && (!serverId || !acc.serverId || acc.serverId.toLowerCase() === serverId);
                  if (matchOwner && (exactBot || exactServerAccount)) {
                    matched = true;
                    return {
                      ...acc,
                      isConnected: isOnline,
                      botId: reportedBotId,
                      serverId: p.serverId || acc.serverId,
                      runtimeState,
                      runtimeReason: p.reason,
                      runtimeHost: p.host,
                      runtimePort: p.port,
                      runtimeUpdatedAt: Date.now(),
                      daemonUrl: url,
                      connectedAt: isOnline ? (Number(p.connectedAt) || acc.connectedAt || Date.now()) : undefined,
                      legitimacy: {
                        status: isOnline ? ('legit' as const) : ('offline' as const),
                        badge: isOnline ? 'Verified Legit Owner' : 'Standby / Offline',
                        description: isOnline
                          ? `Live ${runtimeState.toLowerCase()} state confirmed by @${acc.owner}'s daemon.`
                          : p.reason || `Bot is ${runtimeState.toLowerCase()} on @${acc.owner}'s daemon.`,
                        isLegit: true,
                      },
                    };
                  }
                  return acc;
                });

                // Keep unconfigured daemon bots visible, but never attach them
                // to an unrelated account just because the owner matches.
                if (!matched) {
                  const syntheticId = `runtime:${info.owner}:${botId}`;
                  const synthetic: AccountItem = {
                    id: syntheticId,
                    botId: reportedBotId,
                    serverId: p.serverId,
                    owner: info.owner,
                    ign: p.username || botId,
                    serverHost: p.host || 'Unknown server',
                    serverPort: Number(p.port) || 19132,
                    serverName: p.serverId || 'Unconfigured bot',
                    isConnected: isOnline,
                    connectedAt: isOnline ? (Number(p.connectedAt) || Date.now()) : undefined,
                    runtimeState,
                    runtimeReason: p.reason,
                    runtimeHost: p.host,
                    runtimePort: p.port,
                    runtimeUpdatedAt: Date.now(),
                    daemonUrl: url,
                    registeredTunnel: url,
                    legitimacy: { status: 'legit', badge: 'Live Daemon Bot', description: `Reported by @${info.owner}'s Termux daemon.`, isLegit: true },
                  };
                  const existingIndex = next.findIndex((item) => item.id === syntheticId);
                  if (existingIndex >= 0) next[existingIndex] = synthetic;
                  else next.push(synthetic);
                }

                return next;
              });
            } else if (data.type === 'FRESHSMP_DIAGNOSTICS') {
              const diagnostic = data.payload as FreshSmpDiagnosticState | undefined;
              if (diagnostic?.botId) {
                const diagnosticKey = `${info.owner.toLowerCase()}::${diagnostic.botId.toLowerCase()}`;
                setFreshSmpDiagnostics((prev) => ({ ...prev, [diagnosticKey]: diagnostic }));
              }
            } else if (data.type === 'BOSS_BAR') {
              const bossBar = data.payload;
              if (bossBar?.botId) {
                const botId = String(bossBar.botId).toLowerCase();
                const bossBarKey = `${info.owner.toLowerCase()}::${botId}`;
                const title = String(bossBar.title || '').replace(/§[0-9a-fk-or]/gi, '');
                const confirmsAfkZone = Boolean(bossBar.visible && /\b(?:afk|reward)\b/i.test(title));
                setFreshSmpBossbarSince((prev) => {
                  if (confirmsAfkZone) return prev[bossBarKey] ? prev : { ...prev, [bossBarKey]: Date.now() };
                  if (!prev[bossBarKey]) return prev;
                  const next = { ...prev };
                  delete next[bossBarKey];
                  return next;
                });
              }
            } else if (data.type === 'CHAT_MESSAGE') {
              const msg = data.payload;
              let botKey = String(msg.botId || '').toLowerCase().trim();
              if (!botKey && msg.serverId && msg.accountUsername) {
                const exactFallback = accounts.filter((acc) =>
                  acc.owner.toLowerCase() === info.owner.toLowerCase() &&
                  acc.serverId?.toLowerCase() === String(msg.serverId).toLowerCase() &&
                  acc.ign.replace(/^@/, '').toLowerCase() === String(msg.accountUsername).replace(/^@/, '').toLowerCase()
                );
                if (exactFallback.length === 1) botKey = (exactFallback[0].botId || '').toLowerCase();
              }
              if (!botKey) return;
              const chatKey = `${info.owner.toLowerCase()}::${botKey}`;
              const entry = {
                id: msg.id || `${Date.now()}-${Math.random()}`,
                text: msg.raw || msg.text || msg.message || '',
                raw: msg.raw || msg.text || msg.message || '',
                message: msg.raw || msg.text || msg.message || '',
                formatted: msg.formattedText || msg.formatted || msg.raw || '',
                formattedText: msg.formattedText || msg.formatted || msg.raw || '',
                sender: msg.sender || msg.accountUsername || '',
                type: msg.type || 'chat',
                timestamp: msg.timestamp || Date.now(),
              };

              setLiveChats((prev) => {
                const next = { ...prev };
                const existing = next[chatKey] || [];
                if (existing.some((item) => item.id === entry.id)) return prev;
                next[chatKey] = [...existing.slice(-24), entry];
                return next;
              });
            }
          } catch {}
        };

        ws.onclose = () => {
          if (pingTimer) clearInterval(pingTimer);
          if (authTimer) clearTimeout(authTimer);
          if (daemonSocketsRef.current.get(url) !== ws) return;
          daemonSocketsRef.current.delete(url);
          setDaemonConnections((prev) => ({ ...prev, [url]: authFailed ? { state: 'auth-error', error: prev[url]?.error || 'Daemon authentication failed.' } : { state: 'offline' } }));
          setAccounts((prev) => prev.map((acc) => acc.owner.toLowerCase() === info.owner.toLowerCase() && acc.daemonUrl === url
            ? { ...acc, isConnected: false, connectedAt: undefined, runtimeState: 'UNKNOWN', runtimeReason: 'Daemon connection lost; waiting for the next live sync.' }
            : acc));
          if (!authFailed && desiredDaemonsRef.current.has(url) && !daemonRetryTimersRef.current.has(url)) {
            const attempt = daemonRetryAttemptsRef.current.get(url) || 0;
            daemonRetryAttemptsRef.current.set(url, attempt + 1);
            const delay = Math.min(30_000, 2_000 * (2 ** Math.min(attempt, 4)));
            const retry = setTimeout(() => {
              daemonRetryTimersRef.current.delete(url);
              const latestInfo = desiredDaemonsRef.current.get(url);
              if (latestInfo) connectDaemonRef.current?.(latestInfo);
            }, delay);
            daemonRetryTimersRef.current.set(url, retry);
          }
        };

        ws.onerror = () => {
          if (daemonSocketsRef.current.get(url) === ws) {
            try { ws.close(); } catch {}
          }
        };
      } catch {
        setDaemonConnections((prev) => ({ ...prev, [url]: { state: 'offline' } }));
      }
    };

    connectDaemonRef.current = connectDaemon;
    targetTunnels.forEach((info) => connectDaemon(info));
  }, [accounts, users, tunnels]);

  useEffect(() => {
    return () => {
      desiredDaemonsRef.current.clear();
      daemonSocketsRef.current.forEach((ws) => {
        try { ws.close(); } catch {}
      });
      daemonSocketsRef.current.clear();
      daemonRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
      daemonRetryTimersRef.current.clear();
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  // Fetch all admin data
  const fetchData = useCallback(async (isSilent = false) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load admin data (${res.status})`);
      }
      const data = await res.json();
      setStats(data.stats || {
        totalUsers: 0,
        totalAccounts: 0,
        totalConnected: 0,
        totalTunnels: 0,
      });
      setUsers(data.users || []);
      setAccounts(data.accounts || []);
      setTunnels(data.tunnels || []);
      if (data.isRegistrationsPaused !== undefined) {
        setIsRegistrationsPaused(Boolean(data.isRegistrationsPaused));
      }
    } catch (err: any) {
      showToast(err.message || 'Error fetching data', 'error');
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
    const refreshTimer = setInterval(() => fetchData(true), 30_000);
    return () => clearInterval(refreshTimer);
  }, [fetchData]);

  // Handle Toggle Registrations (Pause / Resume)
  const handleToggleRegistrations = async () => {
    setIsTogglingRegistrations(true);
    try {
      const nextPaused = !isRegistrationsPaused;
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_registrations', paused: nextPaused }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle registrations');

      setIsRegistrationsPaused(data.isRegistrationsPaused ?? nextPaused);
      showToast(data.message || (nextPaused ? 'Registrations paused' : 'Registrations resumed'), nextPaused ? 'info' : 'success');
    } catch (err: any) {
      showToast(err.message || 'Error toggling registrations', 'error');
    } finally {
      setIsTogglingRegistrations(false);
    }
  };

  // Handle Reset Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPassword) return;
    setIsResettingPassword(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          username: resetPasswordUser.username,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      showToast(`Password for @${resetPasswordUser.username} successfully updated!`, 'success');
      setResetPasswordUser(null);
      setNewPassword('');
      fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Handle Create User
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername || !createPassword) return;
    setIsCreatingUser(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_user',
          username: createUsername,
          password: createPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      showToast(`User @${createUsername} registered successfully!`, 'success');
      setIsCreateUserOpen(false);
      setCreateUsername('');
      setCreatePassword('');
      fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'user') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_user', username: deleteTarget.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete user');
        showToast(`User @${deleteTarget.name} deleted.`, 'success');
      } else {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_account', accountId: deleteTarget.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete account');
        showToast(`Account ${deleteTarget.name} deleted.`, 'success');
      }
      setDeleteTarget(null);
      fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Disconnect Account
  const handleDisconnectAccount = async (accountId: string, ign: string, botId: string) => {
    // 1. Immediately send STOP_BOT via any connected daemon WebSockets
    try {
      daemonSocketsRef.current.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'STOP_BOT',
            payload: { botId, id: botId, username: ign }
          }));
        }
      });
    } catch {}

    // 2. Call admin API to update Supabase and send backend STOP_BOT
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect_account', accountId, ign, botId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect account');

      showToast(`Disconnected ${ign} from server.`, 'success');
      fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.secretCode && u.secretCode.toLowerCase().includes(userSearch.toLowerCase()));
      return matchSearch;
    });
  }, [users, userSearch]);

  // Dynamically counted connected bots
  const liveConnectedBots = useMemo(() => {
    return accounts.filter((a) => a.isConnected);
  }, [accounts]);

  // Unique Users List for Filtering
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.owner) set.add(a.owner.toLowerCase().trim());
    });
    return Array.from(set).sort();
  }, [accounts]);

  // Deduplicate only identical deployments; one account assigned to two server
  // profiles must remain visible as two distinct bot deployments.
  const filteredAccounts = useMemo(() => {
    const dedupeMap = new Map<string, AccountItem>();
    accounts.forEach((a) => {
      const key = `${a.owner.toLowerCase().trim()}::${(a.botId || `${a.serverId || 'unassigned'}__${a.id}`).toLowerCase()}`;
      dedupeMap.set(key, a);
    });

    return Array.from(dedupeMap.values())
      .filter((a) => {
        const q = accountSearch.toLowerCase().trim();
        const matchSearch =
          !q ||
          a.ign.toLowerCase().includes(q) ||
          a.owner.toLowerCase().includes(q) ||
          a.serverHost.toLowerCase().includes(q) ||
          (a.serverName && a.serverName.toLowerCase().includes(q)) ||
          (a.daemonUrl && a.daemonUrl.toLowerCase().includes(q)) ||
          (a.registeredTunnel && a.registeredTunnel.toLowerCase().includes(q)) ||
          (a.legitimacy?.badge && a.legitimacy.badge.toLowerCase().includes(q));

        let matchStatus = true;
        if (accountStatusFilter === 'online') {
          matchStatus = a.isConnected;
        } else if (accountStatusFilter === 'offline') {
          matchStatus = !a.isConnected;
        } else if (accountStatusFilter === 'legit') {
          matchStatus = a.isConnected && a.legitimacy?.status === 'legit';
        } else if (accountStatusFilter === 'suspicious') {
          matchStatus = a.isConnected && a.legitimacy?.status !== 'legit';
        }

        let matchUser = true;
        if (accountUserFilter !== 'all') {
          matchUser = a.owner.toLowerCase().trim() === accountUserFilter.toLowerCase().trim();
        }

        return matchSearch && matchStatus && matchUser;
      })
      .sort((a, b) => {
        if (accountSortBy === 'username-asc') {
          return a.ign.localeCompare(b.ign);
        }
        if (accountSortBy === 'username-desc') {
          return b.ign.localeCompare(a.ign);
        }
        if (accountSortBy === 'uptime') {
          const aUptime = a.isConnected && a.connectedAt ? nowTick - a.connectedAt : 0;
          const bUptime = b.isConnected && b.connectedAt ? nowTick - b.connectedAt : 0;
          return bUptime - aUptime;
        }
        if (accountSortBy === 'recent') {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        }
        // 'online-first' default
        if (a.isConnected && !b.isConnected) return -1;
        if (!a.isConnected && b.isConnected) return 1;
        return a.ign.localeCompare(b.ign);
      });
  }, [accounts, accountSearch, accountStatusFilter, accountUserFilter, accountSortBy, nowTick]);

  // Categorize accounts first by User, then by Server
  interface ServerGroup {
    serverKey: string;
    serverName: string;
    serverHost: string;
    serverPort: number;
    accounts: AccountItem[];
    connectedCount: number;
  }

  interface UserGroup {
    owner: string;
    totalAccounts: number;
    connectedCount: number;
    tunnelUrl?: string;
    isTunnelActive?: boolean;
    daemonState?: string;
    servers: ServerGroup[];
  }

  const groupedAccounts = useMemo(() => {
    const userMap = new Map<string, Map<string, AccountItem[]>>();

    filteredAccounts.forEach((acc) => {
      const owner = acc.owner.trim();
      let serverMap = userMap.get(owner);
      if (!serverMap) {
        serverMap = new Map<string, AccountItem[]>();
        userMap.set(owner, serverMap);
      }

      const sKey = acc.serverId || `${acc.serverHost}:${acc.serverPort}`;
      let list = serverMap.get(sKey);
      if (!list) {
        list = [];
        serverMap.set(sKey, list);
      }
      list.push(acc);
    });

    const groups: UserGroup[] = [];

    userMap.forEach((serverMap, owner) => {
      const userItem = users.find((u) => u.username.toLowerCase() === owner.toLowerCase());
      const tunnel = tunnels.find((t) => t.username.toLowerCase() === owner.toLowerCase());
      const tunnelUrl = userItem?.tunnelUrl || tunnel?.url;
      const liveSocketState = tunnel?.url ? daemonConnections[tunnel.url]?.state : undefined;
      const isTunnelActive = liveSocketState === 'connected' || (liveSocketState === undefined && (tunnel?.daemonReachable || userItem?.daemonReachable));
      const daemonState = liveSocketState || (tunnel?.daemonReachable || userItem?.daemonReachable ? 'probe-live' : userItem?.isTunnelActive ? 'heartbeat-only' : 'offline');

      const servers: ServerGroup[] = [];

      serverMap.forEach((accList, sKey) => {
        const first = accList[0];
        const connectedCount = accList.filter((a) => a.isConnected).length;

        const displayName = first?.serverName || (first?.serverHost ? `${first.serverHost}:${first.serverPort}` : 'Bedrock Server');

        servers.push({
          serverKey: sKey,
          serverName: displayName,
          serverHost: first?.serverHost || 'play.cubecraft.net',
          serverPort: first?.serverPort || 19132,
          accounts: accList,
          connectedCount,
        });
      });

      // Sort servers by name/host
      servers.sort((a, b) => a.serverName.localeCompare(b.serverName));
      const ownerDeployments = Array.from(serverMap.values()).flat();
      const userTotal = new Set(ownerDeployments.map((a) => a.id)).size;
      const userConnected = new Set(ownerDeployments.filter((a) => a.isConnected).map((a) => a.id)).size;

      groups.push({
        owner,
        totalAccounts: userTotal,
        connectedCount: userConnected,
        tunnelUrl,
        isTunnelActive,
        daemonState,
        servers,
      });
    });

    // Sort user groups according to accountSortBy
    if (accountSortBy === 'username-desc') {
      groups.sort((a, b) => b.owner.localeCompare(a.owner));
    } else {
      groups.sort((a, b) => a.owner.localeCompare(b.owner));
    }

    return groups;
  }, [filteredAccounts, users, tunnels, accountSortBy, daemonConnections]);

    // Format seconds into uptime
  const formatUptime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  const hostStats = useMemo(() => {
    const map = new Map<string, { total: number; online: number }>();
    accounts.forEach((acc) => {
      const host = (acc.serverHost || 'Unknown Server').toLowerCase().trim();
      const curr = map.get(host) || { total: 0, online: 0 };
      curr.total += 1;
      if (acc.isConnected) curr.online += 1;
      map.set(host, curr);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [accounts]);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans flex flex-col md:flex-row pb-16 md:pb-0">
      {/* MOBILE TOP BAR */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-black text-xs shadow-xs ring-1 ring-emerald-500/30">
            ⛏
          </div>
          <div>
            <span className="font-black text-sm text-slate-900 tracking-tight">PebbleAFK</span>
            <span className="text-[10px] text-emerald-700 font-mono font-bold block leading-none">CHIEF ADMIN</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateUserOpen(true)}
            className="p-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs active:scale-95"
            title="Add User"
          >
            <UserPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex flex-col pt-14">
          <div className="bg-white p-4 border-b border-slate-200 space-y-3 shadow-xl">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Admin Sections
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setActiveTab('stats');
                  setMobileMenuOpen(false);
                }}
                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-bold border transition ${
                  activeTab === 'stats'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Stats</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('users');
                  setMobileMenuOpen(false);
                }}
                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-bold border transition ${
                  activeTab === 'users'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Users ({users.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('accounts');
                  setMobileMenuOpen(false);
                }}
                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-bold border transition ${
                  activeTab === 'accounts'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Server className="w-4 h-4 text-emerald-600" />
                <span>Accounts ({accounts.length})</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Chief Administrator</span>
              <Link href="/" className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
                <span>Exit to Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* LEFT SIDEBAR (Desktop) */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 shadow-2xs z-20 md:sticky md:top-0 md:h-screen">
        {/* Logo Bar */}
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-left group hover:opacity-90 transition cursor-pointer"
            title="Return to PebbleAFK Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 border border-emerald-400 text-white flex items-center justify-center font-black text-sm shadow-xs ring-2 ring-emerald-500/20 group-hover:scale-105 transition-transform">
              ⛏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-slate-900 tracking-tight group-hover:text-emerald-700 transition-colors">
                  PebbleAFK
                </span>
                <span className="w-2 h-2 rounded-full ring-2 bg-emerald-500 ring-emerald-500/30 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-700 font-mono font-bold uppercase tracking-wider">Chief Admin</span>
                <span className="text-slate-300">•</span>
                <span className="text-[10px] text-slate-400 font-mono">Bedrock Core</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Sidebar Navigation */}
        <div className="p-3 space-y-1.5 flex-1 overflow-y-auto">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1">
            Admin Sections
          </div>

          {/* Tab 1: Total Stats */}
          <button
            onClick={() => setActiveTab('stats')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1 rounded-lg ${activeTab === 'stats' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <span>Total Stats</span>
            </div>
            {liveConnectedBots.length > 0 ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                Overview
              </span>
            )}
          </button>

          {/* Tab 2: Users */}
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1 rounded-lg ${activeTab === 'users' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Users className="w-3.5 h-3.5" />
              </div>
              <span>Users</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'users' ? 'bg-emerald-200/80 text-emerald-900' : 'bg-slate-100 text-slate-600'
            }`}>
              {users.length}
            </span>
          </button>

          {/* Tab 3: Bedrock Accounts & Connections */}
          <button
            onClick={() => setActiveTab('accounts')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1 rounded-lg ${activeTab === 'accounts' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Server className="w-3.5 h-3.5" />
              </div>
              <span>Bedrock Accounts</span>
            </div>
            <div className="flex items-center gap-1.5">
              {liveConnectedBots.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title={`${liveConnectedBots.length} online`} />
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'accounts' ? 'bg-emerald-200/80 text-emerald-900' : 'bg-slate-100 text-slate-600'
              }`}>
                {accounts.length}
              </span>
            </div>
          </button>

          {/* Live Overview Box */}
          <div className="pt-4 mt-4 border-t border-slate-100 px-1 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2">
              Live Overview
            </div>
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Activity className="w-3 h-3 text-emerald-600" />
                  Active Bots
                </span>
                <span className="font-mono font-bold text-emerald-600 flex items-center gap-1">
                  {liveConnectedBots.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {liveConnectedBots.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Radio className="w-3 h-3 text-purple-600" />
                  Termux Daemons
                </span>
                <span className="font-mono font-bold text-purple-600">
                  {tunnels.filter((t) => daemonConnections[t.url]?.state === 'connected').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3 h-3 text-sky-600" />
                  Supabase Sync
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                  Connected
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Bottom User Pill */}
        <div className="flex p-3 border-t border-slate-200 bg-slate-50/50 items-center justify-between gap-1 mt-auto shrink-0">
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-slate-800 font-mono truncate">
              @Chief
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 shrink-0 bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs font-mono"
              title="Chief Administrator"
            >
              <span>🛡️</span>
              <span>ADMIN</span>
            </span>
            <Link
              href="/"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              title="Exit to Dashboard"
            >
              <LogOut className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
        {/* Desktop Header Bar */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-6 lg:px-8 items-center justify-between sticky top-0 z-10 shadow-2xs">
          {/* Breadcrumb Left */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              {activeTab === 'stats' ? (
                <BarChart3 className="w-4 h-4" />
              ) : activeTab === 'users' ? (
                <Users className="w-4 h-4" />
              ) : (
                <Server className="w-4 h-4" />
              )}
            </div>
            <span className="text-xs font-bold text-slate-500">Chief Admin</span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wide bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/80">
              {activeTab === 'stats'
                ? 'Total Stats & Overview'
                : activeTab === 'users'
                ? 'User Management'
                : 'Bedrock Accounts & Connections'}
            </span>
          </div>

          {/* Header Actions Right */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateUserOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-sm hover:shadow-emerald-500/25 active:scale-95 flex items-center gap-2 cursor-pointer ring-2 ring-emerald-500/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Toast Alert */}
          {toast && (
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-semibold shadow-md animate-in fade-in slide-in-from-top-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : toast.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : 'bg-sky-50 text-sky-900 border-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                {toast.type === 'info' && <Activity className="w-4 h-4 text-sky-600 shrink-0" />}
                <span>{toast.message}</span>
              </div>
              <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 cursor-pointer p-1">
                ✕
              </button>
            </div>
          )}

          {/* TAB 0: TOTAL STATS */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              {/* 4 Overview Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Users */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Registered Users</span>
                    <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{stats.totalUsers}</span>
                    <span className="text-xs text-slate-400 font-medium">accounts in Supabase</span>
                  </div>
                </div>

                {/* Bedrock Accounts */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Bedrock Accounts</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                      <Server className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{stats.totalAccounts}</span>
                    <span className="text-xs text-slate-400 font-medium">linked across users</span>
                  </div>
                </div>

                {/* Active Connections */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Connections</span>
                    <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-600 flex items-center gap-1.5">
                      {liveConnectedBots.length > 0 && (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      {liveConnectedBots.length}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">online Bedrock bots</span>
                  </div>
                </div>

                {/* Termux Daemons */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Termux Daemons</span>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center">
                      <Radio className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-purple-600 flex items-center gap-1.5">
                      {tunnels.filter((t) => daemonConnections[t.url]?.state === 'connected').length}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      active {tunnels.filter((t) => daemonConnections[t.url]?.state === 'connected').length === 1 ? 'daemon' : 'daemons'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Daemons & Server Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Active Termux Daemons */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Active Termux Daemons</h3>
                      <p className="text-[11px] text-slate-500">Phone daemons paired and reporting heartbeats</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 font-mono">
                      {tunnels.filter((t) => daemonConnections[t.url]?.state === 'connected').length} LIVE
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {tunnels.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs italic">
                        No phone daemons registered yet.
                      </div>
                    ) : (
                      tunnels.map((tun) => {
                        const daemonConnection = daemonConnections[tun.url];
                        const isLive = daemonConnection?.state === 'connected';
                        const isConnecting = daemonConnection?.state === 'connecting' || daemonConnection?.state === 'authenticating';
                        const ageMin = Math.max(1, Math.round((Date.now() - tun.updatedAt) / 60000));
                        return (
                          <div key={tun.username} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-purple-600 flex items-center justify-center font-bold text-xs shrink-0">
                                <Smartphone className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 truncate">
                                <span className="text-xs font-mono font-bold text-slate-800 block truncate">
                                  @{tun.username}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block truncate" title={tun.url}>
                                  {tun.url || 'No tunnel URL'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isLive ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Socket live
                                </span>
                              ) : isConnecting ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Connecting…</span>
                              ) : daemonConnection?.state === 'auth-error' ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200" title={daemonConnection.error || tun.authError}>Auth error</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
                                  Socket offline · heartbeat {ageMin}m ago
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Server Host Distribution */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Bedrock Server Distribution</h3>
                      <p className="text-[11px] text-slate-500">Configured Bedrock servers across all accounts</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 font-mono">
                      {liveConnectedBots.length} ONLINE
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {hostStats.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs italic">
                        No server accounts configured yet.
                      </div>
                    ) : (
                      hostStats.slice(0, 5).map(([host, data]) => (
                        <div key={host} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                              🎮
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-800 truncate" title={host}>
                              {host}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-600">
                              {data.total} {data.total === 1 ? 'account' : 'accounts'}
                            </span>
                            {data.online > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                {data.online} online
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Controls Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                <div className="relative w-full sm:w-96">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search user or secret code..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {/* Toggle Registrations Button */}
                <button
                  type="button"
                  onClick={handleToggleRegistrations}
                  disabled={isTogglingRegistrations}
                  className={`w-full sm:w-auto px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 ${
                    isRegistrationsPaused
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                  title={
                    isRegistrationsPaused
                      ? 'Public sign-ups are paused. Click to resume registrations.'
                      : 'Public sign-ups are open. Click to pause registrations.'
                  }
                >
                  {isRegistrationsPaused ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <UserX className="w-3.5 h-3.5 text-amber-600" />
                      <span>Registrations: Paused</span>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                        Resume
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Registrations: Active</span>
                      <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                        Pause
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Users Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-bold">
                      <tr>
                        <th className="p-3.5">User</th>
                        <th className="p-3.5">Linked Bedrock Accounts</th>
                        <th className="p-3.5">Secret Code</th>
                        <th className="p-3.5">Registered</th>
                        <th className="p-3.5 text-right">Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600 mb-2" />
                            <span>Loading users from Supabase...</span>
                          </td>
                        </tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">
                            No users found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const currentOnlineCount = new Set(accounts
                            .filter((account) => account.owner.toLowerCase() === u.username.toLowerCase() && account.isConnected)
                            .map((account) => account.id)).size;
                          return (
                            <tr key={u.id} className="hover:bg-slate-50/80 transition">
                              {/* User details */}
                              <td className="p-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-800 text-xs">
                                    {u.username.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-bold text-slate-900 block">@{u.username}</span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                      <span className="font-mono">ID: {u.id.substring(0, 8)}...</span>
                                      <span>•</span>
                                      {(u.tunnelUrl && (daemonConnections[u.tunnelUrl]?.state === 'connected' || (!daemonConnections[u.tunnelUrl] && u.daemonReachable))) || (!u.tunnelUrl && u.isTunnelActive) ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold" title={u.tunnelUrl}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                          Daemon socket live
                                        </span>
                                      ) : u.tunnelUrl && ['connecting', 'authenticating'].includes(daemonConnections[u.tunnelUrl]?.state || '') ? (
                                        <span className="text-amber-600 font-semibold">Daemon connecting</span>
                                      ) : u.tunnelUrl && daemonConnections[u.tunnelUrl]?.state === 'auth-error' ? (
                                        <span className="text-rose-600 font-semibold" title={daemonConnections[u.tunnelUrl]?.error}>Daemon auth error</span>
                                      ) : (
                                        <span className="text-slate-400">Daemon unreachable</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Accounts & Active */}
                              <td className="p-3.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">
                                    {u.accountCount} {u.accountCount === 1 ? 'account' : 'accounts'}
                                  </span>
                                  {currentOnlineCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      {currentOnlineCount} online
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Secret Code */}
                              <td className="p-3.5">
                                {u.secretCode ? (
                                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded-lg w-fit">
                                    <span>{u.secretCode}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(u.secretCode!);
                                        showToast(`Copied secret code for @${u.username}`, 'info');
                                      }}
                                      className="text-slate-400 hover:text-slate-700 p-0.5"
                                      title="Copy secret code"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">No password hash</span>
                                )}
                              </td>

                              {/* Date Registered */}
                              <td className="p-3.5 text-slate-500 text-[11px]">
                                {new Date(u.createdAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </td>

                              {/* Actions */}
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setResetPasswordUser(u);
                                      setNewPassword('');
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                                    title="Reset password for this user"
                                  >
                                    <Key className="w-3 h-3 text-amber-600" />
                                    <span>Password</span>
                                  </button>

                                  <button
                                    onClick={() => setDeleteTarget({ type: 'user', id: u.id, name: u.username })}
                                    className="p-1.5 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer shadow-2xs"
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            </div>
          )}

          {/* TAB 2: BEDROCK ACCOUNTS & LIVE CONNECTIONS */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              {/* Filter Bar with Sort, User Filter, and Status Filter */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 shadow-2xs">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search account, owner, server, or tunnel URL..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {/* Filters & Sort Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Sort Filter (Circled by user) */}
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500 font-medium">Sort:</span>
                    <select
                      value={accountSortBy}
                      onChange={(e) => setAccountSortBy(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="username-asc">Username (A → Z)</option>
                      <option value="username-desc">Username (Z → A)</option>
                      <option value="online-first">Status (Online First)</option>
                      <option value="uptime">Uptime (Longest First)</option>
                      <option value="recent">Recently Added</option>
                    </select>
                  </div>

                  {/* User Filter */}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500 font-medium">User:</span>
                    <select
                      value={accountUserFilter}
                      onChange={(e) => setAccountUserFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="all">All Users ({uniqueUsers.length})</option>
                      {uniqueUsers.map((u) => (
                        <option key={u} value={u}>@{u}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500 font-medium">Filter:</span>
                    <select
                      value={accountStatusFilter}
                      onChange={(e) => setAccountStatusFilter(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="all">All Accounts ({accounts.length})</option>
                      <option value="online">Online Bots Only ({liveConnectedBots.length})</option>
                      <option value="legit">Verified Legit Only ({accounts.filter((a) => a.isConnected && a.legitimacy?.status === 'legit').length})</option>
                      <option value="suspicious">Security Warnings / Leaks ({accounts.filter((a) => a.isConnected && a.legitimacy?.status !== 'legit').length})</option>
                      <option value="offline">Offline Only ({accounts.filter((a) => !a.isConnected).length})</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Accounts Categorized: First by User, Then by Server */}
              {loading ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 shadow-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                  <span className="text-xs font-medium">Loading Bedrock accounts and verifying security...</span>
                </div>
              ) : groupedAccounts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 shadow-xs text-xs">
                  No Bedrock accounts found matching your filter.
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedAccounts.map((userGroup) => (
                    <div
                      key={userGroup.owner}
                      className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5"
                    >
                      {/* USER CATEGORY HEADER */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-bold shadow-2xs">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-black text-slate-900 tracking-tight">@{userGroup.owner}</h2>
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                userGroup.connectedCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                {userGroup.connectedCount} / {userGroup.totalAccounts} Online
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {userGroup.servers.length} configured server{userGroup.servers.length === 1 ? '' : 's'} &bull; {userGroup.totalAccounts} unique linked Bedrock account{userGroup.totalAccounts === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>

                        {userGroup.tunnelUrl && (
                          <div className="flex items-center gap-2 self-start sm:self-auto text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 shadow-2xs">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${userGroup.isTunnelActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            <span className="font-mono text-[11px] truncate max-w-[240px]" title={userGroup.tunnelUrl}>
                              {userGroup.tunnelUrl}
                            </span>
                            <span className={`text-[10px] font-bold uppercase ${userGroup.daemonState === 'connected' ? 'text-emerald-700' : userGroup.daemonState === 'connecting' || userGroup.daemonState === 'authenticating' ? 'text-amber-700' : userGroup.daemonState === 'auth-error' ? 'text-rose-700' : 'text-slate-500'}`}>
                              {userGroup.daemonState === 'heartbeat-only' ? 'Heartbeat only' : userGroup.daemonState === 'probe-live' ? 'Probe live' : userGroup.daemonState || 'Unknown'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* SERVERS CATEGORY LIST */}
                      <div className="space-y-6">
                        {userGroup.servers.map((srv) => (
                          <div key={srv.serverKey} className="space-y-3.5">
                            {/* Server Sub-Header Banner */}
                            <div className="flex items-center justify-between bg-slate-50/80 px-4 py-2.5 rounded-2xl border border-slate-200">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                                  <Server className="w-4 h-4" />
                                </div>
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="font-black text-xs text-slate-900 truncate">
                                    {srv.serverName}
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-emerald-800 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs">
                                    {srv.serverHost}:{srv.serverPort}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs shrink-0">
                                {srv.accounts.length} bot{srv.accounts.length === 1 ? '' : 's'} ({srv.connectedCount} online)
                              </span>
                            </div>

                            {/* Account Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                              {srv.accounts.map((a) => {
                                const uptimeSec =
                                  a.isConnected && a.connectedAt
                                    ? Math.max(0, Math.floor((nowTick - a.connectedAt) / 1000))
                                    : 0;

                                const displayTunnel = a.daemonUrl || a.registeredTunnel || '';
                                const cleanIgn = a.ign.replace(/^@/, '').trim();
                                const chatKey = `${a.owner.toLowerCase()}::${(a.botId || '').toLowerCase()}`;
                                const botChats = liveChats[chatKey] || [];
                                const recentLifestealTimeoutAt = botChats.reduce<number>((latest, message) => {
                                  if (!message.timestamp || nowTick - message.timestamp > 120_000 || nowTick < message.timestamp) return latest;
                                  const text = `${message.text || ''} ${message.raw || ''} ${message.formattedText || ''}`;
                                  const isTimeout = (/\blifesteal\b/i.test(message.sender || '') && /\btimed\s*out\b|\btimeout\b/i.test(text)) ||
                                    /(?:<\s*lifesteal\s*>|\blifesteal\b).{0,100}\b(?:timed\s*out|timeout)\b/i.test(text);
                                  return isTimeout ? Math.max(latest, message.timestamp) : latest;
                                }, 0);
                                const runtimeState = (a.runtimeState || (a.isConnected ? 'SPAWNED' : 'DISCONNECTED')).toUpperCase();
                                const stateLabel = runtimeState === 'SPAWNED' || runtimeState === 'LOGGED_IN'
                                  ? 'Connected'
                                  : runtimeState === 'UNKNOWN'
                                    ? 'Unknown'
                                    : runtimeState === 'CONNECTING'
                                      ? 'Connecting'
                                      : runtimeState === 'RECONNECTING'
                                        ? 'Reconnecting'
                                        : runtimeState === 'KICKED'
                                          ? 'Kicked'
                                          : runtimeState === 'ERROR'
                                            ? 'Error'
                                            : 'Offline';
                                const stateStyle = a.isConnected
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : runtimeState === 'CONNECTING' || runtimeState === 'RECONNECTING'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : runtimeState === 'ERROR' || runtimeState === 'KICKED'
                                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200';
                                const isFreshSmp = /freshsmp/i.test(`${a.serverName || ''} ${a.serverHost || ''}`);
                                const rawDiagnostic = freshSmpDiagnostics[`${a.owner.toLowerCase()}::${(a.botId || '').toLowerCase()}`];
                                const diagnostic = rawDiagnostic && (!a.connectedAt || rawDiagnostic.phaseSince >= a.connectedAt - 1_000)
                                  ? rawDiagnostic
                                  : undefined;
                                const fallbackAfkSince = freshSmpBossbarSince[`${a.owner.toLowerCase()}::${(a.botId || '').toLowerCase()}`];
                                const fallbackAfkStable = typeof fallbackAfkSince === 'number' && nowTick - fallbackAfkSince >= 60_000;
                                const diagnosticSessionSince = diagnostic?.phase === 'lifesteal'
                                  ? diagnostic.lifestealSessionStartedAt ?? diagnostic.phaseSince
                                  : undefined;
                                const stableSince = typeof diagnosticSessionSince === 'number' && typeof fallbackAfkSince === 'number'
                                  ? Math.min(diagnosticSessionSince, fallbackAfkSince)
                                  : typeof diagnosticSessionSince === 'number'
                                    ? diagnosticSessionSince
                                    : fallbackAfkSince;
                                const isRecentLifestealTimeout = recentLifestealTimeoutAt > 0 &&
                                  (!stableSince || recentLifestealTimeoutAt >= stableSince);
                                const freshSmpStable = Boolean(
                                  a.isConnected &&
                                  !isRecentLifestealTimeout &&
                                  ((typeof diagnosticSessionSince === 'number' && nowTick - diagnosticSessionSince >= 60_000) || fallbackAfkStable)
                                );
                                const freshSmpLabel = !a.isConnected
                                  ? 'OFFLINE'
                                  : freshSmpStable
                                    ? 'STABLE'
                                    : isRecentLifestealTimeout
                                      ? 'UNSTABLE'
                                    : typeof diagnosticSessionSince === 'number' || typeof fallbackAfkSince === 'number' || diagnostic?.phase === 'lifesteal'
                                        ? 'CHECKING'
                                        : diagnostic?.phase === 'lobby'
                                          ? 'IN LOBBY'
                                          : diagnostic?.phase === 'queue'
                                            ? typeof diagnostic.lifestealAttemptStartedAt === 'number' && nowTick - diagnostic.lifestealAttemptStartedAt >= 60_000 ? 'UNSTABLE' : 'CHECKING'
                                            : 'NO DATA';
                                const freshSmpStyle = freshSmpStable
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : freshSmpLabel === 'IN LOBBY' || freshSmpLabel === 'OFFLINE' || freshSmpLabel === 'NO DATA'
                                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                                    : freshSmpLabel === 'CHECKING'
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-rose-100 text-rose-700 border-rose-200';

                                return (
                                  <div
                                    key={a.botId || `${a.id}:${a.serverId || 'unassigned'}`}
                                    className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                                  >
                                    {/* Top Header: Head Skin, IGN, Owner, Status & Actions */}
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 shrink-0 shadow-xs flex items-center justify-center">
                                          <img
                                            src={`https://crafthead.net/helm/${encodeURIComponent(cleanIgn)}/64`}
                                            alt={a.ign}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLElement).style.display = 'none';
                                            }}
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <h3 className="font-black text-sm text-slate-900 tracking-tight truncate" title={a.ign}>
                                            {a.ign}
                                          </h3>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold font-mono">
                                              @{a.owner}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                              #{a.id.substring(0, 6)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Status & Actions */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border shadow-2xs ${stateStyle}`} title={a.runtimeReason || `Daemon reported ${runtimeState.toLowerCase()}`}>
                                          <span className={`w-2 h-2 rounded-full ${a.isConnected ? 'bg-emerald-500 animate-pulse' : runtimeState === 'ERROR' || runtimeState === 'KICKED' ? 'bg-rose-500' : runtimeState === 'CONNECTING' || runtimeState === 'RECONNECTING' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                                          {stateLabel}
                                        </span>

                                        {isFreshSmp && (
                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black border ${freshSmpStyle}`}
                                            title={diagnostic
                                              ? `FreshSMP phase: ${diagnostic.phase}. Stability requires 60 seconds in /lifesteal.`
                                              : freshSmpLabel === 'NO DATA'
                                                ? 'No current FreshSMP subserver signal or confirmed AFK reward boss bar is available. Update the user’s Termux daemon for precise status.'
                                                : freshSmpLabel === 'CHECKING'
                                                  ? 'FreshSMP subserver evidence detected; waiting 60 seconds to confirm stability.'
                                                  : isRecentLifestealTimeout
                                                    ? 'This account recently received a Lifesteal timeout message.'
                                                    : 'Stability requires a confirmed 60-second FreshSMP /lifesteal session.'}
                                          >
                                            {freshSmpLabel}
                                          </span>
                                        )}

                                        {a.isConnected && (
                                          <button
                                            onClick={() => handleDisconnectAccount(a.id, a.ign, a.botId)}
                                            className="p-1.5 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-slate-500 hover:text-amber-700 transition cursor-pointer"
                                            title="Disconnect bot from server"
                                          >
                                            <Power className="w-3.5 h-3.5" />
                                          </button>
                                        )}

                                        <button
                                          onClick={() => setDeleteTarget({ type: 'account', id: a.id, name: a.ign })}
                                          className="p-1.5 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                          title="Delete account"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Middle Details Box */}
                                    <div className="space-y-2.5 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                                      {/* Server Destination */}
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 shrink-0">
                                          <Server className="w-3.5 h-3.5 text-slate-400" />
                                          Server:
                                        </span>
                                        <span
                                          className="font-mono font-bold text-slate-800 truncate text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200"
                                          title={`${a.serverName ? `${a.serverName} - ` : ''}${a.serverHost}:${a.serverPort}`}
                                        >
                                          {a.serverName && a.serverName !== `${a.serverHost}:${a.serverPort}` ? (
                                            <>
                                              <span className="text-emerald-800 font-bold mr-1">{a.serverName}</span>
                                              <span className="text-slate-500">({a.serverHost}:{a.serverPort})</span>
                                            </>
                                          ) : (
                                            `${a.serverHost}:${a.serverPort}`
                                          )}
                                        </span>
                                      </div>

                                      {/* Tunnel Daemon */}
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 shrink-0">
                                          <Globe className="w-3.5 h-3.5 text-slate-400" />
                                          Tunnel:
                                        </span>
                                        {displayTunnel ? (
                                          <div className="flex items-center gap-1 max-w-[200px] truncate bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-[10.5px] text-slate-700">
                                            <span className="truncate" title={displayTunnel}>
                                              {displayTunnel}
                                            </span>
                                            <button
                                              onClick={() => {
                                                navigator.clipboard.writeText(displayTunnel);
                                                showToast('Copied tunnel URL', 'info');
                                              }}
                                              className="text-slate-400 hover:text-slate-700 p-0.5 shrink-0 cursor-pointer"
                                              title="Copy tunnel URL"
                                            >
                                              <Copy className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 italic text-[11px]">No tunnel registered</span>
                                        )}
                                      </div>

                                      {/* Security / Legitimacy & Uptime */}
                                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                                        {a.legitimacy?.status === 'legit' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                            Verified Legit
                                          </span>
                                        ) : a.legitimacy?.status === 'leak' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300" title={a.legitimacy.description}>
                                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                                            {a.legitimacy.badge}
                                          </span>
                                        ) : a.legitimacy?.status === 'unverified' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300" title={a.legitimacy.description}>
                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                            {a.legitimacy.badge}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            Standby
                                          </span>
                                        )}

                                        <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-slate-600">
                                          <Clock className="w-3 h-3 text-slate-400" />
                                          {a.isConnected ? (
                                            <span className="text-emerald-700">{formatUptime(uptimeSec)}</span>
                                          ) : (
                                            <span className="text-slate-400">Offline</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Live Server Chat */}
                                    {a.isConnected && (
                                      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-xs shadow-2xs space-y-2">
                                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                                          <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Live Bedrock Chat
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-sans font-medium">
                                            last 5 msgs
                                          </span>
                                        </div>

                                        {botChats.length === 0 ? (
                                          <div className="text-slate-400 italic text-[11px] py-3 text-center bg-slate-50/50 rounded-xl border border-slate-200/60">
                                            Listening for server messages...
                                          </div>
                                        ) : (
                                          <div className="space-y-1 bg-slate-50/50 p-2 rounded-xl border border-slate-200/80 max-h-[170px] overflow-y-auto">
                                            {botChats.slice(-5).map((c, i) => (
                                              <MinecraftChatMessage
                                                key={c.id || i}
                                                message={c}
                                                compact={true}
                                                showTimestamp={true}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-3 py-2 flex items-center justify-around z-30 shadow-lg">
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${
            activeTab === 'stats' ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Stats</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${
            activeTab === 'users' ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users</span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${
            activeTab === 'accounts' ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <Server className="w-4 h-4" />
            {liveConnectedBots.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5 animate-pulse" />
            )}
          </div>
          <span>Accounts</span>
        </button>

        <Link
          href="/"
          className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600"
        >
          <LogOut className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
      </nav>

      {/* MODAL: RESET PASSWORD */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Reset Password</h3>
                  <p className="text-xs text-slate-500">For user @{resetPasswordUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setResetPasswordUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Secure Password</label>
                <input
                  type="text"
                  required
                  placeholder="Enter new password (min 4 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword || newPassword.length < 4}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isResettingPassword ? 'Saving...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE USER */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add New User</h3>
                  <p className="text-xs text-slate-500">Register directly into Supabase</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Username <span className="text-slate-400 font-normal">(1-16 alphanumeric characters)</span>
                </label>
                <input
                  type="text"
                  maxLength={16}
                  required
                  placeholder="e.g. Chief"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="text"
                  required
                  placeholder="Password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateUserOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser || !createUsername || !createPassword}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCreatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Delete {deleteTarget.type === 'user' ? 'User' : 'Account'}?
                </h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              {deleteTarget.type === 'user'
                ? 'This will delete the user account and all their linked Bedrock bots from Supabase.'
                : 'This will remove this Bedrock bot record from Supabase.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
