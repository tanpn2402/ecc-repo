import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { connectionStatusAtom, consoleOutputAtom, mrsAtom, reviewingMrIdsAtom } from '../atoms';
import { applyWsEvent, reduceConsoleOutput, reduceReviewingIds } from '../lib/mr-logic.js';
import type { WsEvent } from '../types';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

/**
 * Connects to the MR Management WebSocket, applies every event onto the
 * shared Jotai atoms, and reconnects with capped exponential backoff on
 * disconnect. Events are applied through pure, idempotent reducers
 * (mr-logic.js) so a duplicate or replayed event after a reconnect can
 * never duplicate a row.
 */
export function useWebSocket(enabled: boolean) {
  const setMrs = useSetAtom(mrsAtom);
  const setReviewingIds = useSetAtom(reviewingMrIdsAtom);
  const setConnectionStatus = useSetAtom(connectionStatusAtom);
  const setConsoleOutput = useSetAtom(consoleOutputAtom);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    stoppedRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stoppedRef.current) return;
      setConnectionStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${window.location.host}/ws`);

      socket.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS;
        setConnectionStatus('connected');
      };

      socket.onmessage = (event) => {
        let parsed: WsEvent;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        setMrs((prev) => applyWsEvent(prev, parsed));
        setReviewingIds((prev) => reduceReviewingIds(prev, parsed));
        setConsoleOutput((prev) => reduceConsoleOutput(prev, parsed));
      };

      socket.onclose = () => {
        setConnectionStatus('disconnected');
        if (stoppedRef.current) return;
        reconnectTimer = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled, setMrs, setReviewingIds, setConnectionStatus, setConsoleOutput]);
}

export default useWebSocket;
