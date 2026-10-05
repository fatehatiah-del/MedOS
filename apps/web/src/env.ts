import { parseEnv } from "./env-schema";

export { type Env, parseEnv } from "./env-schema";

/** The validated environment of this server. Throws, listing every problem, when it is invalid. */
export const env = parseEnv(process.env);
