const Core = require('../../src/main/platform/nodejs/index.js');
const argv = require('minimist')(process.argv.slice(2));

if (!argv.host || !argv.port || !argv.key || !argv.cert) {
    console.log('Usage: node index.js --host=<hostname> --port=<port> --key=<ssl-key> --cert=<ssl-cert> [--miner] [--passive]');
    process.exit();
}

const host = argv.host;
const port = parseInt(argv.port);
const miner = argv.miner;
const passive = argv.passive;
const key = argv.key;
const cert = argv.cert;

console.log('Nimiq NodeJS Client starting (host=' + host + ', port=' + port + ', miner=' + !!miner + ', passive=' + !!passive + ')');

// XXX Configure Core.
// TODO Create config/options object and pass to Core.get()/init().
NetworkUtils.configureNetAddress(host, port);
NetworkUtils.configureSSL(key, cert);

Core.get().then( $ => {
    console.log('Blockchain: height=' + $.blockchain.height + ', totalWork=' + $.blockchain.totalWork + ', headHash=' + $.blockchain.headHash.toBase64());

    if (!passive) $.network.connect();
    if (miner) $.miner.startWork();
});
