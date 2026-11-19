"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import { Dialog } from "radix-ui";
import { Mail, Wallet, X } from "lucide-react";
import { useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";

const SignInContext = createContext<
  ((event?: MouseEvent<HTMLElement>) => void) | null
>(null);

/** Keep all login entry points on the same branded chooser. */
export function useSlablineAuth() {
  const auth = usePrivy();
  const openSignIn = useContext(SignInContext);
  return { ...auth, login: openSignIn ?? auth.login };
}

export function SignInProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const { initOAuth, loading } = useLoginWithOAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const handoff = useRef(false);
  const openSignIn = useCallback((event?: MouseEvent<HTMLElement>) => {
    trigger.current =
      event?.currentTarget ?? (document.activeElement as HTMLElement | null);
    handoff.current = false;
    setError("");
    setOpen(true);
  }, []);
  const continueWith = (method: "email" | "wallet") => {
    handoff.current = true;
    setOpen(false);
    login({ loginMethods: [method] });
  };
  return (
    <SignInContext.Provider value={openSignIn}>
      {children}
      <Dialog.Root open={open && !authenticated} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="sign-in-overlay" />
          <Dialog.Content
            className="sign-in-dialog"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!handoff.current)
                trigger.current?.focus({ preventScroll: true });
            }}
          >
            <Dialog.Close className="sign-in-close" aria-label="Close sign in">
              <X size={22} />
            </Dialog.Close>
            <img
              className="sign-in-logo"
              src="/brand/slabline-app-icon.svg"
              alt="Slabline"
              width={72}
              height={72}
            />
            <Dialog.Title>Sign in to start trading</Dialog.Title>
            <div className="sign-in-options">
              <button
                className="sign-in-option sign-in-google"
                disabled={!ready || loading}
                onClick={async () => {
                  setError("");
                  try {
                    await initOAuth({ provider: "google" });
                  } catch {
                    setError(
                      "Google sign-in could not start. Please try again.",
                    );
                  }
                }}
              >
                <img src="/brand/google-g.png" alt="" width={20} height={20} />
                {loading ? "Connecting…" : "Continue with Google"}
              </button>
              <button
                className="sign-in-option"
                disabled={!ready || loading}
                onClick={() => continueWith("email")}
              >
                <Mail size={20} aria-hidden="true" /> Continue with email
              </button>
              <button
                className="sign-in-option"
                disabled={!ready || loading}
                onClick={() => continueWith("wallet")}
              >
                <Wallet size={20} aria-hidden="true" /> Continue with a wallet
              </button>
              <button
                className="sign-in-option sign-in-gemini"
                disabled
                aria-label="Sign in with Gemini, coming soon"
              >
                <span>
                  Sign in with{" "}
                  <img
                    src="/brand/gemini-wordmark.svg"
                    alt="Gemini"
                    width={94}
                    height={20}
                  />
                </span>
                <small>Coming soon</small>
              </button>
            </div>
            {error && (
              <p className="sign-in-error" role="alert">
                {error}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SignInContext.Provider>
  );
}
