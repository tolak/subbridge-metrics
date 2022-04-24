
const ethers = require('ethers');

function from_unit(balance, decimals) {
    return ethers.BigNumber.from(balance)
        .div(
            ethers.BigNumber.from(10).pow(ethers.BigNumber.from(decimals))
        ).toNumber();
}

function minsPassed(start) {
    (Date.now() - start) / 60
}

module.exports = {
    fromUnit,
    minsPassed,
}