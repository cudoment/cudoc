/**
 * Draws the showcase's two pictures as PNG, the one raster format every
 * output carries: the cover behind the volume's title page and a diagram in
 * the getting-started guide. Run from examples/export after `npm ci`; it uses
 * the headless browser cudoc-export installs for PDF output.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const here = path.dirname(fileURLToPath(import.meta.url))

const cover = `
<div style="width:1240px;height:1754px;background:#123c5e;position:relative;overflow:hidden;font-family:system-ui,sans-serif">
  <div style="position:absolute;left:-180px;top:-220px;width:760px;height:760px;border-radius:50%;background:#164a70"></div>
  <div style="position:absolute;right:-260px;bottom:-320px;width:900px;height:900px;border-radius:50%;background:#0f2a44"></div>
  <div style="position:absolute;left:120px;top:1180px;display:flex;gap:28px">
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<div style="width:86px;height:${120 + ((i * 53) % 190)}px;align-self:flex-end;background:${["#6fa8c9", "#8dbbd6", "#4f86a8"][i % 3]};border-radius:8px 8px 0 0"></div>`).join("")}
  </div>
  <div style="position:absolute;left:120px;top:300px;color:#e8f1f8;font-size:44px;letter-spacing:0.28em;text-transform:uppercase">Northlight</div>
  <div style="position:absolute;left:120px;top:1580px;color:#b8cddc;font-size:30px">Weather API · Reference handbook</div>
</div>`

const diagram = `
<div style="width:1200px;height:420px;background:#ffffff;font-family:system-ui,sans-serif;position:relative">
  ${[
    ["Your service", 60, "#e8f1f8", "#0f2a44"],
    ["Northlight edge", 460, "#dcefe6", "#0f4a34"],
    ["Forecast store", 860, "#fbe9d8", "#7a3410"],
  ]
    .map(
      ([label, x, bg, fg]) =>
        `<div style="position:absolute;left:${x}px;top:130px;width:280px;height:160px;border-radius:18px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:600">${label}</div>`,
    )
    .join("")}
  ${[340, 740]
    .map(
      (x) =>
        `<div style="position:absolute;left:${x}px;top:200px;width:120px;height:20px;background:#0f2a44;clip-path:polygon(0 35%,70% 35%,70% 0,100% 50%,70% 100%,70% 65%,0 65%)"></div>`,
    )
    .join("")}
  <div style="position:absolute;left:60px;top:330px;color:#5b6b7a;font-size:26px">GET /v1/weather/current?station=…  →  cached at the edge for 60 seconds  →  read from the store on a miss</div>
</div>`

const browser = await chromium.launch({ channel: "chromium-headless-shell" })
try {
  for (const [name, html, width, height] of [
    ["cover.png", cover, 1240, 1754],
    ["request-flow.png", diagram, 1200, 420],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><body style="margin:0">${html}</body>`,
    )
    await page.screenshot({
      path: path.join(here, name),
      type: "png",
      clip: { x: 0, y: 0, width, height },
    })
    await page.close()
    console.log(`${name}: ${fs.statSync(path.join(here, name)).size} bytes`)
  }
} finally {
  await browser.close()
}
