import { BigNumber, ethers, providers, Wallet } from 'ethers'
import { FormatTypes } from 'ethers/lib/utils'
import { add, flatMap } from 'lodash'
import { convertToObject } from 'typescript'
import { markAsUntransferable } from 'worker_threads'
import { BUNDLE_EXECUTOR_ADDR, TREVCOIN_ADDR, UNI_ROUTER, WETH_ADDR } from './constants'

export type Market = {
  address: string
  coinX: string
  coinY: string
  x: BigNumber
  y: BigNumber
}

export function LogMarket(market: Market) {
  console.log('Market')
  console.log('Address: ' + market.address)
  console.log('CoinX: ' + market.coinX)
  console.log('Volume: ' + market.x.toString())
  console.log('CoinY: ' + market.coinY)
  console.log('Volume: ' + market.y.toString())
}

export async function FetchFromUniswap(address: string, provider: providers.JsonRpcProvider): Promise<Market> {
  const univ2Pair = new ethers.Contract(
    address,
    [
      'function token0() external view returns (address)',
      'function token1() external view returns (address)',
      'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
    ],
    provider
  )

  const coinX = await univ2Pair.token0()
  const coinY = await univ2Pair.token1()
  let reserve0, reserve1: ethers.BigNumber
  ;[reserve0, reserve1] = await univ2Pair.getReserves()
  return {
    address: address,
    coinX: coinX,
    coinY: coinY,
    x: reserve0,
    y: reserve1
  }
}

// formula i derived myself
export function SimulateSwap(market: Market, coin: string, amount: BigNumber): [BigNumber, Market] {
  let k = market.x.mul(market.y).mul(1001).div(1000)
  // let k = market.x.mul(market.y)
  let amTraded = amount.mul(997).div(1000)

  let newX, newY, recieved: BigNumber
  if (coin == market.coinX) {
    newX = market.x.add(amount)
    newY = k.div(market.x.add(amTraded))
    recieved = market.y.sub(newY)
  } else {
    newY = market.y.add(amount)
    newX = k.div(market.y.add(amTraded))
    recieved = market.x.sub(newX)
  }

  return [recieved, { address: market.address, coinX: market.coinX, coinY: market.coinY, x: newX, y: newY }]
}

// stolen from flashbots simple arbitrage. seems to give same result as mine
export function SimulateSwapBert(market: Market, coin: string, amount: BigNumber): [BigNumber, Market] {
  let reserveIn, reserveOut: BigNumber
  if (coin == market.coinX) {
    reserveIn = market.x
    reserveOut = market.y
  } else {
    reserveIn = market.y
    reserveOut = market.x
  }

  const amountInWithFee: BigNumber = amount.mul(997)
  const numerator = amountInWithFee.mul(reserveOut)
  const denominator = reserveIn.mul(1000).add(amountInWithFee)
  const amountOut = numerator.div(denominator)

  let newX, newY: BigNumber
  if (coin == market.coinX) {
    newX = reserveIn.add(amount)
    newY = reserveOut.sub(amountOut)
  } else {
    newY = reserveIn.add(amount)
    newX = reserveOut.sub(amountOut)
  }

  return [amountOut, { address: market.address, coinX: market.coinX, coinY: market.coinY, x: newX, y: newY }]
}

export function SimulateCrossExchange(market1: Market, market2: Market, amount: BigNumber, coin: string, swapCoin: string): BigNumber {
  let [interAmount] = SimulateSwap(market1, coin, amount)

  let [ret] = SimulateSwap(market2, swapCoin, interAmount)

  return ret
}

function GetBestArb(market1: Market, market2: Market, coin: string, swapCoin: string, maxAmount: BigNumber): [BigNumber, BigNumber] {
  let options = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000]
  let bestOption = ethers.constants.Zero
  let bestArb: BigNumber = ethers.constants.Zero
  for (let option of options) {
    let bigOption = ethers.constants.WeiPerEther.div(10000).mul(option)
    if (bigOption.gte(maxAmount)) {
      continue
    }

    let arb = SimulateCrossExchange(market1, market2, bigOption, coin, swapCoin)
    if (bigOption.gt(arb)) {
      continue
    }
    let finalArb = bigOption.sub(arb)

    if (finalArb.gte(bestArb)) {
      bestArb = finalArb
      bestOption = bigOption
    }
  }
  return [bestOption, bestArb]
}

