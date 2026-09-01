import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const productionUrl = process.env.PRODUCTION_URL;
if (!productionUrl) {
  console.error('PRODUCTION_URL is required');
  process.exit(2);
}

const outDir = path.resolve('qa-artifacts');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

const report = {
  url: productionUrl,
  generatedAt: new Date().toISOString(),
  viewports: [],
  reducedMotion: null,
  summary: { blockers: 0, majors: 0, warnings: 0, pass: false },
};

const browser = await chromium.launch({ headless: true });

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const type = request.resourceType();
    if (['document', 'script', 'stylesheet', 'font'].includes(type)) {
      failedRequests.push({
        url: request.url(),
        type,
        error: request.failure()?.errorText ?? 'unknown',
      });
    }
  });

  let response = null;
  let navigationError = null;
  try {
    response = await page.goto(productionUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
  } catch (error) {
    navigationError = error.message;
  }

  const metrics = navigationError
    ? null
    : await page.evaluate(() => {
        const images = [...document.images];
        const brokenImages = images
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.currentSrc || img.src || img.alt || 'unknown');
        const resources = performance.getEntriesByType('resource');
        const totalTransferBytes = resources.reduce(
          (sum, item) => sum + (item.transferSize || 0),
          0,
        );
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          title: document.title,
          bodyTextLength: document.body?.innerText?.trim().length ?? 0,
          horizontalOverflowPx: Math.max(
            0,
            document.documentElement.scrollWidth - window.innerWidth,
          ),
          brokenImages,
          imageCount: images.length,
          resourceCount: resources.length,
          totalTransferBytes,
          domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
          loadEventMs: nav?.loadEventEnd ?? null,
        };
      });

  let accessibility = { severe: [], totalViolations: 0 };
  if (!navigationError) {
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const severe = axe.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
        })),
      }));

    accessibility = {
      severe,
      totalViolations: axe.violations.length,
    };
  }

  if (!navigationError) {
    await page.screenshot({
      path: path.join(outDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }

  let interactionCheck = { attempted: false, success: null, error: null };
  if (!navigationError && viewport.name === 'mobile') {
    const firstButton = page.locator('button:visible').first();
    if ((await firstButton.count()) > 0) {
      interactionCheck.attempted = true;
      try {
        await firstButton.click({ timeout: 5_000 });
        await page.waitForTimeout(500);
        interactionCheck.success = true;
        await page.screenshot({
          path: path.join(outDir, 'mobile-after-entry.png'),
          fullPage: true,
        });
      } catch (error) {
        interactionCheck.success = false;
        interactionCheck.error = error.message;
      }
    }
  }

  const status = response?.status() ?? null;
  const totalTransferMb = metrics
    ? Number((metrics.totalTransferBytes / 1024 / 1024).toFixed(2))
    : null;

  const blockers = [];
  const majors = [];
  const warnings = [];

  if (navigationError) blockers.push(`Navigation failed: ${navigationError}`);
  if (status !== null && (status < 200 || status >= 400)) {
    blockers.push(`HTTP status ${status}`);
  }
  if (pageErrors.length) blockers.push(`${pageErrors.length} uncaught page error(s)`);
  if (consoleErrors.length) majors.push(`${consoleErrors.length} console error(s)`);
  if (failedRequests.length) majors.push(`${failedRequests.length} failed core request(s)`);
  if (metrics?.brokenImages.length) {
    majors.push(`${metrics.brokenImages.length} broken image(s)`);
  }
  if ((metrics?.horizontalOverflowPx ?? 0) > 2) {
    majors.push(`Horizontal overflow ${metrics.horizontalOverflowPx}px`);
  }
  if (accessibility.severe.length) {
    const nodeCount = accessibility.severe.reduce(
      (sum, violation) => sum + violation.nodes.length,
      0,
    );
    majors.push(
      `${accessibility.severe.length} serious/critical accessibility violation type(s), ${nodeCount} node(s)`,
    );
  }
  if (interactionCheck.attempted && interactionCheck.success === false) {
    majors.push('Primary visible button interaction failed');
  }
  if ((metrics?.bodyTextLength ?? 0) < 10 && !navigationError) {
    majors.push('Page appears visually/content empty');
  }
  if (totalTransferMb !== null && totalTransferMb > 15) {
    majors.push(`Transferred ${totalTransferMb} MB (>15 MB budget)`);
  } else if (totalTransferMb !== null && totalTransferMb > 8) {
    warnings.push(`Transferred ${totalTransferMb} MB (>8 MB warning budget)`);
  }
  if ((metrics?.loadEventMs ?? 0) > 8_000) {
    warnings.push(`Load event ${Math.round(metrics.loadEventMs)}ms (>8000ms warning)`);
  }

  report.summary.blockers += blockers.length;
  report.summary.majors += majors.length;
  report.summary.warnings += warnings.length;

  report.viewports.push({
    ...viewport,
    status,
    navigationError,
    metrics: metrics ? { ...metrics, totalTransferMb } : null,
    consoleErrors,
    pageErrors,
    failedRequests,
    accessibility,
    interactionCheck,
    blockers,
    majors,
    warnings,
  });

  await context.close();
}

const reducedContext = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  reducedMotion: 'reduce',
});
const reducedPage = await reducedContext.newPage();
const reducedErrors = [];
reducedPage.on('pageerror', (error) => reducedErrors.push(error.message));
let reducedStatus = null;
let reducedVisible = false;
try {
  const response = await reducedPage.goto(productionUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  reducedStatus = response?.status() ?? null;
  await reducedPage.waitForTimeout(700);
  reducedVisible = await reducedPage.evaluate(() =>
    Boolean(document.body && document.body.innerText.trim().length > 0),
  );
  await reducedPage.screenshot({
    path: path.join(outDir, 'reduced-motion.png'),
    fullPage: true,
  });
} catch (error) {
  reducedErrors.push(error.message);
}

report.reducedMotion = {
  status: reducedStatus,
  visible: reducedVisible,
  errors: reducedErrors,
};
if (
  !reducedVisible ||
  reducedErrors.length ||
  (reducedStatus !== null && reducedStatus >= 400)
) {
  report.summary.majors += 1;
}

await reducedContext.close();
await browser.close();

report.summary.pass =
  report.summary.blockers === 0 && report.summary.majors === 0;

fs.writeFileSync(
  path.join(outDir, 'qa-report.json'),
  JSON.stringify(report, null, 2),
);

const markdown = [
  '# Production QA Summary',
  '',
  `- URL: ${productionUrl}`,
  `- Result: ${report.summary.pass ? 'PASS' : 'FAIL'}`,
  `- Blockers: ${report.summary.blockers}`,
  `- Majors: ${report.summary.majors}`,
  `- Warnings: ${report.summary.warnings}`,
  '',
  ...report.viewports.flatMap((item) => {
    const a11y = item.accessibility.severe.flatMap((violation) =>
      violation.nodes.map(
        (node) =>
          `${violation.id}: ${Array.isArray(node.target) ? node.target.join(' ') : node.target}`,
      ),
    );
    return [
      `## ${item.name} ${item.width}×${item.height}`,
      `- HTTP: ${item.status ?? 'n/a'}`,
      `- Overflow: ${item.metrics?.horizontalOverflowPx ?? 'n/a'}px`,
      `- Transfer: ${item.metrics?.totalTransferMb ?? 'n/a'} MB`,
      `- Blockers: ${item.blockers.length ? item.blockers.join('; ') : '0'}`,
      `- Majors: ${item.majors.length ? item.majors.join('; ') : '0'}`,
      `- Warnings: ${item.warnings.length ? item.warnings.join('; ') : '0'}`,
      `- A11y nodes: ${a11y.length ? a11y.join(' | ') : '0'}`,
      '',
    ];
  }),
];

fs.writeFileSync(path.join(outDir, 'qa-summary.md'), markdown.join('\n'));
console.log(JSON.stringify(report.summary));
process.exit(report.summary.pass ? 0 : 1);
