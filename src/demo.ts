import { BigNumber, ethers, providers, Wallet } from 'ethers'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { FetchFromUniswap, FindArb, LogMarket } from './library/market'
import { SUSHISWAP_PAIR, TREVCOIN_ADDR, UNISWAP_PAIR, WETH_ADDR } from './library/constants'


const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)

async function main() {
    console.log("Connecting Wallet")
    const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
    const account = wallet.connect(provider);
 
    console.log("Fetching Pair Stats");
    let market = await FetchFromUniswap(UNISWAP_PAIR, provider)
    console.log("Uniswap")
    LogMarket(market)

    let market2 = await FetchFromUniswap(SUSHISWAP_PAIR, provider)
    console.log("Sushiswap")
    LogMarket(market2)

    console.log("Getting Best Arb");
    let [vol, arb, path] = FindArb(market, market2, WETH_ADDR, TREVCOIN_ADDR, ethers.constants.WeiPerEther)
    console.log("Best Arb");
    console.log("Vol Needed: " + vol.toString())
    console.log("Amount Earned: " + arb.toString())
    console.log(path)
}
  
main();