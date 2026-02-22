import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAuthUrl } from "@/lib/integrations/calendar";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate auth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
