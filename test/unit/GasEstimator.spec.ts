import {
    ContractInteractor,
    RelayMetadata,
    RelayTransactionRequest,
    DeployTransactionRequest,
    ERC20Token,
    constants,
    EstimateGasParams,
    estimateMaxPossibleRelayCallWithLinearFit
} from '@rsksmart/rif-relay-common';
import {
    DeployRequest,
    DeployRequestStruct,
    ForwardRequest,
    RelayData,
    RelayRequest
} from '@rsksmart/rif-relay-contracts';
import {
    ERC20Instance,
    IRelayHubInstance
} from '@rsksmart/rif-relay-contracts/types/truffle-contracts';
import BigNumber from 'bignumber.js';
import { use, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
    SinonStubbedInstance,
    replace,
    fake,
    restore,
    createStubInstance,
    spy
} from 'sinon';
import * as gasEstimator from '../../src/GasEstimator';
import {
    applyGasCorrectionFactor,
    standardMaxPossibleGasEstimation,
    estimateMaxPossibleGas,
    estimateMaxPossibleGasTokenTransfer,
    estimateMaxPossibleGasExecution,
    applyInternalCorrection,
    linearFitMaxPossibleGasEstimation
} from '../../src/GasEstimator';

use(chaiAsPromised);

describe('GasEstimator', function () {
    const deployRequest: DeployRequest = {
        request: {
            index: '0'
        } as DeployRequestStruct,
        relayData: {
            gasPrice: '60000000'
        } as RelayData
    };
    const relayRequest: RelayRequest = {
        request: {
            gas: '100'
        } as ForwardRequest,
        relayData: {
            gasPrice: '60000000'
        } as RelayData
    };

    let contractInteractor: SinonStubbedInstance<ContractInteractor>;
    const relayWorker = '0x0';

    describe('estimateRelayTransaction', function () {
        const standardDeployEstimation = new BigNumber(178869);
        const standardRelayEstimation = new BigNumber(99466);
        const tokenGas = new BigNumber(16559);
        const estimateMaxPossibleGasTokenTransfer = fake.returns(
            Promise.resolve(tokenGas)
        );

        beforeEach(function () {
            replace(
                gasEstimator,
                'estimateMaxPossibleGasTokenTransfer',
                estimateMaxPossibleGasTokenTransfer
            );
        });

        afterEach(function () {
            restore();
        });

        it('should estimate the relay transaction(standard)', async function () {
            const relayStandardEstimation = fake.returns(
                Promise.resolve(standardRelayEstimation)
            );
            const metadata: Partial<RelayMetadata> = {
                signature: '0x1'
            };
            replace(
                gasEstimator,
                'standardMaxPossibleGasEstimation',
                relayStandardEstimation
            );
            const request: RelayTransactionRequest = {
                relayRequest: relayRequest as RelayRequest,
                metadata: metadata as RelayMetadata
            };
            const estimation = await estimateMaxPossibleGas(
                contractInteractor,
                request,
                relayWorker
            );
            expect(
                estimation.eq(standardRelayEstimation),
                `${estimation.toString()} should equal ${standardRelayEstimation.toString()}`
            ).to.be.true;
        });

        it('should estimate the deploy transaction(standard)', async function () {
            const deployStandardEstimation = fake.returns(
                Promise.resolve(standardDeployEstimation)
            );
            const metadata: Partial<RelayMetadata> = {
                signature: '0x1'
            };
            replace(
                gasEstimator,
                'standardMaxPossibleGasEstimation',
                deployStandardEstimation
            );
            const request: DeployTransactionRequest = {
                relayRequest: deployRequest as DeployRequest,
                metadata: metadata as RelayMetadata
            };
            const estimation = await estimateMaxPossibleGas(
                contractInteractor,
                request,
                relayWorker
            );
            expect(
                estimation.eq(standardDeployEstimation),
                `${estimation.toString()} should equal ${standardDeployEstimation.toString()}`
            ).to.be.true;
        });
    });

    describe('standardMaxPossibleGasEstimation', function () {
        const tokenGas = new BigNumber(16559);
        const deployGas = 147246;
        const relayGas = 82907;
        let relayHubInstance: Partial<IRelayHubInstance>;
        const metadata: Partial<RelayMetadata> = {
            signature: '0x1'
        };

        beforeEach(function () {
            relayHubInstance = {
                contract: {
                    methods: {
                        relayCall: fake.returns({
                            estimateGas: () => Promise.resolve(relayGas)
                        }),
                        deployCall: fake.returns({
                            estimateGas: () => Promise.resolve(deployGas)
                        })
                    }
                }
            };
            contractInteractor = createStubInstance(ContractInteractor);
            contractInteractor.relayHubInstance =
                relayHubInstance as IRelayHubInstance;
        });

        afterEach(function () {
            restore();
        });

        it('should estimate the relay transaction', async function () {
            const request: RelayTransactionRequest = {
                relayRequest: relayRequest as RelayRequest,
                metadata: metadata as RelayMetadata
            };
            const estimation = await standardMaxPossibleGasEstimation(
                contractInteractor,
                request,
                relayWorker,
                tokenGas
            );
            const relayEstimation = tokenGas.plus(
                applyGasCorrectionFactor(relayGas)
            );
            expect(
                estimation.eq(relayEstimation),
                `${estimation.toString()} should equal ${relayEstimation.toString()}`
            ).to.be.true;
        });

        it('should estimate the deploy transaction', async function () {
            const request: DeployTransactionRequest = {
                relayRequest: deployRequest as DeployRequest,
                metadata: metadata as RelayMetadata
            };
            const estimation = await standardMaxPossibleGasEstimation(
                contractInteractor,
                request,
                relayWorker,
                tokenGas
            );
            const relayEstimation = tokenGas.plus(
                applyGasCorrectionFactor(deployGas)
            );
            expect(
                estimation.eq(relayEstimation),
                `${estimation.toString()} should equal ${relayEstimation.toString()}`
            ).to.be.true;
        });
    });

    describe('linearFitGasEstimation', function () {
        const tokenGas = new BigNumber(16559);
        const internalGas = new BigNumber(16559);

        const internalEstimation = fake.returns(Promise.resolve(internalGas));

        beforeEach(function () {
            replace(
                gasEstimator,
                'estimateMaxPossibleGasExecution',
                internalEstimation
            );
        });

        afterEach(function () {
            restore();
        });

        it('should estimate the relay transaction', async function () {
            const expectedEstimation =
                estimateMaxPossibleRelayCallWithLinearFit(
                    applyInternalCorrection(internalGas).toNumber(),
                    tokenGas.toNumber()
                );

            const estimation = await linearFitMaxPossibleGasEstimation(
                contractInteractor,
                relayRequest as RelayRequest,
                tokenGas
            );

            expect(
                estimation.eq(expectedEstimation),
                `${estimation.toString()} should equal ${expectedEstimation.toString()}`
            ).to.be.true;
        });

        it('should fail to estimate the deploy transaction', async function () {
            const estimation = linearFitMaxPossibleGasEstimation(
                contractInteractor,
                deployRequest as DeployRequest,
                tokenGas
            );

            await expect(estimation).to.be.rejectedWith(
                'LinearFit estimation not implemented for deployments'
            );
        });
    });

    describe('estimateMaxPossibleGasTokenTransfer', function () {
        const tokenGas = new BigNumber(16559);
        const estimateTokenGas = new BigNumber(24554);
        let erc20: ERC20Token;

        beforeEach(function () {
            erc20 = {
                instance: {
                    contract: {
                        methods: {
                            transfer: fake.returns({
                                estimateGas: () =>
                                    Promise.resolve(estimateTokenGas)
                            })
                        }
                    }
                } as ERC20Instance
            };
            contractInteractor = createStubInstance(ContractInteractor, {
                getERC20Token: Promise.resolve(erc20),
                getSmartWalletAddress: Promise.resolve('address')
            });
        });

        afterEach(function () {
            restore();
        });

        it('should estimate relay token transfer', async function () {
            const internalCorrectionSpy = spy(
                gasEstimator,
                'applyInternalCorrection'
            );
            const estimation = await estimateMaxPossibleGasTokenTransfer(
                contractInteractor,
                relayRequest as RelayRequest
            );

            expect(contractInteractor.getSmartWalletAddress.calledOnce).to.be
                .false;
            expect(internalCorrectionSpy.calledOnce).to.be.true;

            const tokenEstimation = estimateTokenGas.minus(
                constants.INTERNAL_TRANSACTION_ESTIMATE_CORRECTION
            );
            expect(
                estimation.eq(tokenEstimation),
                `${estimation.toString()} should equal ${tokenEstimation.toString()}`
            ).to.be.true;
        });

        it('should estimate deploy token transfer', async function () {
            const internalCorrectionSpy = spy(
                gasEstimator,
                'applyInternalCorrection'
            );
            const estimation = await estimateMaxPossibleGasTokenTransfer(
                contractInteractor,
                deployRequest as DeployRequest
            );

            expect(contractInteractor.getSmartWalletAddress.calledOnce).to.be
                .true;
            expect(internalCorrectionSpy.calledOnce).to.be.true;

            const tokenEstimation = estimateTokenGas.minus(
                constants.INTERNAL_TRANSACTION_ESTIMATE_CORRECTION
            );
            expect(
                estimation.eq(tokenEstimation),
                `${estimation.toString()} should equal ${tokenEstimation.toString()}`
            ).to.be.true;
        });

        it('should return tokenGas as estimation', async function () {
            const internalCorrectionSpy = spy(
                gasEstimator,
                'applyInternalCorrection'
            );
            const localRelayRequest: RelayRequest = {
                request: { ...relayRequest.request },
                relayData: { ...relayRequest.relayData }
            };
            localRelayRequest.request.tokenGas = tokenGas.toString();

            const estimation = await estimateMaxPossibleGasTokenTransfer(
                contractInteractor,
                localRelayRequest as RelayRequest
            );

            expect(contractInteractor.getSmartWalletAddress.calledOnce).to.be
                .false;
            expect(internalCorrectionSpy.calledOnce).to.be.false;

            const tokenEstimation = applyGasCorrectionFactor(tokenGas);
            expect(
                estimation.eq(tokenEstimation),
                `${estimation.toString()} should equal ${tokenEstimation.toString()}`
            ).to.be.true;
        });

        it('should return SUBSIDY as estimation', async function () {
            const internalCorrectionSpy = spy(
                gasEstimator,
                'applyInternalCorrection'
            );
            erc20.instance.contract.methods.transfer = fake.returns({
                estimateGas: () => Promise.resolve(0)
            });

            const estimation = await estimateMaxPossibleGasTokenTransfer(
                contractInteractor,
                deployRequest as DeployRequest
            );
            expect(contractInteractor.getSmartWalletAddress.calledOnce).to.be
                .true;
            expect(internalCorrectionSpy.calledOnce).to.be.true;

            const tokenEstimation = BigNumber(12000);
            expect(
                estimation.eq(tokenEstimation),
                `${estimation.toString()} should equal ${tokenEstimation.toString()}`
            ).to.be.true;
        });
    });

    describe('estimateMaxPossibleGasExecution', function () {
        const estimateMaxPossibleGasExecutionParams: EstimateGasParams = {
            from: '0x0',
            to: '0x0',
            data: '0x0'
        };
        const estimateTokenGas = 24554;
        beforeEach(function () {
            contractInteractor = createStubInstance(ContractInteractor, {
                estimateGas: Promise.resolve(estimateTokenGas)
            });
        });

        afterEach(function () {
            restore();
        });

        it('should estimate the data execution', async function () {
            const estimation = await estimateMaxPossibleGasExecution(
                contractInteractor,
                estimateMaxPossibleGasExecutionParams
            );
            expect(
                estimation.eq(estimateTokenGas),
                `${estimation.toString()} should equal ${estimateTokenGas.toString()}`
            ).to.be.true;
        });
    });

    describe('applyInternalCorrection', function () {
        it('should apply correction', function () {
            const estimationToCorrect = 25000;
            const estimation = applyInternalCorrection(estimationToCorrect);
            expect(
                estimation.eq(
                    estimationToCorrect -
                        constants.INTERNAL_TRANSACTION_ESTIMATE_CORRECTION
                ),
                `${estimation.toString()} should equal ${estimationToCorrect.toString()}`
            ).to.be.true;
        });

        it('should not apply correction', function () {
            const estimationToCorrect = 15000;
            const estimation = applyInternalCorrection(estimationToCorrect);
            expect(
                estimation.eq(estimationToCorrect),
                `${estimation.toString()} should equal ${estimationToCorrect.toString()}`
            ).to.be.true;
        });
    });

    describe('applyGasCorrectionFactor', function () {
        it('should apply correction', function () {
            const estimationToCorrect = 15000;
            const estimation = applyGasCorrectionFactor(estimationToCorrect);
            expect(
                estimation.eq(
                    estimationToCorrect *
                        constants.ESTIMATED_GAS_CORRECTION_FACTOR
                ),
                `${estimation.toString()} should equal ${estimationToCorrect.toString()}`
            ).to.be.true;
        });
    });
});
