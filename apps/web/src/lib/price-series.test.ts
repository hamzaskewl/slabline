import { expect, test, mock } from "bun:test";
import { createPriceSeries } from "./price-series";

test("live ticks preserve the viewport; first data and range changes fit", () => {
  const target = {
    setData: mock(() => {}),
    update: mock(() => {}),
    fit: mock(() => {}),
  };
  const render = createPriceSeries(target);
  render([], "ALL");
  expect(target.fit).not.toHaveBeenCalled();
  const points = [
    { time: 1800000000, value: 0.25 },
    { time: 1800000060, value: 0.3 },
  ];
  render(points, "ALL");
  for (let i = 0; i < 60; i++)
    render(
      [...points.slice(0, 1), { time: 1800000060, value: 0.3 + i / 1000 }],
      "ALL",
    );
  expect(target.setData).toHaveBeenCalledTimes(2);
  expect(target.update).toHaveBeenCalledTimes(60);
  expect(target.fit).toHaveBeenCalledTimes(1);
  render([...points, { time: 1800000120, value: 0.4 }], "ALL");
  expect(target.fit).toHaveBeenCalledTimes(1);
  render(points, "1D");
  expect(target.fit).toHaveBeenCalledTimes(2);
});

test("historical corrections replace data without resetting the viewport", () => {
  const target = {
    setData: mock(() => {}),
    update: mock(() => {}),
    fit: mock(() => {}),
  };
  const render = createPriceSeries(target);
  render(
    [
      { time: 1800000000, value: 0.2 },
      { time: 1800000060, value: 0.3 },
    ],
    "1D",
  );
  render(
    [
      { time: 1800000000, value: 0.25 },
      { time: 1800000060, value: 0.3 },
    ],
    "1D",
  );
  expect(target.setData).toHaveBeenCalledTimes(2);
  expect(target.fit).toHaveBeenCalledTimes(1);
});
