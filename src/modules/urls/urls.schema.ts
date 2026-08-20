import { z } from 'zod';
import { isValidAlias } from './shortCode.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isSafeLongUrl(value: string, selfHost: string | undefined): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  // Guardrail: refuse to shorten links back to this service to avoid redirect loops.
  if (selfHost && parsed.host === selfHost) return false;
  return true;
}

export function createUrlSchema(selfHost: string | undefined) {
  return z.object({
    longUrl: z
      .string()
      .min(1, 'longUrl is required')
      .max(2048, 'longUrl must be 2048 characters or fewer')
      .refine((value) => isSafeLongUrl(value, selfHost), {
        message: 'longUrl must be a valid http(s) URL and not point back to this service',
      }),
    customAlias: z
      .string()
      .refine(isValidAlias, {
        message: 'customAlias must be 3-32 alphanumeric/underscore/dash characters and not a reserved word',
      })
      .optional(),
    expiresInDays: z.number().int().positive().max(3650).optional(),
  });
}

export type CreateUrlInput = z.infer<ReturnType<typeof createUrlSchema>>;
