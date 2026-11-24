/**
 * Who may sign up, by year of study. The included material follows the Year 3
 * curriculum, so only Year 3 is open; the other years are listed as coming
 * later. To open a year, set `available: true` here: the form and the server
 * both follow this list.
 */
export interface StudyYear {
  value: string;
  label: string;
  available: boolean;
}

export const STUDY_YEARS: readonly StudyYear[] = [
  { value: "1", label: "Year 1", available: false },
  { value: "2", label: "Year 2", available: false },
  { value: "3", label: "Year 3", available: true },
];

/** Sent with an email sign-up. */
export const YEAR_FIELD = "yearOfStudy";

/** Set by the sign-up form before a Google sign-in, which cannot carry a form field. */
export const YEAR_COOKIE = "medos-year-of-study";

/** The error code the server uses when a year is not open yet. */
export const YEAR_NOT_AVAILABLE = "YEAR_NOT_AVAILABLE";

export function isOpenYear(value: unknown): boolean {
  return STUDY_YEARS.some((year) => year.available && year.value === String(value ?? ""));
}

/** The year a sign-up request declares: the form field, or the cookie for Google. */
export function declaredYear(
  context: {
    body?: unknown;
    headers?: Headers | null;
    request?: Request | null;
  } | null,
): string | null {
  const body = context?.body;
  if (body && typeof body === "object" && YEAR_FIELD in body) {
    return String((body as Record<string, unknown>)[YEAR_FIELD] ?? "");
  }
  const cookies = context?.headers?.get("cookie") ?? context?.request?.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === YEAR_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}
