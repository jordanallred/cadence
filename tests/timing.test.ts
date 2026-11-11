import { it, expect } from "vitest";
import { peakTime } from "../src/analysis/timing";
it("recovers a peak between frames using actual nonuniform timestamps", () => {
  expect(peakTime([0, 33, 67], [-444, 975, 159], 1)).toBeCloseTo(38, 6);
});
it("keeps boundary peaks at the measured timestamp", () =>
  expect(peakTime([0, 33, 67], [10, 5, 0], 0)).toBe(0));
it("does not extrapolate a peak from monotonic movement", () =>
  expect(peakTime([0, 33, 67], [1, 2, 3], 1)).toBe(33));
it("avoids frame-quantized cadence across several realistic pedaling rates", () => {
  for (const rpm of [61, 67, 73, 89, 103]) {
    const times = Array.from({ length: 600 }, (_, n) =>
      Math.round((n * 1000) / 30),
    );
    const ys = times.map((t) => Math.sin((t / 60000) * rpm * 2 * Math.PI));
    const peaks: number[] = [];
    for (let n = 1; n < ys.length - 1; n++)
      if (ys[n] > ys[n - 1] && ys[n] >= ys[n + 1])
        peaks.push(peakTime(times, ys, n));
    const periods = peaks
      .slice(1)
      .map((t, n) => t - peaks[n])
      .sort((a, b) => a - b);
    expect(
      Math.abs(60000 / periods[Math.floor(periods.length / 2)] - rpm),
    ).toBeLessThan(0.1);
  }
});
