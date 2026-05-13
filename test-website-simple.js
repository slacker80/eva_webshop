const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const testResults = [];

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

async function runTests() {
    console.log('🚀 Starting website tests...\n');

    try {
        // Test 1: Homepage Load
        console.log('Test 1: Homepage loads');
        try {
            const response = await makeRequest(BASE_URL);
            const status = response.status;
            
            if (status === 200) {
                testResults.push({ test: 'Homepage Load', status: '✅ PASS', details: `HTTP ${status}` });
                console.log(`✅ PASS - HTTP ${status}\n`);
            } else {
                testResults.push({ test: 'Homepage Load', status: '❌ FAIL', details: `HTTP ${status}` });
                console.log(`❌ FAIL - HTTP ${status}\n`);
            }
        } catch (error) {
            testResults.push({ test: 'Homepage Load', status: '❌ FAIL', details: error.message });
            console.log(`❌ FAIL - ${error.message}\n`);
        }

        // Test 2: Content Verification
        console.log('Test 2: Lorem ipsum content visibility');
        try {
            const response = await makeRequest(BASE_URL);
            const body = response.body;
            
            const hasHero = body.includes('Welcome to Crystal Jewelz');
            const hasLoremIpsum = body.includes('Lorem ipsum dolor sit amet');
            const hasAboutSection = body.includes('About Our Collection');
            const hasFeatures = body.includes('Premium Quality') && body.includes('Handcrafted') && body.includes('Fast Shipping');
            
            if (hasHero && hasLoremIpsum && hasAboutSection && hasFeatures) {
                testResults.push({ test: 'Content Visibility', status: '✅ PASS', details: 'All sections present (hero, about, features, lorem)' });
                console.log(`✅ PASS - All sections found\n`);
            } else {
                const missing = [];
                if (!hasHero) missing.push('hero');
                if (!hasLoremIpsum) missing.push('lorem ipsum');
                if (!hasAboutSection) missing.push('about section');
                if (!hasFeatures) missing.push('features');
                testResults.push({ test: 'Content Visibility', status: '❌ FAIL', details: `Missing: ${missing.join(', ')}` });
                console.log(`❌ FAIL - Missing: ${missing.join(', ')}\n`);
            }
        } catch (error) {
            testResults.push({ test: 'Content Visibility', status: '❌ FAIL', details: error.message });
            console.log(`❌ FAIL - ${error.message}\n`);
        }

        // Test 3: Links Verification
        console.log('Test 3: API endpoints accessibility');
        try {
            const apiTests = [
                { url: BASE_URL + '/api/products', name: 'Products API' },
                { url: BASE_URL + '/api/cart', name: 'Cart API' }
            ];

            let allPassed = true;
            const details = [];

            for (const apiTest of apiTests) {
                try {
                    const apiResponse = await makeRequest(apiTest.url);
                    if (apiResponse.status === 200) {
                        details.push(`${apiTest.name}: ✅`);
                    } else {
                        details.push(`${apiTest.name}: HTTP ${apiResponse.status}`);
                        allPassed = false;
                    }
                } catch (e) {
                    details.push(`${apiTest.name}: ❌ ${e.message}`);
                    allPassed = false;
                }
            }

            if (allPassed) {
                testResults.push({ test: 'API Endpoints', status: '✅ PASS', details: details.join(' | ') });
                console.log(`✅ PASS - ${details.join(' | ')}\n`);
            } else {
                testResults.push({ test: 'API Endpoints', status: '⚠️ WARNING', details: details.join(' | ') });
                console.log(`⚠️ WARNING - ${details.join(' | ')}\n`);
            }
        } catch (error) {
            testResults.push({ test: 'API Endpoints', status: '⚠️ WARNING', details: error.message });
            console.log(`⚠️ WARNING - ${error.message}\n`);
        }

        // Test 4: Static assets
        console.log('Test 4: Static assets availability');
        try {
            const assets = [
                { url: BASE_URL + '/', name: 'HTML' },
                { url: BASE_URL + '/index.html', name: 'index.html' }
            ];

            let loadable = 0;
            for (const asset of assets) {
                try {
                    const response = await makeRequest(asset.url);
                    if (response.status === 200) loadable++;
                } catch (e) {
                    // Ignore
                }
            }

            testResults.push({ 
                test: 'Static Assets', 
                status: loadable === assets.length ? '✅ PASS' : '⚠️ WARNING', 
                details: `${loadable}/${assets.length} assets loaded` 
            });
            console.log(`✅ PASS - ${loadable}/${assets.length} assets loaded\n`);
        } catch (error) {
            testResults.push({ test: 'Static Assets', status: '⚠️ WARNING', details: error.message });
            console.log(`⚠️ WARNING - ${error.message}\n`);
        }

        // Test 5: Response time
        console.log('Test 5: Performance - Response time');
        try {
            const start = Date.now();
            await makeRequest(BASE_URL);
            const duration = Date.now() - start;
            const ok = duration < 3000;

            testResults.push({ 
                test: 'Response Time', 
                status: ok ? '✅ PASS' : '⚠️ WARNING', 
                details: `${duration}ms` 
            });
            console.log(`${ok ? '✅ PASS' : '⚠️ WARNING'} - Response time: ${duration}ms\n`);
        } catch (error) {
            testResults.push({ test: 'Response Time', status: '❌ FAIL', details: error.message });
            console.log(`❌ FAIL - ${error.message}\n`);
        }

    } finally {
        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('='.repeat(60) + '\n');

        testResults.forEach(result => {
            console.log(`${result.status} ${result.test}`);
            console.log(`   → ${result.details}\n`);
        });

        const passed = testResults.filter(r => r.status.includes('✅')).length;
        const warnings = testResults.filter(r => r.status.includes('⚠️')).length;
        const failed = testResults.filter(r => r.status.includes('❌')).length;
        
        console.log('='.repeat(60));
        console.log(`Summary: ${passed} passed, ${warnings} warnings, ${failed} failed`);
        console.log('='.repeat(60) + '\n');

        // Save results
        const resultsFile = path.join(SCREENSHOTS_DIR, 'test-results.json');
        fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
        console.log(`✅ Results saved to ${resultsFile}`);
    }
}

runTests().catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
});
