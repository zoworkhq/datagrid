import { describe, expect, it } from "vitest";
import { describeMigration, migrate } from "./index.js";

const antdSource = `
import { Table, Button } from "antd";

export function Roster({ patients }) {
  return (
    <Table
      columns={columns}
      dataSource={patients}
      rowKey="id"
      pagination={{ pageSize: 20 }}
      onChange={handleChange}
    />
  );
}
`;

const muiSource = `
import { DataGrid } from "@mui/x-data-grid";

export function Roster({ patients }) {
  return <DataGrid rows={patients} columns={columns} getRowId={(r) => r.id} checkboxSelection />;
}
`;

describe("the codemod refuses to invent a coverage claim", () => {
  it("inserts a placeholder that does NOT compile", () => {
    // A codemod that helpfully wrote coverage={{ total: rows.length }} would
    // manufacture the exact false completeness claim the prop exists to
    // prevent — across every table in a codebase, in one commit.
    const out = migrate(antdSource, "antd");
    expect(out.code).toContain("MISSING_COVERAGE");
    expect(out.code).toContain("coverage is required and cannot be inferred");
    expect(out.todos.some((t) => t.startsWith("coverage:"))).toBe(true);
  });

  it("does not add one when the file already has coverage", () => {
    const already = antdSource.replace("rowKey=\"id\"", 'rowKey="id" coverage={coverage}');
    const out = migrate(already, "antd");
    expect(out.code).not.toContain("MISSING_COVERAGE");
    expect(out.todos.some((t) => t.startsWith("coverage:"))).toBe(false);
  });
});

describe("antd Table", () => {
  const out = migrate(antdSource, "antd");

  it("rewrites the import and keeps the other named imports", () => {
    expect(out.code).toContain('import { Button } from "antd";');
    expect(out.code).toContain('import { DataGrid } from "@oxygenui-design/grid-react";');
    expect(out.code).not.toMatch(/import \{ Table,/);
  });

  it("renames the element and the props that mean the same thing", () => {
    expect(out.code).toContain("<DataGrid");
    expect(out.code).toContain("data={patients}");
    expect(out.code).toContain("columns={columns}");
  });

  it("LEAVES props whose meaning differs, and says why", () => {
    // Deleting them would hide the decision; renaming them would produce code
    // that compiles and behaves differently.
    expect(out.code).toContain("pagination=");
    expect(out.code).toContain("onChange=");
    expect(out.todos.join("\n")).toContain("offset-based");
    expect(out.todos.join("\n")).toContain("typed action per change");
  });
});

describe("MUI DataGrid", () => {
  const out = migrate(muiSource, "mui");

  it("maps rows and getRowId", () => {
    expect(out.code).toContain("data={patients}");
    expect(out.code).toContain("rowKey={(r) => r.id}");
    expect(out.code).toContain('from "@oxygenui-design/grid-react"');
  });

  it("flags checkboxSelection rather than mapping it", () => {
    // Selection here is ids OR a predicate, because those are different acts.
    expect(out.todos.join("\n")).toContain("ids OR a predicate");
  });
});

describe("safety", () => {
  it("does nothing to a file that does not import the target", () => {
    const untouched = `import { Chart } from "somewhere";\nexport const x = <Chart />;`;
    const out = migrate(untouched, "antd");
    expect(out.code).toBe(untouched);
    expect(out.edits).toEqual([]);
  });

  it("does not confuse a local Table with antd's", () => {
    const local = `import { Table } from "./my-table";\nexport const x = <Table rows={[]} />;`;
    expect(migrate(local, "antd").edits).toEqual([]);
  });

  it("reports what a person must still answer", () => {
    const report = describeMigration(migrate(antdSource, "antd"));
    expect(report).toContain("will NOT compile until these are answered");
    expect(report).toContain("coverage:");
  });
});
