export function SlablineMark({ height = 28 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 100 140"
      width={(height * 100) / 140}
      height={height}
      aria-hidden="true"
      focusable="false"
      className="slabline-mark"
      fill="currentColor"
    >
      <path d="M20 0H80Q86 0 90 4L96 10Q100 14 100 20V75Q100 84 92 80L8 35Q0 31 0 24V20Q0 14 4 10L10 4Q14 0 20 0Z" />
      <path d="M8 62L92 107Q100 111 100 118V120Q100 126 96 130L90 136Q86 140 80 140H20Q14 140 10 136L4 130Q0 126 0 120V67Q0 58 8 62Z" />
    </svg>
  );
}
export function ChartWatermark() {
  return (
    <img
      className="slabline-chart-watermark"
      src="/brand/slabline-chart-watermark.svg"
      width={40}
      height={56}
      alt=""
      aria-hidden="true"
    />
  );
}
