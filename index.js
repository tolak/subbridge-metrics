'use strict';
require('dotenv').config();
const express = require('express');
const server = express();
const register = require('prom-client').register;
const Gauge = require('prom-client').Gauge;
const balances = require('./src/balances.js');
const proposals = require('./src/proposals.js');
const transfer = require('./src/transfer');
const utils = require('./src/utils.js');
const tokens = require('./tokens.json');

// Enable collection of default metrics
require('prom-client').collectDefaultMetrics({
	gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

setInterval(async () => {
    await transfer.updateTransferRecords();
}, Number(20 * process.env.UPDATE_INTERVAL));

// setInterval(async () => {
//     await balances.updateBalanceOf(tokens);
// }, 2 * Number(process.env.UPDATE_INTERVAL));

setInterval(async () => {
    await proposals.updateProposalTime();
}, Number(process.env.UPDATE_INTERVAL));

// Setup server to Prometheus scrapes:
server.get('/metrics', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/pro', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('pending_proposals'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/rb', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('reserve_balance'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/block', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('latest_processed_block'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/send', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('sending_amount'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/receive', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('receiving_amount'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

// Initialize proposal handler
proposals.initialize(__dirname + '/config.json', __dirname);

// Initialize transfer handler
transfer.initialize(__dirname, "https://api.subquery.network/sq/Phala-Network/khala-subbridge-subquery__UGhhb")

const port = process.env.PORT || 3001;
console.info(
	`Server listening to ${port}, metrics exposed on /metrics endpoint`,
);
server.listen(port);
