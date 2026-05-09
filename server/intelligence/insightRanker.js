class InsightRanker {
    constructor() {}

    // 🏆 Elite Prioritization: Pick Top 3
    rank(insights) {
        return insights.sort((a, b) => {
            const scoreA = (a.weight || 1) + (a.sentimentStrength || 1);
            const scoreB = (b.weight || 1) + (b.sentimentStrength || 1);
            return scoreB - scoreA;
        }).slice(0, 3);
    }
}

module.exports = new InsightRanker();
