"use client";

import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from "@medos/ui";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

/** Navigation drawer for tablet and mobile widths. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="-ml-2 lg:hidden"
        >
          <Menu aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent
        placement="left"
        closeLabel="Close navigation"
        aria-describedby={undefined}
        className="flex flex-col bg-canvas"
      >
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <div className="flex h-14 shrink-0 items-center px-5">
          <Brand onNavigate={close} />
        </div>
        <SidebarNav label="Main (menu)" onNavigate={close} />
      </DialogContent>
    </Dialog>
  );
}
