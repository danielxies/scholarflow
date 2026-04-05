import { cookies } from "next/headers";

const COOKIE_NAME = "sf_uid";
const FALLBACK_USER_ID = "anonymous";

/**
 * Read the anonymous user ID from the request cookie.
 * Falls back to "anonymous" if no cookie is set.
 */
export async function getSessionUserId(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? FALLBACK_USER_ID;
}
