const fs = require('fs');
const Gauge = require('prom-client').Gauge;
const {gql, GraphQLClient} = require('graphql-request')
const { Decimal } = require('decimal.js')
const { encodeAddress } = require("@polkadot/util-crypto");

// const config = require('../config.json');

const transdferFileName = '/.transfer';
let indexer = null;
let dataStorePath = '';

const UserSendingAmount = new Gauge({
	name: 'sending_amount',
	help: 'PHA sending to other chain',
	labelNames: ["sender", "recipient"],
})

const UserRecevingAmount = new Gauge({
	name: 'receving_amount',
	help: 'PHA receving from other chain',
	labelNames: ["recipient"],
})

function initialize(path, endpoint) {
    dataStorePath = path
    indexer = new GraphQLClient(endpoint, {
        timeout: 300000,
    })
}

/**
 * External interval task to update the transfer records
 * 
 * Note this function would fetch the indexed data from SubQuery
 */
 async function updateTransferRecords() {
    const transferStore = fs.readFileSync(dataStorePath + transdferFileName, { encoding: 'utf8', flag: 'r' });
    const startTime = JSON.parse(transferStore).startTime
    const nextTime = new Date().toISOString()

    console.log(`Start to fetch records from ${startTime}, next round start at ${nextTime}`)

    // Fetch sending and receving records from SubQuery
    const xcmSendingRecords = await getXcmRangeSendingHistory(startTime)
    // console.log(`Get Xcm sending records: ${JSON.stringify(xcmSendingRecords, null, 2)}`)
    xcmSendingRecords.map(raw => {
        let record = raw.xcm
        let asset = JSON.parse(record.asset)
        // MultiLocation of PHA on Khala: "{\"parents\":0,\"interior\":{\"here\":null}}"
        if (asset.parents === 0) {
            let key = {sender: toKhalaAddress(record.sender), recipient: record.recipient}
            console.log(`xcm sending record: ${toKhalaAddress(record.sender)}`)
            UserSendingAmount.set(key, toPHA(record.amount));
        }
    })

    const chainbridgeSendingRecords = await getChainbridgeRangeSendingHistory(startTime)
    // console.log(`Get Chainbridge sending records: ${JSON.stringify(chainbridgeSendingRecords, null, 2)}`)
    chainbridgeSendingRecords.map(raw => {
        let record = raw.chainbridge
        // ResourceId of PHA on Khala: 0x00e6dfb61a2fb903df487c401663825643bb825d41695e63df8af6162ab145a6
        if (record.resourceId === '0x00e6dfb61a2fb903df487c401663825643bb825d41695e63df8af6162ab145a6') {
            let key = {sender: toKhalaAddress(record.sender), recipient: 'ethereum/' + record.recipient}
            console.log(`chainbridge sending record: ${toKhalaAddress(record.sender)}`)
            UserSendingAmount.set(key, toPHA(record.amount));
        }
    })

    const recevingRecords = await getRangeRecevingRecords(startTime)
    // console.log(`Get receving records: ${JSON.stringify(recevingRecords, null, 2)}`)
    recevingRecords.map(record => {
        let asset = JSON.parse(record.asset)
        // MultiLocation of PHA on Khala: "{\"parents\":0,\"interior\":{\"here\":null}}"
        if (asset.parents === 0) {
            let key = {recipient: record.account}
            UserRecevingAmount.set(key, toPHA(record.amount))
        }
    })

    let jsonStr = JSON.stringify({"startTime": nextTime}, null, 2);
    fs.writeFileSync(dataStorePath + transdferFileName, jsonStr, { encoding: "utf-8" })

    console.debug(`📜 Run transfer update inverval task completed.`)
}

function toPHA(unit) {
    return new Decimal(unit).div(
        new Decimal(new Decimal(10).pow(new Decimal(12)).toString())
    ).toNumber()
}

function toKhalaAddress(pubkey) {
    return encodeAddress(pubkey, 30).toString();
}

function getXcmRangeSendingHistory(from) {
    return new Promise((resolve, reject) => {
    indexer.request(
        gql`
         {
            xTransferSents (orderBy: CREATED_AT_DESC, filter: {isXcm: {equalTo: true}, createdAt: {greaterThanOrEqualTo: \"${from}\"}}) {
                nodes {
                    createdAt
                    sender
                    xcm {
                        id
                        asset
                        sender
                        recipient
                        amount
                        sendTx {
                            sender
                            hash
                        }
                    }
                }
            }
        }
        `
        )
        .then((data) => {
            if (data.xTransferSents.nodes.length > 0) {
                resolve(data.xTransferSents.nodes)
            } else {
                resolve([])
            }
        })
        .catch((e) => {
        reject(
            new Error(
            'Error getting xTransferSents from blockchain: ' +
                JSON.stringify(e)
            )
        )
        })
    })
  }

function getChainbridgeRangeSendingHistory(from) {
    return new Promise((resolve, reject) => {
    indexer.request(
        gql`
         {
            xTransferSents (orderBy: CREATED_AT_DESC, filter: {isChainbridge: {equalTo: true}, createdAt: {greaterThanOrEqualTo: \"${from}\"}}) {
                nodes {
                    isChainbridge
                    chainbridge {
                        destChainId
                        depositNonce
                        resourceId
                        sender
                        recipient
                        amount
                        sendTx {
                            sender
                            hash
                        }
                    }
                }
            }
        }
        `
        )
        .then((data) => {
            if (data.xTransferSents.nodes.length > 0) {
                resolve(data.xTransferSents.nodes)
            } else {
                resolve([])
            }
        })
        .catch((e) => {
        reject(
            new Error(
            'Error getting xTransferSents from blockchain: ' +
                JSON.stringify(e)
            )
        )
        })
    })
  }

  function getRangeRecevingRecords(from) {
    return new Promise((resolve, reject) => {
          indexer.request(
            gql`
            {
                xTransferDepositeds (orderBy: CREATED_AT_DESC, filter: {isLocal: {equalTo: true}, createdAt: {greaterThanOrEqualTo: \"${from}\"}}) {
                    nodes {
                        createdAt
                        asset
                        amount
                        account
                    }
                }
            }
            `
          )
          .then((data) => {
            if (data.xTransferDepositeds.nodes.length > 0) {
              resolve(data.xTransferDepositeds.nodes)
            } else {
              resolve([])
            }
          })
          .catch((e) => {
            reject(
              new Error(
                'Error getting xTransferDepositeds from blockchain: ' +
                  JSON.stringify(e)
              )
            )
        })
    })
}

async function main() {
    initialize(__dirname, "https://api.subquery.network/sq/Phala-Network/khala-subbridge-subquery__UGhhb")
    await updateTransferRecords()
}

main().catch(console.error).finally(() => process.exit());
