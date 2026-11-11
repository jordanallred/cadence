import { it, expect } from "vitest";
import { describeRange, targetRange } from "../src/fit/ranges";
import { defaultIntake } from "../src/domain/types";

const knee = targetRange("knee-min", defaultIntake)!;
it("says where a knee angle sits against the 30–40° target", () => {
  expect(describeRange(35, knee, "°")).toEqual({
    state: "inside",
    text: "Inside the target (30–40°)",
  });
  expect(describeRange(27.5, knee, "°")).toEqual({
    state: "near",
    text: "2.5° below the target (30–40°)",
  });
  expect(describeRange(24.2, knee, "°").state).toBe("outside");
  expect(describeRange(47, knee, "°").text).toBe(
    "7° above the target (30–40°)",
  );
});
it("words one-sided ranges as a minimum", () => {
  const elbow = targetRange("elbow", defaultIntake)!;
  expect(describeRange(20, elbow, "°").text).toBe(
    "Inside the target (at least 10°)",
  );
  expect(describeRange(4, elbow, "°").state).toBe("outside");
});
it("has no range for measurements the advice does not use", () => {
  expect(targetRange("knee-max", defaultIntake)).toBeUndefined();
});
