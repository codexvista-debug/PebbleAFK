'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Search,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Clock,
  ArrowUpRight,
  Database,
  Terminal,
  Filter,
  Server,
  Info,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { BedrockAccount, PlayerLogEntry, PlayerLogType, ActivityLog } from '@/types';
import { RelativeTime } from '@/components/RelativeTime';

interface AccountLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: BedrockAccount | null;
  serverHost?: string;
  logs: PlayerLogEntry[];
  activityLogs?: ActivityLog[];
  onClearLogs: () => void;
  isLiveConnected?: boolean;
}

export const AccountLogsModal: React.FC<AccountLogsModalProps> = ({
  isOpen,
  onClose,
  account,
  serverHost,
  logs,
  activityLogs = [],
  onClearLogs,
  isLiveConnected = false,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'activity' | 'connection' | 'errors' | 'chat'>('all');
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const cleanPlayerName = (account?.ign || account?.expectedIgn || account?.username || 'Steve').replace(/^@/, '').trim();
  const avatarUrl = `https://crafthead.net/helm/${encodeURIComponent(cleanPlayerName)}/32`;

  const unifiedLogs = useMemo(() => {
    type UnifiedLogItem = {
      id: string;
      timestamp: number;
      type: string;
      message: string;
      details?: string;
      serverHost: string;
      status: string;
      isActivity?: boolean;
    };

    const combined: UnifiedLogItem[] = [];

    // 1. Existing stored player audit logs
    (logs || []).forEach((l) => {
      combined.push({
        id: l.id,
        timestamp: l.timestamp,
        type: l.type,
        message: l.message,
        details: l.details,
        serverHost: l.serverHost || serverHost || '',
        status: l.status,
        isActivity: false,
      });
    });

    // 2. Real-time live bot activity logs from daemon
    (activityLogs || []).forEach((act) => {
      combined.push({
        id: act.id,
        timestamp: act.timestamp,
        type: act.type,
        message: act.message,
        details: undefined,
        serverHost: serverHost || '',
        status: act.type === 'disconnect' ? 'error' : act.type === 'reconnect' || act.type === 'warning' ? 'warning' : 'success',
        isActivity: true,
      });
    });

    // Sort newest first
    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [logs, activityLogs, serverHost]);

  const errorCount = useMemo(() => {
    return unifiedLogs.filter(
      (l) => l.type === 'error' || l.type === 'kicked' || l.type === 'disconnect' || l.type === 'warning' || l.status === 'error'
    ).length;
  }, [unifiedLogs]);

  const filteredLogs = useMemo(() => {
    return unifiedLogs
      .filter((entry) => {
        // Tab filter
        if (activeTab === 'activity') {
          return entry.isActivity || ['anti_afk', 'survival', 'command', 'status'].includes(entry.type);
        }
        if (activeTab === 'connection') {
          return [
            'connecting',
            'handshake',
            'connected',
            'spawned',
            'spawn',
            'connect',
            'reconnecting',
            'reconnect',
            'disconnected',
            'disconnect',
          ].includes(entry.type);
        }
        if (activeTab === 'errors') {
          return (
            entry.type === 'error' ||
            entry.type === 'kicked' ||
            entry.type === 'disconnect' ||
            entry.type === 'warning' ||
            entry.status === 'error'
          );
        }
        if (activeTab === 'chat') {
          return entry.type === 'chat';
        }
        return true;
      })
      .filter((entry) => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        return (
          entry.message.toLowerCase().includes(q) ||
          entry.type.toLowerCase().includes(q) ||
          (entry.details && entry.details.toLowerCase().includes(q)) ||
          entry.serverHost.toLowerCase().includes(q)
        );
      });
  }, [unifiedLogs, activeTab, filterQuery]);

  if (!isOpen || !account) return null;

  const handleCopyLogs = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const text = filteredLogs
        .map(
          (l) =>
            `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message} ${
              l.details || ''
            }`
        )
        .join('\n');
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTypeBadge = (type: string, status: string) => {
    switch (type) {
      case 'spawn':
      case 'spawned':
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            SPAWNED
          </span>
        );
      case 'handshake':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <ShieldCheck className="w-3 h-3 text-purple-600" />
            HANDSHAKE
          </span>
        );
      case 'connect':
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Radio className="w-3 h-3 text-sky-600 animate-pulse" />
            CONNECTING
          </span>
        );
      case 'reconnecting':
      case 'reconnect':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            RECONNECTING
          </span>
        );
      case 'anti_afk':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
            <Zap className="w-3 h-3 text-teal-600" />
            ANTI-AFK
          </span>
        );
      case 'survival':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            SURVIVAL
          </span>
        );
      case 'command':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
            COMMAND
          </span>
        );
      case 'kicked':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            KICKED
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            ERROR
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            WARNING
          </span>
        );
      case 'disconnected':
      case 'disconnect':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            DISCONNECTED
          </span>
        );
      case 'chat':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <MessageSquare className="w-3 h-3 text-indigo-600" />
            CHAT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            ACTIVITY
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shrink-0 shadow-2xs">
              <img
                src={avatarUrl}
                alt={cleanPlayerName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'https://raw.githubusercontent.com/InventivetalentDev/MineRender/master/dist/steve.png';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base text-slate-900 font-mono">
                  @{cleanPlayerName}
                </h2>
                {isLiveConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Idle
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono">
                <Server className="w-3 h-3 text-slate-400 inline" />
                <span className="text-slate-700 font-semibold">{serverHost || 'Configured Server'}</span>
                <span>•</span>
                <Database className="w-3 h-3 text-emerald-600 inline" />
                <span className="text-emerald-700 font-medium">Supabase Cloud Sync</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Action Bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Logs ({unifiedLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                activeTab === 'activity'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Live Activity
            </button>
            <button
              onClick={() => setActiveTab('connection')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                activeTab === 'connection'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Connections
            </button>
            <button
              onClick={() => setActiveTab('errors')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                activeTab === 'errors'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : errorCount > 0
                  ? 'text-rose-700 hover:bg-rose-50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Kicks & Errors</span>
              {errorCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'errors' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {errorCount}
                </span>
              )}
            </button>
          </div>

          {/* Search + Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-2xs"
              />
            </div>

            <button
              onClick={handleCopyLogs}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer text-xs font-bold flex items-center gap-1.5 shadow-2xs shrink-0"
              title="Copy visible logs to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {confirmClear ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    onClearLogs();
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition cursor-pointer shadow-2xs"
                >
                  Confirm Clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={logs.length === 0}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition cursor-pointer shadow-2xs shrink-0 disabled:opacity-40"
                title="Clear player logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Logs Feed Container */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-2 bg-slate-50/60 min-h-[340px]">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-2xs">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">No logs captured yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  Connection attempts, RakNet handshakes, world spawns, kick reasons, and error audits for @{cleanPlayerName} will record and sync here in real time.
                </p>
              </div>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const isError = entry.status === 'error' || entry.type === 'kicked' || entry.type === 'error';
              const isWarning =
                entry.status === 'warning' || entry.type === 'warning' || entry.type === 'reconnecting' || entry.type === 'disconnected';
              const isSuccess = entry.type === 'spawned' || entry.type === 'connected';

              return (
                <div
                  key={entry.id}
                  className={`p-3 rounded-xl border transition shadow-2xs ${
                    isError
                      ? 'border-l-4 border-l-rose-500 bg-rose-50/40 border-rose-200 text-rose-950'
                      : isWarning
                      ? 'border-l-4 border-l-amber-500 bg-amber-50/30 border-amber-200 text-amber-950'
                      : isSuccess
                      ? 'border-l-4 border-l-emerald-500 bg-emerald-50/30 border-emerald-200 text-emerald-950'
                      : entry.type === 'connecting' || entry.type === 'connect'
                      ? 'border-l-4 border-l-sky-500 bg-white border-slate-200 text-slate-800'
                      : 'border-l-4 border-l-slate-300 bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RelativeTime timestamp={entry.timestamp} className="text-[10px] font-mono font-medium text-slate-400 select-none" />
                      {getTypeBadge(entry.type, entry.status)}
                      {entry.serverHost && (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/70">
                          {entry.serverHost}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-mono font-medium mt-1 leading-relaxed break-words text-slate-800">
                    {entry.message}
                  </p>

                  {entry.details && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-600 font-mono text-[11px] border border-slate-200/80 max-w-fit">
                      <span className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Detail:</span>
                      <span className="font-semibold text-slate-700">{entry.details}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
