import fs from 'fs/promises';
import path from 'path';
import { getAllScrapes, getScrapesByDomain } from '../storage.js';

/**
 * DataExporter formats and exports scraped SQLite data into standard
 * AI/ML dataset formats: JSONL (JSON Lines), CSV, and JSON.
 */
export class DataExporter {
  /**
   * Escapes a value for RFC-4180 compliant CSV formatting.
   * @param {any} val 
   * @returns {string}
   */
  static escapeCsvValue(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Exports scrape records to a destination file.
   * @param {object} options
   * @param {string} [options.format='jsonl'] Format: 'jsonl' | 'csv' | 'json'
   * @param {string} [options.domain] Domain filter (e.g. 'example.com')
   * @param {string} [options.category] Category filter
   * @param {string} [options.status='success'] Status filter ('success' | 'failed' | 'all')
   * @param {number} [options.limit] Max records to export
   * @param {boolean} [options.includeContent=true] Include markdown body text
   * @param {string} [options.outputBaseDir='./output'] Base output directory for reading markdown
   * @param {string} [options.destination] Destination file path
   * @returns {Promise<{ destination: string, recordCount: number, format: string, totalWords: number }>}
   */
  static async exportDataset(options = {}) {
    const format = (options.format || 'jsonl').toLowerCase();
    if (!['jsonl', 'csv', 'json'].includes(format)) {
      throw new Error(`Unsupported export format: "${format}". Allowed formats are: jsonl, csv, json.`);
    }

    const outputBaseDir = path.resolve(options.outputBaseDir || './output');
    const statusFilter = options.status || 'success';
    const includeContent = options.includeContent !== false;

    // Retrieve records
    let records = [];
    if (options.domain) {
      records = getScrapesByDomain(options.domain);
    } else {
      records = getAllScrapes(options.category);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      records = records.filter(r => r.status === statusFilter);
    }

    // Apply category filter if domain was also specified
    if (options.domain && options.category) {
      records = records.filter(r => r.category === options.category);
    }

    // Apply limit
    if (options.limit && !isNaN(parseInt(options.limit, 10))) {
      records = records.slice(0, parseInt(options.limit, 10));
    }

    // Determine destination filename
    let destination = options.destination;
    if (!destination) {
      const namePart = options.domain
        ? options.domain.replace(/[^a-zA-Z0-9.-]/g, '_')
        : (options.category ? `category_${options.category}` : 'scrapi_dataset');
      destination = path.join(outputBaseDir, `${namePart}.${format}`);
    } else {
      destination = path.resolve(destination);
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    let totalWords = 0;
    const enrichedRecords = [];

    for (const rec of records) {
      let content = '';
      if (includeContent && rec.filename && rec.status === 'success') {
        try {
          const filePath = path.isAbsolute(rec.filename)
            ? rec.filename
            : path.join(outputBaseDir, rec.filename);
          content = await fs.readFile(filePath, 'utf-8');
        } catch (_) {
          // File read error is non-fatal; content remains empty
        }
      }

      const wordCount = rec.word_count || (content ? content.split(/\s+/).filter(Boolean).length : 0);
      totalWords += wordCount;

      enrichedRecords.push({
        id: rec.id,
        url: rec.url,
        title: rec.title || '',
        description: rec.description || '',
        category: rec.category || '',
        word_count: wordCount,
        scraped_at: rec.scraped_at,
        status: rec.status,
        filename: rec.filename || '',
        ...(includeContent ? { content } : {})
      });
    }

    // Write file in requested format
    if (format === 'jsonl') {
      const lines = enrichedRecords.map(r => JSON.stringify(r));
      await fs.writeFile(destination, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
    } else if (format === 'json') {
      await fs.writeFile(destination, JSON.stringify(enrichedRecords, null, 2), 'utf-8');
    } else if (format === 'csv') {
      const headers = ['id', 'url', 'title', 'description', 'category', 'word_count', 'scraped_at', 'status', 'filename'];
      if (includeContent) {
        headers.push('content');
      }

      const rows = [headers.join(',')];
      for (const r of enrichedRecords) {
        const row = [
          r.id,
          DataExporter.escapeCsvValue(r.url),
          DataExporter.escapeCsvValue(r.title),
          DataExporter.escapeCsvValue(r.description),
          DataExporter.escapeCsvValue(r.category),
          r.word_count,
          DataExporter.escapeCsvValue(r.scraped_at),
          r.status,
          DataExporter.escapeCsvValue(r.filename)
        ];
        if (includeContent) {
          row.push(DataExporter.escapeCsvValue(r.content));
        }
        rows.push(row.join(','));
      }
      await fs.writeFile(destination, rows.join('\n') + '\n', 'utf-8');
    }

    return {
      destination,
      recordCount: enrichedRecords.length,
      format,
      totalWords
    };
  }
}
