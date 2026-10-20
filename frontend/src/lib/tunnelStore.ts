export interface CachedTunnelRecord {
  url: string;
  token: string;
  updatedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __pebbleAfkTunnels: Map<string, CachedTunnelRecord> | undefined;
}

if (!global.__pebbleAfkTunnels) {
  global.__pebbleAfkTunnels = new Map<string, CachedTunnelRecord>();
}

export const sharedUserTunnels = global.__pebbleAfkTunnels;
