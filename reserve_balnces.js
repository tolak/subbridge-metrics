
const IERC20Json = require('./IERC20.json');
const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");

async function update_balance_of(tokens) {
    Promise.all(tokens.map(async token => {
        let balance = 'undefined';
        if (token.chain_bype === 'sub') {
            const provider = new WsProvider(token.endpoint);
            const api = await ApiPromise.create({provider});
            if (token.is_native) {
                // Qury balance use balances module
                throw new Error("Unimplemented");
            } else {
                // Qury balance use assets module
                balance = (await api.query.assets.account(token.asset_id, token.account)).toJSON().balance;
            }
        } else if (token.chain_bype === 'evm') {
            const provider = new ethers.providers.JsonRpcProvider(token.endpoint + process.env.ONFINALITY_API_KEY);
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
        console.log(`Got balance of ${token.name} on ${token.chain} network: ${utils.from_unit(balance, token.decimals)}`);
        ReserveBalance.set({ token: token.name, chain: token.chain }, utils.from_unit(balance, token.decimals));
    }));
}

module.export = {
    update_balance_of,
}