import { KeyManager, RelayServer, TxStoreManager } from '../../src';
import sinon, { mock, createStubInstance } from 'sinon';
import type { EnvelopingTxRequest } from '@rsksmart/rif-relay-client';
import * as rifClient from '@rsksmart/rif-relay-client';
import { BigNumber, constants, providers } from 'ethers';
import * as utils from '../../src/Utils';
import { ERC20__factory, ERC20 } from '@rsksmart/rif-relay-contracts';
import { expect, use } from 'chai';
import * as Conversions from '../../src/Conversions';
import { BigNumber as BigNumberJs } from 'bignumber.js';
import { TRANSFER_HASH, TRANSFER_FROM_HASH } from '../../src/RelayServer';
import { toPrecision } from '../../src/Conversions';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe('RelayServer tests', function () {
  const fakeEstimationBeforeFees = 100000;
  const TOKEN_X_RATE = '0.5';
  const GAS_PRICE = 10000;
  const FAKE_GAS_FEE_PERCENTAGE = 0.1;
  const FAKE_TRANSFER_FEE_PERCENTAGE = 0.1;
  const TOKEN_AMOUNT_TO_TRANSFER = '1000000000000000000'; //18 zeros
  const TOKEN_AMOUNT_IN_REQUEST = '500000000000000000'; //17 zeros

  let relayServer: RelayServer;
  let mockServer: sinon.SinonMock;
  let dataWhenTransfer: string;
  let dataWhenTransferFrom: string;
  let expectedFeeFromTransfer: BigNumberJs;

  beforeEach(function () {
    //Build and mock server
    const managerKeyManager = createStubInstance(KeyManager);
    const workersKeyManager = createStubInstance(KeyManager);
    const txStoreManager = createStubInstance(TxStoreManager);

    relayServer = new RelayServer({
      managerKeyManager,
      txStoreManager,
      workersKeyManager,
    });

    mockServer = mock(relayServer);

    //Set stubs
    sinon.replaceGetter(rifClient, 'estimateRelayMaxPossibleGas', () =>
      sinon.stub().resolves(BigNumber.from(fakeEstimationBeforeFees))
    );
    sinon.replaceGetter(rifClient, 'standardMaxPossibleGasEstimation', () =>
      sinon.stub().resolves(BigNumber.from(fakeEstimationBeforeFees))
    );

    sinon.stub(utils, 'getProvider').returns(providers.getDefaultProvider());

    const token = {
      name: () => Promise.resolve('TestToken'),
      symbol: () => Promise.resolve('TT'),
      decimals: () => Promise.resolve(18),
    } as unknown as ERC20;
    sinon.stub(ERC20__factory, 'connect').returns(token);

    sinon.stub(Conversions, 'getXRateFor').resolves(TOKEN_X_RATE);

    //Build the data for the transfer() and transferFrom()
    const fakeFromAddress =
      '000000000000000000000000e87286ba960fa7aaa5b376083a31d440c8cb4bc8';
    const fakeToAddress =
      '0000000000000000000000008470af7f41ee2788eaa4cfc251927877b659cdc5';
    const tokenAmountToTransferAsHex = BigNumber.from(TOKEN_AMOUNT_TO_TRANSFER)
      .toHexString()
      .substring(2) //removes 0x
      .padStart(64, '0'); //fills with 0 to the left

    dataWhenTransfer =
      '0x' + TRANSFER_HASH + fakeToAddress + tokenAmountToTransferAsHex;

    dataWhenTransferFrom =
      '0x' +
      TRANSFER_FROM_HASH +
      fakeFromAddress +
      fakeToAddress +
      tokenAmountToTransferAsHex;

    //Calculate the expected fee value when a transfer/transferFrom is executed
    const tokenFee = BigNumberJs(TOKEN_AMOUNT_TO_TRANSFER).multipliedBy(
      FAKE_TRANSFER_FEE_PERCENTAGE
    );
    const tokenFeeAsFraction = toPrecision({
      value: tokenFee,
      precision: -18,
    });
    const feeAsFractionInNative = tokenFeeAsFraction.multipliedBy(TOKEN_X_RATE);
    const feeInNative = toPrecision({
      value: feeAsFractionInNative,
      precision: 18,
    });
    expectedFeeFromTransfer = feeInNative.dividedBy(GAS_PRICE);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('Function estimateMaxPossibleGas()', function () {
    it('Should not charge fees when is sponsored', async function () {
      mockServer.expects('isSponsorshipAllowed').returns(true);

      const maxPossibleGaseEstimation =
        await relayServer.estimateMaxPossibleGas({
          relayRequest: {
            request: {
              tokenContract: constants.AddressZero,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest);

      expect(maxPossibleGaseEstimation.estimation).to.be.eq(
        fakeEstimationBeforeFees.toString()
      );
    });

    describe('When is not sponsored', function () {
      beforeEach(function () {
        mockServer.expects('isSponsorshipAllowed').returns(false);
      });

      it('Should charge fees based on gas when transferFeePercentage = 0', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: 0,
          },
        };

        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGaseEstimation =
          await relayServer.estimateMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest);

        expect(maxPossibleGaseEstimation.estimation).to.be.eq(
          (
            fakeEstimationBeforeFees +
            fakeEstimationBeforeFees * FAKE_GAS_FEE_PERCENTAGE
          ).toString()
        );
      });

      it('Should charge fees based on gas when transferFeePercentage is not defined', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
          },
        };

        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGaseEstimation =
          await relayServer.estimateMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest);

        expect(maxPossibleGaseEstimation.estimation).to.be.eq(
          (
            fakeEstimationBeforeFees +
            fakeEstimationBeforeFees * FAKE_GAS_FEE_PERCENTAGE
          ).toString()
        );
      });

      it('Should charge fees based on transfer value, when transferFeePercentage > 0 and a transfer() is being relayed', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
          },
        };
        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGaseEstimation =
          await relayServer.estimateMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
                data: dataWhenTransfer,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest);

        expect(maxPossibleGaseEstimation.estimation).to.be.eq(
          BigNumberJs(fakeEstimationBeforeFees)
            .plus(expectedFeeFromTransfer)
            .toString()
        );
      });

      it('Should charge fees based on transfer value, when transferFeePercentage > 0 and a transferFrom() is being relayed', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
          },
        };
        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGaseEstimation =
          await relayServer.estimateMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
                data: dataWhenTransferFrom,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest);

        expect(maxPossibleGaseEstimation.estimation).to.be.eq(
          BigNumberJs(fakeEstimationBeforeFees)
            .plus(expectedFeeFromTransfer)
            .toString()
        );
      });

      it('Should charge fees based on gas when transferFeePercentage > 0 but it is not a transfer/transferFrom', async function () {
        //This just changes the hash of the method
        const dataWhenNoTransfer = dataWhenTransfer.replace('a', 'b');

        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
          },
        };
        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGaseEstimation =
          await relayServer.estimateMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
                data: dataWhenNoTransfer,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest);

        expect(maxPossibleGaseEstimation.estimation).to.be.eq(
          (
            fakeEstimationBeforeFees +
            fakeEstimationBeforeFees * FAKE_GAS_FEE_PERCENTAGE
          ).toString()
        );
      });
    });
  });

  describe('Function getMaxPossibleGas()', function () {
    beforeEach(function () {
      mockServer.expects('_validateIfGasAmountIsAcceptable').resolves();
    });

    //Skiping this test for lack of tools to stub/mock non configurable properties (isDeployTransaction and estimateInternalCallGas).
    //Both functions are not configurable (try Object.getOwnPropertyDescriptor(rifClient, 'estimateInternalCallGas') to know).
    it.skip('Should fail if the gas amount is lower than required', async function () {
      const fakeRequiredGas = 20000;
      // sinon.replaceGetter(rifClient, 'isDeployTransaction', () =>
      //   sinon.stub().returns(false)
      // );

      sinon.replaceGetter(rifClient, 'estimateInternalCallGas', () =>
        sinon.stub().resolves(BigNumber.from(fakeRequiredGas))
      );

      await expect(
        relayServer.getMaxPossibleGas({
          relayRequest: {
            request: {
              gas: fakeRequiredGas - 10000,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest)
      ).to.be.rejectedWith(
        "Request payload's gas parameters deviate too much fom the estimated gas for this transaction"
      );
    });

    it('Should not charge fees when is sponsored', async function () {
      mockServer.expects('isSponsorshipAllowed').returns(true);

      const maxPossibleGas = await relayServer.getMaxPossibleGas({
        relayRequest: {
          request: {
            tokenContract: constants.AddressZero,
          },
          relayData: {
            gasPrice: GAS_PRICE,
          },
        },
      } as EnvelopingTxRequest);

      expect(maxPossibleGas.toString()).to.be.equal(
        fakeEstimationBeforeFees.toString()
      );
    });

    describe('When is not sponsored', function () {
      beforeEach(function () {
        mockServer.expects('isSponsorshipAllowed').returns(false);
      });

      it('Should charge fees based on gas when transferFeePercentage = 0', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: 0,
          },
        };

        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGas = await relayServer.getMaxPossibleGas({
          relayRequest: {
            request: {
              tokenContract: constants.AddressZero,
              tokenAmount: TOKEN_AMOUNT_IN_REQUEST,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest);

        expect(maxPossibleGas.toString()).to.be.eq(
          (
            fakeEstimationBeforeFees +
            fakeEstimationBeforeFees * FAKE_GAS_FEE_PERCENTAGE
          ).toString()
        );
      });

      it('Should charge fees based on gas when transferFeePercentage is not defined', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
          },
        };

        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGas = await relayServer.getMaxPossibleGas({
          relayRequest: {
            request: {
              tokenContract: constants.AddressZero,
              tokenAmount: TOKEN_AMOUNT_IN_REQUEST,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest);

        expect(maxPossibleGas.toString()).to.be.eq(
          (
            fakeEstimationBeforeFees +
            fakeEstimationBeforeFees * FAKE_GAS_FEE_PERCENTAGE
          ).toString()
        );
      });

      it('Should charge fees based on transfer value, when transferFeePercentage > 0 and a transfer() is being relayed', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
          },
        };
        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGas = await relayServer.getMaxPossibleGas({
          relayRequest: {
            request: {
              tokenContract: constants.AddressZero,
              tokenAmount: TOKEN_AMOUNT_IN_REQUEST,
              data: dataWhenTransfer,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest);

        expect(maxPossibleGas.toString()).to.be.eq(
          BigNumberJs(fakeEstimationBeforeFees)
            .plus(expectedFeeFromTransfer)
            .toString()
        );
      });

      it('Should charge fees based on transfer value, when transferFeePercentage > 0 and a transferFrom() is being relayed', async function () {
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
            transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
          },
        };
        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        const maxPossibleGas = await relayServer.getMaxPossibleGas({
          relayRequest: {
            request: {
              tokenContract: constants.AddressZero,
              tokenAmount: TOKEN_AMOUNT_IN_REQUEST,
              data: dataWhenTransferFrom,
            },
            relayData: {
              gasPrice: GAS_PRICE,
            },
          },
        } as EnvelopingTxRequest);

        expect(maxPossibleGas.toString()).to.be.eq(
          BigNumberJs(fakeEstimationBeforeFees)
            .plus(expectedFeeFromTransfer)
            .toString()
        );
      });

      it('Should fail when the token amount sent in request is lower than required', async function () {
        const lowTokenAmount = '50000000';
        const fakeServerConfigParams = {
          app: {
            gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
          },
        };

        sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

        await expect(
          relayServer.getMaxPossibleGas({
            relayRequest: {
              request: {
                tokenContract: constants.AddressZero,
                tokenAmount: lowTokenAmount,
              },
              relayData: {
                gasPrice: GAS_PRICE,
              },
            },
          } as EnvelopingTxRequest)
        ).to.be.rejectedWith(
          'User agreed to spend lower than what the transaction may require'
        );
      });
    });
  });

  describe('Comparisons between estimateMaxPossibleGas() and getMaxPossibleGas()', function () {
    beforeEach(function () {
      mockServer.expects('_validateIfGasAmountIsAcceptable').resolves();
      mockServer.expects('isSponsorshipAllowed').returns(false);
    });

    //Technically the estimation can be slightly greater but here we are using stubs so they should be equal
    it('Value obtained from estimation should be equal to value required on execution', async function () {
      const fakeServerConfigParams = {
        app: {
          gasFeePercentage: FAKE_GAS_FEE_PERCENTAGE,
          transferFeePercentage: FAKE_TRANSFER_FEE_PERCENTAGE,
        },
      };
      sinon.stub(relayServer, 'config').value(fakeServerConfigParams);

      const estimatedGas = await relayServer.estimateMaxPossibleGas({
        relayRequest: {
          request: {
            tokenContract: constants.AddressZero,
            data: dataWhenTransfer,
          },
          relayData: {
            gasPrice: GAS_PRICE,
          },
        },
      } as EnvelopingTxRequest);

      mockServer.expects('isSponsorshipAllowed').returns(false);
      mockServer.expects('_validateIfGasAmountIsAcceptable').resolves();

      const requiredGas = await relayServer.getMaxPossibleGas({
        relayRequest: {
          request: {
            tokenContract: constants.AddressZero,
            tokenAmount: TOKEN_AMOUNT_IN_REQUEST,
            data: dataWhenTransfer,
          },
          relayData: {
            gasPrice: GAS_PRICE,
          },
        },
      } as EnvelopingTxRequest);

      expect(estimatedGas.estimation.toString()).to.be.eq(
        requiredGas.toString()
      );
    });
  });
});
