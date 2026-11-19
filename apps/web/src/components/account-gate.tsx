"use client";
import { useSlablineAuth } from "./sign-in-dialog";

import type { ReactNode } from "react";

import { Button } from "./ui/button";

/** Keep private account panels out of the signed-out page entirely. */
export function AccountGate({ children }: { children: ReactNode }) {
  const { ready, authenticated, login } = useSlablineAuth();
  if (!ready)
    return (
      <div className="account-login" role="status">
        Loading…
      </div>
    );
  if (!authenticated)
    return (
      <section className="account-login" aria-label="Log in">
        <h2>Log in to continue</h2>
        <Button onClick={login}>Log in</Button>
      </section>
    );
  return children;
}
