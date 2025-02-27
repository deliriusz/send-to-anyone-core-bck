import Web3 from "web3/dist/web3.min.js";
import {tokens} from "./sendToAnyoneUtils";
import {IdrissCrypto} from "idriss-crypto/browser";

const defaultWeb3 = new Web3(new Web3.providers.HttpProvider("https://polygon-rpc.com/"));

let oracleAddress = {
    "ETH": "0xf9680d99d6c9589e2a93a78a04a279e509205945",
    "WETH": "0xf9680d99d6c9589e2a93a78a04a279e509205945",
    "BNB": "0x82a6c4af830caa6c97bb504425f6a66165c2c26e",
    "MATIC": "0xab594600376ec9fd91f8e885dadf0ce036862de0",
    "USDC": "0xfe4a8cc5b5b2366c1b58bea3858e81843581b2f7",
    "USDT": "0x0a6513e40db6eb1b165753ad52e80663aea50545",
    "DAI": "0x4746dec9e833a82ec7c2c1356372ccf2cfcd2f3d",
    "DOGE": "0xbaf9327b6564454f4a3364c33efeef032b4b4444"
};

// add ids of token not supported in chainlink oracles
let coingeckoId = {
    "CULT": "cult-dao",
    "RVLT": "revolt-2-earn",
    "BANK":"bankless-dao"
};

