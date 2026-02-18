import { z } from "zod";

export const createFinancialSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
  type: z.enum(["retainer", "project", "cost", "hours"]),
  category: z.string(),
  amount: z.number().positive("Amount must be > 0"),
  hours: z.number().min(0).nullable(),
  description: z.string(),
});

export const updateFinancialSchema = createFinancialSchema;

export type CreateFinancialInput = z.infer<typeof createFinancialSchema>;
