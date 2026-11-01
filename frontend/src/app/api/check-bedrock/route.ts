import crypto from 'crypto';
import dgram from 'dgram';
import dns from 'dns';
import net from 'net';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BedrockProbeResult {
  online: boolean;
  transport?: 'nethernet' | 'raknet';
  signalling?: 'https' | 'http' | null;
  version?: string | null;
  protocol?: number | null;
  motd?: string | null;
  levelName?: string | null;
  players?: { online: number; max: number } | null;
  checkedTransports?: string[];
  error?: string;
}

const RAKNET_MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const POSITIVE_CACHE_TTL_MS = 12_000;
const probeCache = new Map<string, { expiresAt: number; payload: BedrockProbeResult }>();

function stripMinecraftFormatting(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\u00a7[0-9a-fk-org]/gi, '').trim();
  return cleaned || null;
}

function normalizeHost(rawHost: string): string | null {
  const trimmed = rawHost
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  if (!trimmed || trimmed.length > 253) return null;

  let hostOnly = trimmed;
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) return null;
    hostOnly = trimmed.slice(1, closeIdx);
  } else if (trimmed.split(':').length === 2) {
    hostOnly = trimmed.split(':')[0];
  }

  if (!hostOnly || /[/?#@\s\\]/.test(hostOnly)) return null;
  const lower = hostOnly.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return null;
  }
  return hostOnly;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }

  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }

  return true;
}

async function resolvePublicAddresses(host: string): Promise<{ allowed: boolean; ipv4: string | null }> {
  const ipFamily = net.isIP(host);
  if (ipFamily !== 0) {
    if (isPrivateOrReservedIp(host)) return { allowed: false, ipv4: null };
    return { allowed: true, ipv4: ipFamily === 4 ? host : null };
  }

  try {
    const records = await dns.promises.lookup(host, { all: true });
    if (!records.length) return { allowed: false, ipv4: null };
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return { allowed: false, ipv4: null };
      }
    }
    const firstIpv4 = records.find((r) => r.family === 4)?.address || null;
    return { allowed: true, ipv4: firstIpv4 };
  } catch {
    return { allowed: false, ipv4: null };
  }
}

