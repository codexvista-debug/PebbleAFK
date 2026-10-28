'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, Trash2, ArrowDownCircle, ArrowUp, Power, Clock3, Wifi, WifiOff, UsersRound } from 'lucide-react';
import { ShutdownConfirmDialog } from './ShutdownConfirmDialog';

interface TermuxStreamPageProps {
  logs: string[];
  historyError?: string;
  statusStorageError?: string;
  isOnline: boolean;
  daemonStartedAt: number | null;
  lastDisconnectedAt: number | null;
  now: number;
  onFetchLogs: () => void;
  onClearLogs: () => void;
  onRestartDaemon?: () => void;
  onUpdateDaemon?: () => void;
  onShutdownDaemon?: () => boolean;
  termuxCommand?: string;
  pebbleUsername?: string;
  isChiefAdmin?: boolean;
  adminToken?: string;
}

export const TermuxStreamPage: React.FC<TermuxStreamPageProps> = ({
  logs,
  historyError,
  statusStorageError,
  isOnline,
  daemonStartedAt,
  lastDisconnectedAt,
  now,
  onFetchLogs,
  onClearLogs,
  onRestartDaemon,
  onUpdateDaemon,
  onShutdownDaemon,
  pebbleUsername,
  isChiefAdmin = false,
  adminToken = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedPebbleUser, setSelectedPebbleUser] = useState(pebbleUsername || '');
  const [pebbleUsers, setPebbleUsers] = useState<string[]>([]);
  const [otherUserStream, setOtherUserStream] = useState<{
    logs: string[];
    isOnline: boolean;
    daemonStartedAt: number | null;
    lastDisconnectedAt: number | null;
    daemonRevision: string;
    expectedRevision: string;
  } | null>(null);
  const [otherUserError, setOtherUserError] = useState('');
  const [adminUserListError, setAdminUserListError] = useState('');
  const [otherUserLoading, setOtherUserLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const viewingOtherUser = Boolean(selectedPebbleUser && pebbleUsername && selectedPebbleUser.toLowerCase() !== pebbleUsername.toLowerCase());
  const displayedLogs = viewingOtherUser ? (otherUserStream?.logs || []) : logs;
  const displayedIsOnline = viewingOtherUser ? (otherUserStream?.isOnline || false) : isOnline;
  const displayedDaemonStartedAt = viewingOtherUser ? otherUserStream?.daemonStartedAt || null : daemonStartedAt;
  const displayedLastDisconnectedAt = viewingOtherUser ? otherUserStream?.lastDisconnectedAt || null : lastDisconnectedAt;
  const displayedHistoryError = viewingOtherUser ? otherUserError : (isChiefAdmin ? adminUserListError : historyError);
  const displayedStatusError = viewingOtherUser ? '' : statusStorageError;
  const uptimeEndAt = displayedIsOnline ? now : (displayedLastDisconnectedAt || displayedDaemonStartedAt || now);
  const uptimeSeconds = displayedDaemonStartedAt ? Math.max(0, Math.floor((uptimeEndAt - displayedDaemonStartedAt) / 1000)) : 0;
  const uptimeDays = Math.floor(uptimeSeconds / 86400);
  const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeRemainder = uptimeSeconds % 60;
  const uptimeLabel = uptimeDays > 0
    ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`
    : uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes}m ${uptimeRemainder}s`
      : `${uptimeMinutes}m ${uptimeRemainder}s`;
  const lastDisconnectedLabel = displayedLastDisconnectedAt
    ? (() => {
        const elapsedSeconds = Math.max(0, Math.floor((now - displayedLastDisconnectedAt) / 1000));
        if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        if (elapsedHours < 24) return `${elapsedHours}h ago`;
        return `${Math.floor(elapsedHours / 24)}d ago`;
      })()
    : 'No disconnect recorded';

  useEffect(() => {
    if (pebbleUsername) setSelectedPebbleUser(pebbleUsername);
  }, [pebbleUsername]);

  useEffect(() => {
    if (!isChiefAdmin || !adminToken) {
      setPebbleUsers([]);
      return;
    }
    let cancelled = false;
    fetch('/api/admin/termux-stream', {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not load Pebble users.');
      if (!cancelled) {
        setPebbleUsers(Array.isArray(data?.usernames) ? data.usernames : []);
        setAdminUserListError('');
      }
    }).catch((error) => {
      if (!cancelled) setAdminUserListError(error instanceof Error ? error.message : 'Could not load Pebble users.');
    });
    return () => { cancelled = true; };
  }, [isChiefAdmin, adminToken]);

  useEffect(() => {
    if (!viewingOtherUser || !isChiefAdmin || !adminToken) {
      setOtherUserStream(null);
      setOtherUserLoading(false);
      setOtherUserError('');
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setOtherUserLoading(true);
      try {
        const response = await fetch(`/api/admin/termux-stream?username=${encodeURIComponent(selectedPebbleUser)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Could not load this user’s Termux stream.');
        if (cancelled) return;
        setPebbleUsers(Array.isArray(data?.usernames) ? data.usernames : []);
        const status = data?.status;
        const startedAt = Number(status?.daemonStartedAt);
        const disconnectedAt = Number(status?.lastDisconnectedAt);
        const retainedLogs = Array.isArray(data?.logs) ? data.logs.map((entry: { line?: unknown; created_at?: unknown }) => {
          if (typeof entry?.line !== 'string') return '';
          const createdAt = typeof entry.created_at === 'string' ? new Date(entry.created_at) : null;
          const timeLabel = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
            : '';
          return timeLabel ? `[${timeLabel}] ${entry.line}` : entry.line;
        }).filter(Boolean) : [];
        setOtherUserStream({
          logs: retainedLogs,
          isOnline: status?.isOnline === true,
          daemonStartedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
          lastDisconnectedAt: Number.isFinite(disconnectedAt) && disconnectedAt > 0 ? disconnectedAt : null,
          daemonRevision: typeof data?.daemonRevision === 'string' ? data.daemonRevision : '',
          expectedRevision: typeof data?.expectedRevision === 'string' ? data.expectedRevision : '',
        });
        setOtherUserError('');
      } catch (error) {
        if (!cancelled) setOtherUserError(error instanceof Error ? error.message : 'Could not load this user’s Termux stream.');
      } finally {
        inFlight = false;
        if (!cancelled) setOtherUserLoading(false);
      }
    };
    setOtherUserStream(null);
    void load();
    const timer = setInterval(() => { void load(); }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedPebbleUser, viewingOtherUser, isChiefAdmin, adminToken]);

  // Auto-scroll when new logs arrive (ONLY when autoScroll is active)
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [displayedLogs, autoScroll]);

  // Mobile & desktop scroll detector: pauses auto-scroll when user scrolls up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const handleCopyLogs = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(displayedLogs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShutdown = () => {
    if (!onShutdownDaemon || isShuttingDown || !isOnline) return;
    setShowShutdownConfirm(true);
  };

  const confirmShutdown = () => {
    const shutdownDaemon = onShutdownDaemon;
    if (!shutdownDaemon) return;
    setShowShutdownConfirm(false);
    setIsShuttingDown(true);
    if (!shutdownDaemon()) setIsShuttingDown(false);
  };

  const formatLogLine = (line: string, idx: number) => {
    if (/NEW TERMUX SESSION STARTED/i.test(line)) {
      const sessionTime = line.match(/^\[([^\]]+)\]/)?.[1];
      return (
        <div key={`session-${idx}`} className="flex items-center gap-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
          <span className="h-px flex-1 bg-emerald-500/40" />
          <span>New Termux session{sessionTime ? ` · ${sessionTime}` : ''}</span>
          <span className="h-px flex-1 bg-emerald-500/40" />
        </div>
      );
    }
    const isError = /error|failed|exception|err_/i.test(line);
    const isSuccess = /success|connected|established|spawned|joined|ready|listening/i.test(line);
    const isWarn = /warn|notice|timed out/i.test(line);
    const isTunnel = /trycloudflare\.com|wss:\/\/|tunnel/i.test(line);
    const isSys = /\[PebbleAFK\]|===|╔|║|╚|██/i.test(line);

    let textColor = 'text-slate-200';
    let bgStyle = '';
    if (isError) {
      textColor = 'text-rose-200 font-semibold';
      bgStyle = 'bg-rose-950/50 px-1 py-0.5 rounded';
    } else if (isSuccess) {
      textColor = 'text-emerald-300 font-semibold';
    } else if (isWarn) {
      textColor = 'text-amber-200';
    } else if (isTunnel) {
      textColor = 'text-sky-300 font-bold';
    } else if (isSys) {
      textColor = 'text-indigo-300 font-bold';
    }

    return (
      <div key={idx} className={`leading-relaxed break-all hover:bg-slate-100/80 px-1.5 py-0.5 rounded transition ${textColor} ${bgStyle}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="w-full flex-1 min-h-0 min-w-0 flex flex-col">
      {/* Main Light Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs flex-1 min-h-0 flex flex-col">
        {/* Card Header (Light Mode) */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-mono font-bold text-sm shadow-2xs shrink-0">
              &gt;_
            </div>
            <div className="hidden sm:block">
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 font-mono tracking-tight">
                Termux Stream
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 font-medium hidden sm:block">
                Live daemon output <span className="text-emerald-300">·</span> Bedrock connections, server transfers, and recovery
              </p>
            </div>
          </div>

          {isChiefAdmin && (
            <label className="order-3 sm:order-none flex min-w-0 flex-1 items-center justify-center gap-2 sm:px-2" title="View another Pebble user’s retained Termux logs">
              <UsersRound className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="hidden shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 md:inline">Stream</span>
              <select
                value={selectedPebbleUser}
                onChange={(event) => setSelectedPebbleUser(event.target.value)}
                className="min-w-0 max-w-[190px] flex-1 sm:flex-none rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-2xs outline-none focus:border-emerald-500"
                aria-label="Choose whose Termux stream to view"
              >
                {(pebbleUsers.length ? pebbleUsers : (pebbleUsername ? [pebbleUsername] : [])).map((username) => (
                  <option key={username} value={username}>@{username}</option>
                ))}
              </select>
              {viewingOtherUser && otherUserStream && (() => {
                const detected = otherUserStream.daemonRevision.toLowerCase();
                const expected = otherUserStream.expectedRevision.toLowerCase();
                const isOutdated = Boolean(detected && expected && !expected.startsWith(detected));
                const buildLabel = detected
                  ? `${isOutdated ? 'Update needed' : 'Build'} · ${detected.slice(0, 8)}`
                  : 'Build unknown';
                return (
                  <span
                    className={`hidden lg:inline-flex shrink-0 rounded-md border px-2 py-1 text-[10px] font-extrabold ${isOutdated ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-600'}`}
                    title={detected ? `Termux last started on revision ${detected}${expected ? `. Current site revision: ${expected}` : ''}. Refreshing the site does not update the Termux daemon.` : 'This daemon has not logged a build revision yet. Updating and restarting Termux will record it.'}
                  >
                    {buildLabel}
                  </span>
                );
              })()}
              {viewingOtherUser && <span className="hidden xl:inline text-[10px] font-semibold text-slate-500">Read only · refreshes every 15s</span>}
            </label>
          )}

          {/* Quick Action Toolbar - Cleaned and Prominent Update Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = !autoScroll;
                setAutoScroll(next);
                if (next && scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                }
              }}
              title={autoScroll ? 'Auto-scroll is ON (Click to pause)' : 'Auto-scroll is PAUSED (Click to resume)'}
              className={`p-2 rounded-xl border transition cursor-pointer shadow-2xs flex items-center justify-center ${
                autoScroll
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ArrowDownCircle className={`w-4 h-4 ${autoScroll ? 'text-emerald-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy entire console log to clipboard"
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            </button>

            {!viewingOtherUser && <button
              type="button"
              onClick={onClearLogs}
              title="Clear terminal view buffer"
              className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>}

            {!viewingOtherUser && onUpdateDaemon && (
              <button
                type="button"
                onClick={onUpdateDaemon}
                title="Update Engine: Pull latest code from GitHub & reload"
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs border border-emerald-500 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline">Update</span>
              </button>
            )}
            {!viewingOtherUser && onShutdownDaemon && (
              <button
                type="button"
                onClick={handleShutdown}
                disabled={!isOnline || isShuttingDown}
                title="Fully stop the Termux daemon, tunnel, and linked dashboard registration"
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Power className="w-4 h-4" />
                <span className="hidden sm:inline">{isShuttingDown ? 'Stopping...' : 'Shut Down'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-950/25 px-3 py-2 sm:px-4">
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${displayedIsOnline ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-slate-500/40 bg-slate-500/10 text-slate-400'}`}>
              {displayedIsOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Daemon uptime</div>
              <div className="truncate font-mono text-sm font-black tabular-nums text-slate-900 sm:text-base">{uptimeLabel}</div>
            </div>
            <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${displayedIsOnline ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'}`} />
          </div>
          <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-300/70 bg-slate-200/40 px-3 py-2 sm:px-4">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-400/40 bg-slate-500/10 text-slate-400">
              <Clock3 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Last disconnected</div>
              <div className="truncate text-[11px] font-bold text-slate-800 sm:text-xs" title={displayedLastDisconnectedAt ? new Date(displayedLastDisconnectedAt).toLocaleString() : 'No disconnect recorded'}>
                {lastDisconnectedLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Expand to fill the available workspace instead of using a fixed-height console. */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 p-4 bg-slate-50/80 border-b border-slate-200 overflow-y-auto font-mono text-xs text-slate-700 space-y-1 select-text overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {viewingOtherUser && otherUserLoading && displayedLogs.length === 0 && (
            <div className="mb-3 rounded-lg border border-sky-300/70 bg-sky-50/90 px-3 py-2 font-sans text-[11px] font-semibold text-sky-900">Loading @{selectedPebbleUser}’s retained stream…</div>
          )}
          {displayedHistoryError && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 font-sans text-[11px] font-semibold text-amber-200">
              {isChiefAdmin && !viewingOtherUser ? 'Admin stream selection unavailable:' : 'Retained history is unavailable:'} {displayedHistoryError}
            </div>
          )}
          {displayedStatusError && (
            <div className="mx-4 mt-2 rounded-xl border border-amber-300/70 bg-amber-50/90 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-900 sm:mx-5">
              Uptime sync unavailable: {displayedStatusError}
            </div>
          )}
          <div className="text-slate-400 pb-2 text-[10px] border-b border-slate-200 mb-2 flex items-center justify-between font-bold">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-slate-300">@{selectedPebbleUser || pebbleUsername || 'PebbleAFK'} Stream</span>
              <span className="text-slate-500">/</span>
              <span className="truncate rounded-md border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 text-emerald-200">{viewingOtherUser ? 'Retained output · 24h' : 'All daemon output · 24h'}</span>
            </span>
            <span>{viewingOtherUser && otherUserLoading ? 'Refreshing… · ' : ''}Recent lines: {displayedLogs.length.toLocaleString()}</span>
          </div>

          {displayedLogs.length === 0 ? (
            <div className="py-20 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/90 mx-auto flex items-center justify-center text-slate-400 shadow-2xs">
                <Terminal className="w-6 h-6 text-slate-400" />
              </div>
              <p className="font-bold text-slate-700 text-xs">Waiting for live Termux stream...</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                Ensure the daemon is running in Termux. Launcher, tunnel, daemon, and Minecraft activity from every server profile will appear here.
              </p>
            </div>
          ) : (
            <>
              {displayedLogs.map((line, idx) => formatLogLine(line, idx))}
            </>
          )}
        </div>

        {/* Footer with Helpful Stream Info (1-Click launch removed - already in Daemon Popup) */}
        <div className="px-5 py-3.5 bg-white">
          <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
            💡 <b>{viewingOtherUser ? 'Read-only account stream:' : 'Complete daemon stream:'}</b> All output forwarded by the Termux launcher is retained under @{selectedPebbleUser || pebbleUsername || 'your PebbleAFK account'} for 24 hours. Logs are not filtered by server profile.
          </p>
        </div>
      </div>
      <ShutdownConfirmDialog
        open={showShutdownConfirm}
        onCancel={() => setShowShutdownConfirm(false)}
        onConfirm={confirmShutdown}
      />
    </div>
  );
};
