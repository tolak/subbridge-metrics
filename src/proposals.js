const fs = require('fs');
const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Histogram = require('prom-client').Histogram;
const utils = require('./utils.js');
const network = require('./network.js');
const config = require('../config.json');
const BridgeContractAddress = require('../config.json').bridge;
const BridgeJson = require('../Bridge.json');

const proposalFileName = '/.proposals';
const blockFileName = '/.block';
let globalProposalPendingQueue = [];
// Mark if we are currently fetch blocks from source chain
let isProcessing = false;
// Run mode of interval task
let runMode = 'lookup';   // or set to 'cleanup'
let latestHandledBlock = 0;
let syncStep = 10;
let globalDataStorePath = './';

const ProposalPendingTime = new Histogram({
	name: 'pending_proposals',
	help: 'Every pending proposal send to EVM chains',
	labelNames: ['chain', "nonce"],
});

setInterval(async () => {
    if (isProcessing) {
        console.debug(`📜 Interval task not finished, return.`);
        return;
    }
    isProcessing = true;

    // Simple way to grantee no concurrency issue happened on globalProposalPendingQueue,
    if (runMode === 'lookup') {
        console.info('📜 Runing proposal lookup task');
        await _lookupProposals();
        runMode = 'cleanup';
    } else {
        console.info('📜 Runing proposal cleanup task');
        await _cleanProposals();
        runMode = 'lookup';
    }
    isProcessing = false;
}, config.lookupPropoalInterval);

/**
 * External task to initialize the module
 */
function initialize(configPath, dataStorePath) {
    globalDataStorePath = dataStorePath;
    // Initialize latestHandledBlock from given config or local file system record
    try {
        const configFile = fs.readFileSync(configPath, { encoding: 'utf8', flag: 'r' });
        const config = JSON.parse(configFile);
        latestHandledBlock = config.startBlock;
        syncStep = config.syncStep;
    } catch(err) {
        if (err.code === 'ENOENT') {
            console.info(`📜 Config file not found, try read start block from data store`);
            try {
                const blockHistoryFile = fs.readFileSync(dataStorePath + blockFileName, { encoding: 'utf8', flag: 'r' });
                const blockHistory = JSON.parse(blockHistoryFile);
                latestHandledBlock = blockHistory.startBlock;
            } catch(err) {
                throw err;
            }
        } else {
            throw err;
        }
    }
    console.info(`📜 Set last handed block to ${latestHandledBlock}, step to ${syncStep}`);

    // Fetch proposals from local file system
    const proposalStorePath = dataStorePath + proposalFileName;
    try {
        const proposalFile = fs.readFileSync(proposalStorePath, { encoding: 'utf8', flag: 'r' });
        globalProposalPendingQueue = JSON.parse(proposalFile);
        console.info(`📜 Found ${globalProposalPendingQueue.length} intial proposals, add them to pending queue`);
    } catch(err) {
        if (err.code === 'ENOENT') {
            console.info(`📜 Proposal file not found, try create it`);
            fs.writeFileSync(proposalStorePath, '[]', { encoding: 'utf8', flag: 'a'});
        } else {
            throw err;
        }
    }
}

/**
 * External interval task to update the time used in minutes of pending proposals
 */
async function updateProposalTime() {
    if (globalProposalPendingQueue.length === 0) {
        console.debug(`📜 No pending proposal found, return.`);
        return;
    }
    // Update proposals time
    for (const proposal of globalProposalPendingQueue) {
        ProposalPendingTime.labels(proposal.chain, proposal.nonce).observe(utils.minsPassed(proposal.createdAt));
    }
}

/**
 * Internal interval task to remove executed proposals from globalProposalPendingQueue
 */
 async function _cleanProposals() {
    let promises = [];
    // Update proposals time
    for (let proposal of globalProposalPendingQueue) {
        const bnString = ethers.utils.hexZeroPad(utils.asHexNumber(proposal.amount), 32).substr(2);
        promises.push(
            new Promise(async (resolve, reject) => {
                // 1 is khala chainId
                const voteStatus = await _getProposal(evmProvider, 1, proposal.nonce, bnString, proposal.recipient)
                resolve(voteStatus);
            })
        );
    }

    // Qury latest proposal from dest chain
    const proposalStatus = await Promise.all(promises);

    // Shift pending proposal queue according to returned status
    let newPendingProposalQueue = [];
    for (const [index, staus] of proposalStatus.entries()) {
        if (status !== 'Executed' && status !== 'Cancelled') {
            newPendingProposalQueue.push(globalProposalPendingQueue[index]);
        } else {
            console.debug(`✅ Proposal {dest: ${globalProposalPendingQueue[index].destId}, nonce: ${globalProposalPendingQueue[index].nonce}} handled, cost ${utils.minsPassed(globalProposalPendingQueue[index].createdAt)} minutes`);
        }
    }
    globalProposalPendingQueue = newPendingProposalQueue;
    console.debug(`📜 Cleanup task done.`);
}

/**
 * Internal interval task to lookup proposals from source chain
 * 
 * If the task if running, e.g. isProcessing set to true, should return and retry when timer triggered again.
 */
