import { describe, it, expect } from "vitest";
import { assessContext, holdOf } from "../src/fit/assessment";
import { defaultIntake } from "../src/domain/types";
describe("context before changes", () => {
  it("NHS back emergency symptoms override fit experiments", () =>
    expect(
      assessContext({ ...defaultIntake, screen: "emergency-back" }, [])[0]
        ?.urgency,
    ).toBe("emergency"));
  it("NHS urgent knee symptoms request urgent assessment", () =>
    expect(
      assessContext({ ...defaultIntake, screen: "urgent-knee" }, [])[0]
        ?.urgency,
    ).toBe("urgent"));
  it("an unanswered check with no symptoms adds nothing", () =>
    expect(assessContext(defaultIntake, [])).toEqual([]));
  it("an unanswered check with symptoms asks for it without blocking", () => {
    const r = assessContext(
      {
        ...defaultIntake,
        symptoms: [{ area: "neck", side: "both", severity: 3, warning: false }],
      },
      [],
    );
    expect(r[0]?.id).toBe("screen-check");
    expect(holdOf(r)).toBeUndefined();
  });
  it("one worse ride does not stop the fit", () =>
    expect(
      holdOf(
        assessContext({ ...defaultIntake, screen: "none" }, [
          { id: "a", at: "now", kind: "ride", detail: "", response: "worse" },
        ]),
      ),
    ).toBeUndefined());
  it("symptoms outside cycling do not become a fit diagnosis", () =>
    expect(
      assessContext(
        {
          ...defaultIntake,
          screen: "none",
          symptoms: [
            {
              area: "lower-back" as const,
              side: "both" as const,
              severity: 4,
              warning: false,
            },
          ],
          outsideCycling: true,
        },
        [],
      )[0]?.outcome,
    ).toBe("assessment"));
  it("only emergency and urgent groups hold the fit", () => {
    expect(
      holdOf(assessContext({ ...defaultIntake, screen: "urgent-back" }, [])),
    ).toBeDefined();
    expect(
      holdOf(
        assessContext(
          {
            ...defaultIntake,
            screen: "none",
            persistent: true,
            outsideCycling: true,
            limitations: "Old ACL repair",
            symptoms: [
              { area: "knee-front", side: "left", severity: 9, warning: true },
            ],
          },
          [],
        ),
      ),
    ).toBeUndefined();
  });
  it("two unhelpful experiments suggest a professional fitter", () =>
    expect(
      assessContext({ ...defaultIntake, screen: "none" }, [
        {
          id: "a",
          at: "now",
          kind: "ride",
          detail: "",
          experimentId: "one",
          response: "same",
        },
        {
          id: "b",
          at: "now",
          kind: "ride",
          detail: "",
          experimentId: "two",
          response: "same",
        },
      ])[0]?.outcome,
    ).toBe("assessment"));
  it("negative screen is no diagnosis or medical clearance", () =>
    expect(assessContext({ ...defaultIntake, screen: "none" }, [])).toEqual(
      [],
    ));
});