async function probeNetherNetHttp(
  host: string,
  port: number,
  scheme: 'https' | 'http',
  timeoutMs: number
): Promise<BedrockProbeResult> {
  const formattedHost = net.isIP(host) === 6 ? `[${host}]` : host;
  const url = `${scheme}://${formattedHost}:${port}/v1/join`;
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`NetherNet ${scheme.toUpperCase()} returned ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error('Unexpected HTML response on /v1/join');
  }

  const raw = (await response.text()).trim();
  if (raw.startsWith('<')) {
    throw new Error('Unexpected markup response on /v1/join');
  }

  let data: Record<string, any> = {};
  if (raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid NetherNet discovery payload');
    }
    const keys = Object.keys(parsed);
    const hasNetherNetField =
      keys.length === 0 ||
      'protocol' in parsed ||
      'version' in parsed ||
      'transportLayer' in parsed ||
      'dataVersion' in parsed ||
      'players' in parsed ||
      'maxPlayers' in parsed ||
      'level' in parsed ||
      'nonce' in parsed;
    if (!hasNetherNetField) {
      throw new Error('Unrecognized JSON payload on /v1/join');
    }
    data = parsed;
  }

  const playersOnline = Number(data.players);
  const playersMax = Number(data.maxPlayers);
  const protocolNum = Number(data.protocol);

  return {
    online: true,
    transport: 'nethernet',
    signalling: scheme,
    version: data.version != null ? String(data.version) : null,
    protocol: Number.isFinite(protocolNum) && protocolNum > 0 ? protocolNum : null,
    motd: stripMinecraftFormatting(data.name),
    levelName: stripMinecraftFormatting(data.level),
    players: Number.isFinite(playersOnline)
      ? {
          online: playersOnline,
          max: Number.isFinite(playersMax) ? playersMax : 0,
        }
      : null,
  };
}

function probeRakNetUdp(ipv4Host: string | null, port: number, timeoutMs: number): Promise<BedrockProbeResult> {
  if (!ipv4Host) {
    return Promise.reject(new Error('No IPv4 address for direct RakNet ping'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = dgram.createSocket('udp4');

    const finish = (err?: Error, result?: BedrockProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      if (err || !result) reject(err || new Error('RakNet ping failed'));
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error('RakNet UDP ping timed out'));
    }, timeoutMs);

    socket.once('error', (err) => finish(err));
    socket.once('message', (msg) => {
      try {
        if (msg.length < 35 || msg[0] !== 0x1c) {
          finish(new Error('Unexpected UDP response packet'));
          return;
        }
        const strLen = msg.readUInt16BE(33);
        const adRaw = msg.subarray(35, Math.min(msg.length, 35 + strLen)).toString('utf8');
        const parts = adRaw.split(';');
        if (parts.length < 4 || (parts[0] !== 'MCPE' && parts[0] !== 'MCEE')) {
          finish(new Error('Invalid RakNet pong payload'));
          return;
        }
        const protocolNum = Number(parts[2]);
        const onlineNum = Number(parts[4]);
        const maxNum = Number(parts[5]);
        finish(undefined, {
          online: true,
          transport: 'raknet',
          signalling: null,
          motd: stripMinecraftFormatting(parts[1]),
          protocol: Number.isFinite(protocolNum) && protocolNum > 0 ? protocolNum : null,
          version: parts[3] ? parts[3].trim() : null,
          levelName: stripMinecraftFormatting(parts[7]),
          players: Number.isFinite(onlineNum)
            ? { online: onlineNum, max: Number.isFinite(maxNum) ? maxNum : 0 }
            : null,
        });
      } catch (err: any) {
        finish(err instanceof Error ? err : new Error('Failed to parse RakNet pong'));
      }
    });

    const packet = Buffer.alloc(33);
    packet[0] = 0x01; // ID_UNCONNECTED_PING
    packet.writeBigInt64BE(BigInt(Date.now()), 1);
    RAKNET_MAGIC.copy(packet, 9);
    crypto.randomBytes(8).copy(packet, 25);

    socket.send(packet, port, ipv4Host, (err) => {
      if (err) finish(err);
    });
  });
}

async function probeMcStatusIo(host: string, port: number, timeoutMs: number): Promise<BedrockProbeResult> {
  const res = await fetch(
    `https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(host)}:${encodeURIComponent(String(port))}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!res.ok) {
    throw new Error(`mcstatus.io returned ${res.status}`);
  }
  const data = await res.json();
  if (!data?.online) {
    throw new Error('mcstatus.io reported offline');
  }

  const versionName =
    data?.version?.name ||
    data?.version?.name_clean ||
    data?.version?.name_raw ||
    null;
  const protocolNum = Number(data?.version?.protocol);

  return {
    online: true,
    transport: 'raknet',
    signalling: null,
    version: versionName ? String(versionName).trim() : null,
    protocol: Number.isFinite(protocolNum) && protocolNum > 0 ? protocolNum : null,
    motd: stripMinecraftFormatting(data?.motd?.clean || data?.motd?.raw),
    levelName: null,
    players:
      data?.players && typeof data.players.online === 'number'
        ? {
            online: Number(data.players.online),
            max: Number(data.players.max || 0),
          }
        : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawHost = searchParams.get('host') || '';
  const rawPort = searchParams.get('port') || '19132';

  const cleanHost = normalizeHost(rawHost);
  const cleanPort = Number.parseInt(rawPort, 10) || 19132;

  if (!cleanHost) {
    return NextResponse.json({ online: false, error: 'Valid public host is required' }, { status: 400 });
  }
  if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
    return NextResponse.json({ online: false, error: 'Valid port (1-65535) is required' }, { status: 400 });
  }

  const cacheKey = `${cleanHost.toLowerCase()}:${cleanPort}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const dnsCheck = await resolvePublicAddresses(cleanHost);
  if (!dnsCheck.allowed) {
    return NextResponse.json({
      online: false,
      checkedTransports: ['nethernet', 'raknet'],
      error: 'Host could not be resolved to a public address',
    });
  }

  try {
    const winner = await Promise.any([
      probeNetherNetHttp(cleanHost, cleanPort, 'https', 5000),
      probeRakNetUdp(dnsCheck.ipv4, cleanPort, 2500),
      probeMcStatusIo(cleanHost, cleanPort, 5000),
    ]);

    probeCache.set(cacheKey, {
      expiresAt: Date.now() + POSITIVE_CACHE_TTL_MS,
      payload: winner,
    });
    return NextResponse.json(winner);
  } catch {
    try {
      const httpFallback = await probeNetherNetHttp(cleanHost, cleanPort, 'http', 2500);
      probeCache.set(cacheKey, {
        expiresAt: Date.now() + POSITIVE_CACHE_TTL_MS,
        payload: httpFallback,
      });
      return NextResponse.json(httpFallback);
    } catch {
      return NextResponse.json({
        online: false,
        checkedTransports: ['nethernet', 'raknet'],
      });
    }
  }
}
