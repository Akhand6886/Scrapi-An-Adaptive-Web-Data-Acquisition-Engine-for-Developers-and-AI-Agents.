import { CrawlEngine } from './engine.js';
import { discoverCategories } from '../scraper.js';
import { TopicMatcher } from './topic_matcher.js';
import { globalFetcherPool } from '../fetchers/index.js';

/**
 * TopicCrawler coordinates exhaustive, production-grade topic scraping
 * from earliest available historical content to the current date.
 */
export class TopicCrawler {
  /**
   * @param {object} [options]
   * @param {boolean} [options.exhaustive=true] Scrape all historical archives to completion
   * @param {number} [options.maxPages=Infinity] Maximum pages to scrape
   * @param {number} [options.depth=Infinity] Maximum link traversal depth
   * @param {number} [options.concurrency=2] Worker concurrency (bounded 1-16)
   * @param {number} [options.delay=1000] Politeness delay in milliseconds
   * @param {boolean} [options.sitemap=true] Enable XML sitemap discovery
   * @param {boolean} [options.probeCandidates=true] Actively probe conventional URL candidates
   * @param {string} [options.output='./output'] Markdown output directory
   * @param {string} [options.fetcher='auto'] Fetcher tier ('auto'|'static'|'dynamic'|'stealth')
   * @param {AbortSignal} [options.signal] Standard abort signal for external cancellation
   */
  constructor(options = {}) {
    const rawConcurrency = options.concurrency !== undefined ? parseInt(options.concurrency, 10) : 2;
    const concurrency = Math.min(Math.max(1, isNaN(rawConcurrency) ? 2 : rawConcurrency), 16);

    const rawDelay = options.delay !== undefined ? parseInt(options.delay, 10) : 1000;
    const delay = Math.max(0, isNaN(rawDelay) ? 1000 : rawDelay);

    let maxPages = Infinity;
    if (options.maxPages !== undefined && options.maxPages !== Infinity && options.maxPages !== 'Infinity') {
      const parsed = parseInt(options.maxPages, 10);
      maxPages = isNaN(parsed) ? Infinity : Math.max(1, parsed);
    }

    let depth = Infinity;
    if (options.depth !== undefined && options.depth !== Infinity && options.depth !== 'Infinity') {
      const parsed = parseInt(options.depth, 10);
      depth = isNaN(parsed) ? Infinity : Math.max(0, parsed);
    }

    this.options = {
      exhaustive: options.exhaustive !== false,
      maxPages,
      depth,
      concurrency,
      delay,
      sitemap: options.sitemap !== false,
      probeCandidates: options.probeCandidates !== false,
      output: options.output || './output',
      fetcher: options.fetcher || 'auto',
      retries: options.retries !== undefined ? parseInt(options.retries, 10) : 2,
      timeout: options.timeout ? parseInt(options.timeout, 10) : 15000,
      ...options
    };

    this.fetcherPool = options.fetcherPool || globalFetcherPool;
    this.engine = null;
    this.aborted = false;

    // Attach external AbortSignal if supplied
    if (this.options.signal) {
      if (this.options.signal.aborted) {
        this.abort();
      } else {
        this.options.signal.addEventListener('abort', () => this.abort(), { once: true });
      }
    }
  }

