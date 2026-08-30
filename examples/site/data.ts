/**
 * The ward this site shows.
 *
 * Every row is synthetic and no PHI appears anywhere. What is NOT synthetic is
 * the shape: these are the columns a medical-surgical inpatient worklist
 * actually carries, with the distribution of missing values a real one has —
 * roughly a fifth of cells absent, for eight different reasons, because that is
 * what a ward at 09:00 looks like when the morning bloods are half back.
 *
 * A demo with complete data is a demo that never has to answer the question
 * this library exists to answer.
 */
import type { Absent } from "@oxygenui-design/grid-healthcare";

export interface Patient {
  readonly id: string;
  readonly name: string;
  readonly mrn: string;
  readonly age: number;
  readonly bed: string;
  readonly ward: string;
  readonly los: number;
  readonly acuity: "Stable" | "Guarded" | "Deteriorating" | "Critical";
  readonly news2: number | Absent;
  readonly potassium: { readonly value: number; readonly unit: string } | Absent;
  readonly creatinine: { readonly value: number; readonly unit: string } | Absent;
  readonly allergies: readonly string[] | Absent;
  readonly problems: readonly string[];
  readonly anticoag: string | Absent;
  readonly attending: string;
  readonly disposition: string | Absent;
  readonly lastReviewed: string;
}

const GIVEN = [
  "Amara", "Daniel", "Priya", "Marcus", "Elena", "Tobias", "Fatima", "Ruth",
  "Jonas", "Yusuf", "Clara", "Hassan", "Ingrid", "Mateo", "Nadia", "Oliver",
  "Rosa", "Samuel", "Leila", "Viktor", "Grace", "Anton", "Miriam", "Felix",
];

const FAMILY = [
  "Okafor", "Lindqvist", "Rahman", "Müller", "Nakamura", "Oyelaran", "Kowalski",
  "Ferreira", "Haddad", "Bianchi", "Novak", "Petrov", "Dlamini", "Marchetti",
  "Whitfield", "Ashworth", "Delacroix", "Vasquez", "Sørensen", "Ibrahim",
  "Castellano", "Moreau", "Anand", "Bergström", "Adeyemi", "Callaghan",
];

const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin", "Elmwood"];

const PROBLEMS = [
  "Type 2 diabetes", "Hypertension", "COPD", "Atrial fibrillation",
  "Chronic kidney disease", "Heart failure", "Asthma", "Cellulitis",
  "Community-acquired pneumonia", "Delirium", "Depression", "Osteoarthritis",
];

const ATTENDING = [
  "Dr. M. Sandoval", "Dr. P. Achterberg", "Dr. R. Whitfield",
  "Dr. J. Okonkwo", "Dr. L. Fitzgerald", "Dr. S. Adeyemi",
];

const ANTICOAG = [
  "Enoxaparin 40 mg SC daily",
  "Apixaban 5 mg PO BD",
  "Warfarin — INR 2.4",
  "Enoxaparin 40 mg SC daily",
  "Rivaroxaban 20 mg PO daily",
];

const DISPOSITION = [
  "Home, awaiting transport",
  "Home with district nursing",
  "Rehabilitation, bed requested",
  "Awaiting social care assessment",
  "Discharge planned 14:00",
];

/**
 * The eight, in the proportion a ward produces them.
 *
 * Not evenly distributed: "not ordered" and "not resulted" dominate a morning
 * round, and "withheld" is rare and consequential. A demo that cycles them
 * evenly makes the rare one look routine.
 */
const ABSENCES: readonly Absent[] = [
  { reason: "not-ordered" },
  { reason: "not-ordered" },
  { reason: "not-resulted", orderedAt: "06:40" },
  { reason: "not-resulted", orderedAt: "07:15" },
  { reason: "not-measured" },
  { reason: "not-applicable", because: "on dialysis" },
  { reason: "declined", by: "patient" },
  { reason: "specimen-problem", detail: "haemolysed" },
  { reason: "withheld", policy: "42 CFR Part 2", legal: "42 CFR §2.32" },
  { reason: "source-unreachable", source: "Northside Regional Exchange" },
];

const pick = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;

export function ward(n: number): Patient[] {
  const rows = new Array<Patient>(n);
  for (let i = 0; i < n; i++) {
    // Co-prime strides so given and family names do not march in lockstep.
    const name = `${pick(GIVEN, i * 7)} ${pick(FAMILY, i * 11)}`;
    const acuity = (["Stable", "Stable", "Guarded", "Deteriorating", "Stable", "Critical"] as const)[i % 6] as Patient["acuity"];
    const absent = (offset: number): boolean => (i + offset) % 7 === 3;

    rows[i] = {
      id: `p${i}`,
      name,
      mrn: `MRN-${String(100000 + ((i * 7919) % 899999))}`,
      age: 41 + ((i * 13) % 48),
      bed: `${pick(["A", "B", "C", "D"], i)}${String((i % 24) + 1).padStart(2, "0")}`,
      ward: pick(WARDS, i),
      los: 1 + ((i * 5) % 19),
      acuity,
      news2: absent(0) ? pick(ABSENCES, i) : ((i * 3) % 13),
      potassium: absent(2)
        ? pick(ABSENCES, i + 5)
        : { value: Math.round((3.1 + ((i * 37) % 32) / 10) * 10) / 10, unit: "mmol/L" },
      creatinine: absent(4)
        ? pick(ABSENCES, i + 2)
        : { value: 58 + ((i * 29) % 180), unit: "µmol/L" },
      allergies: absent(5)
        ? pick(ABSENCES, i + 8)
        : i % 4 === 0
          ? []
          : pick([["Penicillin"], ["Latex", "Penicillin"], ["Sulfonamides"], ["Contrast media"]], i),
      problems: PROBLEMS.slice(i % 5, (i % 5) + 1 + (i % 4)),
      anticoag: absent(1) ? pick(ABSENCES, i + 3) : pick(ANTICOAG, i),
      attending: pick(ATTENDING, i),
      disposition: absent(3) ? pick(ABSENCES, i + 6) : pick(DISPOSITION, i),
      lastReviewed: `${String(6 + (i % 5)).padStart(2, "0")}:${String((i * 17) % 60).padStart(2, "0")}`,
    };
  }
  return rows;
}

/** The measured figures this site quotes. Every one is from `bench/`. */
export const MEASURED = {
  cellsPerRow: { ours: 15, theirs: 250, at: "250 columns" },
  scrollP50: { ours: 8.3, theirs: 33.3, unit: "ms", at: "100 columns" },
  resort: { ours: 1.9, theirs: 117.7, unit: "ms", at: "100,000 rows" },
  memory: { ours: 252, theirs: 1331, unit: "MB", at: "100,000 × 250" },
  bundle: { ours: 10.71, theirs: 292.6, unit: "kB", at: "brotlied, whole grid" },
  streaming: { ours: 9.0, theirs: 16.7, unit: "ms", at: "10,000 updates/s, p95" },
} as const;
