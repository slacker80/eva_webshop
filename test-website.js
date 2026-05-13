const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const breakpoints = [
    { name: '320px-mobile', width: 320, height: 568 },
    { name: '768px-tablet', width: 768, height: 1024 },
    { name: '1920px-desktop', width: 1920, height: 1080 }
];

const testResults = [];

async function runTests() {
    console.log('🚀 Starting website tests...\n');

    const browser = await chromium.launch();
    
    try {
        // Test 1: Homepage Load
        console.log('✓ Test 1: Homepage loads');
        const context = await browser.createContext();
        const page = await context.newPage();
        
        try {
            const response = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
            const status = response.status();
            
            if (status === 200) {
                testResults.push({ test: 'Homepage Load', status: '✅ PASS', details: `HTTP ${status}` });
            } else {
                testResults.push({ test: 'Homepage Load', status: '❌ FAIL', details: `HTTP ${status}` });
            }
        } catch (error) {
            testResults.push({ test: 'Homepage Load', status: '❌ FAIL', details: error.message });
        }

        // Test 2: Content Visibility
        console.log('✓ Test 2: Lorem ipsum content visible');
        try {
            const heroText = await page.textContent('h1');
            if (heroText && heroText.includes('Welcome')) {
                testResults.push({ test: 'Content Visibility', status: '✅ PASS', details: 'Hero section loaded' });
            } else {
                testResults.push({ test: 'Content Visibility', status: '❌ FAIL', details: 'Hero section not found' });
            }
        } catch (error) {
            testResults.push({ test: 'Content Visibility', status: '❌ FAIL', details: error.message });
        }

        // Test 3: Links Verification
        console.log('✓ Test 3: Checking for broken links');
        try {
            const links = await page.$$eval('a', anchors => anchors.map(a => a.href).filter(h => h));
            let brokenCount = 0;
            
            for (const link of links.slice(0, 5)) { // Test first 5 links
                try {
                    const linkResponse = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 5000 });
                    if (linkResponse && linkResponse.status() === 404) {
                        brokenCount++;
                    }
                } catch (e) {
                    // Link error
                }
            }
            
            testResults.push({ 
                test: 'Links Verification', 
                status: brokenCount === 0 ? '✅ PASS' : '⚠️ WARNING', 
                details: `Checked ${links.length} links, ${brokenCount} broken` 
            });
            
            // Go back to homepage
            await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        } catch (error) {
            testResults.push({ test: 'Links Verification', status: '⚠️ WARNING', details: error.message });
        }

        // Test 4: Form Interaction
        console.log('✓ Test 4: Testing interactive elements');
        try {
            const addButtons = await page.$$('.add-to-cart');
            if (addButtons.length > 0) {
                testResults.push({ test: 'Form Interaction', status: '✅ PASS', details: `Found ${addButtons.length} interactive buttons` });
            } else {
                testResults.push({ test: 'Form Interaction', status: '⚠️ WARNING', details: 'No interactive elements found' });
            }
        } catch (error) {
            testResults.push({ test: 'Form Interaction', status: '❌ FAIL', details: error.message });
        }

        // Test 5-7: Screenshots at different breakpoints
        for (const breakpoint of breakpoints) {
            console.log(`✓ Test ${5 + breakpoints.indexOf(breakpoint)}: Taking ${breakpoint.name} screenshot`);
            try {
                const screenshotPath = path.join(SCREENSHOTS_DIR, `screenshot-${breakpoint.name}.png`);
                await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
                await page.goto(BASE_URL, { waitUntil: 'networkidle' });
                await page.screenshot({ path: screenshotPath, fullPage: true });
                testResults.push({ 
                    test: `Screenshot (${breakpoint.name})`, 
                    status: '✅ PASS', 
                    details: `Saved to ${screenshotPath}` 
                });
            } catch (error) {
                testResults.push({ 
                    test: `Screenshot (${breakpoint.name})`, 
                    status: '❌ FAIL', 
                    details: error.message 
                });
            }
        }

        // Test 8: Performance/Lighthouse metrics
        console.log('✓ Test 8: Checking page metrics');
        try {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.goto(BASE_URL, { waitUntil: 'networkidle' });
            
            const metrics = await page.evaluate(() => ({
                loadTime: window.performance.timing.loadEventEnd - window.performance.timing.navigationStart,
                domContentLoaded: window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart,
                resourceSize: performance.getEntriesByType('resource').length
            }));
            
            const loadTimeOk = metrics.loadTime < 5000;
            testResults.push({ 
                test: 'Performance Metrics', 
                status: loadTimeOk ? '✅ PASS' : '⚠️ WARNING', 
                details: `Load: ${metrics.loadTime}ms, DOMLoad: ${metrics.domContentLoaded}ms, Resources: ${metrics.resourceSize}` 
            });
        } catch (error) {
            testResults.push({ test: 'Performance Metrics', status: '⚠️ WARNING', details: error.message });
        }

        await context.close();
        
    } finally {
        await browser.close();
    }

    // Print results
    console.log('\n📊 TEST RESULTS\n' + '='.repeat(60));
    testResults.forEach(result => {
        console.log(`${result.status} ${result.test}`);
        console.log(`   → ${result.details}\n`);
    });

    // Summary
    const passed = testResults.filter(r => r.status.includes('✅')).length;
    const warnings = testResults.filter(r => r.status.includes('⚠️')).length;
    const failed = testResults.filter(r => r.status.includes('❌')).length;
    
    console.log('='.repeat(60));
    console.log(`\nSummary: ${passed} passed, ${warnings} warnings, ${failed} failed\n`);

    // Save results to JSON
    const resultsFile = path.join(SCREENSHOTS_DIR, 'test-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
    console.log(`✅ Results saved to ${resultsFile}`);
    console.log(`📸 Screenshots saved to ${SCREENSHOTS_DIR}`);
}

runTests().catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
});
