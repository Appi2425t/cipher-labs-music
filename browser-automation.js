#!/usr/bin/env node
// =============================================================
// BRAVE BROWSER AUTOMATION WITH ADBLOCK
// =============================================================
// - Uses @sthbryan/browser-mcp with Ghostery adblock
// - Custom ad blocking rules
// - HTTP API for the Discord bot
// - Headless mode for Railway
// =============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// =============================================================
// CONFIGURATION
// =============================================================

const app = express();
const PORT = process.env.PORT || 3000;
const HEADLESS = process.env.HEADLESS !== 'false';
const ADBLOCK_ENABLED = process.env.ADBLOCK_ENABLED !== 'false';
const BROWSER_PROFILE_PATH = process.env.BROWSER_PROFILE_PATH || './brave-data';

console.log(`🟢 Starting Brave Browser Automation Server...`);
console.log(`📡 Headless mode: ${HEADLESS}`);
console.log(`🛡️ Adblock: ${ADBLOCK_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`📁 Profile path: ${BROWSER_PROFILE_PATH}`);

app.use(cors());
app.use(express.json());

// =============================================================
// ADBLOCK RULES
// =============================================================

const adblockRules = [
  // YouTube Ad Domains
  '||ads.youtube.com^',
  '||doubleclick.net^',
  '||googleadservices.com^',
  '||googlesyndication.com^',
  '||youtube.com/api/stats/ads',
  '||youtube.com/pagead',
  '||google-analytics.com^',
  
  // Element Hiding
  { type: 'elementHide', selector: '.ytd-ad-slot-renderer' },
  { type: 'elementHide', selector: '.ytd-promoted-sparkles-web-renderer' },
  { type: 'elementHide', selector: '#player-ads' },
  { type: 'elementHide', selector: '.ytp-ad-module' },
  { type: 'elementHide', selector: '.ytp-ad-player-overlay' },
  { type: 'elementHide', selector: '.ytp-ad-image-overlay' },
  { type: 'elementHide', selector: '.ytp-ad-text-overlay' },
  
  // Other ad networks
  '||adservice.google.com^',
  '||pagead2.googlesyndication.com^',
  '||partnerad.l.doubleclick.net^',
  '||googletagmanager.com^'
];

// =============================================================
// BRAVE BROWSER MANAGEMENT
// =============================================================

let brave = null;
let isReady = false;

async function startBraveBrowser() {
    try {
        console.log('🔄 Initializing Brave browser with Ghostery adblock...');
        
        const browserMcp = require('@sthbryan/browser-mcp');
        
        const config = {
            headless: HEADLESS,
            browser: 'brave',
            userDataDir: BROWSER_PROFILE_PATH,
            adblock: {
                enabled: ADBLOCK_ENABLED,
                rules: adblockRules
            },
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-accelerated-2d-canvas',
                '--disable-pdf-viewer',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--no-first-run',
                '--block-new-web-contents',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-extensions',
                '--disable-component-update'
            ]
        };
        
        brave = await browserMcp.initialize(config);
        
        isReady = true;
        console.log('✅ Brave browser ready with Ghostery adblock!');
        console.log(`🛡️ ${adblockRules.filter(r => typeof r === 'string').length} domain rules loaded`);
        console.log(`🎯 ${adblockRules.filter(r => typeof r === 'object').length} element hiding rules loaded`);
        
        return true;
    } catch (error) {
        console.error('❌ Failed to start Brave:', error);
        
        // Fallback: Try puppeteer
        try {
            console.log('🔄 Attempting fallback with puppeteer...');
            const puppeteer = require('puppeteer-extra');
            const StealthPlugin = require('puppeteer-extra-plugin-stealth');
            const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
            
            puppeteer.use(StealthPlugin());
            if (ADBLOCK_ENABLED) {
                puppeteer.use(AdblockerPlugin({ blockTrackers: true, blockAds: true }));
                console.log('🛡️ Puppeteer adblocker plugin loaded');
            }
            
            const bravePath = getBravePath();
            if (bravePath) {
                const browser = await puppeteer.launch({
                    headless: HEADLESS,
                    executablePath: bravePath,
                    userDataDir: BROWSER_PROFILE_PATH,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-accelerated-2d-canvas',
                        '--disable-blink-features=AutomationControlled'
                    ]
                });
                
                brave = { browser, isPuppeteer: true };
                isReady = true;
                console.log('✅ Brave browser ready via puppeteer fallback!');
                return true;
            }
        } catch (fallbackError) {
            console.error('❌ Fallback failed:', fallbackError);
        }
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
// API ROUTES
// =============================================================

app.get('/health', (req, res) => {
    res.json({
        status: isReady ? 'ok' : 'starting',
        headless: HEADLESS,
        browser: 'brave',
        adblock: ADBLOCK_ENABLED,
        rules_loaded: ADBLOCK_ENABLED ? adblockRules.length : 0
    });
});

app.post('/search', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    if (!isReady) return res.status(503).json({ error: 'Browser not ready' });
    
    try {
        let result;
        if (brave && brave.isPuppeteer) {
            const page = await brave.browser.newPage();
            await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForSelector('ytd-video-renderer', { timeout: 10000 }).catch(() => {});
            
            const videoData = await page.evaluate(() => {
                const video = document.querySelector('ytd-video-renderer');
                if (!video) return null;
                const titleEl = video.querySelector('#video-title');
                const linkEl = video.querySelector('#video-title');
                const thumbnailEl = video.querySelector('#thumbnail');
                return {
                    title: titleEl ? titleEl.textContent.trim() : 'Unknown',
                    url: linkEl ? `https://youtube.com${linkEl.getAttribute('href')}` : '',
                    thumbnail: thumbnailEl ? thumbnailEl.getAttribute('src') : ''
                };
            });
            await page.close();
            if (videoData && videoData.url) result = videoData;
        } else {
            const searchResult = await brave.tools.search({ query, maxResults: 1 });
            if (searchResult && searchResult.results && searchResult.results.length > 0) {
                const firstResult = searchResult.results[0];
                result = {
                    title: firstResult.title || 'Unknown',
                    url: firstResult.url || '',
                    description: firstResult.description || '',
                    thumbnail: firstResult.thumbnail || ''
                };
            }
        }
        
        if (result) {
            res.json({ ...result, source: 'Brave Browser', adblock: ADBLOCK_ENABLED ? 'Enabled' : 'Disabled' });
        } else {
            res.json(null);
        }
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/fetch', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isReady) return res.status(503).json({ error: 'Browser not ready' });
    
    try {
        let content;
        if (brave && brave.isPuppeteer) {
            const page = await brave.browser.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            content = await page.content();
            await page.close();
        } else {
            content = await brave.tools.fetch({ url });
        }
        res.json({ content });
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/screenshot', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isReady) return res.status(503).json({ error: 'Browser not ready' });
    
    try {
        let screenshot;
        if (brave && brave.isPuppeteer) {
            const page = await brave.browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle2' });
            screenshot = await page.screenshot({ encoding: 'base64' });
            await page.close();
        } else {
            screenshot = await brave.tools.screenshot({ url, fullPage: false });
        }
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
        browser: 'brave',
        adblock: ADBLOCK_ENABLED,
        rules_count: adblockRules.length,
        profile_path: BROWSER_PROFILE_PATH
    });
});

// =============================================================
// START SERVER
// =============================================================

async function start() {
    try {
        await startBraveBrowser();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Brave automation server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

start();