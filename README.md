# SubBridge Metrics services

## Supportecd metrics services

- Return reserve balance of tokens defined in [token.json](https://github.com/tolak/subbridge-metrics/blob/main/tokens.json)
- Return time spend in minutes of chainbridge transfer send from Khala to Ethereum

## How to run

Step1: Setup a start height of khala network in [config.json](https://github.com/tolak/subbridge-metrics/blob/ff21a45f9a7dc0f40f3fd02c82d2cea7aa60dcc7/config.json#L2), will fetch events begin with this block

Step2: Set environment variables, you can create an .env file under project root directory, it should contain following items:

```sh
ONFINALITY_API_KEY=<your Onfinality API key>
INFURA_API_KEY=<your Infura API key>
PORT=3001   // metrics service listen port

UPDATE_INTERVAL=30000 // interval task period time in milliseconds
```

Step3: Issue following command to start service

```sh
yarn & node index.js
```

## Integrate into your prometheus service

Export the service and set custom metrics url in your prometheus config file, then you can add it as a data source into your grafana. 