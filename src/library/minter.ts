import { BigNumber, ethers } from 'ethers'
import { NFT_MINTER } from './constants'

export async function Mint(
  amount: BigNumber,
  contract: string,
  bribe: BigNumber,
  nonce: number,
  chain_id: number
): Promise<ethers.PopulatedTransaction> {
  const minterContract = new ethers.Contract(NFT_MINTER, ['function mintBlock(uint amountToMint, address _target) external payable'])
  let tx = await minterContract.populateTransaction.mintBlock(amount, contract, {
    value: bribe,
    gasPrice: BigNumber.from(10).pow(9).mul(12),
    gasLimit: BigNumber.from(1000000),
    nonce: nonce
  })
  return tx
}
