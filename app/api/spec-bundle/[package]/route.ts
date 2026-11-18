import { handleSpecBundleDownload } from '../../../../lib/reverse-spec/download';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** ZIP of the stored Reverse Spec bundle for an allowlisted package. Works without Groq. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ package: string }> },
): Promise<Response> {
  const { package: name } = await params;
  return handleSpecBundleDownload(name);
}
