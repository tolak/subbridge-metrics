const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Histogram = require('prom-client').Histogram;
const utils = require('./utils.js');
const network = require('./network.js');

/**
 * A pending proposal object is:
 * {
 *      createdAt: timestamp,
 *      chain: String,
 *      nonce: Number
 * }
 */
const proposalPendingQueue = [];
// Mark if we are currently fetch blocks from source chain
const isSyncing = false;
const latestHandledBlock = 0;

const ProposalPendingTime = new Histogram({
	name: 'pending_proposals',
	help: 'Every pending proposal send to EVM chains',
	labelNames: ['chain', "nonce"],
});

/**
 * External task to initialize the module
 */
async function initialize() {
    // Initialize latestHandledBlock from local file system record or from given config

    // Fetch proposals from local file system

}

/**
 * External interval task to update the time used in minutes of pending proposals
 */
async function updateProposalTime() {
    // Update proposals time
    for (proposal in proposalPendingQueue) {
        h.labels(proposal.chain, proposal.nonce).observe(utils.minsPassed(proposal.createdAt));
    }
}

/**
 * Internal interval task to lookup proposals from source chain
 * 
 * If the task if running, e.g. isSyncing set to true, should return and retry when timer triggered again.
 */
async function lookupProposals() {

}

/**
 * Internal interval task to remove executed proposals from proposalPendingQueue
 */
async function cleanProposals() {

}

module.exports = {
    initialize,
    updateProposalTime,
}

