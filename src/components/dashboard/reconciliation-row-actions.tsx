"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, RotateCcw, NotebookPen, Loader2 } from "lucide-react";

interface Props {
  id: string;
  reviewStatus: string; // open | resolved | ignored
  notes: string | null;
}

export function ReconciliationRowActions({ id, reviewStatus, notes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(notes ?? "");

  function update(payload: { reviewStatus?: string; notes?: string }) {
    startTransition(async () => {
      const res = await fetch(`/api/reconciliation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
      } else {
        console.error("Failed to update reconciliation row");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[180px]">
      <div className="flex gap-1">
        {reviewStatus === "open" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update({ reviewStatus: "resolved" })}
              disabled={isPending}
              title="Mark resolved"
            >
              <Check className="h-3 w-3" /> Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update({ reviewStatus: "ignored" })}
              disabled={isPending}
              title="Ignore"
            >
              <X className="h-3 w-3" /> Ignore
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ reviewStatus: "open" })}
            disabled={isPending}
            title="Reopen"
          >
            <RotateCcw className="h-3 w-3" /> Reopen ({reviewStatus})
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditingNote((v) => !v)}
          title={notes ? "Edit note" : "Add note"}
        >
          <NotebookPen className="h-3 w-3" />
        </Button>
        {isPending && <Loader2 className="h-3 w-3 animate-spin self-center" />}
      </div>

      {editingNote && (
        <div className="flex flex-col gap-1">
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            className="text-xs"
            placeholder="Why is this discrepancy ok / what's the fix?"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => {
                update({ notes: noteDraft });
                setEditingNote(false);
              }}
              disabled={isPending}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNoteDraft(notes ?? "");
                setEditingNote(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!editingNote && notes && (
        <p className="text-xs text-muted-foreground italic">{notes}</p>
      )}
    </div>
  );
}
