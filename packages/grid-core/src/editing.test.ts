import { describe, expect, it, vi } from "vitest";
import { beginEdit, cancelEdit, commitEdit, isDirty, isEditable, updateDraft } from "./editing.js";

interface P { readonly id: string; readonly name: string; readonly ward: string }
const row: P = { id: "p1", name: "A. Okafor", ward: "Ashgrove" };
const apply = (r: P, key: string, value: unknown) => ({ ...r, [key]: value }) as P;
const open = () => beginEdit({ rowId: "p1", columnKey: "ward", row, value: "Ashgrove" });

describe("editing", () => {
  it("keeps the original alongside the draft", () => {
    const s = updateDraft(open(), "Beeches");
    expect(s).toMatchObject({ draft: "Beeches", original: "Ashgrove", status: "editing" });
    expect(isDirty(s)).toBe(true);
  });

  it("does not write when nothing changed", async () => {
    // Sending it anyway puts a write in the audit log the user did not make.
    const write = vi.fn();
    const out = await commitEdit(open(), { apply, write });
    expect(write).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
  });

  it("commits a dirty draft and returns what the server wrote", async () => {
    const write = vi.fn(async ({ row: r }: { row: P }) => ({ ...r, ward: "Beeches" }));
    const out = await commitEdit(updateDraft(open(), "Beeches"), { apply, write });
    expect(out.ok).toBe(true);
    expect(out.row.ward).toBe("Beeches");
    expect(out.session.status).toBe("committed");
  });

  it("RESTORES the original when the write fails, and keeps the draft", async () => {
    // The failure every grid gets wrong: the cell keeps showing what the user
    // typed, a toast appears elsewhere, and the row now displays a value the
    // server does not have.
    const write = vi.fn(async () => {
      throw new Error("409 conflict for A. Okafor");
    });
    const out = await commitEdit(updateDraft(open(), "Beeches"), { apply, write });
    expect(out.ok).toBe(false);
    expect(out.row).toEqual(row);              // exactly as it was
    expect(out.session.draft).toBe("Beeches"); // nobody retypes from memory
    expect(out.session.status).toBe("failed");
    if (!out.ok) expect(JSON.stringify(out.error)).not.toContain("Okafor");
  });

  it("lets a failed edit be edited again", async () => {
    const write = vi.fn(async () => {
      throw new Error("nope");
    });
    const failed = await commitEdit(updateDraft(open(), "Beeches"), { apply, write });
    const retried = updateDraft(failed.session, "Cedar");
    expect(retried.status).toBe("editing");
    expect(retried.error).toBeUndefined();
  });

  it("cancels back to the snapshot", () => {
    expect(cancelEdit(updateDraft(open(), "Beeches"))).toEqual(row);
  });

  it("refuses to edit a derived column", () => {
    // Writing to a model output detaches the value from the model that made
    // it, and the provenance in the header becomes a lie.
    expect(isEditable({ derived: true, editable: true })).toBe(false);
    expect(isEditable({ editable: true })).toBe(true);
    expect(isEditable({})).toBe(false); // editable is opt-in
  });
});
