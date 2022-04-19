'use strict';
require('dotenv').config();
const express = require('express');
const server = express();
const register = require('prom-client').register;
const Gauge = require('prom-client').Gauge;
const reserve_balances = require('./src/reserve-balances.js');
const utils = require('./src/utils.js');
const tokens = require('./tokens.json');

// Enable collection of default metrics
require('prom-client').collectDefaultMetrics({
	gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

// Create custom metrics
// const Histogram = require('prom-client').Histogram;
// const h = new Histogram({
// 	name: 'test_histogram',
// 	help: 'Example of a histogram',
// 	labelNames: ['code'],
// });


// Set metric values to some random values for demonstration

// setTimeout(() => {
// 	h.labels('200').observe(Math.random());
// 	h.labels('300').observe(Math.random());
// }, 10);

setInterval(async () => {
    await reserve_balances.update_balance_of(tokens);
}, Number(process.env.BALANCE_UPDATE_INTERVAL));

// Setup server to Prometheus scrapes:
server.get('/metrics', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	} catch (ex) {
		res.status(500).end(ex);
	}
});

/*
server.get('/metrics/histogram', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('test_histogram'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});
*/

server.get('/metrics/rb', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('reserve_balance'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

const port = process.env.PORT || 3001;
console.log(
	`Server listening to ${port}, metrics exposed on /metrics endpoint`,
);
server.listen(port);
