/** Refine a sampled ankle maximum without inventing a peak outside its neighbours. */
export function peakTime(
  times: number[],
  values: number[],
  index: number,
): number {
  const t = times[index];
  if (index < 1 || index >= values.length - 1) return t;
  const x0 = times[index - 1] - t,
    x2 = times[index + 1] - t;
  const y0 = values[index - 1],
    y1 = values[index],
    y2 = values[index + 1];
  if (
    ![x0, x2, y0, y1, y2].every(Number.isFinite) ||
    x0 >= 0 ||
    x2 <= 0 ||
    y1 < y0 ||
    y1 < y2
  )
    return t;
  const a = ((y2 - y1) / x2 - (y0 - y1) / x0) / (x2 - x0);
  const b = (y2 - y1) / x2 - a * x2;
  const vertex = -b / (2 * a);
  return a < 0 && Number.isFinite(vertex) && vertex >= x0 && vertex <= x2
    ? t + vertex
    : t;
}
