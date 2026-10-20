'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BotLifecycleState, ChatMessage, Telemetry, ActivityLog, BedrockForm, SocketStatus, MsAuthData } from '../types';

export function useDaemonSocket(
  currentUser: string | null,
  onAccountVerified?: (payload: { botId: string; email: string; ign: string; uuid?: string; avatarUrl?: string }) => void
) {
  const onAccountVerifiedRef = useRef(onAccountVerified);
  useEffect(() => {
    onAccountVerifiedRef.current = onAccountVerified;
  }, [onAccountVerified]);
  const [daemonUrl, setDaemonUrlState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      const stored = localStorage.getItem(`pebbleafk_daemon_url_${u}`) || '';
      // Filter out localhost / 127.0.0.1 to avoid Chrome Private Network Access prompt
      if (stored && (stored.includes('localhost') || stored.includes('127.0.0.1'))) {
        localStorage.removeItem(`pebbleafk_daemon_url_${u}`);
        return '';
      }
      return stored;
    }
    return '';
  });

  const [authToken, setAuthTokenState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      return localStorage.getItem(`pebbleafk_daemon_token_${u}`) || localStorage.getItem(`pebbleafk_secret_${u}`) || '';
    }
    return '';
  });

  const [status, setStatus] = useState<SocketStatus>('DISCONNECTED');
  const [botStates, setBotStates] = useState<Record<string, BotLifecycleState>>({});
  const [botReasons, setBotReasons] = useState<Record<string, string>>({});
  const [telemetries, setTelemetries] = useState<Record<string, Telemetry>>({});
  const [messagesByBot, setMessagesByBot] = useState<Record<string, ChatMessage[]>>(() => {
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      try {
        const stored = localStorage.getItem(`pebbleafk_chat_${u}`);
        if (stored) return JSON.parse(stored);
      } catch (_) {}
    }
    return {};
  });
  const [activityLogs, setActivityLogs] = useState<Record<string, ActivityLog[]>>({});
  const [bedrockForms, setBedrockForms] = useState<Record<string, BedrockForm | null>>({});
  const [msAuthData, setMsAuthData] = useState<MsAuthData | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartTimeRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const daemonUrlRef = useRef(daemonUrl);
  daemonUrlRef.current = daemonUrl;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const safeClose = (ws: WebSocket | null) => {
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch (_) {}
  };

  const setDaemonUrl = useCallback((url: string) => {
    const clean = url.trim();
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) {
      // Ignore localhost
      return;
    }
    if (clean === daemonUrlRef.current) {
      return;
    }
    daemonUrlRef.current = clean;
    setDaemonUrlState(clean);
    if (typeof window !== 'undefined') {
      const u = currentUserRef.current ? currentUserRef.current.trim().toLowerCase() : 'guest';
      localStorage.setItem(`pebbleafk_daemon_url_${u}`, clean);
    }
  }, []);

  const setAuthToken = useCallback((token: string) => {
    const clean = token.trim();
    if (clean === authTokenRef.current) {
      return;
    }
    authTokenRef.current = clean;
    setAuthTokenState(clean);
    if (typeof window !== 'undefined') {
      const u = currentUserRef.current ? currentUserRef.current.trim().toLowerCase() : 'guest';
      localStorage.setItem(`pebbleafk_daemon_token_${u}`, clean);
    }
  }, []);

  // Clean user switching
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
    const savedUrl = localStorage.getItem(`pebbleafk_daemon_url_${u}`) || '';
    const cleanSaved = (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1')) ? '' : savedUrl;
    const savedToken = localStorage.getItem(`pebbleafk_daemon_token_${u}`) || localStorage.getItem(`pebbleafk_secret_${u}`) || '';
    
    setDaemonUrlState(cleanSaved);
    setAuthTokenState(savedToken);
    try {
      const storedChat = localStorage.getItem(`pebbleafk_chat_${u}`);
      if (storedChat) setMessagesByBot(JSON.parse(storedChat));
      else setMessagesByBot({});
    } catch (_) {
      setMessagesByBot({});
    }
    setStatus('DISCONNECTED');
  }, [currentUser]);

  const connect = useCallback((force = false) => {
    const user = currentUserRef.current;
    const url = (daemonUrlRef.current || '').trim();

    if (!user || !url || url.includes('localhost') || url.includes('127.0.0.1')) {
      if (socketRef.current) {
        safeClose(socketRef.current);
        socketRef.current = null;
      }
      setStatus('DISCONNECTED');
      return;
    }

    // Do NOT destroy an active or connecting socket unless forced
    if (!force && socketRef.current) {
      if (
        (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) &&
        socketRef.current.url.replace(/\/+$/, '') === url
      ) {
        return;
      }
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (socketRef.current) {
      safeClose(socketRef.current);
      socketRef.current = null;
    }

    setStatus('CONNECTING');

    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        if (socketRef.current !== ws) return;
        reconnectAttemptsRef.current = 0;
        setStatus('CONNECTED');
        const effectiveToken =
          authTokenRef.current ||
          (typeof window !== 'undefined'
            ? localStorage.getItem(`pebbleafk_secret_${user.trim().toLowerCase()}`) || ''
            : '');

        ws.send(JSON.stringify({
          type: 'AUTH',
          payload: { token: effectiveToken, username: user },
        }));

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 12000);
      };

      ws.onmessage = (event) => {
        if (socketRef.current !== ws) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'AUTH_RESULT') {
            if (msg.payload?.success) {
              setStatus('AUTHENTICATED');
            } else {
              setStatus('AUTH_ERROR');
              safeClose(ws);
              if (socketRef.current === ws) socketRef.current = null;
            }
          }

          if (msg.type === 'PONG') {
            if (pingStartTimeRef.current) {
              setLatency(Date.now() - pingStartTimeRef.current);
            }
          }

          if (msg.type === 'BOT_STATE') {
            setBotStates((prev) => ({
              ...prev,
              [msg.payload.botId]: msg.payload.state,
            }));
            if (msg.payload.reason) {
              setBotReasons((prev) => ({
                ...prev,
                [msg.payload.botId]: msg.payload.reason,
              }));
            }
          }

          if (msg.type === 'TELEMETRY') {
            setTelemetries((prev) => ({
              ...prev,
              [msg.payload.botId]: msg.payload,
            }));
          }

          if (msg.type === 'CHAT_MESSAGE') {
            setMessagesByBot((prev) => {
              const currentList = prev[msg.payload.botId] || [];
              if (currentList.some((m) => m.id === msg.payload.id || (m.timestamp === msg.payload.timestamp && m.raw === msg.payload.raw))) {
                return prev;
              }
              const updated = [...currentList.slice(-150), msg.payload];
              const nextMap = { ...prev, [msg.payload.botId]: updated };
              if (typeof window !== 'undefined') {
                const u = currentUserRef.current ? currentUserRef.current.trim().toLowerCase() : 'guest';
                try {
                  localStorage.setItem(`pebbleafk_chat_${u}`, JSON.stringify(nextMap));
                } catch (_) {}
              }
              return nextMap;
            });
          }

          if (msg.type === 'ACTIVITY_LOG') {
            setActivityLogs((prev) => ({
              ...prev,
              [msg.payload.botId]: [...(prev[msg.payload.botId] || []).slice(-100), msg.payload],
            }));
          }

          if (msg.type === 'BEDROCK_FORM') {
            setBedrockForms((prev) => ({
              ...prev,
              [msg.payload.botId]: msg.payload,
            }));
          }

          if (msg.type === 'MS_AUTH_CODE') {
            setMsAuthData(msg.payload);
          }

          if (msg.type === 'ACCOUNT_VERIFIED') {
            setMsAuthData(null);
            if (onAccountVerifiedRef.current) {
              onAccountVerifiedRef.current(msg.payload);
            }
          }

          if (msg.type === 'TERMINAL_LOGS') {
            if (Array.isArray(msg.payload?.logs)) {
              setTerminalLogs(msg.payload.logs);
            }
          }

          if (msg.type === 'TERMINAL_LOG_LINE') {
            if (msg.payload?.line) {
              setTerminalLogs((prev) => [...prev.slice(-400), msg.payload.line]);
            }
          }
        } catch (_) {}
      };

      ws.onclose = async () => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        setStatus('DISCONNECTED');
        setBotStates({});
        setBotReasons({});
        setMsAuthData(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        reconnectAttemptsRef.current += 1;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect(false);
        }, 4000);
      };

      ws.onerror = () => {
        if (socketRef.current !== ws) return;
      };
    } catch (_) {
      setStatus('DISCONNECTED');
    }
  }, []);

  useEffect(() => {
    if (currentUser && daemonUrl) {
      const target = daemonUrl.trim().replace(/\/+$/, '');
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) &&
        socketRef.current.url.replace(/\/+$/, '') === target
      ) {
        // Socket is already active and healthy. Keep connection alive!
        return;
      }
      connect(false);
    } else {
      if (socketRef.current) {
        safeClose(socketRef.current);
        socketRef.current = null;
      }
      setStatus('DISCONNECTED');
    }
  }, [currentUser, daemonUrl, connect]);

  const send = useCallback((msg: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const restartDaemon = useCallback((reason = 'Restart requested from dashboard') => {
    setBotStates({});
    return send({ type: 'RESTART_DAEMON', payload: { reason } });
  }, [send]);

  return {
    status,
    daemonUrl,
    setDaemonUrl,
    authToken,
    setAuthToken,
    latency,
    botStates,
    botReasons,
    telemetries,
    messagesByBot,
    activityLogs,
    bedrockForms,
    msAuthData,
    setMsAuthData,
    reconnect: connect,
    restartDaemon,
    updateDaemon: () => {
      setBotStates({});
      return send({ type: 'UPDATE_DAEMON' });
    },
    clearChat: (botId?: string) => {
      setMessagesByBot((prev) => {
        const next = { ...prev };
        if (botId) {
          delete next[botId];
        } else {
          return {};
        }
        if (typeof window !== 'undefined') {
          const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
          try {
            localStorage.setItem(`pebbleafk_chat_${u}`, JSON.stringify(next));
          } catch (_) {}
        }
        return next;
      });
    },
    terminalLogs,
    fetchTerminalLogs: () => send({ type: 'GET_TERMINAL_LOGS' }),
    clearTerminalLogs: () => setTerminalLogs([]),
    verifyAccount: (accountId: string, email?: string) => send({ type: 'VERIFY_ACCOUNT', payload: { accountId, email } }),
    sendChat: (botId: string, message: string) => send({ type: 'SEND_CHAT', payload: { botId, message } }),
    submitForm: (botId: string, formId: number, responseData: any) => send({ type: 'SUBMIT_FORM', payload: { botId, formId, responseData } }),
    closeForm: (botId: string, formId: number) => send({ type: 'CLOSE_FORM', payload: { botId, formId } }),
    startBot: (config: any) => send({ type: 'START_BOT', payload: config }),
    stopBot: (botId: string) => send({ type: 'STOP_BOT', payload: { botId } }),
  };
}
