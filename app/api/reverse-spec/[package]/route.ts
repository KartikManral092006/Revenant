import { handleReverseSpec } from '../../../../lib/reverse-spec/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Reverse Spec bundle for an allowlisted package: live Groq call within the daily limits, else the stored bundle. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ package: string }> },
): Promise<Response> {
  const { package: name } = await params;
  return handleReverseSpec(request, name);
}