export function FindArb(
  market1: Market,
  market2: Market,
  startingCoin: string,
  swapCoin: string,
  maxAmount: BigNumber
): [BigNumber, BigNumber, Array<Market>] {
  let possibleMarkets = [
    [market1, market2],
    [market2, market1]
  ]
  let bestAmount = ethers.constants.Zero
  let bestArb = ethers.constants.Zero
  let bestPath: Market[] = []
  for (let markets of possibleMarkets) {
    let [amount, arb] = GetBestArb(markets[0], markets[1], startingCoin, swapCoin, maxAmount)
    console.log(`Arb: ${ethers.utils.formatUnits(arb, 18)}`)
    if (arb.gte(bestArb)) {
      bestArb = arb
      bestAmount = amount
      bestPath = markets
    }
  }
  return [bestAmount, bestArb, bestPath]
}

export async function GenSwapData(
  vol: BigNumber,
  coin: string,
  swapCoin: string,
  market: Market,
  address: string
): Promise<ethers.PopulatedTransaction> {
  const marketContract = new ethers.Contract(market.address, [
    'function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external'
  ])

  let [amountOut] = SimulateSwap(market, coin, vol)
  let amount0Out = swapCoin == market.coinX ? amountOut : BigNumber.from(0)
  let amount1Out = swapCoin == market.coinY ? amountOut : BigNumber.from(0)
  let tx = await marketContract.populateTransaction.swap(amount0Out, amount1Out, address, [])
  // console.log(`${amount0Out.toString()}, ${amount1Out.toString()}, to: ${address}`)
  return tx
}

export async function GenSwapEthTx(vol: BigNumber, wallet: Wallet): Promise<string> {
  const routerContract = new ethers.Contract(UNI_ROUTER, [
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)'
  ])
  let path = [WETH_ADDR, TREVCOIN_ADDR]
  // We are giving it an hour
  let deadline = Date.now() + 3600
  // TODO: this shouldn't be 0
  let tx = await routerContract.populateTransaction.swapExactETHForTokens(ethers.constants.One, path, wallet.address, deadline, {
    value: vol
  })
  let req = await wallet.populateTransaction(tx)
  let final = await wallet.signTransaction(req)
  return final
}

export async function GenArbData(
  vol: BigNumber,
  arb: BigNumber,
  path: Array<Market>,
  startingCoin: string,
  swapCoin: string
): Promise<ethers.PopulatedTransaction> {
  const bundleExecutorContract = new ethers.Contract(BUNDLE_EXECUTOR_ADDR, [
    'function uniswapWeth(uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) external payable'
  ])

  let targets: Array<String> = ['', '']
  let payloads: Array<String> = ['', '']

  targets[0] = path[0].address
  let sw1tx = await GenSwapData(vol, startingCoin, swapCoin, path[0], path[1].address)
  payloads[0] = sw1tx.data ? sw1tx.data : ''
  let [interAmount] = SimulateSwap(path[0], startingCoin, vol)

  targets[1] = path[1].address
  let sw2tx = await GenSwapData(interAmount, swapCoin, startingCoin, path[1], BUNDLE_EXECUTOR_ADDR)
  payloads[1] = sw2tx.data ? sw2tx.data : ''

  let minerReward = arb.mul(1).div(3)

  let fakeTargets: Array<String> = []
  let fakePayloads: Array<String> = []
  const tx = await bundleExecutorContract.populateTransaction.uniswapWeth(minerReward, targets, payloads, {
    value: vol,
    gasPrice: BigNumber.from(10).pow(9).mul(12),
    gasLimit: BigNumber.from(1000000)
  })
  return tx
}
