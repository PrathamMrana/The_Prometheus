const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Mock setup for the test server
const Persistence = require('../server/utils/persistence');
const executionRoutes = require('../server/routes/execution');
const PortfolioManager = require('../server/execution/portfolioManager');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => res.json({ status: 'TEST_SERVER_ACTIVE' }));

// The Alpha Layer / API route we're testing
app.use('/api/trade', executionRoutes);

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 [TEST SERVER] Running on ${PORT} (WITHOUT WORKER)`);
});
