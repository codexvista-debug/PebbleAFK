'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal, Copy, Check, RotateCw, Trash2, ArrowDownCircle } from 'lucide-react';

interface TermuxConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  isOnline: boolean;
  onFetchLogs: () => void;
  onClearLogs: () => void;
  onRestartDaemon?: () => void;
  onUpdateDaemon?: () => void;
  termuxCommand?: string;
}

export const TermuxConsoleModal: React.FC<TermuxConsoleModalProps> = ({
  isOpen,
  onClose,
  logs,
  isOnline,
  onFetchLogs,
  onClearLogs,
  onRestartDaemon,
  onUpdateDaemon,
  termuxCommand,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      onFetchLogs();
    }
  }, [isOpen, onFetchLogs]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCmd = () => {
    if (termuxCommand && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(termuxCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  };

  const formatLogLine = (line: string, idx: number) => {
    const isError = /error|failed|exception|err_/i.test(line);
    const isSuccess = /success|connected|established|spawned|joined|ready/i.test(line);
    const isWarn = /warn|notice|timed out/i.test(line);
    const isTunnel = /trycloudflare\.com|wss:\/\/|tunnel/i.test(line);
    const isSys = /\[PebbleAFK\]|===/i.test(line);

    let textColor = 'text-slate-300';
    if (isError) textColor = 'text-rose-400 font-semibold';
    else if (isSuccess) textColor = 'text-emerald-400 font-semibold';
    else if (isWarn) textColor = 'text-amber-300';
    else if (isTunnel) textColor = 'text-cyan-300';
    else if (isSys) textColor = 'text-sky-300';

    return (
      <div key={idx} className={`leading-relaxed break-all hover:bg-slate-900/60 px-1 rounded transition ${textColor}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#0b0f17] border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-2xs font-mono font-bold text-xs">
              &gt;_
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-100 flex items-center gap-1.5 font-mono">
                  <span>Termux Android Console</span>
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {isOnline ? 'Live Stream' : 'Daemon Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Real-time terminal stream from Android Termux Bedrock runner</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll is ON' : 'Auto-scroll is PAUSED'}
              className={`p-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                autoScroll
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScroll ? 'animate-bounce' : ''}`} />
              <span className="text-[10px] hidden sm:inline">{autoScroll ? 'Scroll: ON' : 'Paused'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy entire console log to clipboard"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onFetchLogs}
              title="Refresh logs from daemon"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition cursor-pointer shadow-2xs"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              title="Clear terminal buffer"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-900 transition cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Terminal Screen Body */}
        <div className="p-4 bg-[#070a0f] flex-1 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 select-text">
          <div className="text-slate-600 pb-2 text-[10px] border-b border-slate-800/80 mb-2 flex items-center justify-between">
            <span>Termux Bedrock Core Daemon • Output Stream</span>
            <span>Lines: {logs.length}</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Terminal className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-400">Waiting for live Termux stream...</p>
              <p className="text-[11px] text-slate-600">
                Ensure the daemon is running in Termux. Logs and handshake packets will stream here automatically.
              </p>
            </div>
          ) : (
            <>
              {logs.map((line, idx) => formatLogLine(line, idx))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>

        {/* Footer with 1-Click Launcher & Quick Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#0c1017] space-y-3">
          {termuxCommand && (
            <div className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono">
              <span className="text-slate-400 truncate select-all">{termuxCommand}</span>
              <button
                type="button"
                onClick={handleCopyCmd}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shrink-0 transition flex items-center gap-1 cursor-pointer"
              >
                {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 font-mono">
              Tip: You never need to screenshot Termux — view all real-time events right here!
            </span>
            <div className="flex items-center gap-2">
              {onUpdateDaemon && isOnline && (
                <button
                  type="button"
                  onClick={onUpdateDaemon}
                  className="px-3 py-1.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800 text-sky-300 font-bold text-xs transition cursor-pointer"
                >
                  Update Engine
                </button>
              )}
              {onRestartDaemon && isOnline && (
                <button
                  type="button"
                  onClick={onRestartDaemon}
                  className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800 text-amber-300 font-bold text-xs transition cursor-pointer"
                >
                  Restart Daemon
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer border border-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
