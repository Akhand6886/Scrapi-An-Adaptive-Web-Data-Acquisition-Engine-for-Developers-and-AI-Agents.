import './src/polyfill.js';
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';
import { DataExporter } from './src/exporter/data_exporter.js';
import { DocumentMerger } from './src/exporter/document_merger.js';
import { initStorage, closeStorage, insertScrape, saveMarkdownFile } from './src/storage.js';

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting Dataset Exporter & Document Merger Test Suite');
  console.log('🧪 ========================================================\n');

  const testDir = path.resolve('./output_exporter_test');
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });

  await initStorage(path.join(testDir, 'data'), testDir);

  try {
    // ----------------------------------------------------
    // Setup Mock Scrapes & Files
    // ----------------------------------------------------
    console.log('1. Setting up mock scrape records and markdown files...');
    const mockFiles = [
      {
        url: 'https://docs.acme.org/intro',
        title: 'Acme Introduction',
        description: 'Introduction to Acme Framework',
        category: 'guides',
        date: '2024-01-15',
        content: '# Acme Introduction\n\nWelcome to Acme. This is an awesome library with "special quotes" and, commas.',
        filename: 'docs.acme.org/intro.md'
      },
      {
        url: 'https://docs.acme.org/setup/install',
        title: 'Installation Guide',
        description: 'How to install Acme',
        category: 'guides',
        date: '2024-05-20',
        content: '# Installation Guide\n\nRun npm install acme to get started.\n\n## System Requirements\n\nNode.js 18+',
        filename: 'docs.acme.org/setup/install.md'
      },
      {
        url: 'https://docs.acme.org/api/v1',
        title: 'REST API Reference',
        description: 'Complete API specs',
        category: 'api',
        date: '2025-02-10',
        content: '# REST API Reference\n\nEndpoints for all resources.',
        filename: 'docs.acme.org/api/v1.md'
      }
    ];

    for (const item of mockFiles) {
      await saveMarkdownFile(item.content, {
        title: item.title,
        url: item.url,
        date: item.date,
        description: item.description,
        scraped_at: new Date().toISOString()
      }, {
        output: testDir,
        subdir: path.dirname(item.filename),
        filename: path.basename(item.filename, '.md')
      });

      insertScrape({
        url: item.url,
        title: item.title,
        description: item.description,
        filename: item.filename,
        word_count: item.content.split(/\s+/).length,
        scraped_at: new Date().toISOString(),
        status: 'success',
        category: item.category
      });
    }
    console.log('  ✓ 3 mock records created and saved.');

    // ----------------------------------------------------
    // 2. Testing DataExporter (JSONL, CSV, JSON)
    // ----------------------------------------------------
    console.log('\n2. Testing DataExporter formats...');

    // 2a. JSONL Export
    const jsonlDest = path.join(testDir, 'dataset.jsonl');
    const jsonlResult = await DataExporter.exportDataset({
      format: 'jsonl',
      domain: 'docs.acme.org',
      outputBaseDir: testDir,
      destination: jsonlDest
    });

    assert.strictEqual(jsonlResult.recordCount, 3, 'Exported 3 records');
    assert.strictEqual(jsonlResult.format, 'jsonl');
    const jsonlRaw = await fs.readFile(jsonlDest, 'utf-8');
    const lines = jsonlRaw.trim().split('\n');
    assert.strictEqual(lines.length, 3, 'JSONL has exactly 3 lines');
    const parsedObjects = lines.map(l => JSON.parse(l));
    assert.ok(parsedObjects.some(o => o.url.includes('docs.acme.org')), 'JSONL contains URL');
    assert.ok(parsedObjects.some(o => o.content && o.content.includes('Welcome to Acme')), 'JSONL contains full text content');
    console.log('  ✓ JSONL dataset export verified.');

    // 2b. CSV Export
    const csvDest = path.join(testDir, 'dataset.csv');
    const csvResult = await DataExporter.exportDataset({
      format: 'csv',
      domain: 'docs.acme.org',
      outputBaseDir: testDir,
      destination: csvDest
    });

    assert.strictEqual(csvResult.recordCount, 3);
    const csvRaw = await fs.readFile(csvDest, 'utf-8');
    assert.ok(csvRaw.startsWith('id,url,title,description,category,word_count,scraped_at,status,filename,content'), 'CSV has valid RFC-4180 header');
    assert.ok(csvRaw.includes('""special quotes""'), 'CSV escapes double quotes correctly');
    console.log('  ✓ CSV dataset export with RFC-4180 escaping verified.');

    // 2c. JSON Array Export
    const jsonDest = path.join(testDir, 'dataset.json');
    const jsonResult = await DataExporter.exportDataset({
      format: 'json',
      category: 'guides',
      outputBaseDir: testDir,
      destination: jsonDest
    });

    assert.strictEqual(jsonResult.recordCount, 2, 'Filtered to 2 guides records');
    const jsonArray = JSON.parse(await fs.readFile(jsonDest, 'utf-8'));
    assert.strictEqual(jsonArray.length, 2);
    assert.strictEqual(jsonArray[0].category, 'guides');
    console.log('  ✓ JSON dataset export with category filtering verified.');

    // ----------------------------------------------------
    // 3. Testing DocumentMerger (Single Unified Document)
    // ----------------------------------------------------
    console.log('\n3. Testing DocumentMerger...');

    const domainDir = path.join(testDir, 'docs.acme.org');
    const mergedDest = path.join(testDir, 'acme-complete.md');

    // 3a. Merge with Hierarchy Order
    const mergeResult = await DocumentMerger.merge({
      target: domainDir,
      order: 'hierarchy',
      outputBaseDir: testDir,
      destination: mergedDest,
      title: 'Acme Framework Complete Manual'
    });

    assert.strictEqual(mergeResult.chapterCount, 3, 'Merged 3 chapters');
    assert.ok(mergeResult.totalWords > 0, 'Computed total word count');

    const mergedContent = await fs.readFile(mergedDest, 'utf-8');
    assert.ok(mergedContent.includes('# 📖 Acme Framework Complete Manual'), 'Merged document title present');
    assert.ok(mergedContent.includes('## 📑 Table of Contents'), 'Table of contents present');
    assert.ok(mergedContent.includes('[Acme Introduction](#chapter-'), 'TOC links to chapter anchors');
    assert.ok(mergedContent.includes('## Chapter 1:'), 'Chapter 1 header present');
    assert.ok(mergedContent.includes('## Chapter 2:'), 'Chapter 2 header present');
    assert.ok(mergedContent.includes('## Chapter 3:'), 'Chapter 3 header present');
    assert.ok(mergedContent.includes('### System Requirements'), 'Headings demoted inside chapters');
    assert.ok(!mergedContent.includes('--- \n---'), 'Clean frontmatter stripped');
    console.log('  ✓ DocumentMerger compiled single master markdown with TOC and anchors.');

    // 3b. Chronological Ordering Test
    const chronoDest = path.join(testDir, 'acme-chrono.md');
    const chronoResult = await DocumentMerger.merge({
      target: domainDir,
      order: 'chronological',
      outputBaseDir: testDir,
      destination: chronoDest
    });

    const chronoContent = await fs.readFile(chronoDest, 'utf-8');
    const introPos = chronoContent.indexOf('Acme Introduction');
    const installPos = chronoContent.indexOf('Installation Guide');
    const apiPos = chronoContent.indexOf('REST API Reference');
    assert.ok(introPos < installPos && installPos < apiPos, 'Chapters sorted in chronological order (Jan 2024 -> May 2024 -> Feb 2025)');
    console.log('  ✓ DocumentMerger chronological ordering verified.');

    console.log('\n🏆 ========================================================');
    console.log('🏆 ALL DATASET EXPORTER & MERGER TESTS PASSED SUCCESSFULLY!');
    console.log('🏆 ========================================================\n');
  } finally {
    closeStorage();
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
