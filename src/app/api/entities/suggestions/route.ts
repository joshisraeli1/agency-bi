import { NextRequest, NextResponse } from "next/server";
import { findClientMatches, findTeamMemberMatches } from "@/lib/entities/resolver";

export async function GET(request: NextRequest) {
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
