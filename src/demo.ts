import { BigNumber, ethers, providers, utils, Wallet } from 'ethers'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { FetchFromUniswap, FindArb, GenArbData, GenSwapData, GenSwapEthTx, LogMarket } from './library/market'
import { SUSHISWAP_PAIR, TREVCOIN_ADDR, UNISWAP_PAIR, WETH_ADDR } from './library/constants'
import { bigNumberToDecimal } from './library/utils'
import * as _ from 'lodash'

const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545'
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || Wallet.createRandom().privateKey

const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || '80')

async function main() {
  console.log('Connecting Wallet')
  const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet)
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const account = wallet.connect(provider)

  console.log('Fetching Pair Stats')
  let market = await FetchFromUniswap(UNISWAP_PAIR, provider)
  console.log('Uniswap')
  LogMarket(market)

  let market2 = await FetchFromUniswap(SUSHISWAP_PAIR, provider)
  console.log('Sushiswap')
  LogMarket(market2)

  console.log('Getting Balance')
  const balance = await account.getBalance()
  console.log(`ETH Balance: ${ethers.utils.formatUnits(balance, 18)}`)

  console.log('Getting Best Arb')
  let [vol, arb, path] = FindArb(market, market2, WETH_ADDR, TREVCOIN_ADDR, balance)
  console.log('Best Arb')
  console.log('Vol Needed: ' + vol.toString())
  console.log('Amount Earned: ' + arb.toString())
  console.log(path)

  let tx = await GenArbData(vol, arb, path, WETH_ADDR, TREVCOIN_ADDR)
  let req = await wallet.populateTransaction(tx)
  let final = await wallet.signTransaction(req)

  console.log('swapping OG')
  let sentTx = await provider.sendTransaction(final)
  console.log(`Transaction hash: ${sentTx.hash}`)

  const receipt = await sentTx.wait()
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`)
  console.log(`Gas used: ${receipt.gasUsed.toString()}`)

  // console.log('Doing a swap')
  // let tx = await GenSwapEthTx(ethers.constants.WeiPerEther.div(100000), wallet)
  // console.log(tx)
  // let sentTx = await provider.sendTransaction(tx)
  // console.log(`Transaction hash: ${sentTx.hash}`)

  // const receipt = await sentTx.wait()
  // console.log(`Transaction confirmed in block ${receipt.blockNumber}`)
  // console.log(`Gas used: ${receipt.gasUsed.toString()}`)

  // provider.on('block', async (blockNumber) => {
  //   console.log('~~~~~~~~BLOCK~~~~~~~~')
  //   console.log('Fetching Pair Stats')
  //   let market = await FetchFromUniswap(UNISWAP_PAIR, provider)
  //   console.log('Uniswap')
  //   LogMarket(market)

  //   let market2 = await FetchFromUniswap(SUSHISWAP_PAIR, provider)
  //   console.log('Sushiswap')
  //   LogMarket(market2)

  //   console.log('Getting Balance')
  //   const balance = await account.getBalance()
  //   console.log(`ETH Balance: ${ethers.utils.formatUnits(balance, 18)}`)

  //   console.log('Getting Best Arb')
  //   let [vol, arb, path] = FindArb(market, market2, WETH_ADDR, TREVCOIN_ADDR, balance)
  //   console.log('Best Arb')
  //   console.log('Vol Needed: ' + vol.toString())
  //   console.log('Amount Earned: ' + arb.toString())
  //   console.log(path)

  //   let transaction = await GenArbData(vol, arb, path, WETH_ADDR, TREVCOIN_ADDR)

  //   try {
  //     const estimateGas = await provider.estimateGas({
  //       ...transaction,
  //       from: wallet.address
  //     })
  //     if (estimateGas.gt(1400000)) {
  //       console.log('EstimateGas succeeded, but suspiciously large: ' + estimateGas.toString())
  //       return
  //     }
  //     transaction.gasLimit = estimateGas.mul(2)
  //   } catch (e) {
  //     console.warn(`Estimate gas failure`)
  //     console.log(e)
  //     return
  //   }
  //   const bundledTransactions = [
  //     {
  //       signer: wallet,
  //       transaction: transaction
  //     }
  //   ]
  //   console.log(bundledTransactions)
  //   const signedBundle = await flashbotsProvider.signBundle(bundledTransactions)
  //   const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + 1)
  //   if ('error' in simulation || simulation.firstRevert !== undefined) {
  //     console.log(`Simulation Error skipping`)
  //     return
  //   }
  //   console.log(
  //     `Submitting bundle, profit sent to miner: ${bigNumberToDecimal(simulation.coinbaseDiff)}, effective gas price: ${bigNumberToDecimal(
  //       simulation.coinbaseDiff.div(simulation.totalGasUsed),
  //       9
  //     )} GWEI`
  //   )
  //   const bundlePromises = _.map([blockNumber + 1, blockNumber + 2], (targetBlockNumber: number) =>
  //     flashbotsProvider.sendRawBundle(signedBundle, targetBlockNumber)
  //   )
  //   await Promise.all(bundlePromises)
  //   return
  // })
}

main()
