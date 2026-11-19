"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PublicProfile } from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { Button } from "./ui/button";

export function ProfileEditor() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const read = usePrivateRead<PublicProfile | null>("/api/profile");
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  const queries = useQueryClient();
  useEffect(() => {
    generation.current++;
    setEditing(false);
    setMessage("");
    setBusy(false);
  }, [user?.id]);
  if (!authenticated) return null;
  return (
    <section className="profile-settings panel">
      <div className="profile-settings-heading">
        <div>
          <h2>Public profile</h2>
          {read.data && (
            <Link
              href={`/${read.data.username}`}
              className="button button-outline button-pill"
            >
              @{read.data.username} <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
        <Button
          variant="outline"
          className="button-pill"
          disabled={read.isPending || !!read.error}
          onClick={() => {
            setEditing(!editing);
            setMessage("");
          }}
        >
          {editing ? "Cancel" : read.data ? "Edit profile" : "Create profile"}
        </Button>
      </div>
      {read.error && (
        <p role="alert">
          {read.error.message}{" "}
          <button onClick={() => void read.refetch()}>Retry</button>
        </p>
      )}
      {editing && (
        <form
          key={user?.id}
          className="profile-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const current = generation.current;
            setBusy(true);
            setMessage("");
            try {
              const token = await getAccessToken();
              if (!token) throw new Error("Sign in to continue.");
              if (current !== generation.current) return;
              const response = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  username: data.get("username"),
                  displayName: data.get("displayName"),
                  bio: data.get("bio"),
                }),
              });
              const result = await response.json();
              if (current !== generation.current) return;
              if (!response.ok)
                throw new Error(result.error ?? "Could not save your profile.");
              await read.refetch();
              await queries.invalidateQueries({
                queryKey: ["public-profiles"],
              });
              setEditing(false);
              setMessage("Profile published.");
            } catch (error) {
              if (current === generation.current)
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not save profile.",
                );
            } finally {
              if (current === generation.current) setBusy(false);
            }
          }}
        >
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z][a-zA-Z0-9_]*"
              defaultValue={read.data?.username ?? ""}
              placeholder="yourname"
            />
          </label>
          <label>
            Display name
            <input
              name="displayName"
              required
              maxLength={50}
              defaultValue={read.data?.displayName ?? ""}
            />
          </label>
          <label className="profile-bio">
            Bio
            <textarea
              name="bio"
              maxLength={240}
              rows={3}
              defaultValue={read.data?.bio ?? ""}
            />
          </label>
          <p>
            Your name and bio will be public at /username. Holdings and wallets
            stay private.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : read.data ? "Save profile" : "Publish profile"}
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
