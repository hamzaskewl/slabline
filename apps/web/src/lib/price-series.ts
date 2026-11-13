import { normalizePricePoints, type PricePoint } from "@collectible/domain";

export type PriceSeriesTarget = {
  setData: (points: PricePoint[]) => void;
  update: (point: PricePoint) => void;
  fit: () => void;
};

// A tick must not reset the viewport. Fit only on first data or range changes.
export function createPriceSeries(target: PriceSeriesTarget) {
  let previous: PricePoint[] = [],
    previousKey = "",
    fitted = false;
  return (input: PricePoint[], key: string) => {
    const points = normalizePricePoints(input);
    const changed = key !== previousKey;
    if (changed) fitted = false;
    const prefixUnchanged =
      !changed &&
      previous.length > 0 &&
      points.length >= previous.length &&
      previous
        .slice(0, -1)
        .every(
          (p, i) => points[i]?.time === p.time && points[i]?.value === p.value,
        ) &&
      previous.at(-1)?.time === points[previous.length - 1]?.time;
    if (prefixUnchanged) {
      for (const p of points.slice(previous.length - 1)) target.update(p);
    } else {
      target.setData(points);
    }
    if (points.length && !fitted) {
      target.fit();
      fitted = true;
    }
    previous = points;
    previousKey = key;
  };
}
