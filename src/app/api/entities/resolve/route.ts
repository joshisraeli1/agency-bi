import { NextRequest, NextResponse } from "next/server";
import { confirmClientMatch, confirmTeamMemberMatch } from "@/lib/entities/resolver";
import { requireRole, logAudit } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireRole("manager");
  if (auth.error) return auth.error;
  const session = auth.session;

  try {
    const { action, entityType, keepId, mergeId } = await request.json();

    if (!action || !entityType || !keepId || !mergeId) {
      return NextResponse.json(
        { error: "Missing required fields: action, entityType, keepId, mergeId" },
        { status: 400 }
      );
    }

    if (action === "reject") {
      // For now, rejections are just acknowledged (not persisted)
      return NextResponse.json({ success: true, action: "rejected" });
    }

    if (action === "confirm") {
      if (entityType === "client") {
        await confirmClientMatch(keepId, mergeId);
      } else if (entityType === "team_member") {
        await confirmTeamMemberMatch(keepId, mergeId);
      } else {
        return NextResponse.json(
          { error: "Invalid entity type" },
          { status: 400 }
        );
      }
      await logAudit({ action: "entity_resolved", userId: session.userId, entity: entityType, entityId: keepId, details: `Merged ${entityType} ${mergeId} into ${keepId}` });
      return NextResponse.json({ success: true, action: "merged" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Entity resolve error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve entity" },
      { status: 500 }
    );
  }
}
