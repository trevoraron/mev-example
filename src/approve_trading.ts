import { ethers, providers, Wallet } from 'ethers'

const ERC20_ADDR = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
const POOL_ADDR = '0xA3b40f9Cb927AF985d95daB0c4938bbFDCD156c3'
const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)

async function main() {
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const account = wallet.connect(provider)

  const usdc = new ethers.Contract(ERC20_ADDR, ['function approve(address spender, uint256 amount) public returns (bool)'], account)

  const tx = await usdc.approve(ethers.utils.getAddress(POOL_ADDR), ethers.constants.MaxUint256, { gasPrice: 20e9 })
  console.log(`Transaction hash: ${tx.hash}`)

  const receipt = await tx.wait()
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`)
  console.log(`Gas used: ${receipt.gasUsed.toString()}`)
}

main()
