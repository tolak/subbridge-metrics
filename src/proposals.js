const fs = require('fs');
const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Histogram = require('prom-client').Histogram;
const utils = require('./utils.js');
const network = require('./network.js');
const config = require('../config.json')
const BridgeContractAddress = require('../config.json').bridge;
const BridgeJson = require('../Bridge.json');

const proposalFileName = '/.proposals';
const blockFileName = '/.block';
let proposalPendingQueue = [];
// Mark if we are currently fetch blocks from source chain
let isSyncing = false;
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
    if (runMode === 'lookup') {
        await _lookupProposals();
        runMode = 'cleanup';
    } else {
        await _cleanProposals();
        runMode = 'lookup';
    }
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
            console.log(`Config file not found, try read start block from data store`);
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
    console.log(`Set last handed block to ${latestHandledBlock}, step to ${syncStep}`);

    // Fetch proposals from local file system
    const proposalStorePath = dataStorePath + proposalFileName;
    try {
        const proposalFile = fs.readFileSync(proposalStorePath, { encoding: 'utf8', flag: 'r' });
        proposalPendingQueue = JSON.parse(proposalFile);
        console.log(`Found ${proposalPendingQueue.length} intial proposals, add them to pending queue`);
    } catch(err) {
        if (err.code === 'ENOENT') {
            console.log(`Proposal file not found, try create it`);
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
    // Update proposals time
    for (let proposal of proposalPendingQueue) {
        h.labels(proposal.chain, proposal.nonce).observe(utils.minsPassed(proposal.createdAt));
    }
}

/**
 * Internal interval task to remove executed proposals from proposalPendingQueue
 */
 async function _cleanProposals() {
    let promises = [];
    // Update proposals time
    for (let proposal of proposalPendingQueue) {
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
            newPendingProposalQueue.push(pendingProposals[index]);
        }
    }
    pendingProposals = newPendingProposalQueue;
}

/**
 * Internal interval task to lookup proposals from source chain
 * 
 * If the task if running, e.g. isSyncing set to true, should return and retry when timer triggered again.
 */
async function _lookupProposals() {
    if (isSyncing) return;
    isSyncing = true;

    // fetch blocks and checkout bridge transfer
    const proposals = await _lookupProposalsFromBlocks();
    const pendingProposals = proposals.filter(p => { return (p.voteStatus.status !== 'Executed') && (p.voteStatus.status !== 'Cancelled')})

    if (pendingProposals.length === 0) return;
    jsonStr = JSON.stringify(_mergePendingProposals(pendingProposals), null, 2);
    fs.writeFileSync(globalDataStorePath + proposalFileName, jsonStr, { encoding: "utf-8" });

    isSyncing = false;
}

function _mergePendingProposals(proposals) {
    // Merge
    pendingProposals = [...new Set([...pendingProposals, ...proposals])];

    // Sort
    pendingProposals.sort((a, b) => {
        return a.nonce > b.nonce;
    });
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
    // console.log(`==> events: ${JSON.stringify(events, null, 2)}`);
    if (events.length > 0) {
        console.log(`==> proposals exist in block ${hash}`);
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
        console.log(JSON.stringify(proposals, null, 2));
    }
    return proposals;
}

async function _lookupProposalsFromBlocks() {
    const khalaApi = await network.establishSubstrate(config.khalaEndpoint);
    const evmProvider = network.establishEvm(config.evmEndpoint + process.env.INFURA_API_KEY);

    let proposals = [];
    const latestHeader = await khalaApi.rpc.chain.getHeader();
    const latestBlock = Number(latestHeader.number);
    console.log(`Get latest block from network ${config.khalaEndpoint}: #${latestBlock}`);

    const step = syncStep;
    const missingBlocks = latestBlock - latestHandledBlock;
    if (missingBlocks <= 0) {
        throw new Error(`Wrong block height {${latestHandledBlock}, ${latestBlock}}. qed`);
    }

    const nSteps = Math.floor(missingBlocks/step) + (missingBlocks%step === 0 ? 0 : 1);
    console.log(`We have missed #${missingBlocks} blocks, need to run #${nSteps} times`);
    for (let counter = 0; counter < nSteps; counter++) {
        const from = latestHandledBlock;
        const to = counter === (nSteps -1) ? 
            from + (missingBlocks%step - 1) : 
            (from + step - 1);
        console.log(`#[${counter}/${nSteps-1}] fetch batch block hash from ${from} to ${to}`);
        const hashList =  await _fetchSomeBlocksHash(khalaApi, from, to);

        for (const hash of hashList) {
            try {
                proposals = proposals.concat(await _filterBridgeEvent(khalaApi, evmProvider, hash));
                latestHandledBlock++;
                fs.writeFileSync(globalDataStorePath + blockFileName, `"latestHandledBlock": ${latestHandledBlock}`, { encoding: 'utf8', flag: 'w'});
            } catch (e) {
                throw new Error(`Failed to parse block: error: ${e}`);
            }
        }
    }

    return proposals;
}

module.exports = {
    initialize,
    updateProposalTime,
}

