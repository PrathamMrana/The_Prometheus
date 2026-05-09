/**
 * GroqAdapter - Elite-Grade AI Insights & Signal Synthesis.
 */
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class GroqAdapter extends BaseAdapter {
    constructor() {
        super('GROQ', process.env.GROQ_API_KEY);
        this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    async getInsights(prompt) {
        const payload = {
            model: "llama3-70b-8192",
            messages: [
                { role: "system", content: "You are an $80M-grade institutional quant analyst. Provide concise, impactful market insights." },
                { role: "user", content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 150
        };

        try {
            const resp = await this.fetchWithTimeout(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) return null;
            const data = await resp.json();
            return {
                insight: data.choices[0].message.content,
                timestamp: Date.now(),
                source: 'GROQ'
            };
        } catch (e) {
            return null;
        }
    }
}

module.exports = GroqAdapter;
