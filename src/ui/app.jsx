const { useState, useEffect, useRef } = React;

// Helper function to safely fetch JSON and validate content-type and ok status
async function safeFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    if (isJson) {
      try {
        const data = await res.json();
        errorMsg = data.error || errorMsg;
      } catch (e) {}
    } else {
      try {
        const text = await res.text();
        errorMsg = text.substring(0, 120) || errorMsg;
      } catch (e) {}
    }
    throw new Error(errorMsg);
  }

  if (!isJson) {
    throw new Error(`Expected JSON but got content-type "${contentType}"`);
  }

  return res.json();
}

function App() {
  // Inputs & Core State
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selector, setSelector] = useState('');
  const [activeSignature, setActiveSignature] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [includeImages, setIncludeImages] = useState(false);
  const [downloadMedia, setDownloadMedia] = useState(false);
  const [noMeta, setNoMeta] = useState(false);
  const [renderMode, setRenderMode] = useState('auto'); // 'auto' | 'static' | 'dynamic' | 'stealth'
  const [lastDecision, setLastDecision] = useState(null);

  // Console Mode ('single' | 'topic' | 'batch' | 'spider')
  const [consoleMode, setConsoleMode] = useState('single');

  // Spider State & Checkpoints
  const [spiderActive, setSpiderActive] = useState(false);
  const [spiderStats, setSpiderStats] = useState({ visited: 0, queued: 0, succeeded: 0, failed: 0 });
  const [spiderLogs, setSpiderLogs] = useState([]);
  const [spiderPages, setSpiderPages] = useState([]);
  const [spiderDepth, setSpiderDepth] = useState('Infinity');
  const [spiderMaxPages, setSpiderMaxPages] = useState(100);
  const [spiderConcurrency, setSpiderConcurrency] = useState(2);
  const [spiderDelay, setSpiderDelay] = useState(1500);
  const [checkpoints, setCheckpoints] = useState([]);

  // Batch Scraping State
  const [discoveredUrls, setDiscoveredUrls] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchConcurrency, setBatchConcurrency] = useState(2);
  const [batchDelay, setBatchDelay] = useState(1500);
  const [discoveredCategories, setDiscoveredCategories] = useState([]);
  const [discoveringCategories, setDiscoveringCategories] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // Exhaustive Topic Crawl State
  const [topicInput, setTopicInput] = useState('');
  const [topicActive, setTopicActive] = useState(false);
  const [topicStats, setTopicStats] = useState({ visited: 0, queued: 0, succeeded: 0, failed: 0, skippedExisting: 0 });
  const [topicDateCoverage, setTopicDateCoverage] = useState({ earliestDate: null, latestDate: null, byYear: {} });
  const [topicLogs, setTopicLogs] = useState([]);
  const [topicPages, setTopicPages] = useState([]);
  const [topicConcurrency, setTopicConcurrency] = useState(2);
  const [topicDelay, setTopicDelay] = useState(1000);
  const [topicSitemap, setTopicSitemap] = useState(true);

  // Active Tab ('iframe' | 'markdown' | 'query' | 'adaptive' | 'entities')
  const [activeTab, setActiveTab] = useState('iframe');
  const [iframeUrl, setIframeUrl] = useState('');
  const [markdownOutput, setMarkdownOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [confirmKill, setConfirmKill] = useState(false);

  // REPL / Query Tester State
  const [queryType, setQueryType] = useState('css'); // 'css' | 'xpath' | 'regex'
  const [queryInput, setQueryInput] = useState('');
  const [queryResults, setQueryResults] = useState(null);
  const [queryRunning, setQueryRunning] = useState(false);

  // Adaptive Self-Healing Studio State
  const [fingerprints, setFingerprints] = useState([]);
  const [adaptiveResult, setAdaptiveResult] = useState(null);
  const [testingAdaptive, setTestingAdaptive] = useState(false);

  // MCP Info Modal State
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpInfo, setMcpInfo] = useState(null);
  const [mcpClient, setMcpClient] = useState('claude'); // 'claude' | 'cursor' | 'antigravity'

  // Entities & Online Bandit State
  const [entitiesData, setEntitiesData] = useState(null);
  const [banditStats, setBanditStats] = useState([]);
  const [miningEntities, setMiningEntities] = useState(false);

  // Export State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Loaded data lists
  const [profiles, setProfiles] = useState([]);
  const [history, setHistory] = useState([]);

  const iframeRef = useRef(null);

  const showToast = (text, type = 'info') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4500);
  };

  // Load initial data
  const loadData = async (catFilter = categoryFilter) => {
    try {
      const urlParams = catFilter ? `?category=${encodeURIComponent(catFilter)}` : '';
      const [profData, histData, cpData, fpData] = await Promise.all([
        safeFetchJson('/api/profiles'),
        safeFetchJson(`/api/scrapes${urlParams}`),
        safeFetchJson('/api/spider/checkpoints'),
        safeFetchJson('/api/fingerprints')
      ]);
      setProfiles(profData);
      setHistory(histData);
      setCheckpoints(cpData.checkpoints || []);
      setFingerprints(fpData.fingerprints || []);
    } catch (err) {
      console.error("Failed to fetch initial data", err);
    }
  };

  // Load MCP server details
  const loadMcpInfo = async () => {
    try {
      const data = await safeFetchJson('/api/mcp/info');
      setMcpInfo(data);
    } catch (e) {}
  };

  const handleMineEntities = async () => {
    if (!url) {
      showToast('Please enter a target URL first', 'error');
      return;
    }
    setMiningEntities(true);
    try {
      const data = await safeFetchJson('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fetcher: renderMode, limit: 50 })
      });
      setEntitiesData(data);
      const bStats = await safeFetchJson('/api/bandit');
      setBanditStats(bStats || []);
      showToast(`Discovered ${data.entities?.length || 0} entities (${data.detectedType?.toUpperCase() || 'LIST'})`, 'success');
    } catch (err) {
      showToast(`Entity mining failed: ${err.message}`, 'error');
    } finally {
      setMiningEntities(false);
    }
  };

  useEffect(() => {
    loadData();
    loadMcpInfo();

    // Check active spider status on boot
    safeFetchJson('/api/spider')
      .then(data => {
        if (data.running) {
          setSpiderActive(true);
          setSpiderStats(data.stats || { visited: 0, queued: 0, succeeded: 0, failed: 0 });
          setSpiderLogs(data.logs || []);
          setSpiderPages(data.pages || []);
        }
      }).catch(err => {});

    // Check active topic crawl status on boot
    safeFetchJson('/api/topic/status')
      .then(data => {
        if (data.running) {
          setTopicActive(true);
          setTopicStats(data.stats || { visited: 0, queued: 0, succeeded: 0, failed: 0, skippedExisting: 0 });
          setTopicDateCoverage(data.dateCoverage || { earliestDate: null, latestDate: null, byYear: {} });
          setTopicLogs(data.logs || []);
          setTopicPages(data.pages || []);
          if (data.topic) setTopicInput(data.topic);
          setConsoleMode('topic');
        }
      }).catch(err => {});

    // Listen for element clicks inside proxy iframe
    const handleIframeMessage = (event) => {
      if (event.data) {
        if (event.data.type === 'ELEMENT_SELECTED') {
          const { selector: sel, tagName, textSnippet, classes, parentTagName } = event.data;
          setSelector(sel);
          setActiveSignature({
            content: sel,
            tagName,
            textSnippet,
            classes,
            parentTagName
          });
          showToast(`Selected <${tagName}>: "${(textSnippet || '').substring(0, 30)}..."`, 'success');
        } else if (event.data.type === 'NAVIGATE_TO_URL') {
          const targetUrl = event.data.url;
          setUrl(targetUrl);
          setIframeUrl(`/api/proxy?url=${encodeURIComponent(targetUrl)}&mode=${renderMode}`);
          setLoading(true);
          showToast(`Navigating to ${targetUrl}...`, 'info');
        }
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowHelpModal(false);
        setShowMcpModal(false);
        setShowExportMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      }
    };

    window.addEventListener('message', handleIframeMessage);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Spider status polling
  useEffect(() => {
    let timer = null;
    if (spiderActive) {
      timer = setInterval(async () => {
        try {
          const data = await safeFetchJson('/api/spider');
          setSpiderStats(data.stats || { visited: 0, queued: 0, succeeded: 0, failed: 0 });
          setSpiderLogs(data.logs || []);
          setSpiderPages(data.pages || []);
          if (!data.running) {
            setSpiderActive(false);
            showToast('Spider crawl completed!', 'success');
            loadData();
          }
        } catch (err) {}
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [spiderActive]);

  // Topic crawl status polling
  useEffect(() => {
    let timer = null;
    if (topicActive) {
      timer = setInterval(async () => {
        try {
          const data = await safeFetchJson('/api/topic/status');
          setTopicStats(data.stats || { visited: 0, queued: 0, succeeded: 0, failed: 0, skippedExisting: 0 });
          setTopicDateCoverage(data.dateCoverage || { earliestDate: null, latestDate: null, byYear: {} });
          setTopicLogs(data.logs || []);
          setTopicPages(data.pages || []);
          if (!data.running) {
            setTopicActive(false);
            showToast('Exhaustive topic crawl completed!', 'success');
            loadData();
          }
        } catch (err) {}
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [topicActive]);

  // Load Proxy Page
  const handleLoadProxy = () => {
    if (!url) {
      showToast('Please enter a target URL first.', 'error');
      return;
    }
    setLoading(true);
    setActiveTab('iframe');
    setIframeUrl(`/api/proxy?url=${encodeURIComponent(url)}&mode=${renderMode}`);
  };

  // Run On-Demand Scrape
  const handleScrape = async () => {
    if (!url) {
      showToast('Please enter a target URL first.', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await safeFetchJson('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          selector: selector || 'auto',
          images: includeImages,
          downloadMedia,
          noMeta,
          category: category.trim() || null,
          fetcher: renderMode
        })
      });

      setMarkdownOutput(data.markdown);
      if (data.decisionTree) {
        setLastDecision(data.decisionTree);
      }
      setActiveTab('markdown');
      showToast(`Scraped successfully via ${renderMode.toUpperCase()}! Saved to ${data.filename}`, 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Start Site Spider
  const handleStartSpider = async (resumeJobId = null) => {
    if (!url && !resumeJobId) {
      showToast('Please enter a target seed URL first.', 'error');
      return;
    }
    setSpiderActive(true);
    setSpiderLogs(['[System] Initializing Spider...']);
    setSpiderPages([]);

    try {
      const targetUrl = resumeJobId ? (checkpoints.find(c => c.job_id === resumeJobId)?.seed_url || url) : url;
      await safeFetchJson('/api/spider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          depth: spiderDepth === 'Infinity' ? 'Infinity' : parseInt(spiderDepth, 10),
          maxPages: parseInt(spiderMaxPages, 10),
          concurrency: parseInt(spiderConcurrency, 10),
          delay: parseInt(spiderDelay, 10),
          category: category.trim() || null,
          downloadMedia,
          fetcher: renderMode,
          jobId: resumeJobId || undefined,
          resume: !!resumeJobId
        })
      });
      showToast(resumeJobId ? `Resumed crawl for job ${resumeJobId}!` : 'Spider crawl started!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      setSpiderActive(false);
    }
  };

  // Pause & Save Spider Checkpoint
  const handlePauseSpider = async () => {
    try {
      await safeFetchJson('/api/spider/pause', { method: 'POST' });
      showToast('Pause signal dispatched. Checkpoint is being saved...', 'info');
      setTimeout(loadData, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cancel Running Spider
  const handleCancelSpider = async () => {
    try {
      await safeFetchJson('/api/spider/cancel', { method: 'POST' });
      showToast('Crawl cancellation signal sent.', 'info');
      setTimeout(loadData, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Discover Topics / Categories on Website
  const handleDiscoverTopics = async () => {
    if (!url) {
      showToast('Please enter a target website URL first.', 'error');
      return;
    }
    setDiscoveringCategories(true);
    try {
      const data = await safeFetchJson('/api/topic/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      setDiscoveredCategories(data.categories || []);
      if (data.categories && data.categories.length > 0) {
        showToast(`Discovered ${data.categories.length} categories on site!`, 'success');
        if (!topicInput) {
          setTopicInput(data.categories[0].name);
        }
      } else {
        showToast('No standard categories detected. Enter topic name manually.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDiscoveringCategories(false);
    }
  };

  // Start Exhaustive Topic Crawl
  const handleStartTopicCrawl = async (resumeJobId = null) => {
    if (!url && !resumeJobId) {
      showToast('Please enter target website URL first.', 'error');
      return;
    }
    if (!topicInput && !resumeJobId) {
      showToast('Please enter a topic or category name first.', 'error');
      return;
    }

    setTopicActive(true);
    setTopicLogs(['[System] Initializing Exhaustive Topic Crawler...']);
    setTopicPages([]);

    try {
      await safeFetchJson('/api/topic/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          topic: topicInput,
          concurrency: parseInt(topicConcurrency, 10),
          delay: parseInt(topicDelay, 10),
          sitemap: topicSitemap,
          fetcher: renderMode,
          resume: !!resumeJobId
        })
      });
      showToast(`Exhaustive topic crawl launched for [${topicInput}]!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
      setTopicActive(false);
    }
  };

  // Pause & Save Topic Crawl Checkpoint
  const handlePauseTopicCrawl = async () => {
    try {
      await safeFetchJson('/api/topic/pause', { method: 'POST' });
      showToast('Pause signal dispatched. Checkpoint state being saved...', 'info');
      setTimeout(loadData, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cancel Running Topic Crawl
  const handleCancelTopicCrawl = async () => {
    try {
      await safeFetchJson('/api/topic/cancel', { method: 'POST' });
      showToast('Topic crawl cancellation dispatched.', 'info');
      setTimeout(loadData, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Spider Checkpoint
  const handleDeleteCheckpoint = async (jobId) => {
    try {
      await safeFetchJson(`/api/spider/checkpoints/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      showToast(`Checkpoint [${jobId}] deleted.`, 'info');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Live Query / REPL Execution
  const handleRunQuery = async () => {
    if (!url) {
      showToast('Please enter a target URL first.', 'error');
      return;
    }
    if (!queryInput) {
      showToast('Please enter a query expression first.', 'error');
      return;
    }

    setQueryRunning(true);
    try {
      const payload = { url, mode: renderMode };
      if (queryType === 'css') payload.css = queryInput;
      else if (queryType === 'xpath') payload.xpath = queryInput;
      else if (queryType === 'regex') payload.regex = queryInput;

      const data = await safeFetchJson('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setQueryResults(data);
      showToast(`Found ${data.count} matches in ${data.elapsed}ms!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setQueryRunning(false);
    }
  };

  // Test Adaptive Self-Healing
  const handleTestAdaptive = async (sig = activeSignature) => {
    if (!url) {
      showToast('Please enter a target URL first.', 'error');
      return;
    }
    if (!sig) {
      showToast('No element fingerprint selected. Click an element in Target Preview first.', 'error');
      return;
    }

    setTestingAdaptive(true);
    try {
      const data = await safeFetchJson('/api/adaptive/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          signature: sig,
          mode: renderMode
        })
      });
      setAdaptiveResult(data);
      if (data.found) {
        showToast(`Self-healing match found with ${(data.confidence * 100).toFixed(1)}% confidence!`, 'success');
      } else {
        showToast('Target element could not be reliably relocated.', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTestingAdaptive(false);
    }
  };

  // Discover Links for Batch Scraping
  const handleDiscoverLinks = async () => {
    if (!url || !selector) {
      showToast('Target URL and Link Selector are required.', 'error');
      return;
    }
    setDiscovering(true);
    setDiscoveredUrls([]);
    try {
      const data = await safeFetchJson('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, selector, mode: renderMode })
      });
      setDiscoveredUrls(data.urls || []);
      showToast(`Discovered ${data.urls ? data.urls.length : 0} links!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDiscovering(false);
    }
  };

  // Live Batch Scraping
  const handleStartBatchScrape = async () => {
    if (discoveredUrls.length === 0) return;
    const total = discoveredUrls.length;
    setBatchProgress({ active: true, current: 0, total, succeeded: 0, failed: 0 });
    setLoading(true);

    const urlsQueue = [...discoveredUrls];
    let currentIdx = 0;
    let succeeded = 0;
    let failed = 0;
    const concurrencyVal = Math.max(1, parseInt(batchConcurrency, 10) || 2);
    const delayVal = Math.max(0, parseInt(batchDelay, 10) || 0);

    const runWorker = async () => {
      while (urlsQueue.length > 0) {
        const targetUrl = urlsQueue.shift();
        currentIdx++;
        setBatchProgress(prev => ({ ...prev, current: currentIdx }));

        try {
          await safeFetchJson('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: targetUrl,
              selector: 'auto',
              images: includeImages,
              downloadMedia,
              noMeta,
              category: category.trim() || null,
              fetcher: renderMode
            })
          });
          succeeded++;
          setBatchProgress(prev => ({ ...prev, succeeded }));
        } catch (err) {
          failed++;
          setBatchProgress(prev => ({ ...prev, failed }));
        }

        if (urlsQueue.length > 0 && delayVal > 0) {
          await new Promise(res => setTimeout(res, delayVal));
        }
      }
    };

    try {
      const workers = Array.from({ length: concurrencyVal }, () => runWorker());
      await Promise.all(workers);
      showToast(`Batch completed: ${succeeded} ok, ${failed} failed.`, 'success');
      loadData();
    } catch (e) {
      showToast('Batch completed with errors.', 'error');
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  // Save Profile
  const handleSaveProfile = async () => {
    if (!url || !profileName || !selector) {
      showToast('URL, Profile Name, and Selector are required.', 'error');
      return;
    }
    const finalSignature = activeSignature && activeSignature.content === selector ? activeSignature : {
      content: selector,
      tagName: '*',
      textSnippet: '',
      classes: [],
      parentTagName: null
    };

    try {
      await safeFetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          urlPattern: url,
          selectors: finalSignature
        })
      });
      showToast(`Profile "${profileName}" saved!`, 'success');
      setProfileName('');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleApplyProfile = (prof) => {
    setUrl(prof.url_pattern);
    if (prof.selectors) {
      if (typeof prof.selectors === 'object') {
        setSelector(prof.selectors.content || 'auto');
        setActiveSignature(prof.selectors);
      } else {
        setSelector(prof.selectors);
        setActiveSignature({ content: prof.selectors });
      }
    }
    showToast(`Profile "${prof.name}" applied!`, 'success');
  };

  // View Past Scrape
  const handleViewScrape = async (scrape) => {
    setLoading(true);
    try {
      const data = await safeFetchJson(`/api/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrape.url, selector: scrape.selector })
      });
      setMarkdownOutput(data.markdown);
      setActiveTab('markdown');
      setUrl(scrape.url);
      setSelector(scrape.selector || 'auto');
      showToast(`Loaded Scrape #${scrape.id}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (e, id, name) => {
    e.stopPropagation();
    try {
      await safeFetchJson(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast(`Profile "${name}" deleted`, 'info');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteScrape = async (e, id) => {
    e.stopPropagation();
    try {
      await safeFetchJson(`/api/scrapes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast(`Scrape #${id} deleted`, 'info');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCopyMarkdown = () => {
    if (!markdownOutput) return;
    navigator.clipboard.writeText(markdownOutput);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
    showToast('Markdown copied to clipboard!', 'success');
  };

  const handleDownloadMarkdown = () => {
    if (!markdownOutput) return;
    const blob = new Blob([markdownOutput], { type: 'text/markdown' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `scrapi-extract-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(u);
    showToast('Markdown downloaded as .md file!', 'success');
  };

  const handleKillServer = async () => {
    if (!confirmKill) {
      setConfirmKill(true);
      setTimeout(() => setConfirmKill(false), 3000);
      return;
    }
    showToast('Terminating server...', 'error');
    try { await fetch('/api/kill', { method: 'POST' }); } catch (e) {}
    setTimeout(() => {
      document.body.innerHTML = `
        <div class="h-screen w-screen flex flex-col items-center justify-center ambient-bg text-white font-sans p-6 text-center">
          <div class="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-4xl mb-6 shadow-2xl shadow-red-500/20 animate-pulse">
            🛑
          </div>
          <h1 class="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-300 mb-3">
            Scrapi Server Stopped
          </h1>
          <p class="text-slate-400 max-w-md text-sm leading-relaxed">
            The local Node.js server process was safely terminated. You can restart it from terminal anytime using <code class="px-2 py-1 bg-dark-950 rounded border border-white/10 font-mono text-xs text-rose-300">node src/cli.js serve</code>.
          </p>
        </div>
      `;
    }, 800);
  };

  return (
    <div class="flex-1 flex flex-col h-full overflow-hidden text-slate-100 font-sans selection:bg-brand-500/30 selection:text-white">
      {/* Top Header */}
      <header class="glass h-16 flex items-center justify-between px-6 border-b border-white/[0.08] shrink-0 z-30 shadow-lg">
        <div class="flex items-center space-x-3.5">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-brand-500 to-teal-400 p-[1px] shadow-lg shadow-brand-500/20">
            <div class="w-full h-full bg-dark-950 rounded-[11px] flex items-center justify-center text-xl">
              <span class="animate-pulse-slow">🕷️</span>
            </div>
          </div>
          <div>
            <div class="flex items-center space-x-2.5">
              <span class="font-display font-extrabold text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400 drop-shadow-sm">
                SCRAPI
              </span>
              <span class="px-2 py-0.5 bg-brand-500/10 text-brand-400 text-[10px] rounded-full border border-brand-500/30 font-bold font-mono tracking-wide shadow-sm">
                v2.0 ADAPTIVE
              </span>
              <span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1.5"></span>
                ONLINE
              </span>
            </div>
            <div class="text-[11px] text-slate-400 hidden sm:block font-medium">Multi-Tier Evasion • Adaptive Self-Healing • Dual-Frontier Spider</div>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          {/* Shortcuts & Guide Button */}
          <button
            onClick={() => setShowHelpModal(true)}
            class="btn-lux px-3 py-1.5 btn-ghost-lux rounded-xl text-xs font-semibold flex items-center space-x-1.5"
            title="View Console Shortcuts & Navigation (Cmd/Ctrl + K)"
          >
            <span>⌨️</span>
            <span class="hidden md:inline">Shortcuts</span>
            <span class="hidden lg:inline text-[9px] font-mono px-1 py-0.5 rounded bg-white/10 text-slate-400">⌘K</span>
          </button>

          {/* MCP AI Connect Button */}
          <button
            onClick={() => setShowMcpModal(true)}
            class="btn-lux px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/15"
            title="Model Context Protocol for Claude / Cursor AI Integration"
          >
            <span>🤖</span>
            <span>MCP Connect</span>
            <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          {/* Export Scrapes Dropdown */}
          <div class="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              class="btn-lux px-3.5 py-1.5 btn-ghost-lux rounded-xl text-xs font-semibold flex items-center space-x-1.5"
            >
              <span>📥 Export</span>
              <span class="text-[9px] text-slate-400">▼</span>
            </button>
            {showExportMenu && (
              <div class="absolute right-0 mt-2 w-48 glass-card rounded-2xl shadow-2xl py-1.5 z-50 animate-fade-in border border-white/10">
                <div class="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-white/5 mb-1">
                  Download Database
                </div>
                <a
                  href="/api/export?format=jsonl"
                  download
                  onClick={() => setShowExportMenu(false)}
                  class="flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:bg-brand-600/20 hover:text-brand-300 transition-colors"
                >
                  <span>📄</span>
                  <span>JSON Lines (.jsonl)</span>
                </a>
                <a
                  href="/api/export?format=csv"
                  download
                  onClick={() => setShowExportMenu(false)}
                  class="flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:bg-brand-600/20 hover:text-brand-300 transition-colors"
                >
                  <span>📊</span>
                  <span>Spreadsheet (.csv)</span>
                </a>
                <a
                  href="/api/export?format=json"
                  download
                  onClick={() => setShowExportMenu(false)}
                  class="flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:bg-brand-600/20 hover:text-brand-300 transition-colors"
                >
                  <span>🗄️</span>
                  <span>Raw JSON (.json)</span>
                </a>
              </div>
            )}
          </div>

          {/* Kill Program Button */}
          <button 
            onClick={handleKillServer}
            class={`btn-lux px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              confirmKill 
                ? 'btn-amber-gradient font-bold' 
                : 'btn-danger-gradient'
            }`}
            title="Terminate local backend server"
          >
            <span>🛑</span>
            <span class="ml-1.5">{confirmKill ? 'Confirm Shutdown' : 'Shutdown'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main class="flex-1 flex overflow-hidden">
        {/* Left Control Sidebar */}
        <section class="w-[420px] flex flex-col border-r border-white/[0.08] glass overflow-y-auto custom-scrollbar p-5 space-y-5 shrink-0 z-10">
          
          {/* Console Mode Switcher */}
          <div class="space-y-2 shrink-0">
            <div class="flex justify-between items-center px-1">
              <label class="text-[11px] text-slate-400 uppercase tracking-wider font-display font-bold">Console Mode</label>
              <span class="text-[10px] text-brand-400 font-mono">Workflow Target</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5 bg-dark-950/90 rounded-2xl p-1.5 border border-white/[0.08] shadow-inner">
              <button
                onClick={() => setConsoleMode('single')}
                class={`btn-lux py-2 text-xs font-bold rounded-xl transition-all ${
                  consoleMode === 'single' 
                    ? 'btn-primary-gradient shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>🕷️ Single</span>
              </button>
              <button
                onClick={() => setConsoleMode('topic')}
                class={`btn-lux py-2 text-xs font-bold rounded-xl transition-all ${
                  consoleMode === 'topic' 
                    ? 'btn-emerald-gradient shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>🏷️ Topic</span>
              </button>
              <button
                onClick={() => setConsoleMode('batch')}
                class={`btn-lux py-2 text-xs font-bold rounded-xl transition-all ${
                  consoleMode === 'batch' 
                    ? 'btn-primary-gradient shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>⚡ Batch</span>
              </button>
              <button
                onClick={() => setConsoleMode('spider')}
                class={`btn-lux py-2 text-xs font-bold rounded-xl transition-all ${
                  consoleMode === 'spider' 
                    ? 'btn-purple-gradient shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>🕸️ Spider</span>
              </button>
            </div>
          </div>

          {/* Progressive Multi-Tier Fetcher Selector */}
          <div class="space-y-2.5 glass-card p-4 rounded-2xl border border-white/[0.08]">
            <div class="flex justify-between items-center">
              <label class="text-[11px] text-slate-300 uppercase tracking-wider font-display font-bold flex items-center space-x-1.5">
                <span>⚡</span>
                <span>Fetcher Tier</span>
              </label>
              <span class={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono border ${
                renderMode === 'auto' ? 'text-amber-300 bg-amber-500/15 border-amber-500/40 shadow-sm shadow-amber-500/20' :
                renderMode === 'static' ? 'text-blue-300 bg-blue-500/15 border-blue-500/40 shadow-sm shadow-blue-500/20' :
                renderMode === 'dynamic' ? 'text-teal-300 bg-teal-500/15 border-teal-500/40 shadow-sm shadow-teal-500/20' :
                'text-purple-300 bg-purple-500/15 border-purple-500/40 shadow-sm shadow-purple-500/20'
              }`}>
                {renderMode === 'auto' ? '🤖 DECISION TREE' : renderMode === 'stealth' ? '🛡️ ANTI-BOT BYPASS' : renderMode === 'dynamic' ? '🌐 PLAYWRIGHT SPA' : '⚡ 304 CACHED'}
              </span>
            </div>
            
            <div class="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => setRenderMode('auto')}
                class={`btn-lux py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                  renderMode === 'auto' 
                    ? 'btn-amber-gradient shadow-md' 
                    : 'bg-dark-950/80 border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                }`}
                title="AI Decision Tree: Auto-routes in <20µs to Static, Dynamic, or Stealth based on DOM/HTTP signals"
              >
                <span>🤖 Auto</span>
              </button>
              <button
                onClick={() => setRenderMode('static')}
                class={`btn-lux py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                  renderMode === 'static' 
                    ? 'btn-primary-gradient shadow-md' 
                    : 'bg-dark-950/80 border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                }`}
                title="Ultra-fast connection pooling, TLS headers, and HTTP 304 caching"
              >
                <span>⚡ Static</span>
              </button>
              <button
                onClick={() => setRenderMode('dynamic')}
                class={`btn-lux py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                  renderMode === 'dynamic' 
                    ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-teal-400 shadow-md shadow-teal-600/30' 
                    : 'bg-dark-950/80 border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                }`}
                title="Playwright headless browser for dynamic JavaScript single-page apps"
              >
                <span>🌐 Dynamic</span>
              </button>
              <button
                onClick={() => setRenderMode('stealth')}
                class={`btn-lux py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                  renderMode === 'stealth' 
                    ? 'btn-purple-gradient shadow-md' 
                    : 'bg-dark-950/80 border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                }`}
                title="Anti-bot evasion: Cloudflare Turnstile bypass, navigator mask, canvas noise"
              >
                <span>🛡️ Stealth</span>
              </button>
            </div>
            <div class="text-[11px] text-slate-400 pt-0.5 leading-relaxed bg-dark-950/40 p-2.5 rounded-xl border border-white/[0.04]">
              {renderMode === 'auto' && 'Autonomous CART Decision Tree. Evaluates HTTP headers, Turnstile challenges & SPA markers in <20µs.'}
              {renderMode === 'static' && 'High-speed HTTP Keep-Alive client with automatic Brotli/Gzip decompression and ETag 304 caching.'}
              {renderMode === 'dynamic' && 'Chromium headless browser via Playwright for JavaScript SPAs (React, Vue, Next.js).'}
              {renderMode === 'stealth' && 'Anti-bot evasion suite: strips webdriver flags, spoofs WebGL noise, solves Cloudflare Turnstile.'}
            </div>
          </div>

          {/* Mode 1: Single Page Scrape */}
          {consoleMode === 'single' && (
            <div class="space-y-4 animate-fade-in">
              <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                  <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>🎯</span>
                    <span>Target URL</span>
                  </label>
                  <div class="flex items-center space-x-2 text-[10px]">
                    <button onClick={() => setUrl('https://news.ycombinator.com')} class="text-brand-400 hover:underline">HN</button>
                    <span class="text-slate-600">•</span>
                    <button onClick={() => setUrl('https://quotes.toscrape.com')} class="text-brand-400 hover:underline">Quotes</button>
                  </div>
                </div>
                <input 
                  type="url" 
                  placeholder="https://example.com/article" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none"
                />
              </div>

              <div class="space-y-1.5">
                <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                  <span>🏷️</span>
                  <span>Category Tag</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. articles, tech, research (optional)" 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-2.5 pt-1">
                <button 
                  onClick={handleLoadProxy} 
                  disabled={loading}
                  class="btn-lux btn-primary-gradient py-2.5 px-3 text-xs font-bold rounded-xl space-x-2"
                >
                  <span>🌐</span>
                  <span>Proxy Target</span>
                </button>
                <button 
                  onClick={handleScrape} 
                  disabled={loading}
                  class="btn-lux btn-emerald-gradient py-2.5 px-3 text-xs font-bold rounded-xl space-x-2"
                >
                  <span>⚡</span>
                  <span>Scrape Now</span>
                </button>
              </div>

              {/* Selector & Fingerprint Section */}
              <div class="space-y-3 pt-3 border-t border-white/[0.08]">
                <div class="flex justify-between items-center">
                  <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>🔍</span>
                    <span>CSS Selector</span>
                  </label>
                  {activeSignature && (
                    <span class="text-[9px] text-teal-300 font-bold uppercase bg-teal-500/15 px-2 py-0.5 rounded-full border border-teal-500/30">
                      Anchor Fingerprint Active
                    </span>
                  )}
                </div>
                <div class="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="auto (smart content root)" 
                    value={selector} 
                    onChange={e => setSelector(e.target.value)}
                    class="glass-input flex-1 px-3 py-2 rounded-xl text-xs text-emerald-400 font-mono focus:outline-none"
                  />
                  <button 
                    onClick={() => { setSelector(''); setActiveSignature(null); }}
                    class="btn-lux btn-ghost-lux px-3 rounded-xl text-slate-400 hover:text-white"
                    title="Clear Selector"
                  >
                    ✕
                  </button>
                </div>

                {/* Captured Fingerprint preview */}
                {activeSignature && (
                  <div class="p-3 bg-dark-950/80 border border-teal-500/30 rounded-xl space-y-1.5 text-[10px] font-mono shadow-sm">
                    <div class="flex justify-between text-teal-300 font-bold">
                      <span>🎯 DOM Anchor</span>
                      <span>&lt;{activeSignature.tagName}&gt;</span>
                    </div>
                    {activeSignature.classes && activeSignature.classes.length > 0 && (
                      <div class="text-slate-400 truncate">Classes: {activeSignature.classes.join(', ')}</div>
                    )}
                    {activeSignature.textSnippet && (
                      <div class="text-slate-300 italic truncate">"{activeSignature.textSnippet}"</div>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab('adaptive');
                        handleTestAdaptive(activeSignature);
                      }}
                      class="btn-lux w-full mt-1.5 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 rounded-lg text-[10px] font-semibold"
                    >
                      Test Self-Healing in Studio →
                    </button>
                  </div>
                )}

                <div class="space-y-1.5">
                  <label class="text-xs text-slate-300 font-semibold">Save Scraper Profile</label>
                  <div class="flex space-x-2">
                    <input 
                      type="text" 
                      placeholder="Profile Name (e.g. Tech-Articles)" 
                      value={profileName} 
                      onChange={e => setProfileName(e.target.value)}
                      class="glass-input flex-1 px-3 py-2 rounded-xl text-xs text-slate-200 focus:outline-none"
                    />
                    <button 
                      onClick={handleSaveProfile}
                      class="btn-lux btn-primary-gradient px-4 py-2 text-xs font-bold rounded-xl"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <label class="flex items-center text-slate-300 cursor-pointer bg-dark-950/60 p-2 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={includeImages} 
                      onChange={e => setIncludeImages(e.target.checked)}
                      class="rounded bg-dark-900 border-white/20 text-brand-500 mr-2 accent-brand-500"
                    />
                    <span>Alt-Text</span>
                  </label>
                  <label class="flex items-center text-slate-300 cursor-pointer bg-dark-950/60 p-2 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={downloadMedia} 
                      onChange={e => setDownloadMedia(e.target.checked)}
                      class="rounded bg-dark-900 border-white/20 text-brand-500 mr-2 accent-brand-500"
                    />
                    <span>Save Media</span>
                  </label>
                  <label class="flex items-center text-slate-300 cursor-pointer bg-dark-950/60 p-2 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={noMeta} 
                      onChange={e => setNoMeta(e.target.checked)}
                      class="rounded bg-dark-900 border-white/20 text-brand-500 mr-2 accent-brand-500"
                    />
                    <span>Skip Meta</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Mode Topic: Exhaustive Topic Crawl (Earliest ➔ Present) */}
          {consoleMode === 'topic' && (
            <div class="space-y-4 animate-fade-in">
              <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                  <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>🌐</span>
                    <span>Website URL</span>
                  </label>
                  <button 
                    onClick={handleDiscoverTopics}
                    disabled={discoveringCategories || !url}
                    class="btn-lux text-[10px] text-emerald-300 font-semibold hover:text-emerald-200 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <span>{discoveringCategories ? 'Discovering...' : '🪄 Auto-Detect Categories'}</span>
                  </button>
                </div>
                <input 
                  type="url" 
                  placeholder="https://example.com" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none"
                />
              </div>

              {/* Discovered Topic Pills */}
              {discoveredCategories.length > 0 && (
                <div class="space-y-2 glass-card p-3 rounded-xl border border-white/[0.08]">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-display">Discovered Site Categories:</span>
                  <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar pt-1">
                    {discoveredCategories.map((cat, i) => (
                      <button
                        key={i}
                        onClick={() => setTopicInput(cat.name)}
                        class={`btn-lux px-2.5 py-1 text-[11px] rounded-lg border transition-all ${
                          topicInput.toLowerCase() === cat.name.toLowerCase()
                            ? 'btn-emerald-gradient text-white font-bold shadow'
                            : 'bg-dark-950/80 text-slate-300 border-white/10 hover:border-emerald-500/40'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div class="space-y-1.5">
                <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                  <span>🏷️</span>
                  <span>Target Topic / Category</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Analysis, Engineering, AI, Markets" 
                  value={topicInput} 
                  onChange={e => setTopicInput(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-emerald-300 font-semibold focus:outline-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Concurrency</label>
                  <input 
                    type="number" 
                    value={topicConcurrency} 
                    onChange={e => setTopicConcurrency(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Delay (ms)</label>
                  <input 
                    type="number" 
                    value={topicDelay} 
                    onChange={e => setTopicDelay(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
              </div>

              <label class="flex items-center text-xs text-slate-300 cursor-pointer bg-dark-950/60 p-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <input 
                  type="checkbox" 
                  checked={topicSitemap} 
                  onChange={e => setTopicSitemap(e.target.checked)}
                  class="rounded bg-dark-900 border-white/20 text-emerald-500 mr-2.5 accent-emerald-500"
                />
                <span>Probe XML Sitemaps for Historical Archives</span>
              </label>

              {/* Topic Crawl Control Buttons */}
              <div class="space-y-2 pt-1">
                {!topicActive ? (
                  <button 
                    onClick={() => handleStartTopicCrawl()} 
                    class="btn-lux btn-emerald-gradient w-full py-3 text-xs font-bold rounded-xl space-x-2"
                  >
                    <span>🚀</span>
                    <span>Start Exhaustive Topic Crawl</span>
                  </button>
                ) : (
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      onClick={handlePauseTopicCrawl}
                      class="btn-lux btn-amber-gradient py-2.5 text-xs font-bold rounded-xl space-x-1.5"
                      title="Pause crawl and save checkpoint state"
                    >
                      <span>⏸️</span>
                      <span>Pause & Save</span>
                    </button>
                    <button
                      onClick={handleCancelTopicCrawl}
                      class="btn-lux btn-danger-gradient py-2.5 text-xs font-bold rounded-xl space-x-1.5"
                      title="Stop crawl"
                    >
                      <span>🛑</span>
                      <span>Stop Crawl</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Live Topic Crawl Metrics & Dynamic Date Coverage Banner */}
              {(topicActive || topicLogs.length > 0) && (
                <div class="space-y-3 glass-card border border-emerald-500/30 p-4 rounded-2xl animate-fade-in shadow-xl">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-200 font-display">Topic Crawl Progress</span>
                    <span class={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                      topicActive ? 'bg-emerald-500/20 text-emerald-300 animate-pulse border border-emerald-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {topicActive ? 'CRAWLING' : 'FINISHED'}
                    </span>
                  </div>

                  {/* Dynamic Date Coverage Alert Banner */}
                  {topicDateCoverage.earliestDate && (
                    <div class="p-2.5 bg-emerald-950/50 border border-emerald-500/30 rounded-xl text-[10px] space-y-1">
                      <div class="font-bold text-emerald-300 flex items-center space-x-1.5">
                        <span>📅 Dynamic Date Range:</span>
                        <span class="text-white font-mono">{topicDateCoverage.earliestDate} ➔ {topicDateCoverage.latestDate || 'Present'}</span>
                      </div>
                      <div class="text-slate-400 text-[9px]">
                        Earliest discovered publication up to current date.
                      </div>
                    </div>
                  )}

                  <div class="grid grid-cols-4 gap-2 text-center">
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-slate-400 uppercase font-semibold">Visited</div>
                      <div class="text-sm font-bold text-slate-100 mt-0.5">{topicStats.visited}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-slate-400 uppercase font-semibold">Queue</div>
                      <div class="text-sm font-bold text-slate-100 mt-0.5">{topicStats.queued}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-emerald-400 uppercase font-semibold">Scraped</div>
                      <div class="text-sm font-bold text-emerald-300 mt-0.5">{topicStats.succeeded}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-amber-400 uppercase font-semibold">Skipped</div>
                      <div class="text-sm font-bold text-amber-300 mt-0.5">{topicStats.skippedExisting || 0}</div>
                    </div>
                  </div>

                  {/* Real-time pages stream */}
                  {topicPages.length > 0 && (
                    <div class="space-y-1.5">
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Latest Scraped Articles:</div>
                      <div class="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                        {topicPages.map((pg, i) => (
                          <div key={i} class="p-1.5 bg-dark-950 rounded-lg border border-white/5 flex justify-between items-center text-[10px]">
                            <span class="font-mono text-emerald-400 truncate max-w-[220px]" title={pg.filename}>{pg.filename}</span>
                            <span class="text-slate-500 shrink-0 font-mono text-[9px]">{pg.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Terminal log output */}
                  <div class="h-28 overflow-y-auto custom-scrollbar bg-dark-950 border border-white/5 p-2.5 rounded-xl text-[10px] font-mono text-slate-400 space-y-1">
                    {topicLogs.slice().reverse().map((log, idx) => (
                      <div key={idx} class="truncate" title={log}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Batch Scraping */}
          {consoleMode === 'batch' && (
            <div class="space-y-4 animate-fade-in">
              <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                  <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>📑</span>
                    <span>Index / Listing Page</span>
                  </label>
                  <button onClick={() => setUrl('https://news.ycombinator.com')} class="text-[10px] text-brand-400 hover:underline">
                    HN Sample
                  </button>
                </div>
                <input 
                  type="url" 
                  placeholder="https://example.com/blog" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none"
                />
              </div>

              <div class="space-y-1.5">
                <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                  <span>🔗</span>
                  <span>Subpage Link Selector</span>
                </label>
                <div class="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="a.titleline, div.post a" 
                    value={selector} 
                    onChange={e => setSelector(e.target.value)}
                    class="glass-input flex-1 px-3 py-2 rounded-xl text-xs text-emerald-400 font-mono"
                  />
                  <button 
                    onClick={async () => {
                      if (!url) return showToast('Enter URL first', 'error');
                      setAutoDetecting(true);
                      try {
                        const data = await safeFetchJson('/api/auto-selector', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url })
                        });
                        if (data.selector) {
                          setSelector(data.selector);
                          showToast(`Detected selector: ${data.selector}`, 'success');
                        }
                      } finally { setAutoDetecting(false); }
                    }}
                    disabled={autoDetecting || !url}
                    class="btn-lux btn-purple-gradient px-3 py-2 text-xs font-bold rounded-xl"
                  >
                    {autoDetecting ? '...' : '🪄 Auto'}
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Concurrency</label>
                  <input 
                    type="number" 
                    value={batchConcurrency} 
                    onChange={e => setBatchConcurrency(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Delay (ms)</label>
                  <input 
                    type="number" 
                    value={batchDelay} 
                    onChange={e => setBatchDelay(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
              </div>

              <button 
                onClick={handleDiscoverLinks} 
                disabled={loading || discovering || !selector}
                class="btn-lux btn-primary-gradient w-full py-2.5 text-xs font-bold rounded-xl space-x-2 disabled:opacity-40"
              >
                <span>🔍</span>
                <span>{discovering ? 'Discovering Links...' : 'Discover Links Matching Selector'}</span>
              </button>

              {discoveredUrls.length > 0 && (
                <div class="space-y-2.5 glass-card p-3.5 rounded-2xl border border-white/[0.08]">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-200">📄 {discoveredUrls.length} Discovered Links</span>
                    <button onClick={() => setDiscoveredUrls([])} class="btn-lux text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-white/5">Clear</button>
                  </div>
                  <div class="max-h-28 overflow-y-auto custom-scrollbar space-y-1 p-2 bg-dark-950 rounded-xl text-[10px] font-mono text-slate-400">
                    {discoveredUrls.map((u, i) => (
                      <div key={i} class="truncate" title={u}>• {u}</div>
                    ))}
                  </div>
                  <button
                    onClick={handleStartBatchScrape}
                    disabled={loading || batchProgress?.active}
                    class="btn-lux btn-emerald-gradient w-full py-2.5 text-xs font-bold rounded-xl space-x-2 disabled:opacity-50"
                  >
                    <span>⚡</span>
                    <span>Scrape All Links in Parallel</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode 3: Spider with Checkpoints & Pause/Resume */}
          {consoleMode === 'spider' && (
            <div class="space-y-4 animate-fade-in">
              {/* Checkpoint Resume Drawer */}
              {checkpoints.length > 0 && (
                <div class="p-3.5 bg-indigo-950/40 border border-indigo-500/40 rounded-2xl space-y-2 shadow-lg">
                  <div class="flex justify-between items-center text-xs font-bold text-indigo-300">
                    <span>💾 Saved Checkpoints</span>
                    <span class="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 font-mono">{checkpoints.length} Pending</span>
                  </div>
                  <div class="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                    {checkpoints.map(cp => (
                      <div key={cp.job_id} class="p-2.5 bg-dark-950 rounded-xl border border-white/5 flex justify-between items-center">
                        <div class="min-w-0 flex-1 pr-2">
                          <div class="text-xs font-semibold text-slate-200 truncate">{cp.job_id}</div>
                          <div class="text-[10px] text-slate-400 truncate">{cp.seed_url} • {cp.state?.visited?.length || 0} visited</div>
                        </div>
                        <div class="flex space-x-1.5 shrink-0">
                          <button
                            onClick={() => handleStartSpider(cp.job_id)}
                            disabled={spiderActive}
                            class="btn-lux btn-purple-gradient px-2.5 py-1 rounded-lg text-[10px] font-bold"
                            title="Resume this crawl"
                          >
                            Resume
                          </button>
                          <button
                            onClick={() => handleDeleteCheckpoint(cp.job_id)}
                            class="btn-lux px-2 py-1 bg-dark-900 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg text-[10px]"
                            title="Delete checkpoint"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div class="space-y-1.5">
                <label class="text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
                  <span>🕸️</span>
                  <span>Seed URL</span>
                </label>
                <input 
                  type="url" 
                  placeholder="https://example.com" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  class="glass-input w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Max Depth</label>
                  <input 
                    type="text" 
                    value={spiderDepth} 
                    onChange={e => setSpiderDepth(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Page Budget</label>
                  <input 
                    type="number" 
                    value={spiderMaxPages} 
                    onChange={e => setSpiderMaxPages(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Concurrency</label>
                  <input 
                    type="number" 
                    value={spiderConcurrency} 
                    onChange={e => setSpiderConcurrency(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] text-slate-400 font-medium">Delay (ms)</label>
                  <input 
                    type="number" 
                    value={spiderDelay} 
                    onChange={e => setSpiderDelay(e.target.value)}
                    class="glass-input w-full px-3 py-2 rounded-xl text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Spider Control Buttons */}
              <div class="space-y-2">
                {!spiderActive ? (
                  <button 
                    onClick={() => handleStartSpider()} 
                    class="btn-lux btn-purple-gradient w-full py-3 text-xs font-bold rounded-xl space-x-2"
                  >
                    <span>🕸️</span>
                    <span>Start Recursive Spider</span>
                  </button>
                ) : (
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      onClick={handlePauseSpider}
                      class="btn-lux btn-amber-gradient py-2.5 text-xs font-bold rounded-xl space-x-1.5"
                      title="Pause crawl and save checkpoint state"
                    >
                      <span>⏸️</span>
                      <span>Pause & Save</span>
                    </button>
                    <button
                      onClick={handleCancelSpider}
                      class="btn-lux btn-danger-gradient py-2.5 text-xs font-bold rounded-xl space-x-1.5"
                      title="Stop crawl"
                    >
                      <span>🛑</span>
                      <span>Stop Crawl</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Live Spider Statistics & Logs */}
              {(spiderActive || spiderLogs.length > 0) && (
                <div class="space-y-3 glass-card border border-white/[0.08] p-4 rounded-2xl shadow-xl">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-200 font-display">Crawl Metrics</span>
                    <span class={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                      spiderActive ? 'bg-indigo-500/20 text-indigo-300 animate-pulse border border-indigo-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {spiderActive ? 'RUNNING' : 'COMPLETED'}
                    </span>
                  </div>

                  <div class="grid grid-cols-4 gap-2 text-center">
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-slate-400 uppercase font-semibold">Visited</div>
                      <div class="text-sm font-bold text-slate-100 mt-0.5">{spiderStats.visited}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-slate-400 uppercase font-semibold">Queue</div>
                      <div class="text-sm font-bold text-slate-100 mt-0.5">{spiderStats.queued}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-emerald-400 uppercase font-semibold">Ok</div>
                      <div class="text-sm font-bold text-emerald-300 mt-0.5">{spiderStats.succeeded}</div>
                    </div>
                    <div class="bg-dark-950 p-2.5 rounded-xl border border-white/5">
                      <div class="text-[9px] text-rose-400 uppercase font-semibold">Fail</div>
                      <div class="text-sm font-bold text-rose-300 mt-0.5">{spiderStats.failed}</div>
                    </div>
                  </div>

                  {/* Real-time pages stream */}
                  {spiderPages.length > 0 && (
                    <div class="space-y-1.5">
                      <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Live Scraped Pages:</div>
                      <div class="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                        {spiderPages.map((pg, i) => (
                          <div key={i} class="p-1.5 bg-dark-950 rounded-lg border border-white/5 flex justify-between items-center text-[10px]">
                            <span class="font-mono text-emerald-400 truncate max-w-[220px]" title={pg.filename}>{pg.filename}</span>
                            <span class="text-slate-500 shrink-0 font-mono text-[9px]">{pg.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Terminal log output */}
                  <div class="h-28 overflow-y-auto custom-scrollbar bg-dark-950 border border-white/5 p-2.5 rounded-xl text-[10px] font-mono text-slate-400 space-y-1">
                    {spiderLogs.slice().reverse().map((log, idx) => (
                      <div key={idx} class="truncate" title={log}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Profiles section */}
          <div class="space-y-2.5 pt-3 border-t border-white/[0.08] flex-1 flex flex-col min-h-[140px]">
            <div class="flex justify-between items-center">
              <h2 class="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-display">Saved Scraper Profiles</h2>
              <span class="text-[10px] text-brand-400 font-mono">{profiles.length}</span>
            </div>
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 max-h-[160px]">
              {profiles.length === 0 ? (
                <div class="text-xs text-slate-500 italic p-3 bg-dark-950/40 rounded-xl border border-white/5 text-center">No profiles saved yet.</div>
              ) : (
                profiles.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleApplyProfile(p)}
                    class="p-2.5 rounded-xl bg-dark-950/60 hover:bg-dark-900 border border-white/5 hover:border-brand-500/30 cursor-pointer transition-all flex justify-between items-center group shadow-sm active:scale-[0.99]"
                  >
                    <div class="truncate pr-2">
                      <div class="text-xs font-semibold text-slate-200 group-hover:text-brand-300 transition-colors truncate">{p.name}</div>
                      <div class="text-[10px] text-teal-400 font-mono truncate">{p.selectors?.content || 'auto'}</div>
                    </div>
                    <div class="flex items-center space-x-1.5 shrink-0">
                      <span class="btn-lux text-[9px] text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider group-hover:bg-brand-500/20">Apply</span>
                      <button
                        onClick={(e) => handleDeleteProfile(e, p.id, p.name)}
                        class="btn-lux text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-colors text-[10px]"
                        title="Delete profile"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Scrapes History */}
          <div class="space-y-2.5 pt-3 border-t border-white/[0.08] flex-1 flex flex-col min-h-[180px]">
            <div class="flex justify-between items-center">
              <h2 class="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-display">Recent Scrapes ({history.length})</h2>
            </div>
            
            <div class="flex space-x-1.5">
              <input
                type="text"
                placeholder="Filter by category..."
                value={categoryFilter}
                onChange={e => {
                  setCategoryFilter(e.target.value);
                  loadData(e.target.value);
                }}
                class="glass-input w-full px-3 py-1.5 rounded-xl text-xs text-slate-300 placeholder-slate-500 focus:outline-none"
              />
              {categoryFilter && (
                <button onClick={() => { setCategoryFilter(''); loadData(''); }} class="btn-lux px-2 text-xs text-slate-400 hover:text-white rounded-xl bg-white/5">
                  ✕
                </button>
              )}
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 max-h-[200px]">
              {history.length === 0 ? (
                <div class="text-xs text-slate-500 italic p-3 bg-dark-950/40 rounded-xl border border-white/5 text-center">No past scrapes logged.</div>
              ) : (
                history.slice(0, 15).map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => handleViewScrape(s)}
                    class="p-2.5 rounded-xl bg-dark-950/50 hover:bg-dark-900 border border-white/5 hover:border-white/10 cursor-pointer transition-all flex items-start space-x-2.5 shadow-sm active:scale-[0.99] group"
                  >
                    <span class={`text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold shrink-0 mt-0.5 border ${
                      s.status === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      #{s.id}
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs text-slate-200 font-medium truncate">{s.title || s.url}</div>
                      <div class="text-[10px] text-slate-500 font-mono truncate">{s.url}</div>
                      {s.category && (
                        <span class="inline-block mt-1 text-[8px] bg-brand-500/10 text-brand-300 border border-brand-500/20 px-1.5 py-0.2 rounded font-semibold">
                          {s.category}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteScrape(e, s.id)}
                      class="btn-lux text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-colors text-[10px] opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete scrape record"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </section>

        {/* Right Main Display Panel */}
        <section class="flex-1 flex flex-col bg-dark-950/40 overflow-hidden relative">
          {/* Main Top Tab Navigation */}
          <div class="h-14 border-b border-white/[0.08] flex items-center px-6 space-x-2 shrink-0 bg-dark-950/80 backdrop-blur-md">
            <button 
              onClick={() => setActiveTab('iframe')}
              class={`btn-lux h-9 px-3.5 text-xs font-semibold rounded-xl transition-all space-x-2 ${
                activeTab === 'iframe' 
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>🌐</span>
              <span>Visual Target Preview</span>
            </button>
            <button 
              onClick={() => setActiveTab('markdown')}
              class={`btn-lux h-9 px-3.5 text-xs font-semibold rounded-xl transition-all space-x-2 ${
                activeTab === 'markdown' 
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>📝</span>
              <span>Extracted Markdown</span>
            </button>
            <button 
              onClick={() => setActiveTab('query')}
              class={`btn-lux h-9 px-3.5 text-xs font-semibold rounded-xl transition-all space-x-2 ${
                activeTab === 'query' 
                  ? 'bg-teal-600/20 text-teal-300 border border-teal-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>🧪</span>
              <span>Live Query & REPL</span>
            </button>
            <button 
              onClick={() => setActiveTab('adaptive')}
              class={`btn-lux h-9 px-3.5 text-xs font-semibold rounded-xl transition-all space-x-2 ${
                activeTab === 'adaptive' 
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>🎯</span>
              <span>Adaptive Studio</span>
            </button>
            <button 
              onClick={() => {
                setActiveTab('entities');
                safeFetchJson('/api/bandit').then(b => setBanditStats(b || []));
              }}
              class={`btn-lux h-9 px-3.5 text-xs font-semibold rounded-xl transition-all space-x-2 ${
                activeTab === 'entities' 
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>📦</span>
              <span>Entities & Bandit RL</span>
            </button>
          </div>

          {/* Loading Overlay */}
          {loading && (
            <div class="absolute inset-0 bg-dark-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 animate-fade-in">
              <div class="relative w-16 h-16 mb-4">
                <div class="absolute inset-0 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin"></div>
              </div>
              <p class="text-xs font-bold text-brand-400 tracking-widest font-mono uppercase animate-pulse">PROCESSING REQUEST...</p>
            </div>
          )}

          {/* Tab 1: Visual Picker Iframe */}
          <div class={`flex-1 h-full w-full relative ${activeTab === 'iframe' ? 'block' : 'hidden'}`}>
            {iframeUrl ? (
              <iframe 
                ref={iframeRef}
                src={iframeUrl} 
                onLoad={() => setLoading(false)}
                class="w-full h-full border-none bg-white"
              ></iframe>
            ) : (
              <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div class="w-20 h-20 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-4xl shadow-xl shadow-brand-500/10">
                  🕸️
                </div>
                <div class="space-y-1.5 max-w-md">
                  <h3 class="text-base font-display font-bold text-slate-200">No Target URL Loaded in Visual Picker</h3>
                  <p class="text-xs text-slate-400 leading-relaxed">
                    Enter any website URL in the left targeting panel and click <strong class="text-brand-400">Proxy Target</strong>. You can click on any headline or product card to capture its 64-bit SimHash DOM fingerprint.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUrl('https://quotes.toscrape.com');
                    setIframeUrl('/api/proxy?url=' + encodeURIComponent('https://quotes.toscrape.com') + '&mode=' + renderMode);
                    setLoading(true);
                  }}
                  class="btn-lux btn-primary-gradient px-4 py-2 text-xs font-semibold rounded-xl"
                >
                  Load Sample Site (quotes.toscrape.com)
                </button>
              </div>
            )}
          </div>

          {/* Tab 2: Markdown Preview */}
          <div class={`flex-1 h-full overflow-auto custom-scrollbar p-6 ${activeTab === 'markdown' ? 'block' : 'hidden'}`}>
            {markdownOutput ? (
              <div class="space-y-4 max-w-5xl mx-auto">
                {lastDecision && (
                  <div class="glass-card bg-amber-950/20 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-200 shadow-lg">
                    <div class="flex items-center space-x-3">
                      <span class="text-2xl">🌳</span>
                      <div>
                        <div class="font-bold flex items-center space-x-2 font-display">
                          <span>Decision Tree Route: <span class="uppercase text-amber-300 font-mono px-2 py-0.5 bg-amber-500/20 rounded-md border border-amber-500/30">{lastDecision.tier}</span></span>
                          <span class="text-amber-400/80 text-[11px] font-mono">({Math.round((lastDecision.confidence || 1) * 100)}% Confidence)</span>
                        </div>
                        <div class="text-[11px] text-amber-300/80 font-mono mt-0.5">{lastDecision.label}</div>
                      </div>
                    </div>
                    {lastDecision.explanation && (
                      <span class="text-[11px] text-slate-400 font-mono hidden md:inline-block max-w-sm truncate" title={lastDecision.explanation}>
                        {lastDecision.explanation}
                      </span>
                    )}
                  </div>
                )}
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 glass-card p-3.5 rounded-2xl border border-white/[0.08]">
                  <div class="flex items-center space-x-3 text-xs text-slate-400 font-mono">
                    <span>Words: <strong class="text-brand-300">{markdownOutput.split(/\s+/).filter(Boolean).length}</strong></span>
                    <span>•</span>
                    <span>Characters: <strong class="text-teal-300">{markdownOutput.length}</strong></span>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button 
                      onClick={handleDownloadMarkdown}
                      class="btn-lux btn-ghost-lux px-3.5 py-1.5 text-xs font-semibold rounded-xl space-x-1.5"
                      title="Download as markdown file"
                    >
                      <span>💾</span>
                      <span>Download .md</span>
                    </button>
                    <button 
                      onClick={handleCopyMarkdown}
                      class={`btn-lux px-4 py-1.5 text-xs font-bold rounded-xl space-x-1.5 ${
                        copiedMarkdown ? 'btn-emerald-gradient' : 'btn-primary-gradient'
                      }`}
                    >
                      <span>{copiedMarkdown ? '✔' : '📋'}</span>
                      <span>{copiedMarkdown ? 'Copied to Clipboard!' : 'Copy Markdown'}</span>
                    </button>
                  </div>
                </div>
                <pre class="p-6 rounded-2xl border border-white/[0.08] bg-dark-900/90 font-mono text-xs text-emerald-300 overflow-x-auto custom-scrollbar leading-relaxed whitespace-pre-wrap shadow-2xl">
                  {markdownOutput}
                </pre>
              </div>
            ) : (
              <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div class="w-20 h-20 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-4xl shadow-xl shadow-brand-500/10">
                  📝
                </div>
                <div class="space-y-1.5 max-w-md">
                  <h3 class="text-base font-display font-bold text-slate-200">No Extracted Markdown Output</h3>
                  <p class="text-xs text-slate-400 leading-relaxed">
                    Click <strong class="text-emerald-400">Scrape Now</strong> or click any entry in Recent History to inspect sanitized GitHub Flavored Markdown with preserved tables and YAML frontmatter.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tab 3: Live Query & REPL Tester */}
          <div class={`flex-1 h-full overflow-auto custom-scrollbar p-6 ${activeTab === 'query' ? 'block' : 'hidden'}`}>
            <div class="max-w-5xl mx-auto space-y-5">
              <div class="glass-card p-6 rounded-2xl space-y-4 border border-white/[0.08] shadow-xl">
                <div class="flex justify-between items-center">
                  <div>
                    <h3 class="text-sm font-display font-bold text-slate-100 flex items-center space-x-2">
                      <span>🧪</span>
                      <span>Interactive Query & REPL Tester</span>
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">Test CSS, XPath, or Regex queries live on {url || 'target URL'}</p>
                  </div>
                  <div class="flex bg-dark-950 p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => setQueryType('css')}
                      class={`btn-lux px-3 py-1 text-xs font-bold rounded-lg transition-all ${queryType === 'css' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      CSS
                    </button>
                    <button
                      onClick={() => setQueryType('xpath')}
                      class={`btn-lux px-3 py-1 text-xs font-bold rounded-lg transition-all ${queryType === 'xpath' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      XPath
                    </button>
                    <button
                      onClick={() => setQueryType('regex')}
                      class={`btn-lux px-3 py-1 text-xs font-bold rounded-lg transition-all ${queryType === 'regex' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      Regex
                    </button>
                  </div>
                </div>

                <div class="flex space-x-2.5">
                  <input
                    type="text"
                    placeholder={queryType === 'css' ? 'e.g. h1, article a, table.itemlist' : queryType === 'xpath' ? 'e.g. //h1 | //a[@href]' : 'e.g. [a-zA-Z0-9]+'}
                    value={queryInput}
                    onChange={e => setQueryInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRunQuery()}
                    class="glass-input flex-1 px-4 py-2.5 rounded-xl text-xs text-teal-300 font-mono focus:outline-none"
                  />
                  <button
                    onClick={handleRunQuery}
                    disabled={queryRunning || !url || !queryInput}
                    class="btn-lux bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold border border-teal-400/40 shadow-lg shadow-teal-600/20"
                  >
                    {queryRunning ? 'Evaluating...' : 'Run Query'}
                  </button>
                </div>

                <div class="flex items-center space-x-2 text-[11px] text-slate-400">
                  <span class="font-bold text-slate-500 font-display">Presets:</span>
                  <button onClick={() => { setQueryType('css'); setQueryInput('h1, h2'); }} class="text-teal-300 hover:underline">Headers</button>
                  <span>•</span>
                  <button onClick={() => { setQueryType('css'); setQueryInput('a[href]'); }} class="text-teal-300 hover:underline">Links</button>
                  <span>•</span>
                  <button onClick={() => { setQueryType('css'); setQueryInput('article'); }} class="text-teal-300 hover:underline">Articles</button>
                  <span>•</span>
                  <button onClick={() => { setQueryType('xpath'); setQueryInput('//a'); }} class="text-teal-300 hover:underline">XPath Anchors</button>
                </div>
              </div>

              {/* Query Results */}
              {queryResults && (
                <div class="space-y-3 animate-fade-in">
                  <div class="flex justify-between items-center text-xs text-slate-400 px-1">
                    <span class="font-bold text-slate-200">Matched {queryResults.count} Elements</span>
                    <span>Timing: <strong class="text-emerald-400 font-mono">{queryResults.elapsed}ms</strong> • Tier: <strong class="text-brand-400 uppercase font-mono">{queryResults.fetcher}</strong></span>
                  </div>

                  <div class="space-y-2.5">
                    {queryResults.matches.map((m, idx) => (
                      <div key={idx} class="p-3.5 glass-card rounded-2xl space-y-1.5 font-mono text-xs border border-white/[0.08]">
                        <div class="flex justify-between items-center">
                          <span class="px-2 py-0.5 bg-teal-500/15 text-teal-300 border border-teal-500/30 rounded-md font-bold">&lt;{m.tag}&gt;</span>
                          <span class="text-[10px] text-slate-500">#{idx + 1}</span>
                        </div>
                        <div class="text-slate-200 font-sans">{m.text || '<empty text>'}</div>
                        {m.attribs && Object.keys(m.attribs).length > 0 && (
                          <div class="text-[10px] text-slate-400 truncate bg-dark-950 p-1.5 rounded-lg border border-white/5">
                            Attrs: {JSON.stringify(m.attribs)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tab 4: Adaptive Self-Healing Studio */}
          <div class={`flex-1 h-full overflow-auto custom-scrollbar p-6 ${activeTab === 'adaptive' ? 'block' : 'hidden'}`}>
            <div class="max-w-5xl mx-auto space-y-5">
              <div class="glass-card p-6 rounded-2xl space-y-4 border border-white/[0.08] shadow-xl">
                <div class="flex justify-between items-center">
                  <div>
                    <h3 class="text-sm font-display font-bold text-slate-100 flex items-center space-x-2">
                      <span>🎯</span>
                      <span>Adaptive Self-Healing Studio</span>
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">Adaptive 64-bit SimHash structural fingerprinting protects scrapers against website redesigns</p>
                  </div>
                  <button
                    onClick={() => handleTestAdaptive()}
                    disabled={testingAdaptive || !activeSignature}
                    class="btn-lux btn-purple-gradient px-4 py-2.5 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
                  >
                    {testingAdaptive ? 'Relocating...' : '⚡ Test Relocation on Target'}
                  </button>
                </div>

                {activeSignature ? (
                  <div class="grid grid-cols-2 gap-3 pt-2">
                    <div class="p-3.5 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                      <div class="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Anchor Tag & Hierarchy</div>
                      <div class="text-xs font-mono text-purple-300">&lt;{activeSignature.tagName}&gt; (parent: &lt;{activeSignature.parentTagName || 'body'}&gt;)</div>
                      <div class="text-[10px] text-slate-400 font-mono truncate">{activeSignature.content}</div>
                    </div>
                    <div class="p-3.5 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                      <div class="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Text & Class Anchors</div>
                      <div class="text-xs text-slate-200 truncate italic">"{activeSignature.textSnippet || 'N/A'}"</div>
                      <div class="text-[10px] text-teal-400 font-mono truncate">{activeSignature.classes?.join(', ') || 'No classes'}</div>
                    </div>
                  </div>
                ) : (
                  <div class="p-5 bg-dark-950/60 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">
                    Click any element in the "Visual Target Preview" tab to capture its live DOM structural fingerprint.
                  </div>
                )}
              </div>

              {/* Adaptive Self-Healing Result Card */}
              {adaptiveResult && (
                <div class="glass-card p-6 border border-purple-500/40 rounded-2xl space-y-3 animate-fade-in shadow-xl">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-200 font-display">Self-Healing Engine Evaluation</span>
                    <span class={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
                      adaptiveResult.found 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}>
                      {adaptiveResult.found ? `RECOVERED (${(adaptiveResult.confidence * 100).toFixed(1)}% Match)` : 'NO CONFIDENT MATCH'}
                    </span>
                  </div>

                  {adaptiveResult.found && (
                    <div class="space-y-2">
                      <div class="text-xs text-slate-400 font-mono">
                        Healed Selector: <strong class="text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">{adaptiveResult.healedSelector}</strong>
                      </div>
                      {adaptiveResult.match && (
                        <div class="p-3.5 bg-dark-950 rounded-xl border border-white/5 text-xs font-mono text-emerald-400">
                          {adaptiveResult.match.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Saved Domain Fingerprints Table */}
              <div class="glass-card p-6 rounded-2xl space-y-4 border border-white/[0.08] shadow-xl">
                <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider font-display">Persisted Domain Fingerprints ({fingerprints.length})</h4>
                {fingerprints.length === 0 ? (
                  <div class="text-xs text-slate-500 italic">No persistent fingerprints in SQLite element_fingerprints table.</div>
                ) : (
                  <div class="space-y-2">
                    {fingerprints.map(fp => (
                      <div key={fp.id} class="p-3.5 bg-dark-950 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                        <div>
                          <span class="font-bold text-slate-200">{fp.domain}</span>
                          <span class="text-slate-400 ml-2 font-mono text-[10px]">[{fp.name}]</span>
                          <div class="text-[10px] text-teal-400 font-mono truncate max-w-md">{JSON.stringify(fp.signature)}</div>
                        </div>
                        <button
                          onClick={async () => {
                            await safeFetchJson(`/api/fingerprints/${fp.id}`, { method: 'DELETE' });
                            loadData();
                          }}
                          class="btn-lux px-3 py-1 bg-dark-900 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg text-[10px]"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab 5: Unsupervised Entities & Bandit RL Studio */}
          <div class={`flex-1 h-full overflow-auto custom-scrollbar p-6 space-y-6 ${activeTab === 'entities' ? 'block' : 'hidden'}`}>
            {/* Action Bar */}
            <div class="glass-card rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-white/[0.08]">
              <div class="space-y-1">
                <div class="flex items-center space-x-2.5">
                  <span class="text-2xl">📦</span>
                  <h3 class="text-sm font-display font-bold text-slate-100">Unsupervised Entity Induction & Online Bandit RL</h3>
                </div>
                <p class="text-[11px] text-slate-400">Zero-selector structural pattern discovery for products, listings, and cards, paired with Bayesian defense learning.</p>
              </div>

              <div class="flex items-center space-x-3">
                <button
                  onClick={handleMineEntities}
                  disabled={miningEntities || !url}
                  class="btn-lux btn-amber-gradient px-5 py-2.5 disabled:opacity-50 text-white rounded-xl text-xs font-bold space-x-2"
                >
                  {miningEntities ? (
                    <>
                      <div class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Mining Repeating Clusters...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Mine Repeating Entities</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Entities Grid */}
            {entitiesData ? (
              <div class="space-y-4">
                {/* Stats Header Bar */}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="glass-card p-3.5 rounded-xl border border-white/5">
                    <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Items Discovered</div>
                    <div class="text-xl font-bold text-amber-400 mt-0.5">{entitiesData.entities?.length || 0}</div>
                  </div>
                  <div class="glass-card p-3.5 rounded-xl border border-white/5">
                    <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Archetype</div>
                    <div class="text-xl font-bold text-teal-400 uppercase mt-0.5">{entitiesData.detectedType || 'GENERIC'}</div>
                  </div>
                  <div class="glass-card p-3.5 rounded-xl border border-white/5">
                    <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Model Confidence</div>
                    <div class="text-xl font-bold text-emerald-400 mt-0.5">{Math.round((entitiesData.confidence || 0) * 100)}%</div>
                  </div>
                  <div class="glass-card p-3.5 rounded-xl border border-white/5">
                    <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Clusters Analyzed</div>
                    <div class="text-xl font-bold text-purple-400 mt-0.5">{entitiesData.clusterCount || 0}</div>
                  </div>
                </div>

                {/* Cards Grid */}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {entitiesData.entities?.map((item, idx) => (
                    <div key={idx} class="glass-card p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition-all shadow-md">
                      <div class="space-y-2">
                        {item.image && (
                          <div class="w-full h-36 bg-dark-950 rounded-xl overflow-hidden flex items-center justify-center">
                            <img src={item.image} alt={item.title || ''} class="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                          </div>
                        )}
                        <div class="flex items-start justify-between gap-2">
                          <h4 class="text-xs font-bold text-slate-100 line-clamp-2">{item.title || '(Untitled Item)'}</h4>
                          {item.badge && (
                            <span class="px-2 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded uppercase shrink-0 font-mono">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p class="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">{item.description}</p>
                        )}
                      </div>

                      <div class="pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                        {item.price ? (
                          <span class="font-bold text-emerald-400 font-mono">{item.price}</span>
                        ) : item.date ? (
                          <span class="text-slate-400 font-mono text-[10px]">{item.date}</span>
                        ) : (
                          <span class="text-slate-500 font-mono text-[10px]">#{idx + 1}</span>
                        )}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" class="btn-lux text-brand-300 hover:text-white px-2.5 py-1 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 font-semibold text-[10px] space-x-1 border border-brand-500/20">
                            <span>Visit</span>
                            <span>↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div class="glass-card border border-dashed border-white/10 rounded-2xl p-10 text-center space-y-3">
                <span class="text-4xl">📦</span>
                <p class="text-xs text-slate-400 max-w-md mx-auto">
                  No repeating entities mined yet. Enter any product catalog, news feed, or search page URL in the sidebar and click <strong class="text-amber-400">Mine Repeating Entities</strong>.
                </p>
              </div>
            )}

            {/* Bayesian Bandit Domain Defenses Section */}
            <div class="glass-card rounded-2xl p-6 space-y-4 shadow-xl border border-white/[0.08]">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5">
                  <span class="text-2xl">🎰</span>
                  <div>
                    <h3 class="text-xs font-display font-bold text-slate-100">Bayesian Bandit Defense Priors (Thompson Sampling)</h3>
                    <p class="text-[10px] text-slate-400">Dynamically tracks bot defense success probabilities and bypasses probes for protected targets.</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const b = await safeFetchJson('/api/bandit');
                    setBanditStats(b || []);
                  }}
                  class="btn-lux px-3 py-1.5 bg-dark-900 hover:bg-dark-800 text-slate-300 rounded-xl text-[10px] font-semibold border border-white/10"
                >
                  ↻ Refresh
                </button>
              </div>

              {banditStats.length === 0 ? (
                <p class="text-xs text-slate-500 italic py-2">No domain trials recorded in this session yet.</p>
              ) : (
                <div class="overflow-x-auto custom-scrollbar">
                  <table class="w-full text-left text-xs font-mono">
                    <thead>
                      <tr class="border-b border-white/5 text-[10px] text-slate-400 uppercase tracking-wider font-display">
                        <th class="py-2.5 px-3">Domain</th>
                        <th class="py-2.5 px-3">Trials</th>
                        <th class="py-2.5 px-3">Static E[X]</th>
                        <th class="py-2.5 px-3">Dynamic E[X]</th>
                        <th class="py-2.5 px-3">Stealth E[X]</th>
                        <th class="py-2.5 px-3">Route Optimization</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-[11px]">
                      {banditStats.map((st, i) => (
                        <tr key={i} class="hover:bg-white/[0.02]">
                          <td class="py-2.5 px-3 font-bold text-slate-200">{st.domain}</td>
                          <td class="py-2.5 px-3 text-slate-400">{st.totalTrials}</td>
                          <td class="py-2.5 px-3 text-slate-300">{(st.arms.static.expectedValue * 100).toFixed(0)}% <span class="text-[9px] text-slate-500">({st.arms.static.alpha}/{st.arms.static.beta})</span></td>
                          <td class="py-2.5 px-3 text-slate-300">{(st.arms.dynamic.expectedValue * 100).toFixed(0)}% <span class="text-[9px] text-slate-500">({st.arms.dynamic.alpha}/{st.arms.dynamic.beta})</span></td>
                          <td class="py-2.5 px-3 text-slate-300">{(st.arms.stealth.expectedValue * 100).toFixed(0)}% <span class="text-[9px] text-slate-500">({st.arms.stealth.alpha}/{st.arms.stealth.beta})</span></td>
                          <td class="py-2.5 px-3">
                            {st.bypass.bypass ? (
                              <span class="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md text-[9px] font-bold">
                                ⚡ DIRECT {st.bypass.tier.toUpperCase()} ({Math.round(st.bypass.confidence * 100)}%)
                              </span>
                            ) : (
                              <span class="px-2.5 py-0.5 bg-dark-900 text-slate-400 border border-white/5 rounded-md text-[9px]">
                                STANDARD PROBE
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Keyboard Shortcuts & Architecture Guide Modal */}
      {showHelpModal && (
        <div class="fixed inset-0 bg-dark-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-fade-in">
          <div class="glass-card max-w-xl w-full p-6 space-y-5 shadow-2xl border border-white/10 rounded-3xl">
            <div class="flex justify-between items-center">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-2xl">
                  ⌨️
                </div>
                <div>
                  <h3 class="text-sm font-display font-bold text-slate-100">Scrapi Shortcuts & Quick Reference</h3>
                  <p class="text-[11px] text-slate-400">Navigation, visual selector capture, and console execution</p>
                </div>
              </div>
              <button onClick={() => setShowHelpModal(false)} class="btn-lux text-slate-400 hover:text-white text-base px-2 py-1 rounded-lg bg-white/5">✕</button>
            </div>

            <div class="space-y-3 text-xs">
              <div class="grid grid-cols-2 gap-2 text-slate-300">
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-brand-300 font-bold flex justify-between items-center">
                    <span>Cmd / Ctrl + K</span>
                    <span class="text-[9px] bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded">Global</span>
                  </div>
                  <div class="text-[11px] text-slate-400">Toggle this Shortcuts & Reference modal</div>
                </div>
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-slate-300 font-bold flex justify-between items-center">
                    <span>Escape</span>
                    <span class="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded">Global</span>
                  </div>
                  <div class="text-[11px] text-slate-400">Close open dialogs, menus, and modals</div>
                </div>
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-brand-300 font-bold">Click Element</div>
                  <div class="text-[11px] text-slate-400">Capture 64-bit SimHash DOM fingerprint in Target Preview</div>
                </div>
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-brand-300 font-bold">Alt / Cmd + Click</div>
                  <div class="text-[11px] text-slate-400">Navigate to clicked link inside proxy preview</div>
                </div>
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-teal-300 font-bold">Enter Key</div>
                  <div class="text-[11px] text-slate-400">Execute query in Live Query & REPL tester</div>
                </div>
                <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1">
                  <div class="font-mono text-purple-300 font-bold">Thompson Bandit</div>
                  <div class="text-[11px] text-slate-400">Online Bayesian learning auto-bypasses static probes</div>
                </div>
              </div>

              <div class="p-3 bg-dark-950 rounded-xl border border-white/5 space-y-1.5 font-mono text-[11px]">
                <div class="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider">CLI Equivalent Commands</div>
                <div class="text-slate-300"><span class="text-brand-400">node src/cli.js</span> scrape &lt;url&gt; --fetcher auto</div>
                <div class="text-slate-300"><span class="text-emerald-400">node src/cli.js</span> topic &lt;url&gt; "Category"</div>
                <div class="text-slate-300"><span class="text-purple-400">node src/cli.js</span> spider &lt;url&gt; -d 3 -m 50</div>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              class="btn-lux btn-primary-gradient w-full py-2.5 text-xs font-bold rounded-xl"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Model Context Protocol (MCP) Modal */}
      {showMcpModal && (
        <div class="fixed inset-0 bg-dark-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-fade-in">
          <div class="glass-card max-w-xl w-full p-6 space-y-5 shadow-2xl border border-white/10 rounded-3xl">
            <div class="flex justify-between items-center">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div>
                  <h3 class="text-sm font-display font-bold text-slate-100">Model Context Protocol (MCP) Integration</h3>
                  <p class="text-[11px] text-slate-400">Connect Cursor, Claude Desktop, and Antigravity AI agents to Scrapi</p>
                </div>
              </div>
              <button onClick={() => setShowMcpModal(false)} class="btn-lux text-slate-400 hover:text-white text-base px-2 py-1 rounded-lg bg-white/5">✕</button>
            </div>

            <div class="space-y-3.5 text-xs">
              <div class="p-3.5 bg-dark-950 rounded-2xl border border-white/5 space-y-1">
                <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Stdio Launch Command</div>
                <div class="font-mono text-emerald-400 text-[11px]">node src/cli.js mcp</div>
              </div>

              <div class="space-y-1.5">
                <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Exposed AI Tools</div>
                <div class="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div class="p-2.5 bg-dark-950 rounded-xl border border-white/5 text-teal-300">scrapi_fetch</div>
                  <div class="p-2.5 bg-dark-950 rounded-xl border border-white/5 text-teal-300">scrapi_extract</div>
                  <div class="p-2.5 bg-dark-950 rounded-xl border border-white/5 text-purple-300">scrapi_adaptive_query</div>
                  <div class="p-2.5 bg-dark-950 rounded-xl border border-white/5 text-brand-300">scrapi_crawl</div>
                  <div class="p-2.5 bg-dark-950 rounded-xl border border-white/5 text-amber-300 col-span-2">scrapi_entities (zero-selector catalog/cards)</div>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex justify-between items-center">
                  <div class="text-[10px] text-slate-400 font-semibold uppercase font-display">Client Config Snippet</div>
                  <div class="flex bg-dark-950 p-1 rounded-xl border border-white/10 space-x-1">
                    <button
                      onClick={() => setMcpClient('claude')}
                      class={`btn-lux px-2.5 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                        mcpClient === 'claude' ? 'btn-purple-gradient text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Claude Desktop
                    </button>
                    <button
                      onClick={() => setMcpClient('cursor')}
                      class={`btn-lux px-2.5 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                        mcpClient === 'cursor' ? 'btn-purple-gradient text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Cursor
                    </button>
                    <button
                      onClick={() => setMcpClient('antigravity')}
                      class={`btn-lux px-2.5 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                        mcpClient === 'antigravity' ? 'btn-purple-gradient text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Antigravity
                    </button>
                  </div>
                </div>
                <pre class="p-3.5 bg-dark-950 rounded-2xl border border-white/5 font-mono text-[10px] text-slate-300 overflow-x-auto custom-scrollbar">
{JSON.stringify(
  (mcpClient === 'claude' 
    ? mcpInfo?.configSnippets?.claudeDesktop 
    : mcpClient === 'cursor' 
      ? mcpInfo?.configSnippets?.cursor 
      : mcpInfo?.configSnippets?.antigravity) || {}, 
  null, 
  2
)}
                </pre>
              </div>
            </div>

            <button
              onClick={() => {
                const configToCopy = mcpClient === 'claude' 
                  ? mcpInfo?.configSnippets?.claudeDesktop 
                  : mcpClient === 'cursor' 
                    ? mcpInfo?.configSnippets?.cursor 
                    : mcpInfo?.configSnippets?.antigravity;
                navigator.clipboard.writeText(JSON.stringify(configToCopy || {}, null, 2));
                showToast(`MCP ${mcpClient.toUpperCase()} config copied to clipboard!`, 'success');
              }}
              class="btn-lux btn-purple-gradient w-full py-2.5 text-xs font-bold rounded-xl space-x-1.5"
            >
              <span>📋</span>
              <span>Copy {mcpClient === 'claude' ? 'Claude' : mcpClient === 'cursor' ? 'Cursor' : 'Antigravity'} Config JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Status Toast Notification */}
      {statusMsg.text && (
        <div class="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div class={`glass-card px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-bold border backdrop-blur-xl ${
            statusMsg.type === 'success' ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-emerald-900/30' :
            statusMsg.type === 'error' ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-rose-900/30' :
            'bg-brand-950/90 text-brand-300 border-brand-500/50 shadow-brand-900/30'
          }`}>
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 bg-white/10 font-mono">
              {statusMsg.type === 'success' ? '✔' : statusMsg.type === 'error' ? '✖' : 'ℹ'}
            </span>
            <span class="font-sans leading-tight">{statusMsg.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
