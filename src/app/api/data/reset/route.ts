import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, logAudit } from "@/lib/auth";

/**
 * POST /api/data/reset
 *
 * Clears all business data (seed/demo data) from the database.
 * Preserves: users, integration configs, app settings, audit logs.
 * Only admins can access this endpoint.
 */
export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  try {
    // Delete in dependency order (children first)
    const results: Record<string, number> = {};

    // Meeting attendees → meeting logs
    const { count: attendees } = await db.meetingAttendee.deleteMany({});
    results.meetingAttendees = attendees;

    const { count: meetings } = await db.meetingLog.deleteMany({});
    results.meetingLogs = meetings;

    // Communication logs
    const { count: comms } = await db.communicationLog.deleteMany({});
    results.communicationLogs = comms;

    // Deliverable assignments → deliverables
    const { count: delAssign } = await db.deliverableAssignment.deleteMany({});
    results.deliverableAssignments = delAssign;

    const { count: deliverables } = await db.deliverable.deleteMany({});
    results.deliverables = deliverables;

    // Client assignments
    const { count: clientAssign } = await db.clientAssignment.deleteMany({});
    results.clientAssignments = clientAssign;

    // Time entries
    const { count: timeEntries } = await db.timeEntry.deleteMany({});
    results.timeEntries = timeEntries;

    // Financial records
    const { count: financials } = await db.financialRecord.deleteMany({});
    results.financialRecords = financials;

    // Division expenses → division targets → divisions
    const { count: divExpenses } = await db.divisionExpense.deleteMany({});
    results.divisionExpenses = divExpenses;

    const { count: divTargets } = await db.divisionTarget.deleteMany({});
    results.divisionTargets = divTargets;

    const { count: divisions } = await db.division.deleteMany({});
    results.divisions = divisions;

    // Client aliases → clients
    const { count: aliases } = await db.clientAlias.deleteMany({});
    results.clientAliases = aliases;

    const { count: clients } = await db.client.deleteMany({});
    results.clients = clients;

    // Team members
    const { count: team } = await db.teamMember.deleteMany({});
    results.teamMembers = team;

    // Packages
    const { count: packages } = await db.package.deleteMany({});
    results.packages = packages;

    // Data imports (sync history)
    const { count: imports } = await db.dataImport.deleteMany({});
    results.dataImports = imports;

    // Chat sessions and messages
    const { count: chatMessages } = await db.chatMessage.deleteMany({});
    results.chatMessages = chatMessages;

    const { count: chatSessions } = await db.chatSession.deleteMany({});
    results.chatSessions = chatSessions;

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);

    await logAudit({ action: "data_reset", userId: session.userId, entity: "system", details: `Reset ${totalDeleted} records across ${Object.keys(results).length} tables` });

    return NextResponse.json({
      success: true,
      message: `Cleared ${totalDeleted} records across ${Object.keys(results).length} tables`,
      details: results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
