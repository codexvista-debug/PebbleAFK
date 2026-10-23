'use client';

import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Radio, ShieldAlert, Server, UserRound } from 'lucide-react';
import { Account, BotLifecycleState, FreshSmpDiagnosticState, ServerProfile } from '@/types';

interface Props {
  servers: ServerProfile[];
  accounts: Account[];
  diagnostics: Record<string, FreshSmpDiagnosticState>;
  botStates: Record<string, BotLifecycleState>;
  botReasons: Record<string, string>;
  now: number;
}

const phaseLabel: Record<FreshSmpDiagnosticState['phase'], string> = {
  offline: 'Offline', connecting: 'Connecting', lobby: 'FreshSMP lobby', queue: '/lifesteal queue',
  lifesteal: '/lifesteal connected', reconnecting: 'Reconnecting',
};

function elapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function FreshSmpDiagnosticsPage({ servers, accounts, diagnostics, botStates, botReasons, now }: Props) {
  const profiles = servers.filter((server) => server.serverHost.toLowerCase().includes('freshsmp'));

  return (
    <div className="w-full min-w-0 max-w-6xl mx-auto space-y-5 pb-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-300 to-orange-400 text-amber-950 border border-amber-200 shadow-sm"><Activity className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">FreshSMP Lifesteal Diagnostics</h1>
            <p className="mt-1.5 max-w-4xl text-sm leading-6 font-medium text-slate-600">Follow each account from Bedrock login through the resource-pack check, Lifesteal queue, and subserver. Signet retries silent or failed transfers, then refreshes a stale Bedrock session after repeated short returns while pacing reconnects across accounts.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700"><Radio className="inline w-4 h-4 mr-2 text-sky-500" />RakNet login and world spawn</div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700"><ShieldAlert className="inline w-4 h-4 mr-2 text-amber-500" />Resource-pack exchange observations</div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700"><Clock3 className="inline w-4 h-4 mr-2 text-rose-500" />Silent attempts checked at 60 seconds · repeated failures escalate</div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No FreshSMP server profiles are configured for this account yet.</div>
      ) : profiles.map((profile) => {
        const assigned = (profile.assignedAccountIds?.length ? profile.assignedAccountIds : [profile.accountId])
          .map((id) => accounts.find((account) => account.id === id)).filter((account): account is Account => Boolean(account));
        const isStableInLifesteal = (account: Account) => {
          const botId = `${profile.id}__${account.id}`;
          const detail = diagnostics[botId];
          const state = botStates[botId];
          return detail?.phase === 'lifesteal' && typeof detail.lifestealSessionStartedAt === 'number' &&
            now - detail.lifestealSessionStartedAt >= 60_000 && (state === 'SPAWNED' || state === 'LOGGED_IN');
        };
        const unstable = assigned.filter((account) => !isStableInLifesteal(account));
        const stableCount = assigned.length - unstable.length;
        return (
          <section key={profile.id} className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0"><h2 className="text-base font-black tracking-tight text-slate-900">{profile.name}</h2><p className="mt-0.5 text-xs font-medium text-slate-500"><Server className="inline w-3.5 h-3.5 mr-1 text-sky-500" />{profile.serverHost}:{profile.serverPort} · {unstable.length} unstable · {stableCount} stable hidden</p></div>
              <span className="shrink-0 text-[11px] font-extrabold rounded-full px-2.5 py-1 bg-sky-100 text-sky-800 border border-sky-200">FreshSMP only</span>
            </div>
            {assigned.length === 0 ? <p className="p-5 text-xs text-slate-500">No linked accounts to monitor.</p> : unstable.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto w-6 h-6 text-emerald-500" />
                <p className="mt-2 text-sm font-bold text-emerald-800">All assigned accounts have held Lifesteal for at least 60 seconds.</p>
                <p className="mt-1 text-xs text-slate-500">Stable accounts are hidden here; they will reappear if they disconnect or leave the subserver.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
                {unstable.map((account) => {
                  const botId = `${profile.id}__${account.id}`;
                  const detail = diagnostics[botId];
                  const phase = detail?.phase || (botStates[botId] === 'RECONNECTING' || botStates[botId] === 'CONNECTING' ? 'reconnecting' : 'offline');
                  const phaseDuration = detail ? Math.max(0, now - detail.phaseSince) : 0;
                  const attemptDuration = detail?.lifestealAttemptStartedAt ? Math.max(0, now - detail.lifestealAttemptStartedAt) : 0;
                  const waitingOverMinute = Boolean(detail?.lifestealAttemptStartedAt && !detail.lifestealSessionStartedAt && attemptDuration >= 60_000);
                  const latestProblem = [...(detail?.events || [])].reverse().find((event) => event.severity === 'error' || event.severity === 'warning');
                  const status = botStates[botId] || 'DISCONNECTED';
                  return (
                    <article key={account.id} className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-100 to-indigo-100 border border-sky-200 flex items-center justify-center text-xs font-black text-sky-800 shadow-sm"><UserRound className="w-4 h-4" /></div><div><h3 className="text-sm font-black tracking-tight text-slate-900">{account.ign || account.username}</h3><p className="mt-0.5 text-xs font-medium text-slate-500">{account.username} · {status}</p></div></div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold border shadow-sm ${waitingOverMinute || phase === 'reconnecting' ? 'bg-rose-50 text-rose-800 border-rose-200' : phase === 'lifesteal' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                            {waitingOverMinute ? 'Queue over 60 seconds' : phaseLabel[phase]}
                          </span>
                          {detail && <span className="text-[11px] font-semibold text-slate-500">{detail.lifestealAttemptStartedAt ? `Attempt ${elapsed(attemptDuration)}` : elapsed(phaseDuration)}</span>}
                        </div>
                      </div>
                      {detail?.signet && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] font-bold text-emerald-900">
                        <span className="text-emerald-800">Signet</span>
                        <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5">Short returns {detail.signet.shortReturnStreak}/3</span>
                        <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5">Queue failures {detail.signet.queueFailureStreak}/3</span>
                        {detail.signet.recoveryCycle > 0 && <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5">Session resets {detail.signet.recoveryCycle}</span>}
                        {detail.signet.nextAction && <span className="basis-full text-emerald-800">{detail.signet.nextAction}{detail.signet.nextActionAt ? ` in ${elapsed(Math.max(0, detail.signet.nextActionAt - now))}` : ''}</span>}
                      </div>}
                      {botReasons[botId] && <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs font-bold leading-relaxed text-rose-800 shadow-sm"><AlertTriangle className="inline w-4 h-4 mr-1.5 align-[-3px] text-rose-600" />{botReasons[botId]}</div>}
                      {latestProblem && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-950/25 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-200"><AlertTriangle className="inline w-4 h-4 mr-1.5 align-[-3px] text-amber-400" />Most recent issue: {latestProblem.message}</p>}
                      {!detail ? <p className="mt-3 text-xs font-medium text-slate-500">No daemon diagnostic events yet. Connect an account or reconnect the daemon to start collecting evidence.</p> : detail.events.length === 0 ? <p className="mt-3 text-xs font-medium text-slate-500">Waiting for the first connection event.</p> : (
                        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                          {[...detail.events].reverse().map((event) => (
                            <div key={event.id} className="flex gap-2.5 px-3 py-2.5">
                              <span className="mt-0.5 shrink-0">{event.severity === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : event.severity === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : event.severity === 'warning' ? <ShieldAlert className="w-4 h-4 text-amber-500" /> : <Activity className="w-4 h-4 text-sky-500" />}</span>
                              <div className="min-w-0 flex-1"><p className="text-xs leading-relaxed font-medium text-slate-700">{event.message}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{new Date(event.timestamp).toLocaleString()} · {event.category.replace('_', ' ')}{event.durationMs !== undefined ? ` · ${elapsed(event.durationMs)}` : ''}</p></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs leading-relaxed font-medium text-slate-500 px-1">These diagnostics show where a failure occurs. Queue waits, FreshSMP service errors, and RakNet transport timeouts are different issues; Signet handles repeated transfer failures without retrying a confirmed live queue. Events are retained for the current daemon process and resynced when the dashboard reconnects.</p>
    </div>
  );
}