async function _lookupProposals() {
    // fetch blocks and checkout bridge transfer
    const proposals = await _lookupProposalsFromBlocks();
    const pendingProposals = proposals.filter(p => { return (p.voteStatus.status !== 'Executed') && (p.voteStatus.status !== 'Cancelled')})

    if (pendingProposals.length === 0) return;
    const prevPendingCount = globalProposalPendingQueue.length;
    _mergeNewPendingProposals(pendingProposals);
    jsonStr = JSON.stringify(globalProposalPendingQueue, null, 2);
    fs.writeFileSync(globalDataStorePath + proposalFileName, jsonStr, { encoding: "utf-8" });
    console.debug(`📜 Lookup task done, ${globalProposalPendingQueue.length - prevPendingCount} new pending proposals found.`);
}

function _mergeNewPendingProposals(proposals) {
    // Merge
    let pendingProposals = [...new Set([...globalProposalPendingQueue, ...proposals])];

    // Sort
    pendingProposals.sort((a, b) => {
        return a.nonce > b.nonce;
    });
    globalProposalPendingQueue = pendingProposals;
}

async function _getProposal(evmProvider, chain, nonce, u256HexString, recipient) {
    const ProposalStatus = ['Inactive', 'Active', 'Passed', 'Executed', 'Cancelled'];

    const bridge = new ethers.Contract(BridgeContractAddress, BridgeJson.abi, evmProvider);
    const dataHash = utils.getDataHash(u256HexString, recipient);
    const proposal = await bridge.getProposal(chain, nonce, dataHash);
    return utils.proposalToHuman(proposal);
}

async function _fetchSomeBlocksHash(api, from, to) {
    let promises = [];
    for (let height = from; height <= to; height++) {
        promises.push(
            new Promise(async (resolve, reject) => {
                const blockHash = await api.rpc.chain.getBlockHash(height)
                if (blockHash == null) {
                    reject(new Error(`Block ${height} does not exist`));
                }
                resolve(blockHash);
            })
        );
    }

    return await Promise.all(promises);
}

async function _filterBridgeEvent(khalaApi, evmProvider, hash) {
    let proposals = [];
    const events = (await khalaApi.query.chainBridge.bridgeEvents.at(hash)).toJSON();
    const createdAt =  (await khalaApi.rpc.chain.getHeader()).timestamp;
    // console.debug(`📜 ==> events: ${JSON.stringify(events, null, 2)}`);
    if (events.length > 0) {
        console.debug(`📜 ==> proposals exist in block ${hash}`);
        for (let i = 0; i < events.length; i++) {
            const event = events[i].fungibleTransfer;
            const args = {
                destId: event[0],
                nonce: event[1],
                resourceId: event[2],
                amount: event[3],
                recipient: event[4]
            };
            const bnString = ethers.utils.hexZeroPad(utils.asHexNumber(args.amount), 32).substr(2);

            proposals.push({
                createdAt: createdAt,
                destId: args.destId,
                nonce: args.nonce,
                resourceId: args.resourceId,
                amount: args.amount,
                recipient: args.recipient,
                voteStatus: await _getProposal(evmProvider, 1, args.nonce, bnString, args.recipient)
            });
        }
    }
    return proposals;
}

async function _filterSomeEvents(api, provider, hashList) {
    let promises = [];
    for (const hash of hashList) {
        promises.push(
            new Promise(async (resolve, reject) => {
                try {
                    const proposals = await _filterBridgeEvent(api, provider, hash);
                    resolve(proposals);
                } catch (e) {
                    reject(e);
                }
            })
        );
    }

    return await Promise.all(promises);
}

async function _lookupProposalsFromBlocks() {
    const khalaApi = await network.establishSubstrate(config.khalaEndpoint);
    const evmProvider = await network.establishEvm(config.evmEndpoint + process.env.INFURA_API_KEY);

    let proposals = [];
    const latestHeader = await khalaApi.rpc.chain.getHeader();
    const latestBlock = Number(latestHeader.number);
    console.info(`📜 Get latest block from network ${config.khalaEndpoint}: #${latestBlock}`);

    const step = syncStep;
    const missingBlocks = latestBlock - latestHandledBlock;
    if (missingBlocks <= 0) {
        throw new Error(`Wrong block height {${latestHandledBlock}, ${latestBlock}}. qed`);
    }

    const nSteps = Math.floor(missingBlocks/step) + (missingBlocks%step === 0 ? 0 : 1);
    console.info(`📜 We have missed #${missingBlocks} blocks, need to run #${nSteps} times`);
    for (let counter = 0; counter < nSteps; counter++) {
        const from = latestHandledBlock;
        const to = counter === (nSteps -1) ? 
            from + (missingBlocks%step - 1) : 
            (from + step - 1);
        console.info(`📜 #[${counter}/${nSteps-1}] fetch batch block hash from khala network, range [${from}, ${to}]`);
        const hashList =  await _fetchSomeBlocksHash(khalaApi, from, to);

        try {
            // Filter events concurrently, results like [[p0, p1], [p2, p3], [p4, p5]]
            const proposalArrayList = await _filterSomeEvents(khalaApi, evmProvider, hashList);
            for (const newProposals of proposalArrayList) {
                proposals = proposals.concat(newProposals);
            }
            latestHandledBlock = to;
            fs.writeFileSync(globalDataStorePath + blockFileName, `"latestHandledBlock": ${latestHandledBlock}`, { encoding: 'utf8', flag: 'w'});
        } catch (e) {
            throw new Error(`Failed to parse block: error: ${e}`);
        }
    }

    return proposals;
}

module.exports = {
    initialize,
    updateProposalTime,
}

