import { z } from "zod";
import {
  PROVIDERS,
  BALANCE_TYPES,
  PROGRAM_KEYS,
} from "@points-geek/shared";

const linkedCardSchema = z.object({
  cardName: z.string().min(1),
  lastFour: z.string().optional(),
});

const balanceRecordSchema = z.object({
  programKey: z.enum(PROGRAM_KEYS),
  balance: z.number().int().min(0),
  balanceType: z.enum(BALANCE_TYPES),
  linkedCard: linkedCardSchema.optional(),
  externalAccountId: z.string().min(1).optional(),
});

const discoveredCardSchema = z.object({
  cardName: z.string().min(1),
  lastFour: z.string().optional(),
  issuer: z.string().min(1),
  programKey: z.enum(PROGRAM_KEYS).optional(),
  imageUrl: z.string().url().optional(),
  imageSlug: z.string().min(1).optional(),
});

export const balancePayloadSchema = z.object({
  provider: z.enum(PROVIDERS),
  externalAccountId: z.string().min(1).optional(),
  ownerLabel: z.string().min(1).nullable().optional(),
  scrapedAt: z.string().datetime(),
  balances: z.array(balanceRecordSchema),
  cards: z.array(discoveredCardSchema).optional(),
  scrapeEvent: z.object({
    success: z.boolean(),
    durationMs: z.number().int().min(0),
    extensionVersion: z.string(),
    matchedSelector: z.string().optional(),
    selectorsAttempted: z.array(z.string()),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type BalancePayloadInput = z.infer<typeof balancePayloadSchema>;
