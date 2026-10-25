'use client';

import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Promise<Socket> | null = null;

/** socket.io-client is imported on first use so pages without live data never download it. */
function connect(): Promise<Socket> {
  socket ??= import('socket.io-client').then(({ io }) =>
    io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', { transports: ['websocket'], withCredentials: true }),
  );
  return socket;
}

/**
 * Joins a realtime room for as long as the component is mounted, re-joining after
 * reconnects. `handlers` can change between renders without re-subscribing.
 */
export function useRoom(
  room: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: Record<string, (payload: any) => void>,
  opts: { orderToken?: string; token?: string | null } = {},
) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    let cleanup = () => {};
    connect().then((s) => {
      if (cancelled) return;
      cleanup = subscribe(s);
    });
    return () => {
      cancelled = true;
      cleanup();
    };

    function subscribe(s: Socket) {
      const join = () => s.emit('subscribe', { room, token: opts.token ?? getAccessToken(), orderToken: opts.orderToken });
      const events = Object.keys(ref.current);
      const bound = events.map((event) => {
        const fn = (payload: unknown) => ref.current[event]?.(payload);
        s.on(event, fn);
        return [event, fn] as const;
      });
      join();
      s.on('connect', join);
      return () => {
        s.emit('unsubscribe', { room });
        s.off('connect', join);
        for (const [event, fn] of bound) s.off(event, fn);
      };
    }
    // handler identity is tracked through ref; only the room and credentials matter here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, opts.orderToken, opts.token]);
}
