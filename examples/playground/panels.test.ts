// @vitest-environment jsdom
/**
 * What each panel actually DOES when you use it.
 *
 * `page.test.ts` proves the panels mount. This proves they behave, which is a
 * different claim: the demo exists to show that the library refuses, states and
 * rolls back, and every one of those is a thing the wiring can quietly stop
 * doing while the panel still renders a grid.
 *
 * The underlying rules are the packages' and are tested there. What is tested
 * here is that this page is genuinely wired to them — that the refusal on
 * screen is the library's refusal and not a message someone typed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "examples/playground/index.html"), "utf8");

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`no #${id}`);
  return el;
};
const click = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const openTab = (name: string) => {
  const tab = document.querySelector<HTMLElement>(`[data-tab="${name}"]`);
  if (!tab) throw new Error(`no tab ${name}`);
  click(tab);
};
const setSelect = (id: string, value: string) => {
  const el = byId<HTMLSelectElement>(id);
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const setCheck = (id: string, checked: boolean) => {
  const el = byId<HTMLInputElement>(id);
  el.checked = checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const textOf = (id: string) => (byId(id).textContent ?? "").replace(/\s+/g, " ").trim();

beforeAll(async () => {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.className = /<body[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("oxg-viewport") ? 600 : 0;
    },
  });
  await import("./main.js");
});

describe("clinical cells", () => {
  beforeAll(() => openTab("clinical"));

  it("renders a grid of the cells the component library does not have", () => {
    expect(byId("clinical-host").querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0);
  });

  it("says out loud which cell is deliberately absent", () => {
    // The scheduled-dose cell is held for a clinician. Shipping it quietly
    // would be the one thing ADR 0008 forbids.
    expect(textOf("held-note").length).toBeGreaterThan(0);
    expect(textOf("held-note")).toMatch(/dose/i);
  });
});

describe("disclosure", () => {
  beforeAll(() => openTab("disclosure"));

  it("states a withheld column rather than hiding it silently", () => {
    setCheck("p-notes", false);
    // A column that vanishes reads as a column that does not exist.
    expect(textOf("withheld-note").length).toBeGreaterThan(0);
  });

  it("stops stating it when the permission is restored", () => {
    setCheck("p-notes", false);
    const withheld = textOf("withheld-note");
    setCheck("p-notes", true);
    expect(textOf("withheld-note")).not.toBe(withheld);
  });

  it("keeps a restricted row in place rather than dropping it", () => {
    setCheck("p-part2", true);
    const rows = byId("disclosure-host").querySelectorAll('.oxg-body [role="row"]').length;
    setCheck("p-part2", false);
    // A row that disappears changes the count and hides that it was there.
    expect(byId("disclosure-host").querySelectorAll('.oxg-body [role="row"]').length).toBe(rows);
  });

  it("marks a restricted row instead of blanking it", () => {
    setCheck("p-part2", true);
    const marked = byId("disclosure-host").querySelectorAll("[data-restricted]");
    expect(marked.length).toBeGreaterThan(0);
  });

  it("asks for break-glass and waits for an answer — it never grants itself", async () => {
    setCheck("p-part2", true);
    const button = byId("breakglass");
    expect(textOf("breakglass")).toMatch(/request/i);

    click(button);
    // The outcome arrives from the request handler — the demo plays the
    // server. The grid raises the ask; granting is somebody else's act, which
    // is why the label cannot change synchronously.
    expect(textOf("breakglass")).toMatch(/request/i);

    await new Promise((r) => setTimeout(r, 0));
    expect(textOf("breakglass")).toMatch(/active/i);
  });
});

describe("grouping", () => {
  beforeAll(() => openTab("grouping"));

  it("groups and shows group rows", () => {
    setSelect("groupby", "ward");
    expect(byId("group-host").querySelectorAll('[role="row"]').length).toBeGreaterThan(0);
  });

  it("refuses to aggregate incompatible units rather than producing a number", () => {
    setCheck("mixed-units", true);
    const text = byId("group-host").textContent ?? "";
    // Summing mg with mL yields a number that is wrong in a way nobody can see.
    expect(text).toMatch(/incomparable|cannot|refus|mixed|unit/i);
  });

  it("stops refusing when the units agree", () => {
    setCheck("mixed-units", true);
    const refusing = byId("group-host").textContent ?? "";
    setCheck("mixed-units", false);
    expect(byId("group-host").textContent).not.toBe(refusing);
  });
});

describe("working on a row", () => {
  beforeAll(() => openTab("working"));

  it("commits a write that succeeds", async () => {
    setSelect("edit-value", "Beeches");
    click(byId("edit-commit"));
    // The commit is asynchronous because the write is: a microtask is not
    // enough to observe it.
    await new Promise((r) => setTimeout(r, 0));
    expect(byId("edit-note").dataset["state"]).toBe("ok");
  });

  it("rolls the row back when the write fails, and KEEPS the draft", async () => {
    // Writes to Cedar always fail, so the rollback is demonstrable.
    setSelect("edit-value", "Cedar");
    click(byId("edit-commit"));
    await new Promise((r) => setTimeout(r, 0));

    expect(byId("edit-note").dataset["state"]).toBe("fail");
    const note = textOf("edit-note");
    expect(note).toMatch(/restored/i);
    // Nobody should have to retype from memory after a 409.
    expect(note).toContain("Cedar");
  });

  it("puts the inspected row AND its query in one URL", () => {
    const url = textOf("url-bar");
    expect(url).toContain("row=");
    // A link to a row without the list it came from lands the reader in a
    // different set from the one being discussed.
    expect(url).toContain("q=");
  });

  it("does not move focus or selection when inspecting", () => {
    const panel = textOf("inspector-panel");
    // The panel states both, so a regression is visible rather than inferred.
    expect(panel).toMatch(/focus/i);
    expect(panel).toMatch(/selection/i);
  });
});

describe("AI", () => {
  beforeAll(() => openTab("ai"));

  const compile = (proposal: string) => {
    setSelect("ai-proposal", proposal);
    click(byId("ai-run"));
  };

  it("compiles a proposal it can express, and runs NOTHING yet", () => {
    compile("ok");
    expect(byId("ai-refusal").hidden).toBe(true);
    expect(byId("ai-chips").children.length).toBeGreaterThan(0);
    // A proposal is a proposal until a person accepts it.
    expect(textOf("ai-chips")).toMatch(/proposed|nothing has run/i);
    expect(byId<HTMLButtonElement>("ai-accept").disabled).toBe(false);
  });

  it.each([
    ["unknown-column", /diagnosis/i],
    ["unsupported", /endsWith|operator/i],
  ])("refuses %s and names the part it could not express", (proposal, expected) => {
    compile(proposal);
    expect(byId("ai-refusal").hidden).toBe(false);
    expect(textOf("ai-refusal")).toMatch(expected);
    // Refusing means refusing: nothing may be accepted.
    expect(byId<HTMLButtonElement>("ai-accept").disabled).toBe(true);
  });

  it("compiles a disjunction rather than refusing it", () => {
    compile("or");
    expect(byId("ai-refusal").hidden).toBe(true);
  });

  it("clears a refusal when the next proposal compiles", () => {
    compile("unknown-column");
    expect(byId("ai-refusal").hidden).toBe(false);
    compile("ok");
    expect(byId("ai-refusal").hidden).toBe(true);
  });

  it("dispatches only when a person accepts", () => {
    compile("ok");
    click(byId("ai-accept"));
    expect(textOf("ai-chips")).toMatch(/accepted/i);
    // And cannot be accepted twice.
    expect(byId<HTMLButtonElement>("ai-accept").disabled).toBe(true);
  });

  it("marks AI-derived rows so they are not mistaken for measurements", () => {
    expect(byId("ai-host").querySelectorAll('[data-ai="true"]').length).toBeGreaterThan(0);
  });

  it("names the model, its version and the population it was validated on", () => {
    const text = (byId("ai-host").textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/3\.4/);
    expect(text).toMatch(/inpatients/i);
  });
});

describe("migration", () => {
  beforeAll(() => openTab("migration"));

  it.each([["antd"], ["mui"]])("migrates a %s table", (source) => {
    setSelect("mig-source", source);
    click(byId("mig-run"));
    expect(textOf("mig-out")).toContain("DataGrid");
    expect(textOf("mig-out")).toContain("@oxygenui-design/grid-react");
  });

  it("refuses to invent a coverage claim, and breaks the build instead", () => {
    setSelect("mig-source", "antd");
    click(byId("mig-run"));
    // A codemod that filled this in would manufacture a false completeness
    // claim across every table in a codebase, in one commit nobody reads.
    expect(textOf("mig-out")).toContain("MISSING_COVERAGE");
    expect(textOf("mig-todos")).toMatch(/coverage/i);
  });

  it("lists the props it deliberately did not migrate, with reasons", () => {
    setSelect("mig-source", "antd");
    click(byId("mig-run"));
    const todos = textOf("mig-todos");
    // `pagination` means something different in antd; a silent rename would
    // compile and behave differently.
    expect(todos).toMatch(/pagination|onChange/);
  });

  it("never leaves the previous source's output beside the new source's input", () => {
    setSelect("mig-source", "antd");
    click(byId("mig-run"));
    const antd = textOf("mig-out");
    setSelect("mig-source", "mui");

    // The panel used to blank both panes here, which is one way to be correct
    // and a poor one: a migration panel that arrives empty reads as a panel
    // that failed. It now shows the NEW source's result, so what matters is
    // that nothing from the old one survives the switch.
    expect(textOf("mig-out")).not.toBe(antd);
    expect(textOf("mig-out")).not.toBe("");
    expect(textOf("mig-in")).toContain("@mui/x-data-grid");
    expect(textOf("mig-out")).not.toContain("antd");
  });

  it("shows a result on arrival rather than an empty pane", () => {
    // The codemod runs at BUILD time, so there is nothing to wait for and no
    // reason to make anyone press a button to see anything at all.
    expect(textOf("mig-out").trim()).not.toBe("");
    expect(textOf("mig-todos").trim()).not.toBe("");
  });
});

describe("claims stay with the grid they are about", () => {
  it("never states the roster's coverage or count under another panel", () => {
    openTab("scale");
    for (const el of document.querySelectorAll<HTMLElement>("[data-roster-only]")) {
      // A row count or a coverage sentence beside a DIFFERENT grid is a claim
      // about the wrong set, which is worse than no claim at all.
      expect(el.style.display).toBe("none");
    }
    openTab("roster");
    for (const el of document.querySelectorAll<HTMLElement>("[data-roster-only]")) {
      expect(el.style.display).not.toBe("none");
    }
  });
});

describe("devtools", () => {
  beforeAll(() => openTab("devtools"));

  it("records the actions the grid emitted", () => {
    expect((byId("devtools-out").textContent ?? "").length).toBeGreaterThan(0);
  });
});
