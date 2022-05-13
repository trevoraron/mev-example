import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();

console.log(`Mnemonic: ${wallet.mnemonic.phrase}`);
console.log(`Address: ${wallet.address}`);
console.log(`Private Key: ${wallet.privateKey}`);