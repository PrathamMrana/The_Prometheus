const fs = require('fs');
const path = require('path');

const persistenceDir = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(persistenceDir, 'lkg_cache.json');

let sharedInstance = null;

class Persistence {
    static save(data) {
        try {
            // 🔱 [PHASE 17] Ensure we maintain referential integrity
            if (data instanceof Map) sharedInstance = data;
            
            if (!fs.existsSync(persistenceDir)) {
                fs.mkdirSync(persistenceDir, { recursive: true });
            }
            
            const obj = Object.fromEntries(sharedInstance || data || new Map());
            fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
        } catch (e) {
            console.error("LKG Save Error:", e.message);
        }
    }

    static load() {
        if (sharedInstance) return sharedInstance;

        const BOOTSTRAP_FILE = path.join(persistenceDir, 'bootstrap_snapshot.json');

        try {
            // 🛡️ [PHASE 21] PRIMARY: Load Last Known Good state from disk
            if (fs.existsSync(CACHE_FILE)) {
                const raw = fs.readFileSync(CACHE_FILE);
                const obj = JSON.parse(raw);
                sharedInstance = new Map(Object.entries(obj));
                
                if (sharedInstance.size > 0) {
                    console.log(`📡 [PERSISTENCE] Cache Singleton Hydrated: ${sharedInstance.size} symbols.`);
                    return sharedInstance;
                }
                console.warn(`📡 [PERSISTENCE] Cache file exists but is EMPTY. Falling back to bootstrap...`);
            }

            // 🛡️ [PHASE 21] SECONDARY: Fallback to baked-in bootstrap snapshot on cold starts (Render/New Deploy)
            if (fs.existsSync(BOOTSTRAP_FILE)) {
                const raw = fs.readFileSync(BOOTSTRAP_FILE);
                const obj = JSON.parse(raw);
                sharedInstance = new Map(Object.entries(obj));
                console.log(`📡 [PERSISTENCE] Bootstrap Hydration Active: ${sharedInstance.size} symbols loaded.`);
                return sharedInstance;
            }
        } catch (e) {
            console.error("LKG Load Error:", e.message);
        }
        
        sharedInstance = new Map();
        return sharedInstance;
    }

    static getInstance() {
        if (!sharedInstance) {
            return this.load(); // Auto-init if accessed before start
        }
        return sharedInstance;
    }
}

module.exports = Persistence;
