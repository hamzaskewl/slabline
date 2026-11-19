"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";

export function PredictNavigation({ pull }: { pull: boolean }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="predict-menu-trigger">
        <span>{pull ? "Pull & Predict" : "Predict"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="predict-menu"
          align="start"
          sideOffset={6}
        >
          <DropdownMenu.Item asChild>
            <Link href="/" aria-current={pull ? undefined : "page"}>
              Predict
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/pull-predict" aria-current={pull ? "page" : undefined}>
              Pull &amp; Predict
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/pull-predict/packs">Your packs</Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
