import { randomBytes, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "./db";
import { apiKeys } from "./db/schema";
import { API_KEY_PREFIX } from "@point-portfolio/shared";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = API_KEY_PREFIX + randomBytes(32).toString("hex");
  const hash = hashKey(raw);
  const prefix = raw.slice(0, API_KEY_PREFIX.length + 8);
  return { raw, hash, prefix };
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function validateApiKey(
  raw: string
): Promise<{ userId: string; keyId: string } | null> {
  const hash = hashKey(raw);
  const result = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (result.length === 0) return null;

  // Update last used timestamp (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, result[0].id))
    .then(() => {});

  return { userId: result[0].userId, keyId: result[0].id };
}
