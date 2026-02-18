import { z } from "zod";

export const createTeamMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string(),
  role: z.string(),
  division: z.string(),
  location: z.string(),
  employmentType: z.string(),
  costType: z.string(),
  annualSalary: z.number().min(0).nullable(),
  hourlyRate: z.number().min(0).nullable(),
  weeklyHours: z.number().min(0).max(168).nullable(),
  active: z.boolean(),
});

export const updateTeamMemberSchema = createTeamMemberSchema;

export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
