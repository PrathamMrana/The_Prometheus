const axios = require('axios');

const API = 'http://localhost:3001';
const ROUTES = [
    '/api/stats',
    '/api/trade/place',
    '/api/market/search',
    '/api/portfolio/stats',
    '/api/system/logs',
    '/api/metrics'
];

async function runFuzzAudit() {
    console.log("--- PROMETHEUS v7.0: API SECURITY FUZZ AUDIT ---");
    
    for (const route of ROUTES) {
        console.log(`[FUZZ] Testing Route: ${route}`);
        
        // 1. Malformed JSON
        try {
            await axios.post(`${API}${route}`, "INVALID_JSON_CONTENT", {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.log(`[FUZZ] ${route} -> Malformed JSON: Rejected (${e.response?.status || 'ERR'})`);
        }

        // 2. Large Payload
        const largeData = 'A'.repeat(1024 * 512); // 512KB
        try {
            await axios.post(`${API}${route}`, { data: largeData });
        } catch (e) {
            console.log(`[FUZZ] ${route} -> Large Payload: Rejected (${e.response?.status || 'ERR'})`);
        }

        // 3. Unauthorized Access (No JWT)
        try {
            await axios.get(`${API}${route}`);
        } catch (e) {
            console.log(`[FUZZ] ${route} -> No JWT: Rejected (${e.response?.status || 'ERR'})`);
        }
    }
    
    console.log("\n✅ API FUZZ AUDIT COMPLETE");
}

runFuzzAudit();
