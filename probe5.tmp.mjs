import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const events = [];
page.on("pageerror", (e) => events.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") events.push("console: " + m.text()); });
page.on("requestfailed", (r) => events.push(`requestfailed ${r.url().slice(0, 60)} — ${r.failure()?.errorText}`));

// Cut every off-host request: if the page then works, the hang is external.
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("http://127.0.0.1:5173")) return route.continue();
  events.push("blocked " + url.slice(0, 55));
  return route.abort();
});

await page.goto("http://127.0.0.1:5173/index.html", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.oxg-body [role="row"]')];
  const grid = document.querySelector('.oxg-root > [role="grid"]');
  return {
    readyState: document.readyState,
    grid: !!grid,
    rows: rows.length,
    firstName: document.querySelector(".pname")?.textContent ?? null,
    chips: document.querySelectorAll(".a-tag").length,
    coverage: (document.getElementById("coverage")?.textContent ?? "").slice(0, 60),
    gridBg: grid ? getComputedStyle(grid).backgroundColor : null,
  };
});
console.log(JSON.stringify(state, null, 1));
console.log("events:", events.slice(0, 8));
await browser.close();
