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
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartTimeRef = useRef<number>(0);
  const lastPongAtRef = useRef<number>(0);
  const authenticatedAtRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const chatSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    const clean = url.trim().replace(/\/+$/, '');
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) {
      // Ignore localhost
      return;
    }
    if (clean === daemonUrlRef.current.trim().replace(/\/+$/, '')) {
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
    
    // Sever previous user's socket immediately
    if (socketRef.current) {
      safeClose(socketRef.current);
      socketRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    setDaemonUrlState(cleanSaved);
    daemonUrlRef.current = cleanSaved;
    setAuthTokenState(savedToken);
    authTokenRef.current = savedToken;

    try {
      const storedChat = localStorage.getItem(`pebbleafk_chat_${u}`);
      if (storedChat) setMessagesByBot(JSON.parse(storedChat));
      else setMessagesByBot({});
    } catch (_) {
      setMessagesByBot({});
    }

    // Flush all logs, bot states, and telemetry from previous user
    setTerminalLogs([]);
    setBotStates({});
    setBotReasons({});
    setTelemetries({});
    setActivityLogs({});
    setBedrockForms({});
    setMsAuthData(null);
    setLatency(null);
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      setStatus('DISCONNECTED');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('DISCONNECTED');
      return;
    }

    const cleanTarget = url.replace(/\/+$/, '');

    // Do NOT destroy an active or connecting socket unless forced
    if (!force && socketRef.current) {
      const currentUrl = (socketRef.current.url || '').replace(/\/+$/, '');
      if (
        (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) &&
        currentUrl === cleanTarget
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
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (socketRef.current) {
      safeClose(socketRef.current);
      socketRef.current = null;
    }

    setStatus('CONNECTING');

    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;
      connectionTimeoutRef.current = setTimeout(() => {
        if (socketRef.current === ws && ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 20000);

      ws.onopen = () => {
        if (socketRef.current !== ws) return;
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setStatus('CONNECTED');
        lastPongAtRef.current = Date.now();
        authenticatedAtRef.current = 0;
        const effectiveToken =
          authTokenRef.current ||
          (typeof window !== 'undefined'
            ? localStorage.getItem(`pebbleafk_secret_${user.trim().toLowerCase()}`) || ''
            : '');

        try {
          ws.send(JSON.stringify({
            type: 'AUTH',
            payload: { token: effectiveToken, username: user },
          }));
        } catch (_) {}

        connectionTimeoutRef.current = setTimeout(() => {
          if (socketRef.current === ws && ws.readyState === WebSocket.OPEN && !authenticatedAtRef.current) {
            ws.close(4001, 'Daemon authentication timed out');
          }
        }, 12000);

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pageIsVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
            if (pageIsVisible && lastPongAtRef.current && Date.now() - lastPongAtRef.current > 45000) {
              ws.close(4000, 'Daemon heartbeat timed out');
              return;
            }
            pingStartTimeRef.current = Date.now();
            try {
              ws.send(JSON.stringify({ type: 'PING' }));
            } catch (_) {}
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        if (socketRef.current !== ws) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'AUTH_RESULT') {
            if (msg.payload?.success) {
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
              }
              authenticatedAtRef.current = Date.now();
              lastPongAtRef.current = Date.now();
              setStatus('AUTHENTICATED');
            } else {
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
              }
              setStatus('AUTH_ERROR');
              if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
              }
              safeClose(ws);
              if (socketRef.current === ws) socketRef.current = null;
            }
          }

          if (msg.type === 'PONG') {
            lastPongAtRef.current = Date.now();
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
              const bId = msg.payload.botId;
              const currentList = prev[bId] || [];
              if (currentList.some((m) => m.id === msg.payload.id || (m.timestamp === msg.payload.timestamp && m.raw === msg.payload.raw))) {
                return prev;
              }
              const updated = [...currentList.slice(-250), msg.payload];
              const nextMap = { ...prev, [bId]: updated };

              // Debounce localStorage write so incoming chat renders instantly without UI delay
              if (chatSaveTimerRef.current) clearTimeout(chatSaveTimerRef.current);
              chatSaveTimerRef.current = setTimeout(() => {
                if (typeof window !== 'undefined') {
                  const u = currentUserRef.current ? currentUserRef.current.trim().toLowerCase() : 'guest';
                  try {
                    localStorage.setItem(`pebbleafk_chat_${u}`, JSON.stringify(nextMap));
                  } catch (_) {}
                }
              }, 1200);

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
              setTerminalLogs((prev) => {
                if (
                  prev.length === msg.payload.logs.length &&
                  prev[prev.length - 1] === msg.payload.logs[msg.payload.logs.length - 1]
                ) {
                  return prev;
                }
                return msg.payload.logs;
              });
            }
          }

          if (msg.type === 'TERMINAL_LOG_LINE') {
            if (msg.payload?.line) {
              setTerminalLogs((prev) => {
                if (prev.length > 0 && prev[prev.length - 1] === msg.payload.line) {
                  return prev;
                }
                return [...prev.slice(-400), msg.payload.line];
              });
            }
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setStatus('DISCONNECTED');
        setBotStates({});
        setBotReasons({});
        setMsAuthData(null);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (authenticatedAtRef.current && Date.now() - authenticatedAtRef.current >= 30000) {
          reconnectAttemptsRef.current = 0;
        }
        authenticatedAtRef.current = 0;
        reconnectAttemptsRef.current += 1;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        const backoff = Math.min(1000 * (2 ** Math.min(reconnectAttemptsRef.current - 1, 5)), 30000);
        const delay = backoff + Math.floor(Math.random() * 750);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect(false);
        }, delay);
      };

      ws.onerror = () => {
        if (socketRef.current !== ws) return;
        try { ws.close(); } catch (_) {}
      };
    } catch (_) {
      setStatus('DISCONNECTED');
      reconnectAttemptsRef.current += 1;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const backoff = Math.min(1000 * (2 ** Math.min(reconnectAttemptsRef.current - 1, 5)), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect(false);
      }, backoff + Math.floor(Math.random() * 750));
    }
  }, []);

  // Resume promptly after mobile network hand-offs or a tab returning from suspension.
  useEffect(() => {
    const reconnectIfNeeded = () => {
      if (!currentUserRef.current || !daemonUrlRef.current) return;
      const ws = socketRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connect(false);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconnectIfNeeded();
    };

    window.addEventListener('online', reconnectIfNeeded);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', reconnectIfNeeded);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [connect]);

  useEffect(() => {
    if (currentUser && daemonUrl) {
      const target = daemonUrl.trim().replace(/\/+$/, '');
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) &&
        (socketRef.current.url || '').replace(/\/+$/, '') === target
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
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

  const updateDaemon = useCallback(() => {
    setBotStates({});
    return send({ type: 'UPDATE_DAEMON' });
  }, [send]);

  const clearChat = useCallback((botId?: string) => {
    setMessagesByBot((prev) => {
      const next = { ...prev };
      if (botId) {
        delete next[botId];
      } else {
        return {};
      }
      if (typeof window !== 'undefined') {
        const u = currentUserRef.current ? currentUserRef.current.trim().toLowerCase() : 'guest';
        try {
          localStorage.setItem(`pebbleafk_chat_${u}`, JSON.stringify(next));
        } catch (_) {}
      }
      return next;
    });
  }, []);

  const fetchTerminalLogs = useCallback(() => {
    return send({ type: 'GET_TERMINAL_LOGS' });
  }, [send]);

  const clearTerminalLogs = useCallback(() => {
    setTerminalLogs([]);
  }, []);

  const verifyAccount = useCallback((accountId: string, email?: string) => {
    return send({ type: 'VERIFY_ACCOUNT', payload: { accountId, email } });
  }, [send]);

  const sendChat = useCallback((botId: string, message: string) => {
    return send({ type: 'SEND_CHAT', payload: { botId, message } });
  }, [send]);

  const submitForm = useCallback((botId: string, formId: number, responseData: any) => {
    return send({ type: 'SUBMIT_FORM', payload: { botId, formId, responseData } });
  }, [send]);

  const closeForm = useCallback((botId: string, formId: number) => {
    return send({ type: 'CLOSE_FORM', payload: { botId, formId } });
  }, [send]);

  const startBot = useCallback((config: any) => {
    return send({ type: 'START_BOT', payload: config });
  }, [send]);

  const updateBotSettings = useCallback((botId: string, settings: any) => {
    return send({ type: 'UPDATE_SETTINGS', payload: { botId, settings } });
  }, [send]);

  const stopBot = useCallback((botId: string) => {
    return send({ type: 'STOP_BOT', payload: { botId } });
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
    updateDaemon,
    clearChat,
    terminalLogs,
    fetchTerminalLogs,
    clearTerminalLogs,
    verifyAccount,
    sendChat,
    submitForm,
    closeForm,
    startBot,
    updateBotSettings,
    stopBot,
  };
}
