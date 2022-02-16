/// <reference types="express-serve-static-core" />
import express from 'express';
/**
 * @swagger
 * components:
 *   schemas:
 *     PingResponse:
 *       type: object
 *       properties:
 *         relayWorkerAddress:
 *           type: string
 *           description: Relay Worker address.
 *         relayManagerAddress:
 *           type: string
 *           description: Relay Manager address.
 *         relayHubAddress:
 *           type: string
 *           description: Relay Hub address.
 *         minGasPrice:
 *           type: string
 *           description: Gas price of the current network.
 *         chainId:
 *           type: string
 *           description: Id of the network [To check differences with networkID].
 *         networkId:
 *           type: string
 *           description: Id of the network [To check differences with chainId].
 *         ready:
 *           type: boolean
 *           description: A field that that specifies if the server is ready to relay transactions.
 *         version:
 *           type: string
 *           description: String in semver format.
 *           example: 2.0.1
 *     RelayTransactionRequest:
 *       type: object
 *       properties:
 *         relayRequest:
 *           $ref: '#/components/schemas/RelayRequest'
 *         metadata:
 *           $ref: '#/components/schemas/RelayMetadata'
 *     RelayRequest:
 *       type: object
 *       properties:
 *         request:
 *           $ref: '#/components/schemas/ForwardRequest'
 *         relayData:
 *           $ref: '#/components/schemas/RelayData'
 *     ForwardRequest:
 *       type: object
 *       properties:
 *         relayHub:
 *           type: string
 *         from:
 *           type: string
 *         to:
 *           type: string
 *         tokenContract:
 *           type: string
 *         value:
 *           type: string
 *         gas:
 *           type: string
 *         nonce:
 *           type: string
 *         tokenAmount:
 *           type: string
 *         tokenGas:
 *           type: string
 *         data:
 *           type: string
 *     DeployTransactionRequest:
 *       type: object
 *       properties:
 *         request:
 *           $ref: '#/components/schemas/DeployRequestStruct'
 *         relayData:
 *           $ref: '#/components/schemas/RelayData'
 *     DeployRequestStruct:
 *       type: object
 *       properties:
 *         relayHub:
 *           type: string
 *         from:
 *           type: string
 *         to:
 *           type: string
 *         tokenContract:
 *           type: string
 *         recoverer:
 *           type: string
 *         value:
 *           type: string
 *         nonce:
 *           type: string
 *         tokenAmount:
 *           type: string
 *         tokenGas:
 *           type: string
 *         index:
 *           type: string
 *         data:
 *           type: string
 *     RelayData:
 *       type: object
 *       properties:
 *         gasPrice:
 *           type: string
 *         domainSeparator:
 *           type: string
 *         relayWorker:
 *           type: string
 *         callForwarder:
 *           type: string
 *         callVerifier:
 *           type: string
 *     RelayMetadata:
 *       type: object
 *       properties:
 *         relayHubAddress:
 *           type: string
 *         relayMaxNonce:
 *           type: number
 *         signature:
 *           type: string
 */
declare const configureDocumentation: (app: express.Express, serverUrl: string) => void;
export default configureDocumentation;
