'use strict';
require('dotenv').config();
const express = require('express');
const server = express();
const register = require('prom-client').register;

const reserve_balance = require('reserve-balance');
const utils = require('./utils.js');
const tokens = require('./tokens.json');

// Enable collection of default metrics

require('prom-client').collectDefaultMetrics({
	gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

// Create custom metrics
const Histogram = require('prom-client').Histogram;
const h = new Histogram({
	name: 'test_histogram',
	help: 'Example of a histogram',
	labelNames: ['code'],
});

const Counter = require('prom-client').Counter;
const c = new Counter({
	name: 'test_counter',
	help: 'Example of a counter',
	labelNames: ['code'],
});

new Counter({
	name: 'scrape_counter',
	help: 'Number of scrapes (example of a counter with a collect fn)',
	collect() {
		// collect is invoked each time `register.metrics()` is called.
		this.inc();
	},
});

const Gauge = require('prom-client').Gauge;
const g = new Gauge({
	name: 'test_gauge',
	help: 'Example of a gauge',
	labelNames: ['method', 'code'],
});

const ReserveBalance = new Gauge({
	name: 'reserve_balance',
	help: 'Blance of reserve account on specific chain',
	labelNames: ['token', 'chain'],
});


// Set metric values to some random values for demonstration

setTimeout(() => {
	h.labels('200').observe(Math.random());
	h.labels('300').observe(Math.random());
}, 10);

setInterval(() => {
	c.inc({ code: 200 });
}, 5000);

setInterval(() => {
	c.inc({ code: 400 });
}, 2000);

setInterval(() => {
	c.inc();
}, 2000);

setInterval(() => {
	g.set({ method: 'get', code: 200 }, Math.random());
	g.set(Math.random());
	g.labels('post', '300').inc();
}, 100);

setInterval(async () => {
    await reserve_balance.update_balance_of(tokens);
}, 10000);  // 10s


const t = [];
setInterval(() => {
	for (let i = 0; i < 100; i++) {
		t.push(new Date());
	}
}, 10);
setInterval(() => {
	while (t.length > 0) {
		t.pop();
	}
});

// Setup server to Prometheus scrapes:

server.get('/metrics', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/counter', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('test_counter'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/scrape', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('scrape_counter'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/histogram', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('test_histogram'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/guage', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('test_gauge'));
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

const port = process.env.PORT || 3000;
console.log(
	`Server listening to ${port}, metrics exposed on /metrics endpoint`,
);
server.listen(port);
