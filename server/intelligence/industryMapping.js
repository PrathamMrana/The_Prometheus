/**
 * 📊 NIFTY 50 Industry Classification [PHASE 10.6]
 * Purpose: Used by RiskManager to track sector exposure and correlation.
 * [UPDATED] Full Nifty 50 + extended watchlist coverage.
 */

const INDUSTRY_MAP = {
    // 🏦 Banking
    "HDFCBANK":     "BANKING",
    "ICICIBANK":    "BANKING",
    "KOTAKBANK":    "BANKING",
    "AXISBANK":     "BANKING",
    "SBIN":         "BANKING",
    "INDUSINDBK":   "BANKING",
    "PNB":          "BANKING",
    "FEDERALBNK":   "BANKING",
    "IDFCFIRSTB":   "BANKING",
    "BANKBARODA":   "BANKING",
    "AUBANK":       "BANKING",
    "BANDHANBNK":   "BANKING",

    // 💰 Finance & Insurance
    "BAJFINANCE":   "FINANCE",
    "BAJAJFINSV":   "FINANCE",
    "CHOLAFIN":     "FINANCE",
    "RECLTD":       "FINANCE",
    "PFC":          "FINANCE",
    "SHRIRAMFIN":   "FINANCE",
    "MUTHOOTFIN":   "FINANCE",
    "HDFCLIFE":     "FINANCE",
    "SBILIFE":      "FINANCE",

    // 💻 Information Technology
    "TCS":          "IT",
    "INFY":         "IT",
    "WIPRO":        "IT",
    "HCLTECH":      "IT",
    "TECHM":        "IT",
    "LTIM":         "IT",
    "COFORGE":      "IT",
    "MPHASIS":      "IT",
    "PERSISTENT":   "IT",
    "LTTS":         "IT",

    // 🚗 Automobile
    "MARUTI":       "AUTO",
    "M&M":          "AUTO",
    "TATAMOTORS":   "AUTO",
    "BAJAJ-AUTO":   "AUTO",
    "HEROMOTOCO":   "AUTO",
    "EICHERMOT":    "AUTO",
    "TVSMOTOR":     "AUTO",
    "ASHOKLEY":     "AUTO",
    "BHARATFORG":   "AUTO",

    // ⚡ Energy & Utilities
    "RELIANCE":     "ENERGY",
    "ONGC":         "ENERGY",
    "NTPC":         "ENERGY",
    "POWERGRID":    "ENERGY",
    "BPCL":         "ENERGY",
    "COALINDIA":    "ENERGY",
    "GAIL":         "ENERGY",
    "ADANIGREEN":   "ENERGY",
    "ADANITRANS":   "ENERGY",

    // 💊 Pharma & Healthcare
    "SUNPHARMA":    "PHARMA",
    "DRREDDY":      "PHARMA",
    "CIPLA":        "PHARMA",
    "DIVISLAB":     "PHARMA",
    "APOLLOHOSP":   "PHARMA",
    "AUROPHARMA":   "PHARMA",
    "LUPIN":        "PHARMA",
    "BIOCON":       "PHARMA",
    "TORNTPHARM":   "PHARMA",

    // 🏗️ Metals & Mining
    "TATASTEEL":    "METALS",
    "JSWSTEEL":     "METALS",
    "HINDALCO":     "METALS",
    "VEDL":         "METALS",
    "NMDC":         "METALS",
    "SAIL":         "METALS",
    "NATIONALUM":   "METALS",

    // 🧴 FMCG & Consumer Goods
    "HINDUNILVR":   "FMCG",
    "ITC":          "FMCG",
    "NESTLEIND":    "FMCG",
    "BRITANNIA":    "FMCG",
    "TATACONSUM":   "FMCG",
    "VBL":          "FMCG",
    "GODREJCP":     "FMCG",
    "DABUR":        "FMCG",
    "MARICO":       "FMCG",

    // 🎨 Consumer Discretionary
    "ASIANPAINT":   "CONSUMER",
    "TITAN":        "CONSUMER",
    "BERGEPAINT":   "CONSUMER",
    "PIDILITIND":   "CONSUMER",
    "TRENT":        "CONSUMER",

    // 🏗️ Infrastructure & Construction
    "LT":           "INFRA",
    "ADANIPORTS":   "INFRA",
    "ADANIENT":     "INFRA",
    "GRASIM":       "INFRA",
    "ULTRACEMCO":   "INFRA",
    "AMBUJACEM":    "INFRA",
    "ACC":          "INFRA",

    // 📡 Telecom
    "BHARTIARTL":   "TELECOM",
    "IDEA":         "TELECOM",
    "INDUSTOWER":   "TELECOM",

    // 🛡️ Defense
    "HAL":          "DEFENSE",
    "BEL":          "DEFENSE",
    "BDL":          "DEFENSE",
    "MAZDOCK":      "DEFENSE",

    // 📈 Indices (tracked but not traded)
    "NSEI":         "INDEX",
    "NSEBANK":      "INDEX",
    "BSESN":        "INDEX",
    "GSPC":         "INDEX",
    "IXIC":         "INDEX",
    "VIX":          "MACRO",
    "INDIAVIX":     "MACRO",
};

/**
 * Get the industry for a specific symbol.
 * Returns "OTHER" if not mapped — never returns undefined.
 */
const getIndustry = (symbol) => {
    return INDUSTRY_MAP[symbol] || "OTHER";
};

module.exports = {
    INDUSTRY_MAP,
    getIndustry
};
