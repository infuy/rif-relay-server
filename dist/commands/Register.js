"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeRegister = exports.Register = void 0;
const CommandClient_1 = require("./helpers/CommandClient");
const rif_relay_common_1 = require("@rsksmart/rif-relay-common");
const web3_utils_1 = require("web3-utils");
const Utils_1 = require("./helpers/Utils");
const rif_relay_client_1 = require("@rsksmart/rif-relay-client");
// @ts-ignore
const test_helpers_1 = require("@openzeppelin/test-helpers");
const path_1 = __importDefault(require("path"));
class Register extends CommandClient_1.CommandClient {
    constructor(host, config, mnemonic) {
        super(host, config, mnemonic);
    }
    async execute(options) {
        var _a;
        const transactions = [];
        console.log(`Registering Enveloping relayer at ${options.relayUrl}`);
        const response = await this.httpClient.getPingResponse(options.relayUrl);
        if (response.ready) {
            throw new Error('Already registered');
        }
        if (!this.contractInteractor.isInitialized()) {
            await this.contractInteractor.init();
        }
        const chainId = this.contractInteractor.chainId;
        if (response.chainId !== chainId.toString()) {
            throw new Error(`wrong chain-id: Relayer on (${response.chainId}) but our provider is on (${chainId})`);
        }
        const relayAddress = response.relayManagerAddress;
        const relayHubAddress = (_a = this.config.relayHubAddress) !== null && _a !== void 0 ? _a : response.relayHubAddress;
        const relayHub = await this.contractInteractor._createRelayHub(relayHubAddress);
        const { stake, unstakeDelay, owner } = await relayHub.getStakeInfo(relayAddress);
        console.log('Current stake info:');
        console.log('Relayer owner: ', owner);
        console.log('Current unstake delay: ', unstakeDelay);
        console.log('current stake=', (0, web3_utils_1.fromWei)(stake, 'ether'));
        if (owner !== rif_relay_common_1.constants.ZERO_ADDRESS &&
            !(0, rif_relay_common_1.isSameAddress)(owner, options.from)) {
            throw new Error(`Already owned by ${owner}, our account=${options.from}`);
        }
        if ((0, web3_utils_1.toBN)(unstakeDelay).gte((0, web3_utils_1.toBN)(options.unstakeDelay)) &&
            (0, web3_utils_1.toBN)(stake).gte((0, web3_utils_1.toBN)(options.stake.toString()))) {
            console.log('Relayer already staked');
        }
        else {
            const stakeValue = (0, web3_utils_1.toBN)(options.stake.toString()).sub((0, web3_utils_1.toBN)(stake));
            console.log(`Staking relayer ${(0, web3_utils_1.fromWei)(stakeValue, 'ether')} RBTC`, stake === '0'
                ? ''
                : ` (already has ${(0, web3_utils_1.fromWei)(stake, 'ether')} RBTC)`);
            const stakeTx = await relayHub.stakeForAddress(relayAddress, options.unstakeDelay.toString(), {
                value: stakeValue,
                from: options.from,
                gas: 1e6,
                gasPrice: options.gasPrice
            });
            transactions.push(stakeTx.tx);
        }
        if ((0, rif_relay_common_1.isSameAddress)(owner, options.from)) {
            console.log('Relayer already authorized');
        }
        const bal = await this.contractInteractor.getBalance(relayAddress);
        if ((0, web3_utils_1.toBN)(bal).gt((0, web3_utils_1.toBN)(options.funds.toString()))) {
            console.log('Relayer already funded');
        }
        else {
            console.log('Funding relayer');
            const _fundTx = await this.web3.eth.sendTransaction({
                from: options.from,
                to: relayAddress,
                value: options.funds,
                gas: 1e6,
                gasPrice: options.gasPrice
            });
            const fundTx = _fundTx;
            if (fundTx.transactionHash == null) {
                throw new Error(`Fund transaction reverted: ${JSON.stringify(_fundTx)}`);
            }
            transactions.push(fundTx.transactionHash);
        }
        await this.waitForRelay(options.relayUrl);
        console.log('Executed Transactions', transactions);
    }
}
exports.Register = Register;
async function executeRegister(registerOptions) {
    var _a;
    const parameters = (0, Utils_1.getParams)();
    if (process.argv.length <= 0) {
        parameters.config = path_1.default.resolve(__dirname, '../', 'server-config.json');
    }
    const serverConfiguration = (0, Utils_1.parseServerConfig)(parameters.config);
    const register = new Register(serverConfiguration.rskNodeUrl, (0, rif_relay_client_1.configure)({ relayHubAddress: serverConfiguration.relayHubAddress }), parameters.mnemonic);
    const portIncluded = serverConfiguration.url.indexOf(':') > 0;
    const relayUrl = serverConfiguration.url +
        (!portIncluded && serverConfiguration.port > 0
            ? ':' + serverConfiguration.port.toString()
            : '');
    await register.execute(registerOptions
        ? registerOptions
        : {
            hub: serverConfiguration.relayHubAddress,
            from: (_a = parameters.account) !== null && _a !== void 0 ? _a : (await register.findWealthyAccount()),
            stake: (0, test_helpers_1.ether)(parameters.stake ? parameters.stake.toString() : '0.01'),
            funds: (0, test_helpers_1.ether)(parameters.funds ? parameters.funds.toString() : '0.02'),
            relayUrl,
            unstakeDelay: '1000',
            gasPrice: '60000000'
        });
}
exports.executeRegister = executeRegister;
executeRegister()
    .then(() => {
    console.log('Registration is done!');
})
    .catch((error) => {
    console.log('Error registering relay server', error);
});
//# sourceMappingURL=Register.js.map