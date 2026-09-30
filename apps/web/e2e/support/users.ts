import path from "node:path";

/** Where the `setup` project saves the signed-in browser state. */
export const STORAGE_STATE = path.join(__dirname, "..", "..", ".e2e", "state", "user.json");

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/*
 * Test-only accounts. They exist solely in the scratch database that each run
 * creates and deletes; none of these is a real credential.
 */
const PASSWORD = "e2e-scratch-password-01";

/** The account most tests run as. Created once by the `setup` project. */
export const TEST_USER: TestUser = {
  name: "Test Student",
  email: "student@e2e.test",
  password: PASSWORD,
};

let sequence = 0;

/** A fresh account for a test that must not share a session with others. */
export function uniqueUser(label: string): TestUser {
  sequence += 1;
  const id = `${label}-${process.pid}-${Date.now().toString(36)}-${sequence}`;
  return { name: "Extra Student", email: `${id}@e2e.test`, password: PASSWORD };
}
