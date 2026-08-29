/**
 * The synthetic people every panel draws from.
 *
 * Extracted from `main.ts` when the second panel needed a name: two tables of
 * names drifting apart is how a demo ends up with "Amara Okafor" on one tab and
 * "Patient 3" on another, and a roster of "Patient 3" is not a roster anyone
 * recognises. Nothing here is a real person.
 */
import type { FacePool } from "./avatar.js";

export const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin", "Elmwood"];

export const SURNAMES = [
  "Okafor", "Lindqvist", "Rahman", "Müller", "Nakamura", "Oyelaran", "Kowalski",
  "Ferreira", "Haddad", "Bianchi", "Novak", "Petrov", "Dlamini", "Marchetti",
  "Whitfield", "Ashworth", "Delacroix", "Vasquez", "Sørensen", "Ibrahim",
  "Castellano", "Moreau", "Anand", "Bergström", "Adeyemi", "Callaghan",
];

/* Full given names, not initials: a roster shows people, and "A. Okafor" is
   how a system refers to a record rather than how a ward refers to a person.
   Each carries the portrait set its face is drawn from — presentation only,
   and only so a photograph does not visibly contradict the name beside it. */
export const GIVEN: ReadonlyArray<readonly [string, FacePool]> = [
  ["Amara", "feminine"], ["Daniel", "masculine"], ["Priya", "feminine"],
  ["Marcus", "masculine"], ["Elena", "feminine"], ["Tobias", "masculine"],
  ["Fatima", "feminine"], ["Ruth", "feminine"], ["Jonas", "masculine"],
  ["Yusuf", "masculine"], ["Clara", "feminine"], ["Hassan", "masculine"],
  ["Ingrid", "feminine"], ["Mateo", "masculine"], ["Nadia", "feminine"],
  ["Oliver", "masculine"], ["Rosa", "feminine"], ["Samuel", "masculine"],
  ["Leila", "feminine"], ["Viktor", "masculine"], ["Grace", "feminine"],
  ["Anton", "masculine"], ["Miriam", "feminine"], ["Felix", "masculine"],
];

/** Co-prime strides, so the two halves do not march in lockstep. */
export const personFor = (i: number): { readonly name: string; readonly pool: FacePool } => {
  const given = GIVEN[(i * 7) % GIVEN.length] as readonly [string, FacePool];
  return { name: `${given[0]} ${SURNAMES[(i * 11) % SURNAMES.length]}`, pool: given[1] };
};

export const nameFor = (i: number): string => personFor(i).name;
