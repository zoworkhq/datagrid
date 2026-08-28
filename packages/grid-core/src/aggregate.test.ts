import { describe, expect, it } from "vitest";
import { aggregate, describeAggregate, type Measured } from "./aggregate.js";

const mg = (value: number): Measured => ({ value, unit: "mg" });
const mL = (value: number): Measured => ({ value, unit: "mL" });
const bare = (value: number): Measured => ({ value });

describe("aggregation", () => {
  it("sums, means, mins and maxes within one unit", () => {
    const vs = [mg(2), mg(4), mg(6)];
    expect(aggregate("sum", vs)).toMatchObject({ value: 12, unit: "mg", n: 3 });
    expect(aggregate("mean", vs)).toMatchObject({ value: 4, unit: "mg" });
    expect(aggregate("min", vs)).toMatchObject({ value: 2 });
    expect(aggregate("max", vs)).toMatchObject({ value: 6 });
  });

  it("REFUSES across incompatible units rather than coercing", () => {
    // Every other grid returns 7 here, because to the summing code 5 and 2 are
    // both numbers. 5 mg + 2 mL is not 7 of anything.
    const r = aggregate("sum", [mg(5), mL(2)]);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") {
      expect(r.reason).toBe("cannot combine mg and mL");
      expect(r.units).toEqual(["mg", "mL"]);
    }
  });

  it("treats dimensionless as a real unit, not as a wildcard", () => {
    // A bare 5 and 5 mg are not the same measurement, and silently adopting the
    // unit of whichever came first is how a dose becomes a volume.
    const r = aggregate("sum", [bare(5), mg(5)]);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") expect(r.reason).toBe("cannot combine no unit and mg");
  });

  it("counts across mixed units, because counting does not depend on the unit", () => {
    expect(aggregate("count", [mg(1), mL(2), bare(3)])).toMatchObject({ value: 3, n: 3 });
  });

  it("reports how many rows it could not use", () => {
    // A mean over three of ten rows, shown as "the mean", is a claim about ten.
    const r = aggregate("mean", [mg(3), null, undefined, mg(9), { value: Number.NaN, unit: "mg" }]);
    expect(r).toMatchObject({ kind: "value", value: 6, n: 2, missing: 3 });
  });

  it("distinguishes empty from zero and from refused", () => {
    expect(aggregate("sum", []).kind).toBe("empty");
    expect(aggregate("sum", [null, undefined]).kind).toBe("empty");
    expect(aggregate("sum", [mg(0)])).toMatchObject({ kind: "value", value: 0 });
  });

  it("counts nothing as zero, which is a real answer", () => {
    expect(aggregate("count", [])).toMatchObject({ kind: "value", value: 0 });
  });
});

describe("the sentence a renderer shows", () => {
  it("names the refusal rather than showing a number", () => {
    expect(describeAggregate(aggregate("sum", [mg(5), mL(2)]))).toBe("cannot combine mg and mL");
  });

  it("says when an aggregate covers only some of the rows", () => {
    expect(describeAggregate(aggregate("mean", [mg(4), null, null]))).toBe("4 mg (2 not included)");
  });

  it("says nothing extra when it covers all of them", () => {
    expect(describeAggregate(aggregate("sum", [mg(1), mg(2)]))).toBe("3 mg");
  });

  it("distinguishes no values from zero", () => {
    expect(describeAggregate(aggregate("sum", []))).toBe("no values");
    expect(describeAggregate(aggregate("sum", [bare(0)]))).toBe("0");
  });
});
