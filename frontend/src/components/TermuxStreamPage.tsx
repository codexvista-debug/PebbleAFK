'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, RotateCw, Trash2, ArrowDownCircle, RefreshCw, Power } from 'lucide-react';

interface TermuxStreamPageProps {
  logs: string[];
  isOnline: boolean;
  onFetchLogs: () => void;
  onClearLogs: () => void;
  onRestartDaemon?: () => void;
  onUpdateDaemon?: () => void;
  termuxCommand?: string;
}

export const TermuxStreamPage: React.FC<TermuxStreamPageProps> = ({
  logs,
  isOnline,
  onFetchLogs,
  onClearLogs,
  onRestartDaemon,
  onUpdateDaemon,
}) => {
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatLogLine = (line: string, idx: number) => {
    const isError = /error|failed|exception|err_/i.test(line);
    const isSuccess = /success|connected|established|spawned|joined|ready|listening/i.test(line);
    const isWarn = /warn|notice|timed out/i.test(line);
    const isTunnel = /trycloudflare\.com|wss:\/\/|tunnel/i.test(line);
    const isSys = /\[PebbleAFK\]|===|╔|║|╚|██/i.test(line);

    let textColor = 'text-slate-700';
    let bgStyle = '';
    if (isError) {
      textColor = 'text-rose-700 font-semibold';
      bgStyle = 'bg-rose-50/80 px-1 py-0.5 rounded';
    } else if (isSuccess) {
      textColor = 'text-emerald-700 font-semibold';
    } else if (isWarn) {
      textColor = 'text-amber-800';
    } else if (isTunnel) {
      textColor = 'text-sky-700 font-bold';
    } else if (isSys) {
      textColor = 'text-indigo-800 font-bold';
    }

    return (
      <div key={idx} className={`leading-relaxed break-all hover:bg-slate-100/80 px-1.5 py-0.5 rounded transition ${textColor} ${bgStyle}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Main Light Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs flex flex-col">
        {/* Card Header (Light Mode) */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-row items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-mono font-bold text-sm shadow-2xs shrink-0">
              &gt;_
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 font-mono">
                Termux Android Console
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">
                Real-time continuous terminal stream from Android background daemon
              </p>
            </div>
          </div>

          {/* Quick Action Toolbar - Compact Icon-Only Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
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
              onClick={onFetchLogs}
              title="Refresh logs from daemon"
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              title="Clear terminal view buffer"
              className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {onRestartDaemon && (
              <button
                type="button"
                onClick={onRestartDaemon}
                title="Reboot Bedrock daemon core"
                className="p-2 rounded-xl bg-white hover:bg-amber-50 text-amber-600 border border-slate-200 hover:border-amber-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
              >
                <Power className="w-4 h-4" />
              </button>
            )}

            {onUpdateDaemon && (
              <button
                type="button"
                onClick={onUpdateDaemon}
                title="Update Engine: Pull latest code from GitHub & reload"
                className="p-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 transition cursor-pointer shadow-2xs flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Terminal Screen Body (100% Crisp Light Mode) */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 h-[520px] overflow-y-auto font-mono text-xs text-slate-700 space-y-1 select-text">
          <div className="text-slate-400 pb-2 text-[10px] border-b border-slate-200 mb-2 flex items-center justify-between font-bold">
            <span>PebbleAFK • Android Termux Bedrock Core Stream</span>
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
              <div ref={logsEndRef} />
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
    </div>
  );
};
