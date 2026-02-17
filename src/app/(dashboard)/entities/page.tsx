"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Check, X, GitMerge } from "lucide-react";

interface MatchSuggestion {
  id: string;
  entityType: "client" | "team_member";
  sourceA: { id: string; name: string; source: string };
  sourceB: { id: string; name: string; source: string };
  confidence: number;
  status: string;
}

function MatchesTable({
  type,
  suggestions,
  loading,
  onRefresh,
  onConfirm,
  onReject,
}: {
  type: "clients" | "team";
  suggestions: MatchSuggestion[];
  loading: boolean;
  onRefresh: () => void;
  onConfirm: (match: MatchSuggestion) => void;
  onReject: (match: MatchSuggestion) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {type === "clients" ? "Client" : "Team Member"} Matches
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            {loading ? "Scanning for matches..." : "No matches found. Sync data from integrations first."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source A</TableHead>
                <TableHead>Source B</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((match) => (
                <TableRow key={match.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{match.sourceA.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {match.sourceA.source}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{match.sourceB.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {match.sourceB.source}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        match.confidence >= 95
                          ? "default"
                          : match.confidence >= 85
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {match.confidence}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onConfirm(match)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReject(match)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function EntitiesPage() {
  const [clientMatches, setClientMatches] = useState<MatchSuggestion[]>([]);
  const [teamMatches, setTeamMatches] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [mergeDialog, setMergeDialog] = useState<MatchSuggestion | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchMatches = useCallback(async (type: "clients" | "team") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/entities/suggestions?type=${type}`);
      const data = await res.json();
      if (type === "clients") {
        setClientMatches(data.suggestions || []);
      } else {
        setTeamMatches(data.suggestions || []);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to fetch matches" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches("clients");
    fetchMatches("team");
  }, [fetchMatches]);

  async function handleConfirm(match: MatchSuggestion) {
    setMergeDialog(match);
  }

  async function executeMerge(keepId: string, mergeId: string) {
    if (!mergeDialog) return;
    try {
      const res = await fetch("/api/entities/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          entityType: mergeDialog.entityType,
          keepId,
          mergeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: "success", text: "Entities merged successfully" });
      setMergeDialog(null);
      fetchMatches(mergeDialog.entityType === "client" ? "clients" : "team");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Merge failed",
      });
    }
  }

  async function handleReject(match: MatchSuggestion) {
    try {
      await fetch("/api/entities/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          entityType: match.entityType,
          keepId: match.sourceA.id,
          mergeId: match.sourceB.id,
        }),
      });
      if (match.entityType === "client") {
        setClientMatches((prev) => prev.filter((m) => m.id !== match.id));
      } else {
        setTeamMatches((prev) => prev.filter((m) => m.id !== match.id));
      }
    } catch {
      setMessage({ type: "error", text: "Failed to reject match" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Entity Resolution</h1>
        <p className="text-muted-foreground mt-1">
          Match and merge duplicate entities across data sources.
        </p>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">
            Clients ({clientMatches.length})
          </TabsTrigger>
          <TabsTrigger value="team">
            Team Members ({teamMatches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          <MatchesTable
            type="clients"
            suggestions={clientMatches}
            loading={loading}
            onRefresh={() => fetchMatches("clients")}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <MatchesTable
            type="team"
            suggestions={teamMatches}
            loading={loading}
            onRefresh={() => fetchMatches("team")}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        </TabsContent>
      </Tabs>

      {/* Merge Dialog */}
      <Dialog open={!!mergeDialog} onOpenChange={() => setMergeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge Entities
            </DialogTitle>
          </DialogHeader>
          {mergeDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose which record to keep. The other will be merged into it.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() =>
                    executeMerge(mergeDialog.sourceA.id, mergeDialog.sourceB.id)
                  }
                >
                  <CardContent className="pt-4">
                    <p className="font-medium">{mergeDialog.sourceA.name}</p>
                    <Badge variant="outline" className="mt-1">
                      {mergeDialog.sourceA.source}
                    </Badge>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() =>
                    executeMerge(mergeDialog.sourceB.id, mergeDialog.sourceA.id)
                  }
                >
                  <CardContent className="pt-4">
                    <p className="font-medium">{mergeDialog.sourceB.name}</p>
                    <Badge variant="outline" className="mt-1">
                      {mergeDialog.sourceB.source}
                    </Badge>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialog(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
