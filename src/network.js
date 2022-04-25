const ethers = require('ethers');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Mutex = require('async-mutex').Mutex;

const subApis = new Map();
const evmProviders = new Map();
const subConnMutex = new Mutex();
const evmConnMutex = new Mutex();

async function establishSubstrate(url) {
    const release = await subConnMutex.acquire();
    return new Promise(async (resolve, reject) => {
        try {
            if (subApis.has(url)) {
                release();
                resolve(subApis.get(url));
            } else {
                console.log(`Establish connection with substrate node`);
                const provider = new WsProvider(url);
                const api = await ApiPromise.create({provider});
                subApis.set(url, api);
                release();
                resolve(api);
            }
        } catch (e) {
            release();
            reject(e);
        }
    });
}

async function establishEvm(url) {
    const release = await evmConnMutex.acquire();
    return new Promise(async (resolve, reject) => {
        try {
            if (evmProviders.has(url)) {
                release();
                resolve(evmProviders.get(url));
            } else {
                console.log(`Establish connection with evm node`);
                const provider = new ethers.providers.JsonRpcProvider(url)
                evmProviders.set(url, provider);
                release();
                resolve(provider);
            }
        } catch (e) {
            release();
            reject(e);
        }
    });
}

module.exports = {
    establishSubstrate,
    establishEvm
}