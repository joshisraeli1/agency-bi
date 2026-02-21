import { NextRequest, NextResponse } from "next/server";
import { findClientMatches, findTeamMemberMatches } from "@/lib/entities/resolver";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type") || "clients";

  try {
    const suggestions =
      type === "team"
        ? await findTeamMemberMatches()
        : await findClientMatches();

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Entity suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
