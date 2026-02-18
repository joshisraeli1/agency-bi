"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTimeEntrySchema, type CreateTimeEntryInput } from "@/lib/validations/time-entry";
import { FormDialog } from "./form-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

interface TimeEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Partial<CreateTimeEntryInput> & { id?: string };
  clients: { id: string; name: string }[];
  teamMembers: { id: string; name: string }[];
  onSuccess: () => void;
}

export function TimeEntryForm({
  open,
  onOpenChange,
  defaultValues,
  clients,
  teamMembers,
  onSuccess,
}: TimeEntryFormProps) {
  const isEdit = !!defaultValues?.id;
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateTimeEntryInput>({
    resolver: zodResolver(createTimeEntrySchema),
    defaultValues: {
      clientId: defaultValues?.clientId ?? "",
      teamMemberId: defaultValues?.teamMemberId ?? "",
      date: defaultValues?.date ?? "",
      hours: defaultValues?.hours ?? (0 as unknown as number),
      description: defaultValues?.description ?? "",
      isOverhead: defaultValues?.isOverhead ?? false,
    },
  });

  async function onSubmit(data: CreateTimeEntryInput) {
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/time-entries/${defaultValues!.id}` : "/api/time-entries";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.error && typeof err.error === "object") {
          Object.entries(err.error).forEach(([key, messages]) => {
            form.setError(key as keyof CreateTimeEntryInput, {
              message: (messages as string[])[0],
            });
          });
        }
        return;
      }
      onOpenChange(false);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const NO_SELECTION = "__none__";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Time Entry" : "Add Time Entry"}
      description={isEdit ? "Update time entry." : "Log a new time entry."}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === NO_SELECTION ? "" : v)}
                  defaultValue={field.value || NO_SELECTION}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>None</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="teamMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team Member</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === NO_SELECTION ? "" : v)}
                  defaultValue={field.value || NO_SELECTION}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>None</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? 0 : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What was done..." rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isOverhead"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <FormLabel>Overhead (non-billable)</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Entry"}
            </Button>
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
