
const IERC20Json = require('../IERC20.json');
const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Gauge = require('prom-client').Gauge;
const utils = require('./utils.js');
const network = require('./network.js');

const ReserveBalance = new Gauge({
	name: 'reserve_balance',
	help: 'Blance of reserve account on specific chain',
	labelNames: ['token', 'chain'],
});

async function updateBalanceOf(tokens) {
    Promise.all(tokens.map(async token => {
        let balance = 'undefined';
        if (token.chain_bype === 'sub') {
            let api = await network.establishSubstrate(token.endpoint);
            if (token.is_native) {
                // Qury balance use balances module
                throw new Error("Unimplemented");
            } else {
                // Qury balance use assets module
                balance = (await api.query.assets.account(token.asset_id, token.account)).toJSON().balance;
            }
        } else if (token.chain_bype === 'evm') {
            let provider = await network.establishEvm(token.endpoint + process.env.ONFINALITY_API_KEY);
            if (token.is_native) {
                // Qury balance through network RPC
                throw new Error("Unimplemented");
            } else {
                // Qury balance according erc20 protocol
                const erc20Token = new ethers.Contract(token.contract_address, IERC20Json.abi, provider);
                balance = await erc20Token.balanceOf(token.account);
            }
        } else {
            throw new Error("Unsupported chain type");
        }
        console.info(`Got balance of ${token.name} on ${token.chain} network: ${utils.fromUnit(balance, token.decimals)}`);
        ReserveBalance.set({ token: token.name, chain: token.chain }, utils.fromUnit(balance, token.decimals));
    }));
}

module.exports = {
    updateBalanceOf,
}