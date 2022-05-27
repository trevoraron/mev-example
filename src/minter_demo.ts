import { BigNumber, constants, ethers, providers, utils, Wallet } from 'ethers'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { FetchFromUniswap, FindArb, GenArbData, GenSwapData, GenSwapEthTx, LogMarket } from './library/market'
import { NFT_MINTER, SUSHISWAP_PAIR, TREVCOIN_ADDR, TREV_NFT, UNISWAP_PAIR, WETH_ADDR } from './library/constants'
import { bigNumberToDecimal } from './library/utils'
import * as _ from 'lodash'
import { exit } from 'process'
import { Mint } from './library/minter'

const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545'
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || Wallet.createRandom().privateKey
const FLASHBOTS_EP = 'https://relay-goerli.flashbots.net/'
const GWEI = BigNumber.from(10).pow(9)
const PRIORITY_FEE = GWEI.mul(3)
const BLOCKS_IN_THE_FUTURE = 2

async function main() {
  console.log('Connecting Wallet')
  const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet, FLASHBOTS_EP)
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const account = wallet.connect(provider)

  console.log('Getting Balance')
  const balance = await account.getBalance()
  console.log(`ETH Balance: ${ethers.utils.formatUnits(balance, 18)}`)
  console.log(`eth addr: ${account.address}`)

  provider.on('block', async (blockNumber) => {
    console.log('~~~~~~~~BLOCK~~~~~~~~')
    let transaction = await Mint(
      BigNumber.from(5),
      TREV_NFT,
      constants.WeiPerEther.div(2),
      await provider.getTransactionCount(wallet.address),
      CHAIN_ID
    )

    console.log('simulating gas price')
    try {
      const estimateGas = await provider.estimateGas({
        ...transaction,
        from: wallet.address
      })
      if (estimateGas.gt(1400000)) {
        console.log('EstimateGas succeeded, but suspiciously large: ' + estimateGas.toString())
        return
      }
      transaction.gasLimit = estimateGas.mul(2)
    } catch (e) {
      console.warn(`Estimate gas failure`)
      console.log(e)
      return
    }
    const bundledTransactions = [
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
