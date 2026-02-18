import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  status: z.enum(["active", "paused", "churned", "prospect"]),
  industry: z.string(),
  website: z.string(),
  retainerValue: z.number().min(0, "Must be >= 0").nullable(),
  dealStage: z.string(),
  notes: z.string(),
});

export const updateClientSchema = createClientSchema;

export type CreateClientInput = z.infer<typeof createClientSchema>;
