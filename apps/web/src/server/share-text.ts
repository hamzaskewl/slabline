import metrics from "./inter-metrics.json";
import displayMetrics from "./inter-display-metrics.json";
const widths = metrics.widths as Record<string, number>;
const displayWidths = displayMetrics.widths as Record<string, number>;
/** Advance widths from the same bundled Inter font used by the PNG renderer. */
export const textWidth = (
  text: string,
  size: number,
  weight: 500 | 650 = 500,
) =>
  (Array.from(text).reduce(
    (sum, c) =>
      sum +
      ((weight === 650 ? displayWidths : widths)[String(c.codePointAt(0))] ??
        metrics.unitsPerEm * 0.65),
    0,
  ) *
    size) /
  metrics.unitsPerEm;
export function fitSize(
  text: string,
  width: number,
  preferred: number,
  minimum = 12,
  weight: 500 | 650 = 500,
) {
  return Math.max(
    minimum,
    Math.min(
      preferred,
      Math.floor(
        (preferred * width) / Math.max(1, textWidth(text, preferred, weight)),
      ),
    ),
  );
}
export function ellipsis(
  text: string,
  width: number,
  size: number,
  weight: 500 | 650 = 500,
) {
  if (textWidth(text, size, weight) <= width) return text;
  const letters = Array.from(text);
  while (
    letters.length &&
    textWidth(`${letters.join("")}…`, size, weight) > width
  )
    letters.pop();
  return `${letters.join("").trimEnd()}…`;
}
function lines(text: string, width: number, size: number) {
  const result: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && textWidth(`${line} ${word}`, size, 650) > width) {
      result.push(line);
      line = "";
    }
    if (textWidth(word, size, 650) > width) {
      for (const letter of Array.from(word)) {
        if (textWidth(line + letter, size, 650) > width) {
          result.push(line);
          line = "";
        }
        line += letter;
      }
    } else line += (line ? " " : "") + word;
  }
  if (line) result.push(line);
  return result;
}
export function titleLines(text: string, width = 800) {
  let size = 42,
    wrapped = lines(text, width, size);
  while (wrapped.length > 2 && size > 32) wrapped = lines(text, width, --size);
  return {
    size,
    lines:
      wrapped.length <= 2
        ? wrapped
        : [wrapped[0]!, ellipsis(wrapped.slice(1).join(" "), width, size, 650)],
  };
}
