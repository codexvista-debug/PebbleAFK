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
  termuxCommand,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
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

  const handleCopyCmd = () => {
    if (termuxCommand && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(termuxCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
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
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-mono font-bold text-sm shadow-2xs shrink-0">
              &gt;_
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-900 flex items-center gap-1.5 font-mono">
                  <span>Termux Android Console</span>
                </h2>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                    isOnline
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {isOnline ? 'Live Stream Active' : 'Daemon Standby'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Real-time continuous terminal stream from Android background daemon</p>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll is ON' : 'Auto-scroll is PAUSED'}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                autoScroll
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScroll ? 'animate-bounce text-emerald-600' : ''}`} />
              <span className="text-[11px]">{autoScroll ? 'Scroll: ON' : 'Paused'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy entire console log to clipboard"
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span className="text-[11px]">{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={onFetchLogs}
              title="Refresh logs from daemon"
              className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition cursor-pointer shadow-2xs"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              title="Clear terminal view buffer"
              className="p-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {onRestartDaemon && (
              <button
                type="button"
                onClick={onRestartDaemon}
                title="Reboot Bedrock daemon core"
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 hover:border-amber-200 font-bold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
              >
                <Power className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] hidden sm:inline">Restart</span>
              </button>
            )}

            {onUpdateDaemon && (
              <button
                type="button"
                onClick={onUpdateDaemon}
                title="Pull latest code from GitHub and reboot daemon"
                className="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-bold text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                <span className="text-[11px]">Update Engine</span>
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

        {/* Footer with 1-Click Launcher & Helpful Tip */}
        <div className="p-4 bg-white space-y-3">
          {termuxCommand && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-600">1-Click Termux Launch Command:</span>
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono">
                <span className="text-slate-700 truncate select-all">{termuxCommand}</span>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            💡 <b>Live Log Stream:</b> This terminal displays every action from startup, version detection, subserver transfer packets (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">/lifesteal</code>), to background Anti-AFK swings in real-time.
          </p>
        </div>
      </div>
    </div>
  );
};
