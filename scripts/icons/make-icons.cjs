/**
 * Renders the app icons (public/icons/*.png) from an SVG with Playwright's Chromium.
 * Run: node scripts/icons/make-icons.cjs   (only needed when the icon design changes)
 */
const { chromium } = require('playwright');
const path = require('node:path');

const BLUE = '#1e5bb8';
const FONT = "Inter, 'DejaVu Sans', Arial, sans-serif";

/** `maskable`: full-bleed background with the letter inside the central safe zone (Android crops to a circle or squircle). */
function svg(size, { maskable = false } = {}) {
  const rx = maskable ? 0 : Math.round(size * 0.22);
  const fontSize = Math.round(size * (maskable ? 0.46 : 0.62));
  const baseline = Math.round(size * (maskable ? 0.665 : 0.725));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${rx}" fill="${BLUE}"/>
    <text x="${size / 2}" y="${baseline}" font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="#ffffff" text-anchor="middle">R</text>
  </svg>`;
}

const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon.size, icon)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(__dirname, '..', '..', 'public', 'icons', icon.file);
    await page.locator('svg').screenshot({ path: out, omitBackground: true });
    console.log('wrote', path.relative(process.cwd(), out));
  }
  await browser.close();
})();
