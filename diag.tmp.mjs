import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
const t0 = Date.now();
const ms = () => String(Date.now() - t0).padStart(6);

page.on("request", (r) => console.log(ms(), "→ REQ ", r.resourceType().padEnd(10), r.url().slice(0, 70)));
page.on("response", (r) => console.log(ms(), "← RES ", String(r.status()).padEnd(10), r.url().slice(0, 70)));
page.on("requestfailed", (r) => console.log(ms(), "✗ FAIL", (r.failure()?.errorText ?? "").padEnd(10), r.url().slice(0, 70)));
page.on("pageerror", (e) => console.log(ms(), "! PAGEERROR", e.message.split("\n")[0]));
page.on("console", (m) => console.log(ms(), "  console." + m.type(), m.text().slice(0, 90)));

try {
  await page.goto("http://127.0.0.1:5173/index.html", { waitUntil: "commit", timeout: 15000 });
  console.log(ms(), "== committed ==");
} catch (e) { console.log(ms(), "goto threw:", e.message.split("\n")[0]); }

// Poll the document independently of any lifecycle event.
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  try {
    const s = await page.evaluate(() => ({
      rs: document.readyState,
      rows: document.querySelectorAll('.oxg-body [role="row"]').length,
      grid: !!document.querySelector('[role="grid"]'),
    }));
    console.log(ms(), `poll ${i}: readyState=${s.rs} grid=${s.grid} rows=${s.rows}`);
    if (s.rows > 0) break;
  } catch (e) { console.log(ms(), `poll ${i}: evaluate blocked —`, e.message.split("\n")[0]); }
}
await browser.close();
