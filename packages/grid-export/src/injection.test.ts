import { describe, expect, it } from "vitest";
import { isFormulaInjection, neutralise } from "./injection.js";

/**
 * The payload sits in a patient's *preferred name* — free text a patient
 * supplies. That is the whole reason this defence exists: without it, export is
 * a remote-code-execution path from a patient into a biller's workstation.
 */
const PAYLOAD = "=cmd|' /C calc'!A0";

describe("formula injection detection", () => {
  it("catches every dangerous leading character", () => {
    for (const c of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(isFormulaInjection(`${c}SUM(1)`)).toBe(true);
    }
  });

  it("catches full-width variants, which execute in some locales", () => {
    for (const c of ["＝", "＋", "－", "＠"]) {
      expect(isFormulaInjection(`${c}SUM(1)`)).toBe(true);
    }
  });

  it("is not fooled by leading whitespace, NBSP or a BOM", () => {
    expect(isFormulaInjection(`   ${PAYLOAD}`)).toBe(true);
    expect(isFormulaInjection(` ${PAYLOAD}`)).toBe(true);
    expect(isFormulaInjection(`﻿${PAYLOAD}`)).toBe(true);
  });

  it("applies after the delimiter, not only at field start", () => {
    // A re-save can split this field, and the second half becomes a formula
    // cell. Checking only the first character misses it entirely.
    expect(isFormulaInjection(`Okafor,${PAYLOAD}`)).toBe(true);
    expect(isFormulaInjection(`Okafor;${PAYLOAD}`)).toBe(true);
    expect(isFormulaInjection(`Okafor\n${PAYLOAD}`)).toBe(true);
    expect(isFormulaInjection(`Okafor\t${PAYLOAD}`)).toBe(true);
  });

  it("leaves ordinary clinical text alone", () => {
    for (const s of [
      "Aurelia Marchetti-Okonkwo",
      "3.7 mmol/L",
      "COVID-19",
      "O'Brien",
      "",
      "42 CFR Part 2",
      "Follow-up in 2 weeks",
    ]) {
      expect(isFormulaInjection(s)).toBe(false);
      expect(neutralise(s)).toBe(s);
    }
  });

  it("neutralises by forcing the cell to text", () => {
    expect(neutralise(PAYLOAD)).toBe(`'${PAYLOAD}`);
  });
});
