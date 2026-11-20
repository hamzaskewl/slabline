export function UsdcIcon() {
  return (
    <svg className="usdc-icon" viewBox="0 0 32 32" role="img" aria-label="USDC">
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M10 6.5a11.2 11.2 0 0 0 0 19M22 6.5a11.2 11.2 0 0 1 0 19M19.6 11.4c-.7-1-1.8-1.5-3.5-1.5-2 0-3.5 1-3.5 2.7 0 4 7.3 1.5 7.3 5.7 0 1.7-1.6 3-3.8 3-1.8 0-3.2-.6-4-1.9M16 7.5v2.4M16 21.3v3.2"
      />
    </svg>
  );
}

export function UsdcAmount({ value }: { value: string | number }) {
  return (
    <span className="usdc-amount">
      {Number(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}
