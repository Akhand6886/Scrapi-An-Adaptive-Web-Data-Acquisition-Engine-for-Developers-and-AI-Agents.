import './src/polyfill.js';
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';
import { IndexGenerator } from './src/spiders/index_generator.js';
import { initStorage, closeStorage } from './src/storage.js';

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting Table of Contents & Index Generator Test Suite');
  console.log('🧪 ========================================================\n');

  const testOutputDir = path.resolve('./output_index_test');
  await fs.rm(testOutputDir, { recursive: true, force: true });
  await fs.mkdir(testOutputDir, { recursive: true });

  await initStorage(path.join(testOutputDir, 'data'), testOutputDir);

  try {
    // 1. Testing Core Index Generation
    console.log('1. Testing Core IndexGenerator.generateIndex...');
    const samplePages = [
      {
        url: 'https://example.com/',
        title: 'Example Homepage',
        filename: 'example.com/index.md',
        date: null,
        wordCount: 450,
        description: 'Welcome to Example.com'
      },
      {
        url: 'https://example.com/docs/getting-started',
        title: 'Getting Started Guide',
        filename: 'example.com/docs/getting-started.md',
        date: '2024-03-15',
        wordCount: 1200,
        description: 'Quick start guide for developers'
      },
      {
        url: 'https://example.com/docs/api/reference',
        title: 'API Reference',
        filename: 'example.com/docs/api/reference.md',
        date: '2025-01-20',
        wordCount: 3500,
        description: 'Complete API documentation'
      },
      {
        url: 'https://example.com/blog/2026/future-of-scraping',
        title: 'The Future of Web Scraping',
        filename: 'example.com/blog/2026/future-of-scraping.md',
        date: '2026-10-14',
        wordCount: 1800,
        description: 'Insights into modern web crawling architectures'
      },
      {
        url: 'https://example.com/about/team',
        title: 'About the Engineering Team',
        filename: 'example.com/about/team.md',
        date: null,
        wordCount: 650,
        description: 'Meet our global engineering team'
      }
    ];

    const targetDir = path.join(testOutputDir, 'example.com');
    const result = await IndexGenerator.generateIndex(samplePages, {
      targetDir,
      outputBaseDir: testOutputDir,
      domain: 'example.com',
      seedUrl: 'https://example.com',
      topic: 'Documentation',
      generateJson: true,
      mergeExisting: false
    });

    assert.strictEqual(result.totalPages, 5, 'Should have indexed exactly 5 pages');
    assert.strictEqual(result.totalWords, 450 + 1200 + 3500 + 1800 + 650, 'Total word count matches sum');
    assert.ok(result.indexPath && result.indexPath.endsWith('INDEX.md'), 'INDEX.md path generated');
    assert.ok(result.manifestPath && result.manifestPath.endsWith('manifest.json'), 'manifest.json path generated');

    const indexContent = await fs.readFile(result.indexPath, 'utf-8');
    
    // Assert Header & Metadata
    assert.ok(indexContent.includes('# 📑 Exhaustive Topic Archive: [Documentation]'), 'Includes topic title');
    assert.ok(indexContent.includes('`2024-03-15` ➔ `2026-10-14`'), 'Displays correct date span');
    
    // Assert Directory & Path Hierarchy Section
    assert.ok(indexContent.includes('## 📁 Directory & Path Hierarchy'), 'Includes Directory Hierarchy section');
    assert.ok(indexContent.includes('[**Example Homepage**](./index.md)'), 'Root index relative link is correct');
    assert.ok(indexContent.includes('[**Getting Started Guide**](./docs/getting-started.md)'), 'Docs relative link is correct');
    assert.ok(indexContent.includes('[**API Reference**](./docs/api/reference.md)'), 'Nested API reference link is correct');
    
    // Assert Chronological Reading Order Section
    assert.ok(indexContent.includes('## 📅 Chronological Reading Order'), 'Includes Chronological Order section');
    assert.ok(indexContent.includes('### 🗓️ 2024'), 'Groups 2024 articles');
    assert.ok(indexContent.includes('### 🗓️ 2025'), 'Groups 2025 articles');
    assert.ok(indexContent.includes('### 🗓️ 2026'), 'Groups 2026 articles');
    assert.ok(indexContent.includes('### 📄 Reference & Undated Pages'), 'Lists undated pages');

    // Assert Alphabetical Section
    assert.ok(indexContent.includes('## 🔤 Alphabetical Index'), 'Includes Alphabetical section');
    assert.ok(indexContent.includes('### A'), 'Includes letter A');
    assert.ok(indexContent.includes('### T'), 'Includes letter T');

    // Assert JSON Manifest
    const manifestRaw = await fs.readFile(result.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    assert.strictEqual(manifest.domain, 'example.com', 'Manifest has correct domain');
    assert.strictEqual(manifest.totalPages, 5, 'Manifest reports 5 pages');
    assert.strictEqual(manifest.pages.length, 5, 'Manifest contains 5 items');
    assert.strictEqual(manifest.pages[0].file, 'index.md', 'Clean relative file in manifest');

    console.log('  ✓ Core IndexGenerator created valid, comprehensive INDEX.md and manifest.json.');

    // 2. Testing Index Generation from an existing Disk Directory
    console.log('\n2. Testing IndexGenerator.fromDirectory (Disk Scan)...');
    const diskCatalogDir = path.join(testOutputDir, 'disk_scan_site');
    await fs.mkdir(path.join(diskCatalogDir, 'articles'), { recursive: true });

    // Write a dummy markdown and metadata sidecar
    await fs.writeFile(
      path.join(diskCatalogDir, 'articles', 'article-1.md'),
      '# Article 1\n\nContent here',
      'utf-8'
    );
    await fs.writeFile(
      path.join(diskCatalogDir, 'articles', 'article-1-metadata.json'),
      JSON.stringify({
        url: 'https://mysite.org/articles/1',
        title: 'First Great Article',
        date: '2025-04-10',
        word_count: 320
      }),
      'utf-8'
    );

    const diskResult = await IndexGenerator.fromDirectory(diskCatalogDir, {
      domain: 'mysite.org'
    });

    assert.strictEqual(diskResult.totalPages, 1, 'Discovered 1 page from directory scan');
    const diskIndex = await fs.readFile(diskResult.indexPath, 'utf-8');
    assert.ok(diskIndex.includes('First Great Article'), 'Cataloged article title correctly');
    assert.ok(diskIndex.includes('./articles/article-1.md'), 'Relative path resolved correctly');
    console.log('  ✓ IndexGenerator.fromDirectory successfully scanned and cataloged disk directory.');

    // 3. Testing Automated End-to-End Crawl Index Generation
    console.log('\n3. Testing End-to-End Crawl Automated Index Generation...');
    const http = await import('http');
    const mockServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/') {
        res.end(`<html><head><title>My Site Root</title></head><body><h1>My Site</h1><p>Home content</p><a href="/page1">Page 1</a></body></html>`);
      } else if (req.url === '/page1') {
        res.end(`<html><head><title>Subpage One</title></head><body><h1>Page 1</h1><p>Page 1 content here</p></body></html>`);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
    const port = mockServer.address().port;
    const seedUrl = `http://127.0.0.1:${port}/`;

    const { runSpider } = await import('./src/spiders/index.js');
    const crawlStats = await runSpider(seedUrl, {
      output: testOutputDir,
      maxPages: 2,
      depth: 1,
      delay: 0,
      fetcher: 'static',
      noDb: false
    });

    mockServer.close();

    assert.ok(crawlStats.indexPath, 'Crawl returned indexPath');
    assert.ok(crawlStats.manifestPath, 'Crawl returned manifestPath');
    const crawlIndexContent = await fs.readFile(crawlStats.indexPath, 'utf-8');
    assert.ok(crawlIndexContent.includes('Directory & Path Hierarchy'), 'Contains hierarchy in generated index');
    assert.ok(crawlIndexContent.includes('My Site Root'), 'Indexed root title');
    assert.ok(crawlIndexContent.includes('Subpage One'), 'Indexed subpage title');
    console.log('  ✓ Automated end-to-end crawl index generation verified successfully.');

    console.log('\n🏆 ========================================================');
    console.log('🏆 ALL TABLE OF CONTENTS & INDEX TESTS PASSED SUCCESSFULLY!');
    console.log('🏆 ========================================================\n');
  } finally {
    closeStorage();
    await fs.rm(testOutputDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
