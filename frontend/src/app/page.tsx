'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { SettingsModal } from '@/components/SettingsModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { MicrosoftAuthModal } from '@/components/MicrosoftAuthModal';
import { ServerProfileModal } from '@/components/ServerProfileModal';
import { DangerousSettingsModal } from '@/components/DangerousSettingsModal';
import { AccountLogsModal } from '@/components/AccountLogsModal';
import { ServerLogo } from '@/components/ServerLogo';
import { useDaemonSocket } from '@/lib/useDaemonSocket';
import { BedrockAccount, ServerProfile, BotSettings, ChatMessage, BotLifecycleState, PlayerLogEntry, PlayerLogType } from '@/types';
import { 
  loadAccountsFromSupabase, 
  syncAllToSupabase, 
  deleteAccountFromSupabase,
  loadServersFromSupabase,
  saveServersToSupabase,
  saveAccountLogsToSupabase,
  loadAccountLogsFromSupabase
} from '@/lib/supabaseSync';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [secretCode, setSecretCode] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'accounts'>('dashboard');

  // Accounts state & unlink confirmation
  const [accounts, setAccounts] = useState<BedrockAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [accountNotes, setAccountNotes] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = localStorage.getItem('pebbleafk_current_user') || 'guest';
        const saved = localStorage.getItem(`pebbleafk_notes_${u}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });
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
  const [msAuthError, setMsAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

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
  const [selectedChatReceiver, setSelectedChatReceiver] = useState<string>('all');
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

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
          currentList[0].message === message &&
          Date.now() - currentList[0].timestamp < 2000
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
    messagesByBot,
    reconnect,
    restartDaemon,
    verifyAccount,
    msAuthData,
    setMsAuthData,
    sendChat,
    startBot,
    stopBot,
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

        // Load accounts from Supabase (filter out any old dummy names)
        loadAccountsFromSupabase(savedUser).then((accs) => {
          if (accs && accs.length > 0) {
            const cleanAccs = accs.filter((a) => !a.ign?.startsWith('bedrock_user_') && !a.username?.startsWith('bedrock_user_'));
            setAccounts(cleanAccs);
          }
        });

        // Load server profiles from Supabase
        loadServersFromSupabase(savedUser).then((srvs) => {
          if (srvs && srvs.length > 0) {
            setServers(srvs);
            setActiveServerId((prev) => prev || srvs[0].id);
          } else {
            const cached = localStorage.getItem(`pebbleafk_servers_${savedUser.toLowerCase()}`);
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setServers(parsed);
                  setActiveServerId((prev) => prev || parsed[0].id);
                }
              } catch (_) {}
            }
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
    setCurrentUser(null);
    setSecretCode('');
    setAccounts([]);
    setServers([]);
    setAccountNotes({});
    setSessionStartTimes({});
    setActiveServerId(null);
    setActiveTab('dashboard');
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

  // Microsoft OAuth Device Code Sign-In (Exact same flow as PocketAFK)
  const handleStartMicrosoftLogin = (target?: BedrockAccount | string) => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    if (accounts.filter((a) => a.verified).length >= 5 && !target) {
      showToast('Maximum account limit (5 accounts) reached.', 'error');
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

  // Active selected server profile
  const activeServer = servers.find((s) => s.id === activeServerId) || servers[0] || null;

  // Save server profile to state & Supabase
  const handleSaveServer = async (profile: ServerProfile) => {
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

  // Update specific setting (physics, resource packs, delays) on active server
  const handleUpdateServerSetting = (key: keyof BotSettings, value: any) => {
    if (!activeServer) return;
    const updatedSettings: BotSettings = {
      ...(activeServer.settings || {
        physics: true,
        acceptResourcePacks: true,
        autoEat: false,
        autoTotem: false,
        antiAfk: true,
        antiAfkInterval: 10,
        mobFarm: false,
        mobFarmRange: 3.5,
        mobFarmIntervalMs: 650,
        autoReconnect: true,
        autoReconnectDelay: 5000,
        joinDelay: 0,
      }),
      [key]: value,
    };
    handleUpdateActiveServer({ settings: updatedSettings });
  };

  // Accounts assigned to current Server Profile (strictly filtered to existing accounts)
  const profileAccountIds = useMemo(() => {
    if (!activeServer) return [];
    const validAccountIds = new Set(accounts.map((a) => a.id));
    if (Array.isArray(activeServer.assignedAccountIds)) {
      return activeServer.assignedAccountIds.filter((id) => validAccountIds.has(id));
    }
    return activeServer.accountId && validAccountIds.has(activeServer.accountId)
      ? [activeServer.accountId]
      : [];
  }, [activeServer, accounts]);

  const assignedAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (!profileAccountIds.includes(a.id)) return false;
      const q = accountFilter.toLowerCase().trim();
      if (!q) return true;
      const ign = (a.ign || a.username).toLowerCase();
      const note = (accountNotes[a.id] || (a.ign ? accountNotes[a.ign.toLowerCase()] : '') || '').toLowerCase();
      return ign.includes(q) || note.includes(q);
    });
  }, [accounts, profileAccountIds, accountFilter, accountNotes]);

  const availableAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (profileAccountIds.includes(a.id)) return false;
      const q = accountFilter.toLowerCase().trim();
      if (!q) return true;
      const ign = (a.ign || a.username).toLowerCase();
      const note = (accountNotes[a.id] || (a.ign ? accountNotes[a.ign.toLowerCase()] : '') || '').toLowerCase();
      return ign.includes(q) || note.includes(q);
    });
  }, [accounts, profileAccountIds, accountFilter, accountNotes]);

  // Reset selection when changing active server
  useEffect(() => {
    setSelectedAccountIds([]);
  }, [activeServerId]);

  // Update notes locally & in state
  const handleUpdateNote = (accId: string, noteText: string, ign?: string) => {
    const updated: Record<string, string> = { ...accountNotes, [accId]: noteText };
    if (ign) {
      updated[ign.toLowerCase()] = noteText;
    }
    setAccountNotes(updated);
    if (typeof window !== 'undefined') {
      const u = currentUser || 'guest';
      localStorage.setItem(`pebbleafk_notes_${u}`, JSON.stringify(updated));
    }
  };

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

  const isActiveServerRunning = assignedAccounts.some((acc) => {
    const botId = `${activeServer?.id}__${acc.id}`;
    const st = botStates[botId];
    return st === 'SPAWNED' || st === 'LOGGED_IN' || st === 'CONNECTING';
  });

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
    const botConfig = {
      id: botId,
      username: acc.ign || acc.username,
      host: srv.serverHost,
      port: srv.serverPort || 19132,
      version: srv.serverVersion || 'auto',
      authType: 'microsoft',
      autoReconnect: srv.autoReconnect,
      settings: srv.settings,
    };
    startBot(botConfig);
    showToast(`Connecting @${acc.ign || acc.username} to ${srv.name}...`, 'info');
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
    showToast(`Disconnecting @${acc.ign || acc.username}...`, 'info');
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
            const reason = botReasons[botKey] ? `: ${botReasons[botKey]}` : '';
            addPlayerLog(ign, srv.serverHost, 'kicked', `Kicked from ${srv.serverHost}${reason}`, undefined, 'error');
          } else if (st === 'ERROR') {
            const reason = botReasons[botKey] ? `: ${botReasons[botKey]}` : '';
            addPlayerLog(ign, srv.serverHost, 'error', `Connection error (${srv.serverHost})${reason}`, undefined, 'error');
          } else if (st === 'DISCONNECTED' && prevSt && prevSt !== 'DISCONNECTED') {
            addPlayerLog(ign, srv.serverHost, 'disconnected', `Disconnected from ${srv.serverHost}`, undefined, 'warning');
          }
        }
      }
    });
    prevBotStatesRef.current = { ...botStates };
  }, [botStates, botReasons, daemonStatus, servers, accounts, addPlayerLog]);

  // Connect / Disconnect all checked accounts
  const handleConnectSelected = () => {
    if (!activeServer) return;
    const targetAccounts = assignedAccounts.filter((a) => selectedAccountIds.includes(a.id));
    if (targetAccounts.length === 0) {
      showToast('Please select at least one assigned Bedrock account.', 'error');
      return;
    }
    targetAccounts.forEach((acc) => handleConnectAccount(acc, activeServer));
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

  // Chat auto-scroll
  useEffect(() => {
    if (activeSubTab === 'chat' && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messagesByBot, activeSubTab]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeServer) return;
    const msg = chatInput.trim();
    const targetAccounts = assignedAccounts.length > 0 ? assignedAccounts : accounts;
    if (selectedChatReceiver === 'all') {
      targetAccounts.forEach((acc) => {
        const botId = `${activeServer.id}__${acc.id}`;
        sendChat(botId, msg);
      });
    } else {
      sendChat(`${activeServer.id}__${selectedChatReceiver}`, msg);
    }
    setChatInput('');
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

  // 1. UNLOGGED VIEW: Main page
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

  // 2. LOGGED-IN VIEW
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
                <div className={`p-1 rounded-lg ${activeTab === 'servers' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
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
                  <div className={`p-1 rounded-lg ${activeTab === 'accounts' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Users className="w-4 h-4" />
                  </div>
                  <span>Accounts</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                  {verifiedAccountsCount}/5
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
                    const onlineCount = accounts.filter(
                      (acc) =>
                        srvAssignedIds.includes(acc.id) &&
                        (botStates[`${srv.id}__${acc.id}`] === 'SPAWNED' ||
                         botStates[`${srv.id}__${acc.id}`] === 'LOGGED_IN' ||
                         botStates[acc.id] === 'SPAWNED' ||
                         botStates[acc.id] === 'LOGGED_IN')
                    ).length;
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
                              ? 'bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs'
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
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                activeSubTab === 'connect'
                                  ? 'bg-emerald-100/60 text-emerald-900 border border-emerald-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <HomeIcon className={`w-3.5 h-3.5 ${activeSubTab === 'connect' ? 'text-emerald-700' : 'text-slate-400'}`} />
                              <span>Connect</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('chat');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                activeSubTab === 'chat'
                                  ? 'bg-sky-50 text-sky-900 border border-sky-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <MessageSquare className={`w-3.5 h-3.5 ${activeSubTab === 'chat' ? 'text-sky-700' : 'text-slate-400'}`} />
                              <span>Chat</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveSubTab('settings');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                activeSubTab === 'settings'
                                  ? 'bg-slate-200/80 text-slate-900 border border-slate-300 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                              }`}
                            >
                              <Sliders className={`w-3.5 h-3.5 ${activeSubTab === 'settings' ? 'text-slate-800' : 'text-slate-400'}`} />
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
                  <span className="capitalize">{activeTab}</span>
                </>
              )}
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
            {/* VIEW 1: DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
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
                        onClick={() => setActiveTab('accounts')}
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
                    onClick={() => setActiveTab('accounts')}
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
                      Server profiles and multi-bot management are being configured. Click on Accounts to link your Bedrock profiles!
                    </p>
                  </div>
                </div>
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
                        {verifiedAccountsCount}/5
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Manage all your verified Microsoft Bedrock Minecraft accounts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      disabled={verifiedAccountsCount >= 5}
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

                {/* Accounts Table Container */}
                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto touch-pan-x">
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
                          }).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-12 text-center text-slate-500">
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
                            </td>
                          </tr>
                        ) : (
                          accounts
                            .filter((a) => {
                              const q = accountFilter.toLowerCase().trim();
                              if (!q) return true;
                              return (a.ign || a.username).toLowerCase().includes(q);
                            })
                            .map((acc) => {
                              const displayName = acc.ign || acc.username || 'BedrockPlayer';
                              const rawName = displayName.includes('@') ? displayName.split('@')[0] : displayName;
                              const primaryAvatarUrl = acc.avatarUrl || `https://crafthead.net/helm/${encodeURIComponent(displayName)}/32`;
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
                                            const img = e.target as HTMLImageElement;
                                            if (acc.avatarUrl && img.src !== acc.avatarUrl) {
                                              img.src = acc.avatarUrl;
                                            } else if (!img.src.includes('crafthead')) {
                                              img.src = `https://crafthead.net/helm/${encodeURIComponent(displayName)}/32`;
                                            } else if (!img.src.includes('mc-heads')) {
                                              img.src = `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/32`;
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
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: SERVERS VIEW (CONNECT, CHAT, SETTINGS) */}
            {activeTab === 'servers' && (
              <div className="max-w-4xl mx-auto space-y-6">
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

                        {/* Accounts Table for this Server Profile */}
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                          <div className="overflow-x-auto touch-pan-x">
                            <table className="w-full text-left text-xs min-w-[680px]">
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
                                  <th className="p-3">Note</th>
                                  <th className="p-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {assignedAccounts.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500">
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
                                    const botState = botStates[botId] || botStates[acc.id] || 'DISCONNECTED';
                                    const isConnected = botState === 'SPAWNED' || botState === 'LOGGED_IN';
                                    const isConnecting = botState === 'CONNECTING' || botState === 'RECONNECTING';
                                    const isChecked = selectedAccountIds.includes(acc.id);

                                    const srvStart = sessionStartTimes[botId];
                                    const localSec = srvStart ? Math.max(0, Math.floor((nowTick - srvStart) / 1000)) : 0;
                                    const srvTel = telemetries?.[botId];
                                    const daemonUptime =
                                      srvTel && typeof srvTel.uptime === 'number' && srvTel.uptime > 0
                                        ? srvTel.uptime
                                        : srvTel && typeof srvTel.connectedAt === 'number' && srvTel.connectedAt > 0
                                        ? Math.max(0, Math.floor((nowTick - srvTel.connectedAt) / 1000))
                                        : 0;
                                    const accountUptime = (daemonStatus === 'AUTHENTICATED' && isConnected) ? Math.max(daemonUptime, localSec) : 0;

                                    return (
                                      <tr
                                        key={acc.id}
                                        className={`hover:bg-slate-50/80 transition ${
                                          isChecked ? 'bg-emerald-50/30' : ''
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
                                                src={acc.avatarUrl || `https://avatar-ssl.xboxlive.com/avatar/${encodeURIComponent(acc.ign || acc.username)}/avatarpic-l.png`}
                                                alt="Gamerpic"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                  (e.currentTarget as HTMLImageElement).src = 'https://raw.githubusercontent.com/InventivetalentDev/MineRender/master/dist/steve.png';
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
                                            {getStatusBadge(botState as BotLifecycleState)}
                                          </button>
                                        </td>
                                        <td className="p-3">
                                          {isConnected ? (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-mono text-xs font-bold shadow-2xs">
                                              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                              <span>{formatUptime(accountUptime)}</span>
                                            </div>
                                          ) : (
                                            <span className="text-xs font-mono text-slate-400 font-medium px-2">-</span>
                                          )}
                                        </td>
                                        <td className="p-3">
                                          <input
                                            type="text"
                                            placeholder="Add Note"
                                            value={accountNotes[acc.id] || (acc.ign ? accountNotes[acc.ign.toLowerCase()] : '') || ''}
                                            onChange={(e) => handleUpdateNote(acc.id, e.target.value, acc.ign)}
                                            className="w-full max-w-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500"
                                          />
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
                              <div className="overflow-x-auto touch-pan-x">
                                <table className="w-full text-left text-xs min-w-[480px]">
                                  <tbody className="divide-y divide-slate-100">
                                    {availableAccounts.map((acc) => (
                                      <tr key={acc.id} className="hover:bg-slate-50/80 transition">
                                        <td className="p-3">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                                              <img
                                                src={acc.avatarUrl || `https://avatar-ssl.xboxlive.com/avatar/${encodeURIComponent(acc.ign || acc.username)}/avatarpic-l.png`}
                                                alt="Gamerpic"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                  (e.currentTarget as HTMLImageElement).src = 'https://raw.githubusercontent.com/InventivetalentDev/MineRender/master/dist/steve.png';
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
                                        <td className="p-3">
                                          <input
                                            type="text"
                                            placeholder="Add Note"
                                            value={accountNotes[acc.id] || (acc.ign ? accountNotes[acc.ign.toLowerCase()] : '') || ''}
                                            onChange={(e) => handleUpdateNote(acc.id, e.target.value, acc.ign)}
                                            className="w-full max-w-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500"
                                          />
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
                            disabled={accounts.length >= 10}
                            onClick={() => handleStartMicrosoftLogin()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-emerald-700 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-40"
                          >
                            <Plus className="w-4 h-4" /> Link Another Microsoft Bedrock Account ({accounts.length}/10)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SUBTAB 2: CHAT */}
                    {activeSubTab === 'chat' && (
                      <div className="space-y-3">
                        {/* Chat Receivers selector */}
                        <div className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600">Chat receivers:</span>
                            <select
                              value={selectedChatReceiver}
                              onChange={(e) => setSelectedChatReceiver(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                            >
                              <option value="all">
                                All {assignedAccounts.length > 0 ? 'Assigned ' : ''}Accounts ({assignedAccounts.length > 0 ? assignedAccounts.length : accounts.length})
                              </option>
                              {(assignedAccounts.length > 0 ? assignedAccounts : accounts).map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  @{acc.ign || acc.username}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Messages Box */}
                        <div className="h-[460px] bg-white border border-slate-200/90 rounded-2xl p-4 overflow-y-auto space-y-2 shadow-xs font-mono text-xs">
                          {(() => {
                            const chatList: ChatMessage[] = [];
                            const chatAccs = assignedAccounts.length > 0 ? assignedAccounts : accounts;
                            if (selectedChatReceiver === 'all') {
                              chatAccs.forEach((acc) => {
                                const botId = `${activeServer.id}__${acc.id}`;
                                const msgs = messagesByBot[botId] || messagesByBot[acc.id] || [];
                                chatList.push(...msgs);
                              });
                            } else {
                              const botId = `${activeServer.id}__${selectedChatReceiver}`;
                              const msgs = messagesByBot[botId] || messagesByBot[selectedChatReceiver] || [];
                              chatList.push(...msgs);
                            }
                            chatList.sort((a, b) => a.timestamp - b.timestamp);

                            if (chatList.length === 0) {
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                                  <MessageSquare className="w-8 h-8 text-slate-300" />
                                  <p className="text-xs font-medium">No chat messages received yet.</p>
                                  <p className="text-[11px] text-slate-400">
                                    When your Bedrock bot connects to {activeServer.name}, server messages and player chats will appear here in real time.
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <>
                                {chatList.map((m) => (
                                  <div key={m.id} className="flex items-start gap-2 leading-relaxed">
                                    <span className="text-[10px] text-slate-400 select-none">
                                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    {m.sender && (
                                      <span className="font-bold text-emerald-700">
                                        &lt;{m.sender}&gt;
                                      </span>
                                    )}
                                    <span className="text-slate-800 break-all">{m.formattedText || m.raw}</span>
                                  </div>
                                ))}
                                <div ref={chatMessagesEndRef} />
                              </>
                            );
                          })()}
                        </div>

                        {/* Chat input box */}
                        <form onSubmit={handleSendChat} className="flex gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Send a message or command (e.g. /spawn)..."
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium shadow-2xs"
                          />
                          <button
                            type="submit"
                            disabled={!chatInput.trim()}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send</span>
                          </button>
                        </form>
                      </div>
                    )}

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
                        <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-xs">
                          <h3 className="font-bold text-sm text-slate-900">Server information</h3>

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
                                  <option value="auto">Auto Detect</option>
                                  <option value="1.21.50">1.21.50 (Latest)</option>
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
                        <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-xs">
                          <h3 className="font-bold text-sm text-slate-900">Extra settings</h3>

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
                        <div className="p-5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                          <div>
                            <h3 className="font-bold text-sm text-slate-900">Dangerous settings</h3>
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
          onClose={() => setMsAuthData(null)}
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

      {/* Bedrock Server Profile Modal (Create / Edit) */}
      <ServerProfileModal
        isOpen={isServerModalOpen}
        onClose={() => {
          setIsServerModalOpen(false);
          setEditingServer(null);
        }}
        accounts={accounts}
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
