"use client";

import { Button } from "@medos/ui";
import { LogOut } from "lucide-react";
import { useState } from "react";

import { signOut } from "./sign-out";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signOut();
      }}
    >
      <LogOut aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
