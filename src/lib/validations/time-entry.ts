import { z } from "zod";

export const createTimeEntrySchema = z.object({
  clientId: z.string(),
  teamMemberId: z.string(),
  date: z.string().min(1, "Date is required"),
  hours: z.number().positive("Hours must be > 0"),
  description: z.string(),
  isOverhead: z.boolean(),
});

export const updateTimeEntrySchema = createTimeEntrySchema;

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
