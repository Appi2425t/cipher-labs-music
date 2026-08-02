#!/usr/bin/env node
// =============================================================
// BRAVE BROWSER AUTOMATION WITH ADBLOCK (FIXED)
// =============================================================
// - Uses Puppeteer with stealth & adblocker plugins
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
  '||ads.youtube.com^',
  '||doubleclick.net^',
  '||googleadservices.com^',
  '||googlesyndication.com^',
  '||youtube.com/api/stats/ads',
  '||youtube.com/pagead',
  '||google-analytics.com^',
  '||adservice.google.com^',
  '||pagead2.googlesyndication.com^',
  '||partnerad.l.doubleclick.net^',
  '||googletagmanager.com^'
];

// =============================================================
// BRAVE BROWSER MANAGEMENT (Using Puppeteer)
// =============================================================

let browser = null;
let isReady = false;

async function startBraveBrowser() {
    try {
        console.log('🔄 Initializing Brave browser with adblock...');
        
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        
        // Add stealth plugin
        puppeteer.use(StealthPlugin());
        
        // Add adblocker if enabled
        if (ADBLOCK_ENABLED) {
            try {
                const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
                puppeteer.use(AdblockerPlugin({
                    blockTrackers: true,
                    blockAds: true
                }));
                console.log('🛡️ Adblocker plugin loaded');
            } catch (e) {
                console.log('⚠️ Adblocker plugin not available, continuing without');
            }
        }
        
        // Find Brave executable path
        const bravePath = getBravePath();
        console.log(`🔍 Brave path: ${bravePath || 'Not found, using Chromium fallback'}`);
        
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
                '--mute-audio'
            ]
        });
        
        isReady = true;
        console.log(`✅ Browser ready! (${bravePath ? 'Brave' : 'Chromium'})`);
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
// API ROUTES
// =============================================================

app.get('/health', (req, res) => {
    res.json({
        status: isReady ? 'ok' : 'starting',
        headless: HEADLESS,
        browser: 'brave/puppeteer',
        adblock: ADBLOCK_ENABLED
    });
});

app.post('/search', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    if (!isReady) return res.status(503).json({ error: 'Browser not ready' });
    
    try {
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Go to YouTube search
        await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Wait for results
        await page.waitForSelector('ytd-video-renderer', { timeout: 10000 }).catch(() => {});
        
        // Extract first video
        const videoData = await page.evaluate(() => {
            const video = document.querySelector('ytd-video-renderer');
            if (!video) return null;
            
            const titleEl = video.querySelector('#video-title');
            const linkEl = video.querySelector('#video-title');
            const thumbnailEl = video.querySelector('#thumbnail img');
            
            return {
                title: titleEl ? titleEl.textContent.trim() : 'Unknown',
                url: linkEl ? `https://youtube.com${linkEl.getAttribute('href')}` : '',
                thumbnail: thumbnailEl ? thumbnailEl.getAttribute('src') || '' : ''
            };
        });
        
        await page.close();
        
        if (videoData && videoData.url) {
            res.json({
                ...videoData,
                source: 'Brave Browser',
                adblock: ADBLOCK_ENABLED ? 'Enabled' : 'Disabled'
            });
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
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const content = await page.content();
        await page.close();
        res.json({ content });
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({
        ready: isReady,
        headless: HEADLESS,
        browser: 'brave/puppeteer',
        adblock: ADBLOCK_ENABLED,
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
            console.log(`🌐 Automation server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

start();
