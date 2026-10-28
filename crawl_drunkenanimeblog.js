import './src/polyfill.js';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import { 
  initStorage, 
  isUrlScraped, 
  saveMarkdownFile, 
  insertScrape 
} from './src/storage.js';
import { scrapePage } from './src/scraper.js';
import { globalFetcherPool } from './src/fetchers/index.js';

const SITEMAP_URLS = [
  'https://drunkenanimeblog.com/sitemap-1.xml',
  'https://drunkenanimeblog.com/sitemap-2.xml',
  'https://drunkenanimeblog.com/sitemap-3.xml'
];

const OUTPUT_DIR = './output';
const CATEGORY = 'drunkenanimeblog.com';
const CONCURRENCY = 3;
const DELAY_MS = 600;
const STATUS_FILE = './data/crawl_status.json';

async function fetchAllSitemapUrls() {
  console.log(chalk.cyan('🗺️ Fetching sitemaps from drunkenanimeblog.com...'));
  const urls = [];
  const seen = new Set();

  for (const sitemapUrl of SITEMAP_URLS) {
    try {
      console.log(chalk.gray(`Fetching ${sitemapUrl}...`));
      const response = await axios.get(sitemapUrl, { timeout: 15000 });
      const matches = response.data.match(/<loc>(.*?)<\/loc>/g) || [];
      for (const m of matches) {
        const u = m.replace(/<\/?loc>/g, '').trim();
        if (u && !seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    } catch (err) {
      console.error(chalk.red(`Failed to fetch sitemap ${sitemapUrl}: ${err.message}`));
    }
  }

  return urls;
}

async function writeStatus(statusData) {
  try {
    await fs.writeFile(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf-8');
  } catch {}
}

async function run() {
  await initStorage(undefined, OUTPUT_DIR);

  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('🕷️ Drunken Anime Blog - Comprehensive Archive Scraper'));
  console.log(chalk.bold.cyan('======================================================\n'));

  // 1. Fetch all URLs from sitemaps
  const allUrls = await fetchAllSitemapUrls();
  console.log(chalk.green(`✓ Total discovered URLs in sitemaps: ${allUrls.length}`));

  // 2. Write all URLs to urls.txt for reference
  await fs.writeFile('./urls.txt', allUrls.join('\n'), 'utf-8');
  console.log(chalk.green(`✓ Updated urls.txt with all ${allUrls.length} site URLs.`));

  // 3. Filter pending URLs (skip already scraped)
  const pendingUrls = [];
  let skippedCount = 0;

  for (const url of allUrls) {
    if (isUrlScraped(url)) {
      skippedCount++;
    } else {
      pendingUrls.push(url);
    }
  }

  console.log(chalk.yellow(`⏩ Already scraped in SQLite: ${skippedCount}`));
  console.log(chalk.bold.cyan(`🎯 Remaining URLs to scrape: ${pendingUrls.length}\n`));

  if (pendingUrls.length === 0) {
    console.log(chalk.bold.green('All URLs are already scraped! Nothing to do.'));
    return;
  }

  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let currentIndex = 0;
  const queue = [...pendingUrls];

  const statusData = {
    totalUrls: allUrls.length,
    alreadyScraped: skippedCount,
    remainingToScrape: pendingUrls.length,
    succeeded: 0,
    failed: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  await writeStatus(statusData);

  const worker = async (workerId) => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;

      currentIndex++;
      const currentPos = currentIndex;
      const progressPct = ((currentPos / pendingUrls.length) * 100).toFixed(1);

      console.log(chalk.gray(`[W${workerId}] [${currentPos}/${pendingUrls.length} - ${progressPct}%] Fetching: ${url}`));

      let success = false;
      let errorMsg = null;
      let title = '';

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await scrapePage(url, {
            fetcher: 'auto',
            timeout: 15000,
            images: true
          });

          title = result.metadata.title || 'Untitled';
          const filename = await saveMarkdownFile(result.markdown, result.metadata, {
            output: OUTPUT_DIR,
            category: CATEGORY
          });

          insertScrape({
            url,
            title: result.metadata.title,
            description: result.metadata.description,
            filename,
            word_count: result.metadata.word_count || 0,
            scraped_at: new Date().toISOString(),
            selector: 'auto',
            status: 'success',
            category: CATEGORY
          });

          success = true;
          succeeded++;
          console.log(chalk.green(`  ✓ [W${workerId}] Saved: "${title.slice(0, 45)}" -> ${filename}`));
          break;
        } catch (err) {
          errorMsg = err.message;
          if (attempt === 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (!success) {
        failed++;
        console.error(chalk.red(`  ✗ [W${workerId}] Failed: ${url} (${errorMsg})`));
        try {
          insertScrape({
            url,
            scraped_at: new Date().toISOString(),
            status: 'failed',
            error: errorMsg,
            selector: 'auto',
            category: CATEGORY
          });
        } catch {}
      }

      // Update status every 5 scrapes or on completion
      if (currentPos % 5 === 0 || queue.length === 0) {
        statusData.succeeded = succeeded;
        statusData.failed = failed;
        statusData.processed = currentPos;
        statusData.lastUpdated = new Date().toISOString();
        statusData.lastScraped = { url, title };
        await writeStatus(statusData);
      }

      if (DELAY_MS > 0 && queue.length > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  statusData.status = 'completed';
  statusData.completedAt = new Date().toISOString();
  statusData.durationSeconds = durationSec;
  await writeStatus(statusData);

  console.log(chalk.bold.green('\n======================================================'));
  console.log(chalk.bold.green('🎉 Crawl Finished!'));
  console.log(chalk.bold.green(`   Total Discovered:  ${allUrls.length}`));
  console.log(chalk.green(`   Already Scraped:   ${skippedCount}`));
  console.log(chalk.green(`   New Succeeded:     ${succeeded}`));
  console.log(chalk.red(`   Failed:            ${failed}`));
  console.log(chalk.cyan(`   Duration:          ${durationSec}s`));
  console.log(chalk.bold.green('======================================================\n'));

  await globalFetcherPool.close();
}

run().catch(async (err) => {
  console.error(chalk.red('Fatal crawler error:', err));
  await globalFetcherPool.close();
  process.exit(1);
});
