import fs from 'fs/promises';
import path from 'path';
import { getScrapesByDomain } from '../storage.js';

/**
 * DocumentMerger compiles multiple scraped Markdown files into a single,
 * cohesive, well-formatted document (e.g. book, offline manual, or unified LLM context).
 */
export class DocumentMerger {
  /**
   * Generates a GitHub-flavored Markdown anchor from a heading string.
   * @param {string} text 
   * @returns {string}
   */
  static slugifyAnchor(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-');
  }

  /**
   * Strips YAML frontmatter from markdown content if present.
   * @param {string} markdown 
   * @returns {string}
   */
  static stripFrontmatter(markdown) {
    if (!markdown) return '';
    if (markdown.startsWith('---')) {
      const secondIdx = markdown.indexOf('\n---', 3);
      if (secondIdx !== -1) {
        return markdown.slice(secondIdx + 4).trimStart();
      }
    }
    return markdown;
  }

  /**
   * Adjusts heading levels in content so top-level # becomes ### under a chapter ##.
   * @param {string} markdown 
   * @returns {string}
   */
  static demoteHeadings(markdown) {
    if (!markdown) return '';
    return markdown.replace(/^(#{1,5})\s/gm, '#$1 ');
  }

  /**
   * Merges multiple scraped pages into a single document.
   * @param {object} options
   * @param {string} [options.target] Directory path or domain name
   * @param {string} [options.order='hierarchy'] 'hierarchy' | 'chronological' | 'alphabetical'
   * @param {string} [options.outputBaseDir='./output'] Base output directory
   * @param {string} [options.destination] Custom output file path
   * @param {string} [options.title] Custom document title
   * @param {boolean} [options.includeToc=true] Include table of contents
   * @param {boolean} [options.demoteHeadings=true] Shift page headings so chapters remain dominant
   * @returns {Promise<{ destination: string, chapterCount: number, totalWords: number, title: string }>}
   */
  static async merge(options = {}) {
    const target = options.target || './output';
    const outputBaseDir = path.resolve(options.outputBaseDir || './output');
    const order = options.order || 'hierarchy';
    const includeToc = options.includeToc !== false;
    const shouldDemoteHeadings = options.demoteHeadings !== false;

    let targetDir = null;
    let domain = null;
    let isDirectory = false;

    // Check if target is a directory on disk
    try {
      const resolved = path.resolve(target);
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        targetDir = resolved;
        isDirectory = true;
        domain = path.basename(resolved);
      }
    } catch (_) {}

    const pages = [];

    if (isDirectory) {
      // 1. Try reading manifest.json first if available
      const manifestPath = path.join(targetDir, 'manifest.json');
      let manifestLoaded = false;
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw);
        if (Array.isArray(manifest.pages) && manifest.pages.length > 0) {
          domain = manifest.domain || domain;
          for (const p of manifest.pages) {
            const relFile = p.file;
            const fullPath = path.join(targetDir, relFile);
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              pages.push({
                url: p.url,
                title: p.title || path.basename(relFile, '.md'),
                file: relFile,
                fullPath,
                date: p.date || null,
                author: p.author || null,
                category: p.category || null,
                wordCount: p.word_count || 0,
                description: p.description || null,
                content
              });
            } catch (_) {}
          }
          manifestLoaded = pages.length > 0;
        }
      } catch (_) {}