  /**
   * Normalizes and validates target website URL.
   * Prepends https:// if missing, strips hash fragments, and validates format.
   * @param {string} rawUrl 
   * @returns {string}
   */
  static normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new TypeError(`Invalid URL: Expected a non-empty string, got ${typeof rawUrl}`);
    }
    let trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error('Invalid URL: Empty string provided.');
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    try {
      const parsed = new URL(trimmed);
      parsed.hash = '';
      return parsed.href;
    } catch (err) {
      throw new Error(`Invalid target website URL "${rawUrl}": ${err.message}`);
    }
  }

  /**
   * Signals the crawl engine to stop processing immediately.
   */
  abort() {
    this.aborted = true;
    if (this.engine) {
      this.engine.aborted = true;
      if (this.engine.options) {
        this.engine.options.aborted = true;
      }
    }
  }

  /**
   * Probes a candidate URL using the static fetcher with a short timeout.
   * @param {string} candidateUrl 
   * @param {number} [timeout=3500] 
   * @returns {Promise<boolean>}
   */
  async probeCandidate(candidateUrl, timeout = 3500) {
    try {
      const res = await this.fetcherPool.staticFetcher.fetch(candidateUrl, {
        timeout,
        noCache: true,
        maxRetries: 0
      });
      return !!(res && res.status >= 200 && res.status < 400 && res.rawHtml && res.rawHtml.length > 80);
    } catch (err) {
      return false;
    }
  }

  /**
   * Probes an array of conventional candidate URLs, returning the first working candidate.
   * @param {string[]} candidates 
   * @returns {Promise<string|null>}
   */
  async probeCandidateUrls(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    for (const candidate of candidates) {
      if (this.aborted) return null;
      const isWorking = await this.probeCandidate(candidate);
      if (isWorking) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Resolves the primary category/topic entrypoint with comprehensive strategy tracking.
   * @param {string} websiteUrl 
   * @param {string} topicName 
   * @returns {Promise<{ entrypoint: string, strategy: string, verified: boolean }>}
   */
  async resolveTopicEntrypointDetails(websiteUrl, topicName) {
    const normalizedUrl = TopicCrawler.normalizeUrl(websiteUrl);
    if (!topicName || typeof topicName !== 'string' || !topicName.trim()) {
      return { entrypoint: normalizedUrl, strategy: 'DIRECT_SEED_NO_TOPIC', verified: true };
    }

    const profile = TopicMatcher.createProfile(topicName);

    // Strategy 1: If websiteUrl already points directly to the topic page, use it directly
    if (TopicMatcher.isTopicMatch(normalizedUrl, profile)) {
      return { entrypoint: normalizedUrl, strategy: 'DIRECT_URL_MATCH', verified: true };
    }

    // Strategy 2: Discover and match navigation menu categories
    try {
      const categories = await discoverCategories(normalizedUrl);
      if (Array.isArray(categories) && categories.length > 0) {
        // Direct match on category name or slug
        for (const cat of categories) {
          const catName = (cat.name || '').toLowerCase().trim();
          if (catName === profile.raw.toLowerCase() || catName === profile.slug) {
            const absoluteUrl = new URL(cat.url, normalizedUrl).href;
            return { entrypoint: absoluteUrl, strategy: 'NAV_CATEGORY_EXACT_MATCH', verified: true };
          }
        }

        // Token match on category url or name
        for (const cat of categories) {
          const catName = (cat.name || '').toLowerCase().trim();
          const absoluteUrl = new URL(cat.url, normalizedUrl).href;
          if (TopicMatcher.isTopicMatch(absoluteUrl, profile) || profile.tokens.some(t => catName.includes(t))) {
            return { entrypoint: absoluteUrl, strategy: 'NAV_CATEGORY_TOKEN_MATCH', verified: true };
          }
        }
      }
    } catch (err) {
      // Category discovery error is non-fatal; continue to probing candidates
    }

    // Strategy 3: Generate and actively probe conventional URL patterns
    const origin = new URL(normalizedUrl).origin;
    const candidates = [
      `${origin}/${profile.slug}/`,
      `${origin}/category/${profile.slug}/`,
      `${origin}/topics/${profile.slug}/`,
      `${origin}/section/${profile.slug}/`,
      `${origin}/tag/${profile.slug}/`,
      `${origin}/tags/${profile.slug}/`,
      `${origin}/archives/${profile.slug}/`
    ];

    if (this.options.probeCandidates) {
      const verifiedCandidate = await this.probeCandidateUrls(candidates);
      if (verifiedCandidate) {
        return { entrypoint: verifiedCandidate, strategy: 'PROBED_CONVENTIONAL_CANDIDATE', verified: true };
      }
    } else {
      return { entrypoint: candidates[0], strategy: 'SPECULATIVE_CANDIDATE', verified: false };
    }

    // Strategy 4: Fallback to the seed homepage directly (with fallbackSeedUrl)
    return { entrypoint: normalizedUrl, strategy: 'SEED_HOMEPAGE_FALLBACK', verified: true };
  }

  /**
   * Resolves the primary category/topic entrypoint URL on the target website.
   * Returns a clean URL string for seamless backward compatibility.
   * @param {string} websiteUrl 
   * @param {string} topicName 
   * @returns {Promise<string>}
   */
  async resolveTopicEntrypoint(websiteUrl, topicName) {
    const details = await this.resolveTopicEntrypointDetails(websiteUrl, topicName);
    return details.entrypoint;
  }

  /**
   * Runs the exhaustive topic crawl with full lifecycle tracking and velocity telemetry.
   * @param {string} websiteUrl 
   * @param {string} topicName 
   * @param {function} [onProgress] 
   * @returns {Promise<object>}
   */
  async crawl(websiteUrl, topicName, onProgress = () => {}) {
    const startTime = Date.now();
    const normalizedUrl = TopicCrawler.normalizeUrl(websiteUrl);
    const host = new URL(normalizedUrl).hostname;
    const sanitizedTopic = (topicName || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const jobId = this.options.jobId || `${host}-${sanitizedTopic}-topic-crawl`;

    onProgress({
      type: 'start',
      message: `🚀 Launching Exhaustive Topic Crawl for [${topicName}] on ${normalizedUrl}`,
      stats: { topic: topicName, seedUrl: normalizedUrl, jobId }
    });

    const { entrypoint, strategy, verified } = await this.resolveTopicEntrypointDetails(normalizedUrl, topicName);

    onProgress({
      type: 'entrypoint_resolved',
      message: `🎯 Target Entrypoint resolved to: ${entrypoint} (Strategy: ${strategy})`,
      stats: { entrypoint, strategy, verified }
    });

    this.engine = new CrawlEngine({
      ...this.options,
      fetcherPool: this.fetcherPool,
      topic: topicName,
      category: topicName,
      jobId,
      exhaustive: this.options.exhaustive,
      fallbackSeedUrl: normalizedUrl !== entrypoint ? normalizedUrl : null
    });

    const wrappedProgress = (evt) => {
      const elapsedSec = Math.max(0.001, (Date.now() - startTime) / 1000);
      if (evt && evt.stats) {
        evt.velocity = {
          pagesPerSec: Number((evt.stats.visited / elapsedSec).toFixed(2)),
          articlesPerSec: Number((evt.stats.succeeded / elapsedSec).toFixed(2)),
          elapsedSec: Number(elapsedSec.toFixed(1))
        };
      }
      onProgress(evt);
    };

    const results = await this.engine.crawl(entrypoint, wrappedProgress);

    const durationMs = Date.now() - startTime;
    const durationSec = Math.max(0.001, durationMs / 1000);
    const pagesPerSec = Number((results.visited / durationSec).toFixed(2));
    const articlesPerSec = Number((results.succeeded / durationSec).toFixed(2));

    const summary = {
      success: results.succeeded > 0 || (results.failed === 0 && results.skippedExisting > 0),
      topic: topicName,
      seedUrl: normalizedUrl,
      entrypoint,
      strategy,
      jobId,
      durationMs,
      visited: results.visited,
      succeeded: results.succeeded,
      failed: results.failed,
      skippedExisting: results.skippedExisting,
      dateCoverage: results.dateCoverage,
      failedUrls: results.failedUrls,
      throughput: {
        pagesPerSec,
        articlesPerSec
      }
    };

    onProgress({
      type: 'complete',
      message: `🏁 Exhaustive Topic Crawl complete: ${results.succeeded} scraped, ${results.skippedExisting} cached in ${durationSec.toFixed(1)}s`,
      stats: summary
    });

    return summary;
  }
}

/**
 * High-level helper to execute an exhaustive topic crawl.
 * @param {string} websiteUrl 
 * @param {string} topicName 
 * @param {object} [options] 
 * @param {function} [onProgress] 
 * @returns {Promise<object>}
 */
export async function runTopicCrawl(websiteUrl, topicName, options = {}, onProgress = () => {}) {
  const crawler = new TopicCrawler(options);
  return crawler.crawl(websiteUrl, topicName, onProgress);
}
