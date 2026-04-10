import { z } from "zod";
import { PROVIDERS } from "@point-portfolio/shared";

export const balancePayloadSchema = z.object({
  provider: z.enum(PROVIDERS),
  balance: z.number().int().nonneg().optional(),
  scrapedAt: z.string().datetime(),
  scrapeEvent: z.object({
    success: z.boolean(),
    durationMs: z.number().int().nonneg(),
    extensionVersion: z.string(),
    matchedSelector: z.string().optional(),
    selectorsAttempted: z.array(z.string()),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type BalancePayloadInput = z.infer<typeof balancePayloadSchema>;
