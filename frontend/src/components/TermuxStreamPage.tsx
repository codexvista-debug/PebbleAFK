'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, Trash2, ArrowDownCircle, ArrowUp, Power } from 'lucide-react';
import { ShutdownConfirmDialog } from './ShutdownConfirmDialog';

interface TermuxStreamPageProps {
  logs: string[];
  isOnline: boolean;
  onFetchLogs: () => void;
  onClearLogs: () => void;
  onRestartDaemon?: () => void;
  onUpdateDaemon?: () => void;
  onShutdownDaemon?: () => boolean;
  termuxCommand?: string;
  serverName?: string;
}

export const TermuxStreamPage: React.FC<TermuxStreamPageProps> = ({
  logs,
  isOnline,
  onFetchLogs,
  onClearLogs,
  onRestartDaemon,
  onUpdateDaemon,
  onShutdownDaemon,
  serverName,
}) => {
  const [copied, setCopied] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new logs arrive (ONLY when autoScroll is active)
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

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
      navigator.clipboard.writeText(logs.join('\n'));
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
    <div className="max-w-6xl mx-auto space-y-6 w-full">
      {/* Main Light Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs flex flex-col">
        {/* Card Header (Light Mode) */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-row items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-mono font-bold text-sm shadow-2xs shrink-0">
              &gt;_
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 font-mono tracking-tight">
                Termux Stream
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 font-medium hidden sm:block">
                Live daemon output <span className="text-emerald-300">·</span> Bedrock connections, server transfers, and recovery
              </p>
            </div>
          </div>

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

            <button
              type="button"
              onClick={onClearLogs}
              title="Clear terminal view buffer"
              className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {onUpdateDaemon && (
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
            {onShutdownDaemon && (
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

        {/* Terminal Screen Body (Exact Same Size as Chat Box: h-[580px] sm:h-[650px]) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="p-4 bg-slate-50/80 border-b border-slate-200 h-[580px] sm:h-[650px] overflow-y-auto font-mono text-xs text-slate-700 space-y-1 select-text overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="text-slate-400 pb-2 text-[10px] border-b border-slate-200 mb-2 flex items-center justify-between font-bold">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-slate-300">PebbleAFK Stream</span>
              <span className="text-slate-500">/</span>
              <span className="truncate rounded-md border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 text-emerald-200">{serverName || 'Active server'}</span>
            </span>
            <span>Total Log Lines: {logs.length}</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-20 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/90 mx-auto flex items-center justify-center text-slate-400 shadow-2xs">
                <Terminal className="w-6 h-6 text-slate-400" />
              </div>
              <p className="font-bold text-slate-700 text-xs">Waiting for live Termux stream...</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                Ensure the daemon is running in Termux. Startup handshakes, Minecraft Bedrock packets, subserver transfers, and Anti-AFK rotations will appear here.
              </p>
            </div>
          ) : (
            <>
              {logs.map((line, idx) => formatLogLine(line, idx))}
            </>
          )}
        </div>

        {/* Footer with Helpful Stream Info (1-Click launch removed - already in Daemon Popup) */}
        <div className="px-5 py-3.5 bg-white">
          <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
            💡 <b>Live Log Stream:</b> Captures live Termux daemon stdout/stderr, server transfers (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">/lifesteal</code>), keepalives, and Anti-AFK activity.
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
