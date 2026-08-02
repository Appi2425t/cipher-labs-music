#!/usr/bin/env node
// =============================================================
// BRAVE BROWSER AUTOMATION WITH ADBLOCK (FIXED)
// =============================================================
// - Uses Puppeteer with stealth plugin
// - Adblock via page.evaluate() injection
// - HTTP API for the Discord bot
// - Headless mode for Railway
// =============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');

// =============================================================
// CONFIGURATION
// =============================================================

const app = express();
const PORT = process.env.PORT || 3000;
const HEADLESS = process.env.HEADLESS !== 'false';
const ADBLOCK_ENABLED = process.env.ADBLOCK_ENABLED !== 'false';
const BROWSER_PROFILE_PATH = process.env.BROWSER_PROFILE_PATH || './brave-data';

console.log(`🟢 Starting F-Society Browser Automation...`);
console.log(`📡 Headless mode: ${HEADLESS}`);
console.log(`🛡️ Adblock: ${ADBLOCK_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`📁 Profile path: ${BROWSER_PROFILE_PATH}`);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// =============================================================
// ADBLOCK RULES (Element Hiding)
// =============================================================

const AD_SELECTORS = [
    // YouTube Ad Slots
    '.ytd-ad-slot-renderer',
    '.ytd-promoted-sparkles-web-renderer',
    '.ytd-video-renderer[is-ad]',
    '.ytd-in-feed-ad-layout-renderer',
    '.ytd-merch-shelf-renderer',
    '.ytd-statement-banner-renderer',
    
    // Video Player Ads
    '#player-ads',
    '.ytp-ad-module',
    '.ytp-ad-player-overlay',
    '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay',
    '.ytp-ad-simple-ad-badge',
    '.ytp-ad-action-interstitial',
    
    // Sidebar Ads
    '#secondary .ytd-ad-slot-renderer',
    '#related .ytd-ad-slot-renderer',
    
    // Search Result Ads
    'ytd-search-pyv-renderer',
    'ytd-compact-promoted-video-renderer',
    
    // Banner Ads
    '.ytd-banner-promo-renderer',
    '.ytd-promoted-sparkles-text-search-renderer'
];

// =============================================================
// BRAVE BROWSER MANAGEMENT
// =============================================================

let browser = null;
let isReady = false;

async function startBrowser() {
    try {
        console.log('🔄 Initializing browser with stealth...');
        
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        
        // Add stealth plugin
        puppeteer.use(StealthPlugin());
        console.log('✅ Stealth plugin loaded');
        
        // Find Brave executable path
        const bravePath = getBravePath();
        console.log(`🔍 Browser path: ${bravePath || 'Using Chromium fallback'}`);
        
        // Launch browser
        browser = await puppeteer.launch({
            headless: HEADLESS,
            executablePath: bravePath || undefined,
            userDataDir: BROWSER_PROFILE_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-accelerated-2d-canvas',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions',
                '--disable-default-apps',
                '--disable-component-update',
                '--mute-audio',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });
        
        isReady = true;
        console.log(`✅ Browser ready! (${bravePath ? 'Brave' : 'Chromium'})`);
        console.log(`🛡️ Adblock rules: ${AD_SELECTORS.length} selectors`);
        return true;
    } catch (error) {
        console.error('❌ Failed to start browser:', error);
        return false;
    }
}

function getBravePath() {
    const paths = [
        '/usr/bin/brave-browser',
        '/usr/bin/brave',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// =============================================================
// ADBLOCK INJECTION (via page.evaluate)
// =============================================================

async function applyAdBlock(page) {
    if (!ADBLOCK_ENABLED) {
        console.log('⚠️ Adblock disabled, skipping injection');
        return;
    }
    
    try {
        // Inject CSS to hide ad elements
        const cssRules = AD_SELECTORS.map(s => `${s} { display: none !important; }`).join('\n');
        await page.addStyleTag({ content: cssRules });
        
        // JavaScript to remove ad elements dynamically
        await page.evaluate((selectors) => {
            // Remove existing ad elements
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
            });
            
            // Watch for new ad elements
            const observer = new MutationObserver(() => {
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => el.remove());
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
            
            console.log('🛡️ Adblock active');
        }, AD_SELECTORS);
        
        console.log('🛡️ Adblock injected successfully');
    } catch (error) {
        console.log('⚠️ Adblock injection warning:', error.message);
    }
}

// =============================================================
// API ROUTES
// =============================================================

app.get('/health', (req, res) => {
    res.json({
        status: isReady ? 'ok' : 'starting',
        headless: HEADLESS,
        browser: 'brave/puppeteer',
        adblock: ADBLOCK_ENABLED,
        adblock_rules: AD_SELECTORS.length
    });
});

app.post('/search', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }
    if (!isReady) {
        return res.status(503).json({ error: 'Browser not ready' });
    }
    
    try {
        console.log(`🔍 Searching: "${query}"`);
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Apply adblock
        await applyAdBlock(page);
        
        // Go to YouTube search
        await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Wait for results
        await page.waitForSelector('ytd-video-renderer', { timeout: 10000 }).catch(() => {});
        
        // Extract first video (skip ads)
        const videoData = await page.evaluate(() => {
            const videos = document.querySelectorAll('ytd-video-renderer:not([is-ad])');
            const video = videos[0];
            if (!video) return null;
            
            const titleEl = video.querySelector('#video-title');
            const linkEl = video.querySelector('#video-title');
            const thumbnailEl = video.querySelector('#thumbnail img');
            const channelEl = video.querySelector('#channel-name a');
            
            return {
                title: titleEl ? titleEl.textContent.trim() : 'Unknown',
                url: linkEl ? `https://youtube.com${linkEl.getAttribute('href')}` : '',
                thumbnail: thumbnailEl ? thumbnailEl.getAttribute('src') || '' : '',
                channel: channelEl ? channelEl.textContent.trim() : 'Unknown'
            };
        });
        
        await page.close();
        
        if (videoData && videoData.url) {
            console.log(`✅ Found: "${videoData.title}"`);
            res.json({
                ...videoData,
                source: 'Brave Browser',
                adblock: ADBLOCK_ENABLED ? 'Enabled' : 'Disabled'
            });
        } else {
            console.log(`❌ No results found for: "${query}"`);
            res.json(null);
        }
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/fetch', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    if (!isReady) {
        return res.status(503).json({ error: 'Browser not ready' });
    }
    
    try {
        console.log(`📄 Fetching: ${url}`);
        
        const page = await browser.newPage();
        await applyAdBlock(page);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const content = await page.content();
        await page.close();
        
        res.json({ content });
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/screenshot', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    if (!isReady) {
        return res.status(503).json({ error: 'Browser not ready' });
    }
    
    try {
        console.log(`📸 Screenshot: ${url}`);
        
        const page = await browser.newPage();
        await applyAdBlock(page);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await page.close();
        
        res.json({ screenshot });
    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({
        ready: isReady,
        headless: HEADLESS,
        browser: 'brave/puppeteer',
        adblock: ADBLOCK_ENABLED,
        adblock_rules: AD_SELECTORS.length,
        profile_path: BROWSER_PROFILE_PATH
    });
});

// =============================================================
// START SERVER
// =============================================================

async function start() {
    try {
        await startBrowser();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Automation server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

start();