export const SendToAnyoneLogic = {
    provider: null,
    idriss: null,
    async prepareSendToAnyone(provider, network) {
        console.log('prepareSendToAnyone')
        this.provider = provider;
        const web3 = new Web3(this.provider);
        // all values are injected by webpack based on the environment
        this.idriss = new IdrissCrypto(this.provider.host ?? POLYGON_RPC_ENDPOINT, {
            web3Provider: this.provider,
            sendToAnyoneContractAddress: SEND_TO_ANYONE_CONTRACT_ADDRESS,
            idrissRegistryContractAddress: IDRISS_REGISTRY_CONTRACT_ADDRESS,
            reverseIDrissMappingContractAddress: REVERSE_IDRISS_MAPPING_CONTRACT_ADDRESS,
            priceOracleContractAddress: PRICE_ORACLE_CONTRACT_ADDRESS
        })
        this.web3 = web3;
        await this.switchNetwork(network)
    },

    async calculateAmount(ticker, sendToAnyoneValue) {

        let priceSt

        if (oracleAddress[ticker]) {
            let oracle = await this.loadOracle(ticker) // token ticker selected
            priceSt = await this.getPrice(oracle);
        } else {
            let response = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId[ticker]}&vs_currencies=USD`)).json()
            priceSt = Object.values(Object.values(response)[0])[0]
        }

        let decimals = tokens.filter(x => x.symbol == ticker)[0]?.decimals
        let integer = this.getAmount(sendToAnyoneValue, priceSt, decimals) // sendToAnyoneValue selected in popup, decimals specified in json for token
        let normal = integer / Math.pow(10, decimals) // sendToAnyoneValue selected in popup, decimals specified in json for token
        return {integer, normal}
    },
    async switchNetwork(network) {
        if (network === "Polygon") {
            try {
                await this.switchtopolygon();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }
        } else if (network === "ETH") {
            try {
                await this.switchtoeth();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }

        } else if (network === "BSC") {
            try {
                await this.switchtobsc();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }
        } else {
            return false;
        }
    },

    async sendToAnyone(recipient, amount, network, token, message, assetType, assetAmount, assetAddress, assetId) {
        let tokenContractAddr = tokens.filter(x => x.symbol == token && x.network == network)[0]?.address; // get from json
        const assetTypes = {}
        assetTypes['native'] = 0
        assetTypes['erc20']  = 1
        assetTypes['erc721'] = 2

        let properAmount
        if (assetType === 'erc721')
            properAmount = 1
       else
           properAmount = (assetAmount ?? '').length > 0 ? assetAmount : amount

        const asset = {
            amount: properAmount,
            type: assetTypes[assetType],
            assetContractAddress: (assetAddress ?? '').length > 0 ? assetAddress : tokenContractAddr,
            assetId: assetId === '' ? 0 : assetId
        }

        //TODO: add wallet tag for existing user
        const walletType = {
            coin: "ETH",
            network: "evm",
            walletTag: "Public ETH"
        }

        // let contract;
        let polygonGas;

        // make another check if the address selected really belongs to the twitter name selected

        // switch to selected payment option's network
        // exchange if statement for suitable check depending on selected network in dropdown
        if (network === "Polygon") {
            try {
                await this.switchtopolygon();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }
            // contract = await this.loadSendToAnyonePolygon();
            polygonGas = String(Math.round((await (await fetch('https://gasstation-mainnet.matic.network/v2')).json())['standard']['maxFee'] * 1000000000))
        } else if (network === "ETH") {
            try {
                await this.switchtoeth();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }
            // contract = await this.loadSendToAnyoneETH();
        } else if (network === "BSC") {
            try {
                await this.switchtobsc();
            } catch (e) {
                if (e != "network1") {
                    throw e
                }
            }
            // contract = await this.loadSendToAnyoneBSC();
        } else {
            return false;
        }

        // exchanged for redundant multiple get accounts calls
        const accounts = await this.web3.eth.getAccounts();
        let selectedAccount = accounts[0];

        if (accounts.length > 0) {
            let result;

            try {
                const transactionOptions = {
                    from: selectedAccount,
                    ...(polygonGas) && {gasPrice: polygonGas}
                }
                result = this.idriss.transferToIDriss(recipient, walletType, asset, transactionOptions)
            } catch (err) {
                console.log("error", err)
                // Transaction failed or user has denied
                // catch different errors?
                // code 4001 user denied
                if (err.code == 4001) {
                    console.log("Transaction denied.");
                    return false;
                } else {
                    throw err;
                }
            }
            return result;
        }
    },
    async switchtopolygon() {
        console.log("Checking chain...")
        const chainId = await this.web3.eth.getChainId();
        console.log(chainId);
        const chainIdHex = this.web3.utils.toHex(POLYGON_CHAIN_ID)

        // check if correct chain is connected
        console.log("Connected to chain ", chainId)
        if (chainId != POLYGON_CHAIN_ID) {
            console.log("Switch to Polygon requested")
            try {
                await this.provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{chainId: chainIdHex}],
                });
            } catch (switchError) {
                if (switchError.message === "JSON RPC response format is invalid") {
                    throw "network1"
                }
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                    try {
                        await this.provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: chainIdHex,
                                chainName: 'Polygon',
                                rpcUrls: [POLYGON_RPC_ENDPOINT],
                                nativeCurrency: {name: 'MATIC', symbol: 'MATIC', decimals: 18}
                            }],
                        });
                    } catch (addError) {
                        alert("Please add Polygon network to continue.");
                    }
                }
                console.log("Please switch to Polygon network.");
                throw "network"
            }
        }
    },
    async switchtoeth() {
        //  rpc method?
        console.log("Checking chain...")
        const chainId = await this.web3.eth.getChainId();
        console.log(chainId);

        // check if correct chain is connected
        console.log("Connected to chain ", chainId)
        if (chainId != 1) {
            console.log("Switch to Ethereum Mainnet requested")
            try {
                await this.provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{chainId: '0x1'}],
                });
            } catch (switchError) {
                if (switchError.message === "JSON RPC response format is invalid") {
                    throw "network1"
                }
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                    try {
                        await this.provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x1',
                                chainName: 'Ethereum Mainnet',
                                rpcUrls: ['https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161']
                            }],
                        });
                    } catch (addError) {
                        alert("Please add Ethereum network to continue.");
                    }
                }
                console.log("Please switch to Ethereum Mainnet.");
                // disable continue buttons here or throw error
                throw "network"
            }
        }
    },
    async switchtobsc() {
        //  rpc method?
        console.log("Checking chain...")
        const chainId = await this.web3.eth.getChainId();
        console.log(chainId);

        // check if correct chain is connected
        console.log("Connected to chain ", chainId)
        if (chainId != 56) {
            console.log("Switch to BSC requested")
            try {
                await this.provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{chainId: '0x38'}],
                });
            } catch (switchError) {
                if (switchError.message === "JSON RPC response format is invalid") {
                    throw "network1"
                }
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                    try {
                        await this.provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x38',
                                chainName: 'BSC',
                                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                                nativeCurrency: {name: 'BNB', symbol: 'BNB', decimals: 18}
                            }],
                        });
                    } catch (addError) {
                        alert("Please add Binance Smart Chain to continue.");
                    }
                }
                console.log("Please switch to BSC.");
                // disable continue buttons here
                throw "network"
            }
        }
    },
    // async checkApproval(selectedAccount_, tokenContractAddr_, amount_, network_) {
    //     if (network_ === "Polygon") {
    //         await this.switchtopolygon();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         let allowance = await tokenContract.methods.allowance(selectedAccount_, sendToAnyoneAddressPolygon).call()
    //         return allowance >= amount_
    //     } else if (network_ === "ETH") {
    //         await this.switchtoeth();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         let allowance = await tokenContract.methods.allowance(selectedAccount_, sendToAnyoneAddressETH).call()
    //         return allowance >= amount_
    //     } else if (network_ === "BSC") {
    //         await this.switchtobsc();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         let allowance = await tokenContract.methods.allowance(selectedAccount_, sendToAnyoneAddressBSC).call()
    //         return allowance >= amount_
    //     }
    //     return false
    // },
    // load oracle price data
    async loadOracle(ticker) {
        let abiOracle = [{
            "inputs": [{
                "internalType": "address",
                "name": "_aggregator",
                "type": "address"
            }, {"internalType": "address", "name": "_accessController", "type": "address"}],
            "stateMutability": "nonpayable",
            "type": "constructor"
        }, {
            "anonymous": false,
            "inputs": [{
                "indexed": true,
                "internalType": "int256",
                "name": "current",
                "type": "int256"
            }, {"indexed": true, "internalType": "uint256", "name": "roundId", "type": "uint256"}, {
                "indexed": false,
                "internalType": "uint256",
                "name": "updatedAt",
                "type": "uint256"
            }],
            "name": "AnswerUpdated",
            "type": "event"
        }, {
            "anonymous": false,
            "inputs": [{
                "indexed": true,
                "internalType": "uint256",
                "name": "roundId",
                "type": "uint256"
            }, {"indexed": true, "internalType": "address", "name": "startedBy", "type": "address"}, {
                "indexed": false,
                "internalType": "uint256",
                "name": "startedAt",
                "type": "uint256"
            }],
            "name": "NewRound",
            "type": "event"
        }, {
            "anonymous": false,
            "inputs": [{
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            }, {"indexed": true, "internalType": "address", "name": "to", "type": "address"}],
            "name": "OwnershipTransferRequested",
            "type": "event"
        }, {
            "anonymous": false,
            "inputs": [{
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            }, {"indexed": true, "internalType": "address", "name": "to", "type": "address"}],
            "name": "OwnershipTransferred",
            "type": "event"
        }, {
            "inputs": [],
            "name": "acceptOwnership",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }, {
            "inputs": [],
            "name": "accessController",
            "outputs": [{"internalType": "contract AccessControllerInterface", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "aggregator",
            "outputs": [{"internalType": "address", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "address", "name": "_aggregator", "type": "address"}],
            "name": "confirmAggregator",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }, {
            "inputs": [],
            "name": "decimals",
            "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "description",
            "outputs": [{"internalType": "string", "name": "", "type": "string"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "uint256", "name": "_roundId", "type": "uint256"}],
            "name": "getAnswer",
            "outputs": [{"internalType": "int256", "name": "", "type": "int256"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "uint80", "name": "_roundId", "type": "uint80"}],
            "name": "getRoundData",
            "outputs": [{"internalType": "uint80", "name": "roundId", "type": "uint80"}, {
                "internalType": "int256",
                "name": "answer",
                "type": "int256"
            }, {"internalType": "uint256", "name": "startedAt", "type": "uint256"}, {
                "internalType": "uint256",
                "name": "updatedAt",
                "type": "uint256"
            }, {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "uint256", "name": "_roundId", "type": "uint256"}],
            "name": "getTimestamp",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "latestAnswer",
            "outputs": [{"internalType": "int256", "name": "", "type": "int256"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "latestRound",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "latestRoundData",
            "outputs": [{"internalType": "uint80", "name": "roundId", "type": "uint80"}, {
                "internalType": "int256",
                "name": "answer",
                "type": "int256"
            }, {"internalType": "uint256", "name": "startedAt", "type": "uint256"}, {
                "internalType": "uint256",
                "name": "updatedAt",
                "type": "uint256"
            }, {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "latestTimestamp",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "owner",
            "outputs": [{"internalType": "address payable", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "uint16", "name": "", "type": "uint16"}],
            "name": "phaseAggregators",
            "outputs": [{"internalType": "contract AggregatorV2V3Interface", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "phaseId",
            "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "address", "name": "_aggregator", "type": "address"}],
            "name": "proposeAggregator",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }, {
            "inputs": [],
            "name": "proposedAggregator",
            "outputs": [{"internalType": "contract AggregatorV2V3Interface", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "uint80", "name": "_roundId", "type": "uint80"}],
            "name": "proposedGetRoundData",
            "outputs": [{"internalType": "uint80", "name": "roundId", "type": "uint80"}, {
                "internalType": "int256",
                "name": "answer",
                "type": "int256"
            }, {"internalType": "uint256", "name": "startedAt", "type": "uint256"}, {
                "internalType": "uint256",
                "name": "updatedAt",
                "type": "uint256"
            }, {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [],
            "name": "proposedLatestRoundData",
            "outputs": [{"internalType": "uint80", "name": "roundId", "type": "uint80"}, {
                "internalType": "int256",
                "name": "answer",
                "type": "int256"
            }, {"internalType": "uint256", "name": "startedAt", "type": "uint256"}, {
                "internalType": "uint256",
                "name": "updatedAt",
                "type": "uint256"
            }, {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}],
            "stateMutability": "view",
            "type": "function"
        }, {
            "inputs": [{"internalType": "address", "name": "_accessController", "type": "address"}],
            "name": "setController",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }, {
            "inputs": [{"internalType": "address", "name": "_to", "type": "address"}],
            "name": "transferOwnership",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }, {
            "inputs": [],
            "name": "version",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }]
        return await new defaultWeb3.eth.Contract(abiOracle, oracleAddress[ticker]);
    },
    //TODO: delete
    // async loadSendToAnyonePolygon() {
    //     return await new this.web3.eth.Contract(abiSendToAnyoneContract, sendToAnyoneAddressPolygon);
    // },
    // async loadSendToAnyoneETH() {
    //     return await new this.web3.eth.Contract(abiSendToAnyoneContract, sendToAnyoneAddressETH);
    // },
    // async loadSendToAnyoneBSC() {
    //     return await new this.web3.eth.Contract(abiSendToAnyoneContract, sendToAnyoneAddressBSC);
    // },
    // calculate price in USD
    async getPrice(oracleContract) {
        let latestAnswer = oracleContract.methods.latestAnswer().call();
        let decimals = oracleContract.methods.decimals().call();
        return await latestAnswer / Math.pow(10, await decimals)
    },
    // calculate price in wei (amount needed to send to anyone)
    getAmount(sendToAnyoneValue, tokenPrice, decimals) {
        return Math.round((sendToAnyoneValue / tokenPrice) * Math.pow(10, decimals))
    },

    //TODO: delete
    // async loadTokenContract(tokenContractAddr_) {
    //     let abiERC20 = [{
    //         "constant": false,
    //         "inputs": [{"name": "_spender", "type": "address"}, {"name": "_value", "type": "uint256"}],
    //         "name": "approve",
    //         "outputs": [{"name": "", "type": "bool"}],
    //         "payable": false,
    //         "stateMutability": "nonpayable",
    //         "type": "function"
    //     }, {
    //         "constant": true,
    //         "inputs": [{"name": "_owner", "type": "address"}],
    //         "name": "balanceOf",
    //         "outputs": [{"name": "balance", "type": "uint256"}],
    //         "payable": false,
    //         "stateMutability": "view",
    //         "type": "function"
    //     }, {
    //         "constant": true,
    //         "inputs": [{"name": "_owner", "type": "address"}, {"name": "_spender", "type": "address"}],
    //         "name": "allowance",
    //         "outputs": [{"name": "", "type": "uint256"}],
    //         "payable": false,
    //         "stateMutability": "view",
    //         "type": "function"
    //     }]
    //     return await new this.web3.eth.Contract(abiERC20, tokenContractAddr_);
    // },
    // async getApproval(tokenContractAddr_, network_, selectedAccount, polygonGas) {
    //     // max approval amount, adjust as needed
    //     var approveAmount = 2n ** 255n;
    //
    //     if (network_ === "Polygon") {
    //         await this.switchtopolygon();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         await tokenContract.methods.approve(sendToAnyoneAddressPolygon, approveAmount).send({
    //             from: selectedAccount,
    //             gasPrice: polygonGas
    //         })
    //     } else if (network_ === "ETH") {
    //         await this.switchtoeth();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         await tokenContract.methods.approve(sendToAnyoneAddressETH, approveAmount).send({from: selectedAccount})
    //     } else if (network_ === "BSC") {
    //         await this.switchtobsc();
    //         let tokenContract = await this.loadTokenContract(tokenContractAddr_)
    //         await tokenContract.methods.approve(sendToAnyoneAddressBSC, approveAmount).send({from: selectedAccount})
    //     }
    // }
}
