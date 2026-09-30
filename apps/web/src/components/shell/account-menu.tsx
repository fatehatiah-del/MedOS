"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@medos/ui";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { SETTINGS_NAV } from "@/config/navigation";
import { userInitial } from "@/features/auth/messages";
import { signOut } from "@/features/auth/sign-out";

export interface AccountMenuProps {
  displayName: string;
  email: string;
}

/** The signed-in account, kept deliberately small: who you are, and a way out. */
export function AccountMenu({ displayName, email }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="flex size-8 items-center justify-center rounded-full bg-subtle text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
      >
        <span aria-hidden="true">{userInitial(displayName, email)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          {displayName ? (
            <span className="block truncate text-[13px] font-medium text-fg">{displayName}</span>
          ) : null}
          <span className="block truncate text-xs text-fg-subtle">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={SETTINGS_NAV.href}>
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
