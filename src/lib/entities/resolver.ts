import { db } from "@/lib/db";
import { similarityScore, isExactMatch } from "./matchers";

export interface MatchSuggestion {
  id: string;
  entityType: "client" | "team_member";
  sourceA: { id: string; name: string; source: string };
  sourceB: { id: string; name: string; source: string };
  confidence: number;
  status: "pending" | "confirmed" | "rejected";
}

const FUZZY_THRESHOLD = 0.8;

export async function findClientMatches(): Promise<MatchSuggestion[]> {
  const clients = await db.client.findMany({
    select: { id: true, name: true, source: true, hubspotDealId: true, hubspotCompanyId: true },
  });

  const existingAliases = await db.clientAlias.findMany({
    select: { clientId: true, alias: true, source: true },
  });

  // Build set of already-matched pairs
  const matchedPairs = new Set<string>();
  for (const alias of existingAliases) {
    matchedPairs.add(`${alias.clientId}:${alias.alias}`);
  }

  const suggestions: MatchSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const a = clients[i];
      const b = clients[j];

      // Skip same-source comparisons
      if (a.source === b.source) continue;

      const pairKey = [a.id, b.id].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      // Skip already matched
      if (matchedPairs.has(`${a.id}:${b.name}`) || matchedPairs.has(`${b.id}:${a.name}`)) {
        continue;
      }

      const score = similarityScore(a.name, b.name, "company");

      if (score >= FUZZY_THRESHOLD) {
        suggestions.push({
          id: pairKey,
          entityType: "client",
          sourceA: { id: a.id, name: a.name, source: a.source },
          sourceB: { id: b.id, name: b.name, source: b.source },
          confidence: Math.round(score * 100),
          status: isExactMatch(a.name, b.name) ? "confirmed" : "pending",
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export async function findTeamMemberMatches(): Promise<MatchSuggestion[]> {
  const members = await db.teamMember.findMany({
    select: { id: true, name: true, email: true, source: true },
  });

  const suggestions: MatchSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];

      if (a.source === b.source) continue;

      const pairKey = [a.id, b.id].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      // Check email match first
      if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
        suggestions.push({
          id: pairKey,
          entityType: "team_member",
          sourceA: { id: a.id, name: a.name, source: a.source },
          sourceB: { id: b.id, name: b.name, source: b.source },
          confidence: 100,
          status: "confirmed",
        });
        continue;
      }

      const score = similarityScore(a.name, b.name, "person");
      if (score >= FUZZY_THRESHOLD) {
        suggestions.push({
          id: pairKey,
          entityType: "team_member",
          sourceA: { id: a.id, name: a.name, source: a.source },
          sourceB: { id: b.id, name: b.name, source: b.source },
          confidence: Math.round(score * 100),
          status: "pending",
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export async function confirmClientMatch(
  keepId: string,
  mergeId: string
): Promise<void> {
  const keep = await db.client.findUnique({ where: { id: keepId } });
  const merge = await db.client.findUnique({ where: { id: mergeId } });
  if (!keep || !merge) throw new Error("Client not found");

  // Create alias for the merged client name
  await db.clientAlias.upsert({
    where: { alias_source: { alias: merge.name, source: merge.source } },
    update: { clientId: keepId },
    create: {
      clientId: keepId,
      alias: merge.name,
      source: merge.source,
      externalId: merge.hubspotDealId || merge.hubspotCompanyId || undefined,
    },
  });

  // Reassign all related records from merge → keep
  await db.timeEntry.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });
  await db.deliverable.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });
  await db.financialRecord.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });
  await db.communicationLog.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });
  await db.meetingLog.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });

  // Move aliases
  await db.clientAlias.updateMany({
    where: { clientId: mergeId },
    data: { clientId: keepId },
  });

  // Merge fields: fill in missing data on keep from merge
  const updates: Record<string, unknown> = {};
  if (!keep.hubspotDealId && merge.hubspotDealId) updates.hubspotDealId = merge.hubspotDealId;
  if (!keep.hubspotCompanyId && merge.hubspotCompanyId) updates.hubspotCompanyId = merge.hubspotCompanyId;
  if (!keep.retainerValue && merge.retainerValue) updates.retainerValue = merge.retainerValue;
  if (!keep.industry && merge.industry) updates.industry = merge.industry;
  if (!keep.website && merge.website) updates.website = merge.website;
  if (Object.keys(updates).length > 0) {
    await db.client.update({ where: { id: keepId }, data: updates });
  }

  // Delete the merged client
  await db.client.delete({ where: { id: mergeId } });
}

export async function confirmTeamMemberMatch(
  keepId: string,
  mergeId: string
): Promise<void> {
  const keep = await db.teamMember.findUnique({ where: { id: keepId } });
  const merge = await db.teamMember.findUnique({ where: { id: mergeId } });
  if (!keep || !merge) throw new Error("Team member not found");

  // Reassign related records
  await db.timeEntry.updateMany({
    where: { teamMemberId: mergeId },
    data: { teamMemberId: keepId },
  });
  await db.deliverableAssignment.updateMany({
    where: { teamMemberId: mergeId },
    data: { teamMemberId: keepId },
  });
  await db.clientAssignment.updateMany({
    where: { teamMemberId: mergeId },
    data: { teamMemberId: keepId },
  });

  // Merge fields
  const updates: Record<string, unknown> = {};
  if (!keep.email && merge.email) updates.email = merge.email;
  if (!keep.mondayUserId && merge.mondayUserId) updates.mondayUserId = merge.mondayUserId;
  if (!keep.annualSalary && merge.annualSalary) updates.annualSalary = merge.annualSalary;
  if (!keep.hourlyRate && merge.hourlyRate) updates.hourlyRate = merge.hourlyRate;
  if (!keep.role && merge.role) updates.role = merge.role;
  if (!keep.division && merge.division) updates.division = merge.division;
  if (Object.keys(updates).length > 0) {
    await db.teamMember.update({ where: { id: keepId }, data: updates });
  }

  await db.teamMember.delete({ where: { id: mergeId } });
}
