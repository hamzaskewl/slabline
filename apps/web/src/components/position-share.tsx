"use client";
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, Switch } from "radix-ui";
import { Copy, Download, Link as LinkIcon, Share2, X } from "lucide-react";
import {
  identityLabel,
  shareFilename,
  shareIntent,
  type ShareReference,
  type ShareSnapshot,
  type Listing,
  type GrailToken,
} from "@collectible/domain";
import { RewardBrowser } from "./reward-browser";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";
import { GrailReward } from "./grail-reward";

export type PreparedShare = {
  draft: string;
  snapshot: ShareSnapshot;
  png: string;
};
type Preview = PreparedShare & { blob: Blob; url: string; key: string };
export type ShareRequest = <T>(
  body: object,
  signal?: AbortSignal,
) => Promise<T>;

export function PositionShare({
  reference,
  revision,
}: {
  reference: ShareReference;
  revision: string;
}) {
  const auth = usePrivy(),
    { network } = useNetwork(),
    queries = useQueryClient();
  const owner = `${auth.user?.id ?? ""}:${network}`;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const request: ShareRequest = async <T,>(
    body: object,
    signal?: AbortSignal,
  ) => {
    const token = await auth.getAccessToken();
    if (!token || currentOwner.current !== owner)
      throw new Error("Sign in to share your position.");
    const response = await fetch("/api/share/positions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const result = await response.json();
    if (currentOwner.current !== owner)
      throw new Error("Account changed. Reopen the position.");
    if (!response.ok)
      throw new Error(
        result.error ?? "Could not prepare the share. Please retry.",
      );
    return result as T;
  };
  return (
    <PositionShareDialog
      key={owner}
      reference={reference}
      revision={revision}
      request={request}
      onTargetSaved={() => {
        void queries.invalidateQueries({
          queryKey: ["private-read", auth.user?.id],
        });
      }}
    />
  );
}

/** The dialog consumes prepared PNG bytes; preview/copy/download never render independently. */
export function PositionShareDialog({
  reference,
  revision,
  request,
  onTargetSaved,
}: {
  reference: ShareReference;
  revision: string;
  request: ShareRequest;
  onTargetSaved?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [showProfile, setShowProfile] = useState(true),
    [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [catalog, setCatalog] = useState<{
      cards: Listing[];
      tokens: GrailToken[];
      subject: string;
    } | null>(null);
  const [publicUrl, setPublicUrl] = useState<{
    key: string;
    url: string;
  } | null>(null);
  const [intent, setIntent] = useState<{
    key: string;
    url: string;
    platform: string;
  } | null>(null);
  const generation = useRef(0),
    requestRef = useRef(request),
    actionLock = useRef(false);
  requestRef.current = request;
  const key = JSON.stringify([reference, revision, showProfile, refresh]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const ready = open && preview?.key === key ? preview : null;
  useEffect(() => {
    const generationId = ++generation.current,
      controller = new AbortController();
    let url: string | undefined;
    setPreview(null);
    setPublicUrl(null);
    setIntent(null);
    setMessage("");
    setError("");
    if (!open) return;
    void requestRef
      .current<PreparedShare>(
        { action: "prepare", reference, showProfile },
        controller.signal,
      )
      .then((result) => {
        if (controller.signal.aborted || generation.current !== generationId)
          return;
        const blob = new Blob(
          [Uint8Array.from(atob(result.png), (c) => c.charCodeAt(0))],
          { type: "image/png" },
        );
        url = URL.createObjectURL(blob);
        setPreview({ ...result, blob, url, key });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Image preparation failed. Try again.",
          );
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // Key includes the full reference, identity preference, current position and explicit refresh.
  }, [open, key]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let checking = false;
    const timer = window.setInterval(async () => {
      if (checking || actionLock.current) return;
      checking = true;
      try {
        const result = await requestRef.current<{ valid: boolean }>(
          { action: "validate", draft: ready.draft },
          controller.signal,
        );
        if (
          !controller.signal.aborted &&
          currentKey.current === ready.key &&
          !result.valid
        )
          setRefresh((value) => value + 1);
      } catch (e) {
        if (!controller.signal.aborted && currentKey.current === ready.key) {
          setPreview(null);
          setPublicUrl(null);
          setIntent(null);
          setError(
            e instanceof Error
              ? e.message
              : "Could not refresh this position. Try again.",
          );
        }
      } finally {
        checking = false;
      }
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [ready]);
  async function action(work: () => Promise<void>) {
    if (actionLock.current) return;
    const actionKey = currentKey.current;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(
          e instanceof Error
            ? e.message
            : "Sharing failed. Try downloading the image.",
        );
    } finally {
      actionLock.current = false;
      setBusy(false);
      if (currentKey.current !== actionKey) {
        setMessage("");
        setError("");
      }
    }
  }
  async function link(p: Preview) {
    if (publicUrl?.key === p.key) return publicUrl.url;
    const result = await requestRef.current<{ url: string }>({
      action: "publish",
      draft: p.draft,
    });
    if (currentKey.current !== p.key)
      throw new Error("The preview changed. Share the new image instead.");
    setPublicUrl({ key: p.key, url: result.url });
    return result.url;
  }
  function copyImage() {
    if (!ready) return;
    // Invoke clipboard.write synchronously inside the click, before any awaited work.
    if (
      !window.isSecureContext ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    ) {
      setError("Image copying is unavailable here. Use Download image.");
      return;
    }
    void action(async () => {
      setMessage("Copying...");
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": ready.blob }),
        ]);
        setMessage("Copied image");
      } catch {
        setMessage("");
        throw new Error("Image copying was denied. Use Download image.");
      }
    });
  }
  function download() {
    if (!ready) return;
    const url = URL.createObjectURL(ready.blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = shareFilename(ready.snapshot);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Download started");
    setError("");
  }
  function platform(name: "X" | "Telegram" | "WhatsApp") {
    if (!ready || actionLock.current) return;
    const p = ready;
    // Reserve a window within user activation. No social page opens on modal mount.
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    void action(async () => {
      try {
        const url = shareIntent(
          name,
          await link(p),
          `${p.snapshot.market.title} · Slabline`,
        );
        if (popup && !popup.closed) {
          popup.location.href = url;
          setMessage(
            `${name} compose opened. Attach the copied or downloaded image.`,
          );
        } else {
          setIntent({ key: p.key, url, platform: name });
          setError(
            "Your browser blocked the compose window. Use the link below.",
          );
        }
      } catch (e) {
        popup?.close();
        throw e;
      }
    });
  }
  function more() {
    if (!ready) return;
    const p = ready,
      file = new File([p.blob], shareFilename(p.snapshot), {
        type: "image/png",
      });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      void action(async () => {
        await navigator.share({ files: [file], title: "Slabline position" });
        setMessage("Share sheet completed");
      });
    } else if (navigator.share && publicUrl?.key === p.key) {
      void action(async () => {
        await navigator.share({
          url: publicUrl.url,
          title: "Slabline position",
        });
        setMessage("Share sheet completed");
      });
    } else {
      setMessage("Use Copy link or Download image to share in another app.");
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="position-share-trigger"
        aria-label="Share position"
      >
        <Share2 size={16} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="share-overlay" />
        <Dialog.Content
          className="position-share-dialog"
          aria-busy={!ready && !error}
        >
          <header>
            <Dialog.Title>Share position</Dialog.Title>
            <Dialog.Close
              className="position-share-trigger"
              aria-label="Close share position"
            >
              <X size={22} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Preview your position image, choose profile visibility, then copy,
            download or share.
          </Dialog.Description>
          <div className="share-preview-frame">
            {ready ? (
              <img
                src={ready.url}
                className="share-preview"
                width={1200}
                height={630}
                alt={`Position share preview for ${ready.snapshot.market.title}${ready.snapshot.slab ? ` with ${ready.snapshot.slab.name}` : ""}`}
              />
            ) : (
              <p role="status">
                {error ? "Image unavailable" : "Preparing image..."}
              </p>
            )}
          </div>
          <div className="share-profile-control">
            <label htmlFor={`share-profile-${preview?.draft ?? "loading"}`}>
              Show profile
            </label>
            <Switch.Root
              id={`share-profile-${preview?.draft ?? "loading"}`}
              checked={showProfile}
              disabled={busy}
              onCheckedChange={setShowProfile}
              className="share-switch"
            >
              <Switch.Thumb />
            </Switch.Root>
            <span>
              {ready
                ? identityLabel(ready.snapshot)
                : showProfile
                  ? ""
                  : "Anonymous"}
            </span>
          </div>
          <div className="share-target-control">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setCatalog(
                    await requestRef.current({ action: "catalog", reference }),
                  );
                })
              }
            >
              {ready?.snapshot.slab ? "Change target slab" : "Choose slab"}
            </Button>
            {catalog && (
              <RewardBrowser
                withinShare
                cards={catalog.cards}
                selected={catalog.cards.find(
                  (c) => c.mint === ready?.snapshot.slab?.sourceId,
                )}
                team={catalog.subject}
                payout={null}
                initialOpen
                triggerLabel="Browse target slabs"
                onSelect={(mint) => {
                  void action(async () => {
                    await requestRef.current({
                      action: "target",
                      reference,
                      choice: { source: "collectorcrypt", sourceId: mint },
                    });
                    setCatalog(null);
                    setRefresh((v) => v + 1);
                    onTargetSaved?.();
                  });
                }}
              />
            )}
            {ready?.snapshot.slab?.role === "collected" && (
              <span>Showing the confirmed collectible receipt.</span>
            )}
          </div>
          {!!catalog?.tokens.length && (
            <details className="share-grail-targets">
              <summary>Choose a Grail slab</summary>
              {catalog.tokens.map((token) => (
                <GrailReward
                  key={token.id}
                  token={token}
                  claimable={false}
                  onTargetSelect={(reserveId) =>
                    void action(async () => {
                      await requestRef.current({
                        action: "target",
                        reference,
                        choice: {
                          source: "grail",
                          sourceId: token.id,
                          reserveId,
                        },
                      });
                      setCatalog(null);
                      setRefresh((v) => v + 1);
                      onTargetSaved?.();
                    })
                  }
                />
              ))}
            </details>
          )}
          <div className="share-actions">
            <Button
              variant="outline"
              disabled={!ready || busy}
              onClick={copyImage}
            >
              <Copy size={18} />
              Copy image
            </Button>
            <Button
              variant="outline"
              disabled={!ready || busy}
              onClick={download}
            >
              <Download size={18} />
              Download image
            </Button>
            <Button
              variant="outline"
              disabled={!ready || busy}
              onClick={() =>
                ready &&
                void action(async () => {
                  const p = ready;
                  if (!navigator.clipboard?.writeText) {
                    await link(p);
                    throw new Error(
                      "Link copying is unavailable here. Use Open public snapshot below.",
                    );
                  }
                  // ClipboardItem's promise keeps activation alive while publishing on WebKit.
                  if (
                    typeof ClipboardItem !== "undefined" &&
                    navigator.clipboard.write
                  ) {
                    await navigator.clipboard.write([
                      new ClipboardItem({
                        "text/plain": link(p).then(
                          (url) => new Blob([url], { type: "text/plain" }),
                        ),
                      }),
                    ]);
                  } else await navigator.clipboard.writeText(await link(p));
                  setMessage("Copied link");
                })
              }
            >
              <LinkIcon size={18} />
              Copy link
            </Button>
          </div>
          <div className="share-platforms">
            <span>Share to</span>
            <div>
              {(["X", "Telegram", "WhatsApp"] as const).map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() => platform(name)}
                >
                  {name}
                </Button>
              ))}
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={more}
              >
                <Share2 size={18} />
                More
              </Button>
            </div>
          </div>
          <p className="share-hint">
            X shares the link. Attach the copied or downloaded image.
          </p>
          <p role="status" aria-live="polite">
            {message}
          </p>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => setRefresh((v) => v + 1)}
              >
                Refresh preview
              </button>
            </div>
          )}
          {publicUrl?.key === key && (
            <a
              className="text-link"
              href={publicUrl.url}
              target="_blank"
              rel="noreferrer"
            >
              Open public snapshot
            </a>
          )}
          {intent?.key === key && (
            <a
              className="text-link"
              href={intent.url}
              target="_blank"
              rel="noreferrer"
            >
              Open {intent.platform} compose
            </a>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
