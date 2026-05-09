const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../intelligence_engine.log');

class Logger {
    log(entry) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${JSON.stringify(entry)}\n`;
        fs.appendFileSync(LOG_FILE, line);
    }

    info(msg) { this.log({ level: "INFO", message: msg }); }
    error(err) { this.log({ level: "ERROR", error: err }); }
    perf(data) { this.log({ level: "PERF", ...data }); }
}

module.exports = new Logger();
