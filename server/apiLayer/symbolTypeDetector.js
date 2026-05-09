/**
 * symbolTypeDetector - Categorizes symbols for intelligent routing.
 */
class SymbolTypeDetector {
    detect(symbol) {
        if (!symbol) return 'UNKNOWN';
        const upper = symbol.toUpperCase();
        
        if (upper.startsWith('^')) return 'INDEX';
        if (upper.endsWith('.NS')) return 'INDIAN_STOCK';
        
        return 'US_STOCK';
    }
}

module.exports = new SymbolTypeDetector();
