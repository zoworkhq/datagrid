/**
 * @oxygenui-design/grid-codemod — migrations from antd `Table` and MUI `DataGrid`.
 *
 * ── THE RULE THAT SHAPES THE WHOLE THING ────────────────────────────────────
 *
 * **A codemod never invents a coverage claim.**
 *
 * `coverage` is required and has no default, because every plausible default is
 * a claim the caller did not make. That constraint does not relax because a
 * migration is inconvenient: a codemod that helpfully wrote
 * `coverage={{ sources: [...], total: rows.length }}` would be manufacturing
 * exactly the false completeness claim the prop exists to prevent — at scale,
 * across every table in a codebase, in a single commit nobody reads line by
 * line.
 *
 * So it emits a placeholder that **does not compile**, with the reason inline.
 * The build breaks, a person supplies the truth, and the migration is finished
 * by someone who knows what the query actually reached.
 *
 * That is the codemod's real job. Renaming props is the easy part; refusing to
 * answer a question only the developer can answer is the valuable part.
 */
import ts from "typescript";

export type Source = "antd" | "mui";

export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Why, so a reviewer reading the diff can check it. */
  readonly reason: string;
}

export interface Migration {
  readonly code: string;
  readonly edits: readonly Edit[];
  /** Things a person must finish. Non-empty means the file will not compile yet. */
  readonly todos: readonly string[];
}

/** antd `Table` → our `DataGrid`. Only props with an exact meaning are renamed. */
const ANTD_PROPS: Readonly<Record<string, string>> = {
  dataSource: "data",
  rowKey: "rowKey",
  columns: "columns",
  loading: "loading",
};

/** MUI `DataGrid` → ours. */
const MUI_PROPS: Readonly<Record<string, string>> = {
  rows: "data",
  columns: "columns",
  getRowId: "rowKey",
  loading: "loading",
};

/**
 * Props deliberately NOT migrated, with the reason.
 *
 * Each is a place where the two libraries mean different things, and a silent
 * rename would produce code that compiles and behaves differently.
 */
const NOT_MIGRATED: Readonly<Record<string, string>> = {
  pagination:
    "antd's `pagination` is offset-based. This grid defaults to cursor paging because FHIR has no offset. Choose deliberately.",
  onChange:
    "antd's `onChange` fires for sort, filter and pagination together. This grid emits a typed action per change; split the handler.",
  scroll: "Virtualisation is automatic here. `scroll={{ y }}` has no equivalent and is not needed.",
  rowSelection:
    "Selection here is ids OR a predicate, because those are different acts. Map it explicitly.",
  checkboxSelection:
    "Selection here is ids OR a predicate. Map it explicitly rather than assuming ids.",
  autoHeight: "Height is the container's. Remove it and size the host element.",
  disableColumnFilter: "Filtering is a plugin here, off unless registered. Remove it.",
};

const COVERAGE_PLACEHOLDER = `coverage={/* TODO(grid-codemod): coverage is required and cannot be inferred.
      Describe what this query actually reached: which sources, their health, and the
      total if the server reports one. See docs/decisions/0005. */ MISSING_COVERAGE}`;

interface Target {
  readonly tag: string;
  readonly importFrom: string;
}

const TARGETS: Readonly<Record<Source, Target>> = {
  antd: { tag: "Table", importFrom: "antd" },
  mui: { tag: "DataGrid", importFrom: "@mui/x-data-grid" },
};

/**
 * Plans a migration. It does not write files.
 *
 * Returning edits rather than performing them means a caller can show the diff,
 * and means this is testable without a filesystem.
 */
export function migrate(code: string, source: Source, fileName = "input.tsx"): Migration {
  const target = TARGETS[source];
  const propMap = source === "antd" ? ANTD_PROPS : MUI_PROPS;
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const edits: Edit[] = [];
  const todos: string[] = [];
  let importedAs: string | null = null;

  // ── the import ────────────────────────────────────────────────────────────
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== target.importFrom) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    const match = bindings.elements.find(
      (e) => (e.propertyName ?? e.name).text === target.tag,
    );
    if (!match) continue;
    importedAs = match.name.text;

    const others = bindings.elements.filter((e) => e !== match);
    const rest =
      others.length > 0
        ? `import { ${others.map((e) => e.getText(file)).join(", ")} } from "${target.importFrom}";\n`
        : "";
    edits.push({
      start: statement.getStart(file),
      end: statement.getEnd(),
      text: `${rest}import { DataGrid } from "@oxygenui-design/grid-react";`,
      reason: `${target.tag} from ${target.importFrom} becomes DataGrid`,
    });
  }

  if (importedAs === null) return { code, edits: [], todos: [] };

  // ── the elements ──────────────────────────────────────────────────────────
  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(file);
      if (tagName === importedAs) {
        edits.push({
          start: node.tagName.getStart(file),
          end: node.tagName.getEnd(),
          text: "DataGrid",
          reason: "element renamed",
        });

        let sawCoverage = false;
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText(file);
          if (name === "coverage") sawCoverage = true;

          const renamed = propMap[name];
          if (renamed && renamed !== name) {
            edits.push({
              start: attr.name.getStart(file),
              end: attr.name.getEnd(),
              text: renamed,
              reason: `${name} becomes ${renamed}`,
            });
            continue;
          }

          const why = NOT_MIGRATED[name];
          if (why) {
            // Left in place, so the build breaks on an unknown prop and a
            // person reads the reason. Deleting it would hide the decision.
            todos.push(`${name}: ${why}`);
          }
        }

        if (!sawCoverage) {
          // The whole point. A codemod that filled this in would manufacture a
          // false completeness claim across every table in a codebase, in one
          // commit nobody reads line by line.
          const insertAt = node.tagName.getEnd();
          edits.push({
            start: insertAt,
            end: insertAt,
            text: `\n      ${COVERAGE_PLACEHOLDER}`,
            reason: "coverage is required and cannot be inferred",
          });
          todos.push(
            "coverage: required, with no default. Describe what this query reached — the codemod will not guess.",
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return { code: apply(code, edits), edits, todos };
}

/** Applies edits back-to-front, so earlier offsets stay valid. */
export function apply(code: string, edits: readonly Edit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((out, e) => out.slice(0, e.start) + e.text + out.slice(e.end), code);
}

/** A human-readable summary for the migration report. */
export function describeMigration(result: Migration): string {
  if (result.edits.length === 0) return "Nothing to migrate in this file.";
  const lines = [`${result.edits.length} edits.`];
  if (result.todos.length > 0) {
    lines.push("", "This file will NOT compile until these are answered:");
    for (const todo of result.todos) lines.push(`  · ${todo}`);
  }
  return lines.join("\n");
}
