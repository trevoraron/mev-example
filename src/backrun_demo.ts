import { BigNumber, ethers, providers, utils, Wallet } from 'ethers'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { FetchFromUniswap, FindArb, GenArbData, GenSwapData, GenSwapEthTx, LogMarket, SimulateSwap } from './library/market'
import { SUSHISWAP_PAIR, TREVCOIN_ADDR, UNISWAP_PAIR, WETH_ADDR } from './library/constants'
import { bigNumberToDecimal } from './library/utils'
import * as _ from 'lodash'
import { exit } from 'process'

const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545'
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || Wallet.createRandom().privateKey
const BLOCKS_IN_THE_FUTURE = 2
const FLASHBOTS_EP = 'https://relay-goerli.flashbots.net/'

const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || '80')

async function main() {
  console.log('Connecting Wallet')
  const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet, FLASHBOTS_EP)
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const wallet2 = new Wallet(process.env.PRIVATE_KEY2 || '', provider)
  const account = wallet.connect(provider)

  console.log('Getting Balance')
  const balance = await account.getBalance()
  console.log(`ETH Balance: ${ethers.utils.formatUnits(balance, 18)}`)
  console.log(`eth addr: ${account.address}`)

  provider.on('block', async (blockNumber) => {
    console.log('~~~~~~~~BLOCK~~~~~~~~')

    let walletSwapAmount = ethers.constants.WeiPerEther.div(4)
    let walletTx = await GenSwapEthTx(walletSwapAmount, wallet2)

    console.log('Fetching Pair Stats')
    let market = await FetchFromUniswap(UNISWAP_PAIR, provider)
    console.log('Uniswap')
    LogMarket(market)
    let [res, marketMod] = SimulateSwap(market, WETH_ADDR, walletSwapAmount)

    let market2 = await FetchFromUniswap(SUSHISWAP_PAIR, provider)
    console.log('Sushiswap')
    LogMarket(market2)

    console.log('Getting Balance')
    const balance = await account.getBalance()
    console.log(`ETH Balance: ${ethers.utils.formatUnits(balance, 18)}`)
    console.log(`eth addr: ${account.address}`)

    console.log('Getting Best Arb')
    let [vol, arb, path] = FindArb(marketMod, market2, WETH_ADDR, TREVCOIN_ADDR, balance)
    console.log('Best Arb')
    console.log('Vol Needed: ' + vol.toString())
    console.log('Amount Earned: ' + arb.toString())
    console.log(path)

    let transaction = await GenArbData(vol, arb, path, WETH_ADDR, TREVCOIN_ADDR)

    const bundledTransactions = [
      {
        signedTransaction: walletTx
      },
      {
        signer: wallet,
        transaction: transaction
      }
    ]
    console.log(bundledTransactions)

    const targetBlock = blockNumber + BLOCKS_IN_THE_FUTURE
    const signedBundle = await flashbotsProvider.signBundle(bundledTransactions)
    console.log('running the simulations')
    const simulation = await flashbotsProvider.simulate(signedBundle, targetBlock)
    if ('error' in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`)
      console.log(`Simulation Error skipping`)
      return
    }
    console.log(
      `Submitting bundle, profit sent to miner: ${bigNumberToDecimal(simulation.coinbaseDiff)}, effective gas price: ${bigNumberToDecimal(
        simulation.coinbaseDiff.div(simulation.totalGasUsed),
        9
      )} GWEI`
    )

    console.log('submitting to flashbots')
    const bundleSubmission = await flashbotsProvider.sendRawBundle(signedBundle, targetBlock)
    console.log('bundle submitted, waiting')
    if ('error' in bundleSubmission) {
      console.log('error: ' + bundleSubmission.error.message)
      throw new Error(bundleSubmission.error.message)
    }
    const waitResponse = await bundleSubmission.wait()
    console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)
    if (waitResponse === FlashbotsBundleResolution.BundleIncluded || waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh) {
      process.exit(0)
    } else {
      console.log({
        bundleStats: await flashbotsProvider.getBundleStats(simulation.bundleHash, targetBlock),
        userStats: await flashbotsProvider.getUserStats()
      })
    }
  })
}

main()
