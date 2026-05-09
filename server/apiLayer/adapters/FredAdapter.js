/**
 * FredAdapter - Institutional Macro-Economic Pulse.
 */
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class FredAdapter extends BaseAdapter {
    constructor() {
        super('FRED', process.env.FRED_KEY);
        this.baseUrl = 'https://api.stlouisfed.org/fred';
    }

    async getMacro(seriesId) {
        const url = `${this.baseUrl}/series/observations?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json&sort_order=desc&limit=1`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (!resp.ok) return null;

            const data = await resp.json();
            if (!data.observations || !data.observations[0]) return null;

            return {
                value: parseFloat(data.observations[0].value),
                date: data.observations[0].date,
                timestamp: Date.now()
            };
        } catch (e) {
            return null;
        }
    }

    async getIndicators(type) {
        // Map type to FRED Series ID
        const mapping = {
            'INTEREST_RATE': 'FEDFUNDS',
            'GDP': 'GDP',
            'INFLATION': 'CPIAUCSL'
        };
        const seriesId = mapping[type];
        if (!seriesId) return null;
        return this.getMacro(seriesId);
    }
}

module.exports = FredAdapter;
