'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BotLifecycleState, ChatMessage, Telemetry, ActivityLog, BedrockForm, SocketStatus, MsAuthData } from '../types';

export function useDaemonSocket(currentUser: string | null) {
  const [daemonUrl, setDaemonUrlState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      return localStorage.getItem(`pebbleafk_daemon_url_${u}`) || 'ws://localhost:8080';
    }
    return 'ws://localhost:8080';
  });

  const [authToken, setAuthTokenState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      return localStorage.getItem(`pebbleafk_daemon_token_${u}`) || '';
    }
    return '';
  });

  const [status, setStatus] = useState<SocketStatus>('DISCONNECTED');
  const [botStates, setBotStates] = useState<Record<string, BotLifecycleState>>({});
  const [telemetries, setTelemetries] = useState<Record<string, Telemetry>>({});
  const [messagesByBot, setMessagesByBot] = useState<Record<string, ChatMessage[]>>({});
  const [activityLogs, setActivityLogs] = useState<Record<string, ActivityLog[]>>({});
  const [bedrockForms, setBedrockForms] = useState<Record<string, BedrockForm | null>>({});
  const [msAuthData, setMsAuthData] = useState<MsAuthData | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartTimeRef = useRef<number>(0);

  const setDaemonUrl = (url: string) => {
    setDaemonUrlState(url);
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      localStorage.setItem(`pebbleafk_daemon_url_${u}`, url);
    }
  };

  const setAuthToken = (token: string) => {
    setAuthTokenState(token);
    if (typeof window !== 'undefined') {
      const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
      localStorage.setItem(`pebbleafk_daemon_token_${u}`, token);
    }
  };

  // Re-load settings when user changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = currentUser ? currentUser.trim().toLowerCase() : 'guest';
    const savedUrl = localStorage.getItem(`pebbleafk_daemon_url_${u}`) || 'ws://localhost:8080';
    const savedToken = localStorage.getItem(`pebbleafk_daemon_token_${u}`) || '';
    setDaemonUrlState(savedUrl);
    setAuthTokenState(savedToken);
  }, [currentUser]);

  const connect = useCallback(() => {
    if (!currentUser) {
      setStatus('DISCONNECTED');
      return;
    }

    if (socketRef.current) {
      try { socketRef.current.close(); } catch (_) {}
      socketRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const cleanUrl = daemonUrl.trim();
    if (!cleanUrl) {
      setStatus('DISCONNECTED');
      return;
    }

    setStatus('CONNECTING');

    try {
      const ws = new WebSocket(cleanUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('CONNECTED');
        // Send AUTH
        ws.send(JSON.stringify({
          type: 'AUTH',
          payload: { token: authToken, username: currentUser },
        }));

        // Keepalive ping loop
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'AUTH_RESULT') {
            if (msg.payload?.success) {
              setStatus('AUTHENTICATED');
            } else {
              setStatus('AUTH_ERROR');
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
          }

          if (msg.type === 'TELEMETRY') {
            setTelemetries((prev) => ({
              ...prev,
              [msg.payload.botId]: msg.payload,
            }));
          }

          if (msg.type === 'CHAT_MESSAGE') {
            setMessagesByBot((prev) => ({
              ...prev,
              [msg.payload.botId]: [...(prev[msg.payload.botId] || []).slice(-100), msg.payload],
            }));
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
        } catch (_) {}
      };

      ws.onclose = () => {
        setStatus('DISCONNECTED');
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        // Auto-reconnect after 4s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 4000);
      };

      ws.onerror = () => {
        setStatus('DISCONNECTED');
      };
    } catch (_) {
      setStatus('DISCONNECTED');
    }
  }, [currentUser, daemonUrl, authToken]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        try { socketRef.current.close(); } catch (_) {}
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connect]);

  const send = (msg: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  };

  return {
    status,
    daemonUrl,
    setDaemonUrl,
    authToken,
    setAuthToken,
    latency,
    botStates,
    telemetries,
    messagesByBot,
    activityLogs,
    bedrockForms,
    msAuthData,
    reconnect: connect,
    sendChat: (botId: string, message: string) => send({ type: 'SEND_CHAT', payload: { botId, message } }),
    submitForm: (botId: string, formId: number, responseData: any) => send({ type: 'SUBMIT_FORM', payload: { botId, formId, responseData } }),
    closeForm: (botId: string, formId: number) => send({ type: 'CLOSE_FORM', payload: { botId, formId } }),
    startBot: (config: any) => send({ type: 'START_BOT', payload: config }),
    stopBot: (botId: string) => send({ type: 'STOP_BOT', payload: { botId } }),
  };
}
