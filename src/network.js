const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");

const subApis = new Map();
const evmProviders = new Map();

async function establishSubstrate(url) {
    if (subApis.has(url)) {
        return subApis.get(url)
    } else {
        console.log(`Establish connection with substrate node`);
        const provider = new WsProvider(url);
        const api = await ApiPromise.create({provider});
        subApis.set(url, api);
        return api;
    }
}

async function establishEvm(url) {
    if (evmProviders.has(url)) {
        return evmProviders.get(url)
    } else {
        console.log(`Establish connection with evm node`);
        const provider = new ethers.providers.JsonRpcProvider(url)
        evmProviders.set(url, provider);
        return provider;
    }
}

module.exports = {
    establishSubstrate,
    establishEvm
}