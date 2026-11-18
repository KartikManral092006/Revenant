import { NextResponse } from 'next/server';
import { buildCertificate } from '../../../../lib/autopsy/certificate';
import { listGraveyard } from '../../../../lib/graveyard/loader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Live Death Certificate for an allowlisted Graveyard package. Unknown names get 404. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ package: string }> },
): Promise<NextResponse> {
  const { package: name } = await params;
  const manifest = listGraveyard().find((m) => m.name === name);
  if (!manifest) {
    return NextResponse.json({ error: 'package is not in the Graveyard' }, { status: 404 });
  }
  const certificate = await buildCertificate(manifest.name, manifest.version, {
    monorepo: manifest.monorepo,
  });
  return NextResponse.json(certificate, { headers: { 'Cache-Control': 'no-store' } });
}