      // 2. If no manifest, recursively scan all markdown files in directory
      if (!manifestLoaded) {
        async function walk(currentDir) {
          const entries = await fs.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
            } else if (
              entry.isFile() && 
              entry.name.endsWith('.md') && 
              entry.name !== 'INDEX.md' && 
              !entry.name.endsWith('-complete.md')
            ) {
              try {
                const content = await fs.readFile(full, 'utf-8');
                let meta = {};
                const sidecarPath = full.replace(/\.md$/, '-metadata.json');
                try {
                  const sidecarRaw = await fs.readFile(sidecarPath, 'utf-8');
                  meta = JSON.parse(sidecarRaw);
                } catch (_) {}

                const relFile = path.relative(targetDir, full);
                pages.push({
                  url: meta.url || `file://${full}`,
                  title: meta.title || entry.name.replace('.md', ''),
                  file: relFile,
                  fullPath: full,
                  date: meta.date || null,
                  author: meta.author || null,
                  category: meta.category || null,
                  wordCount: meta.word_count || content.split(/\s+/).filter(Boolean).length,
                  description: meta.description || null,
                  content
                });
              } catch (_) {}
            }
          }
        }
        await walk(targetDir);
      }
    } else {
      // Target is a domain name string: Query SQLite database
      domain = target.replace(/^https?:\/\//i, '').split('/')[0].trim();
      const records = getScrapesByDomain(domain);
      const hostFolder = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
      targetDir = path.join(outputBaseDir, hostFolder);

      for (const rec of records) {
        if (rec.filename && rec.status === 'success') {
          const fullPath = path.isAbsolute(rec.filename)
            ? rec.filename
            : path.join(outputBaseDir, rec.filename);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            pages.push({
              url: rec.url,
              title: rec.title || path.basename(rec.filename, '.md'),
              file: rec.filename,
              fullPath,
              date: null,
              author: null,
              category: rec.category || null,
              wordCount: rec.word_count || 0,
              description: rec.description || null,
              content
            });
          } catch (_) {}
        }
      }
    }

    if (pages.length === 0) {
      throw new Error(`No markdown pages found to merge for "${target}".`);
    }

    // Sort pages according to requested order
    if (order === 'chronological') {
      pages.sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return a.title.localeCompare(b.title);
      });
    } else if (order === 'alphabetical') {
      pages.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      // Default: hierarchy (index files first, then path hierarchy)
      pages.sort((a, b) => {
        const aDir = path.dirname(a.file || '');
        const bDir = path.dirname(b.file || '');
        if (aDir !== bDir) return aDir.localeCompare(bDir);
        const aIsIdx = (a.file || '').endsWith('index.md');
        const bIsIdx = (b.file || '').endsWith('index.md');
        if (aIsIdx && !bIsIdx) return -1;
        if (!aIsIdx && bIsIdx) return 1;
        return a.title.localeCompare(b.title);
      });
    }

    const docTitle = options.title || `Complete Archive: ${domain}`;
    const cleanDomain = (domain || 'scrapi').replace(/[^a-zA-Z0-9.-]/g, '_');
    const destination = options.destination
      ? path.resolve(options.destination)
      : path.join(targetDir || outputBaseDir, `${cleanDomain}-complete.md`);

    await fs.mkdir(path.dirname(destination), { recursive: true });

    let totalWords = 0;
    const chapterEntries = [];

    // Assign chapter numbers and anchors
    pages.forEach((page, idx) => {
      const chapterNum = idx + 1;
      const cleanTitle = (page.title || `Document ${chapterNum}`).replace(/[\[\]]/g, '');
      const headingText = `Chapter ${chapterNum}: ${cleanTitle}`;
      const anchor = DocumentMerger.slugifyAnchor(headingText);
      const words = page.wordCount || page.content.split(/\s+/).filter(Boolean).length;
      totalWords += words;

      chapterEntries.push({
        num: chapterNum,
        title: cleanTitle,
        headingText,
        anchor,
        words,
        page
      });
    });

    // Build Master Document
    let md = '';
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

    md += `# 📖 ${docTitle}\n\n`;
    md += `> **Origin:** [${domain}](https://${domain})  \n`;
    md += `> **Total Chapters:** \`${chapterEntries.length}\`  \n`;
    md += `> **Total Word Count:** \`~${totalWords.toLocaleString()} words\`  \n`;
    md += `> **Ordering:** \`${order.toUpperCase()}\`  \n`;
    md += `> **Compiled On:** \`${nowIso} UTC\` by **Scrapi v2.0**\n\n`;

    // Table of Contents
    if (includeToc) {
      md += `---\n\n`;
      md += `## 📑 Table of Contents\n\n`;
      for (const entry of chapterEntries) {
        const datePart = entry.page.date ? ` — 🗓️ \`${entry.page.date}\`` : '';
        md += `${entry.num}. [${entry.title}](#${entry.anchor}) *(~${entry.words.toLocaleString()} words)*${datePart}\n`;
      }
      md += `\n---\n\n`;
    }

    // Chapters
    for (const entry of chapterEntries) {
      md += `## ${entry.headingText}\n\n`;
      md += `> 🔗 **Source URL:** [${entry.page.url}](${entry.page.url})  \n`;
      if (entry.page.file) {
        md += `> 📁 **File:** \`${entry.page.file}\`  \n`;
      }
      if (entry.page.date) {
        md += `> 🗓️ **Published Date:** \`${entry.page.date}\`  \n`;
      }
      if (entry.page.author) {
        md += `> ✍️ **Author:** ${entry.page.author}  \n`;
      }
      md += `> 📊 **Word Count:** ~${entry.words.toLocaleString()} words  \n\n`;

      let body = DocumentMerger.stripFrontmatter(entry.page.content);
      // Remove any redundant leading # title if it matches chapter title
      const lines = body.split('\n');
      if (lines.length > 0 && lines[0].startsWith('# ')) {
        lines.shift();
        body = lines.join('\n').trimStart();
      }

      if (shouldDemoteHeadings) {
        body = DocumentMerger.demoteHeadings(body);
      }

      md += `${body.trim()}\n\n`;
      md += `---\n\n`;
    }

    md += `*End of Document. Compiled by [Scrapi](https://github.com/Akhand6886/Scrapi).*  \n`;

    await fs.writeFile(destination, md, 'utf-8');

    return {
      destination,
      chapterCount: chapterEntries.length,
      totalWords,
      title: docTitle
    };
  }
}
