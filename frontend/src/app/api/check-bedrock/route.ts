import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const host = searchParams.get('host') || '';
  const port = searchParams.get('port') || '19132';

  if (!host) {
    return NextResponse.json({ online: false, error: 'Host is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(host)}:${encodeURIComponent(port)}`, {
      next: { revalidate: 15 },
    });
    const data = await res.json();
    return NextResponse.json({
      online: Boolean(data?.online),
      version: data?.version?.name_clean || data?.version?.name_raw || null,
      protocol: data?.version?.protocol || null,
      motd: data?.motd?.clean || null,
      players: data?.players || null,
    });
  } catch (err: any) {
    return NextResponse.json({ online: false, error: err?.message || 'Check failed' });
  }
}
