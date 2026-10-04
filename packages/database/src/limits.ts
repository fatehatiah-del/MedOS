/*
 * Limits on what the user can write, shared with the browser so forms can
 * enforce them as they are typed. Kept free of any database code: client
 * components import this file (`@medos/database/limits`) on its own.
 */

export const MAX_EVENT_TITLE = 200;
export const MAX_EVENT_LOCATION = 200;
export const MAX_EVENT_NOTES = 5000;
