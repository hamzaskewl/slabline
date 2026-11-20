"use client";
import { CheckCircle2, X } from "lucide-react";
import { createPortal } from "react-dom";

export function SaleNotification({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return createPortal(
    <div
      className="sale-notification"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <CheckCircle2 size={20} aria-hidden="true" />
      <p>{message}</p>
      <button
        type="button"
        aria-label="Dismiss sale notification"
        onClick={onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
