
const IERC20Json = require('./IERC20.json');
const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Gauge = require('prom-client').Gauge;
const utils = require('./utils.js');

let khalaApi = 'undefined';
let moonriverProvider = 'undefined';

const ReserveBalance = new Gauge({
	name: 'reserve_balance',
	help: 'Blance of reserve account on specific chain',
	labelNames: ['token', 'chain'],
});

async function update_balance_of(tokens) {
    Promise.all(tokens.map(async token => {
        let balance = 'undefined';
        if (token.chain_bype === 'sub') {
            if (khalaApi === 'undefined') {
                console.log(`Establish connection with substrate node`);
                const provider = new WsProvider(token.endpoint);
                khalaApi = await ApiPromise.create({provider});
            }
            if (token.is_native) {
                // Qury balance use balances module
                throw new Error("Unimplemented");
            } else {
                // Qury balance use assets module
                balance = (await khalaApi.query.assets.account(token.asset_id, token.account)).toJSON().balance;
            }
        } else if (token.chain_bype === 'evm') {
            if (moonriverProvider === 'undefined') {
                console.log(`Establish connection with evm node`);
                moonriverProvider = new ethers.providers.JsonRpcProvider(token.endpoint + process.env.ONFINALITY_API_KEY);
            }
            if (token.is_native) {
                // Qury balance through network RPC
                throw new Error("Unimplemented");
            } else {
                // Qury balance according erc20 protocol
                const erc20Token = new ethers.Contract(token.contract_address, IERC20Json.abi, moonriverProvider);
                balance = await erc20Token.balanceOf(token.account);
            }
        } else {
            throw new Error("Unsupported chain type");
        }
        console.log(`Got balance of ${token.name} on ${token.chain} network: ${utils.from_unit(balance, token.decimals)}`);
        ReserveBalance.set({ token: token.name, chain: token.chain }, utils.from_unit(balance, token.decimals));
    }));
}

module.exports = {
    update_balance_of,
}