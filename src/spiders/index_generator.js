import fs from 'fs/promises';
import path from 'path';
import { getScrapesByDomain } from '../storage.js';

/**
 * IndexGenerator creates structured, human-readable Table of Contents (INDEX.md)
 * and machine-readable manifests (manifest.json) for scraped websites and topic archives.
 */
export class IndexGenerator {
  /**
   * Generates INDEX.md and manifest.json for a collection of scraped pages.
   * @param {Array<object>} pages Array of page records
   * @param {object} options Configuration options
   * @param {string} options.targetDir Directory where INDEX.md will be saved
   * @param {string} [options.outputBaseDir='./output'] Base output directory
   * @param {string} [options.domain] Target website domain/host
   * @param {string} [options.seedUrl] Original seed URL
   * @param {string} [options.topic] Topic name if topic-aware crawl
   * @param {object} [options.dateCoverage] Earliest/latest dates and yearly distributions
   * @param {boolean} [options.generateJson=true] Also output manifest.json
   * @param {boolean} [options.mergeExisting=true] Merge prior SQLite records for same domain
   * @returns {Promise<{ indexPath: string, manifestPath: string|null, totalPages: number }>}
   */
  static async generateIndex(pages = [], options = {}) {
    const targetDir = path.resolve(options.targetDir || options.outputBaseDir || './output');
    const outputBaseDir = path.resolve(options.outputBaseDir || './output');
    const domain = options.domain || 'Unknown Domain';
    const topic = options.topic || null;
    const seedUrl = options.seedUrl || `https://${domain}`;

    await fs.mkdir(targetDir, { recursive: true });

    // Deduplicate and merge with existing database records if requested
    const pageMap = new Map();

    // 1. Load prior SQLite scrapes for this domain if available
    if (options.mergeExisting !== false && domain) {
      try {
        const existingRecords = getScrapesByDomain(domain);
        for (const rec of existingRecords) {
          if (rec.filename && rec.status === 'success') {
            const cleanUrl = rec.url;
            pageMap.set(cleanUrl, {
              url: cleanUrl,
              title: rec.title || path.basename(rec.filename, '.md'),
              filename: rec.filename,
              date: null, // will be augmented from sidecar or frontmatter if present
              author: null,
              category: rec.category || null,
              wordCount: rec.word_count || 0,
              description: rec.description || null,
              depth: 0,
              scrapedAt: rec.scraped_at
            });
          }
        }
      } catch (_) {}
    }

    // 2. Overlay freshly scraped pages (more up-to-date)
    for (const p of pages) {
      if (!p || !p.url) continue;
      pageMap.set(p.url, {
        url: p.url,
        title: p.title || 'Untitled Document',
        filename: p.filename || '',
        date: p.date || null,
        author: p.author || null,
        category: p.category || null,
        wordCount: p.wordCount || 0,
        description: p.description || null,
        depth: p.depth || 0,
        scrapedAt: p.scrapedAt || new Date().toISOString()
      });
    }

    const allPages = Array.from(pageMap.values());
    if (allPages.length === 0) {
      return { indexPath: null, manifestPath: null, totalPages: 0 };
    }

    // Compute relative file paths from targetDir (where INDEX.md sits)
    for (const p of allPages) {
      if (p.filename) {
        const absoluteDocPath = path.isAbsolute(p.filename)
          ? p.filename
          : path.resolve(outputBaseDir, p.filename);
        p.relativeLink = path.relative(targetDir, absoluteDocPath).replace(/\\/g, '/');
        if (!p.relativeLink.startsWith('.') && !p.relativeLink.startsWith('/')) {
          p.relativeLink = `./${p.relativeLink}`;
        }
      } else {
        p.relativeLink = p.url;
      }
    }

    // Sort metrics
    const totalWords = allPages.reduce((acc, p) => acc + (p.wordCount || 0), 0);
    const pagesWithDates = allPages.filter(p => p.date && typeof p.date === 'string');
    pagesWithDates.sort((a, b) => a.date.localeCompare(b.date));

    const earliestDate = pagesWithDates.length > 0 ? pagesWithDates[0].date : (options.dateCoverage?.earliestDate || null);
    const latestDate = pagesWithDates.length > 0 ? pagesWithDates[pagesWithDates.length - 1].date : (options.dateCoverage?.latestDate || null);

    // Build hierarchical directory groups
    const hierarchy = new Map();
    for (const p of allPages) {
      let folderPath = '/';
      if (p.relativeLink && p.relativeLink.startsWith('./')) {
        const cleanRel = p.relativeLink.slice(2);
        const dir = path.dirname(cleanRel);
        folderPath = dir === '.' ? '/' : `/${dir.replace(/\\/g, '/')}/`;
      }
      if (!hierarchy.has(folderPath)) {
        hierarchy.set(folderPath, []);
      }
      hierarchy.get(folderPath).push(p);
    }

    // Sort folders: root '/' first, then alphabetical
    const sortedFolders = Array.from(hierarchy.keys()).sort((a, b) => {
      if (a === '/') return -1;
      if (b === '/') return 1;
      return a.localeCompare(b);
    });

    for (const folder of sortedFolders) {
      hierarchy.get(folder).sort((a, b) => {
        // index files first, then alphabetical by title
        const aIsIndex = a.relativeLink.endsWith('/index.md') || a.relativeLink === './index.md';
        const bIsIndex = b.relativeLink.endsWith('/index.md') || b.relativeLink === './index.md';
        if (aIsIndex && !bIsIndex) return -1;
        if (!aIsIndex && bIsIndex) return 1;
        return a.title.localeCompare(b.title);
      });
    }

    // Build Markdown Document
    let md = '';
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (topic) {
      md += `# 📑 Exhaustive Topic Archive: [${topic}]\n\n`;
      md += `> **Origin:** [${domain}](${seedUrl})  \n`;
      md += `> **Topic Filter:** \`${topic}\`  \n`;
    } else {
      md += `# 📑 Master Site Index & Table of Contents\n\n`;
      md += `> **Website:** [${domain}](${seedUrl})  \n`;
    }

    md += `> **Total Pages:** \`${allPages.length}\` | **Total Word Count:** \`~${totalWords.toLocaleString()} words\`  \n`;
    if (earliestDate && latestDate) {
      md += `> **Publication Date Coverage:** \`${earliestDate}\` ➔ \`${latestDate}\`  \n`;
    }
    md += `> **Generated:** \`${nowIso} UTC\` by **Scrapi v2.0**\n\n`;

    // Quick Navigation Jump Bar
    md += `---\n\n`;
    md += `### ⚡ Quick Navigation\n`;
    md += `[📁 Site Hierarchy](#-directory--path-hierarchy) • `;
    if (pagesWithDates.length > 0) {
      md += `[📅 Chronological Archive](#-chronological-reading-order) • `;
    }
    md += `[🔤 Alphabetical Index](#-alphabetical-index)\n\n`;
    md += `---\n\n`;

    // ──────────────────────────────────────────────────────────
    // Section 1: Directory & Path Hierarchy (Table of Contents)
    // ──────────────────────────────────────────────────────────
    md += `## 📁 Directory & Path Hierarchy\n\n`;
    md += `The complete directory structure of the website mapped to local Markdown documents:\n\n`;

    for (const folder of sortedFolders) {
      const items = hierarchy.get(folder);
      const folderHeader = folder === '/' ? '📂 `/` (Site Root)' : `📁 \`${folder}\``;
      md += `### ${folderHeader}\n\n`;

      for (const item of items) {
        const cleanTitle = (item.title || 'Untitled Document').replace(/[\[\]]/g, '');
        const wordBadge = item.wordCount > 0 ? ` *(${item.wordCount.toLocaleString()} words)*` : '';
        const dateBadge = item.date ? ` — 🗓️ \`${item.date}\`` : '';
        const authorBadge = item.author ? ` *(by ${item.author})*` : '';
        md += `- [**${cleanTitle}**](${item.relativeLink})${wordBadge}${dateBadge}${authorBadge}\n`;
        if (item.description && item.description.length > 5) {
          const shortDesc = item.description.slice(0, 140).replace(/\n/g, ' ');
          md += `  > ${shortDesc}${item.description.length > 140 ? '...' : ''}\n`;
        }
      }
      md += `\n`;
    }

    // ──────────────────────────────────────────────────────────
    // Section 2: Chronological Reading Order (Earliest to Latest)
    // ──────────────────────────────────────────────────────────
    if (pagesWithDates.length > 0) {
      md += `---\n\n`;
      md += `## 📅 Chronological Reading Order\n\n`;
      md += `Articles arranged in sequential historical order from earliest published to newest:\n\n`;

      // Group by Year
      const byYear = new Map();
      for (const item of pagesWithDates) {
        const year = item.date.slice(0, 4);
        if (!byYear.has(year)) {
          byYear.set(year, []);
        }
        byYear.get(year).push(item);
      }

      const sortedYears = Array.from(byYear.keys()).sort((a, b) => a.localeCompare(b));
      for (const year of sortedYears) {
        const yearItems = byYear.get(year);
        md += `### 🗓️ ${year} (${yearItems.length} ${yearItems.length === 1 ? 'article' : 'articles'})\n\n`;
        for (const item of yearItems) {
          const cleanTitle = (item.title || 'Untitled Document').replace(/[\[\]]/g, '');
          const words = item.wordCount > 0 ? ` *(${item.wordCount.toLocaleString()} words)*` : '';
          const category = item.category ? ` \`[${item.category}]\`` : '';
          md += `- **\`${item.date}\`** — [${cleanTitle}](${item.relativeLink})${category}${words}\n`;
        }
        md += `\n`;
      }

      // Undated pages section
      const undatedPages = allPages.filter(p => !p.date);
      if (undatedPages.length > 0) {
        md += `### 📄 Reference & Undated Pages (${undatedPages.length})\n\n`;
        for (const item of undatedPages.slice(0, 50)) {
          const cleanTitle = (item.title || 'Untitled Document').replace(/[\[\]]/g, '');
          const words = item.wordCount > 0 ? ` *(${item.wordCount.toLocaleString()} words)*` : '';
          md += `- [${cleanTitle}](${item.relativeLink})${words}\n`;
        }
        if (undatedPages.length > 50) {
          md += `\n*... and ${undatedPages.length - 50} more reference pages (see Hierarchy section above)*\n`;
        }
        md += `\n`;
      }
    }

    // ──────────────────────────────────────────────────────────
    // Section 3: Alphabetical Title Index (A-Z)
    // ──────────────────────────────────────────────────────────
    md += `---\n\n`;
    md += `## 🔤 Alphabetical Index\n\n`;

    const byLetter = new Map();
    const sortedAlphabetical = [...allPages].sort((a, b) => a.title.localeCompare(b.title));

    for (const item of sortedAlphabetical) {
      let firstChar = (item.title || 'U').trim().charAt(0).toUpperCase();
      if (!/[A-Z]/.test(firstChar)) {
        firstChar = '#';
      }
      if (!byLetter.has(firstChar)) {
        byLetter.set(firstChar, []);
      }
      byLetter.get(firstChar).push(item);
    }

    const sortedLetters = Array.from(byLetter.keys()).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });

    for (const letter of sortedLetters) {
      const letterItems = byLetter.get(letter);
      md += `### ${letter}\n\n`;
      for (const item of letterItems) {
        const cleanTitle = (item.title || 'Untitled Document').replace(/[\[\]]/g, '');
        const wordInfo = item.wordCount > 0 ? ` *(${item.wordCount.toLocaleString()} words)*` : '';
        md += `- [${cleanTitle}](${item.relativeLink})${wordInfo}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
    md += `*End of Table of Contents. Generated by [Scrapi](https://github.com/Akhand6886/Scrapi).*  \n`;

    // Write INDEX.md
    const indexPath = path.join(targetDir, 'INDEX.md');
    await fs.writeFile(indexPath, md, 'utf-8');

    // Write machine-readable manifest.json
    let manifestPath = null;
    if (options.generateJson !== false) {
      const manifest = {
        domain,
        topic,
        seedUrl,
        generatedAt: new Date().toISOString(),
        totalPages: allPages.length,
        totalWordCount: totalWords,
        dateCoverage: {
          earliestDate,
          latestDate,
          totalWithDates: pagesWithDates.length
        },
        pages: allPages.map(p => ({
          url: p.url,
          title: p.title,
          file: p.relativeLink.replace(/^\.\//, ''),
          date: p.date,
          author: p.author,
          category: p.category,
          wordCount: p.wordCount,
          description: p.description
        }))
      };
      manifestPath = path.join(targetDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    }

    return {
      indexPath,
      manifestPath,
      totalPages: allPages.length,
      totalWords
    };
  }

  /**
   * Scans a target directory on disk, reads all metadata sidecars, and builds INDEX.md.
   * Useful for regenerating indices or cataloging previously downloaded directories.
   * @param {string} directoryPath 
   * @param {object} [options] 
   * @returns {Promise<object>}
   */
  static async fromDirectory(directoryPath, options = {}) {
    const resolvedDir = path.resolve(directoryPath);
    const discoveredPages = [];

    async function walk(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith('-metadata.json')) {
          try {
            const raw = await fs.readFile(full, 'utf-8');
            const meta = JSON.parse(raw);
            const mdFilename = entry.name.replace(/-metadata\.json$/, '.md');
            const mdFullPath = path.join(currentDir, mdFilename);
            
            // Verify corresponding markdown file exists
            try {
              await fs.access(mdFullPath);
              discoveredPages.push({
                url: meta.url || `file://${mdFullPath}`,
                title: meta.title || mdFilename.replace('.md', ''),
                filename: mdFullPath,
                date: meta.date || null,
                author: meta.author || null,
                category: meta.category || null,
                wordCount: meta.word_count || 0,
                description: meta.description || null
              });
            } catch (_) {}
          } catch (_) {}
        }
      }
    }

    await walk(resolvedDir);

    const domain = options.domain || path.basename(resolvedDir);
    return IndexGenerator.generateIndex(discoveredPages, {
      targetDir: resolvedDir,
      outputBaseDir: resolvedDir,
      domain,
      mergeExisting: false,
      ...options
    });
  }
}
