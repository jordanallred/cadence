import type { Metric } from "../domain/types";

/** A metric's value as riders read it: whole cycles, 2-decimal ratios, else 1 decimal. */
export function metricValue(m: Pick<Metric, "value" | "unit">) {
  if (m.unit === "cycles") return String(Math.round(m.value));
  if (m.unit === "ratio") return m.value.toFixed(2);
  return m.value.toFixed(1);
}

/** Unit text after the number; degrees sit tight against it. */
export function metricUnit(unit: string) {
  return unit === "°" ? "°" : ` ${unit}`;
}

/** "23.7°", "1.02 ratio", "-3.1 % thigh". */
export function showMetric(value: number, unit: string) {
  return metricValue({ value, unit }) + metricUnit(unit);
}
