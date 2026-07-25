/**
 * Read a required environment variable, or fail loudly.
 *
 * Named error, because the alternative is a downstream symptom that reads as
 * something else entirely: a missing AUTH_SECRET turns into "every login is
 * rejected", and a missing LLM_API_KEY into a 401 from the provider that looks
 * like a bad key rather than no key.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
