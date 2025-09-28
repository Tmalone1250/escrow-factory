// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const feeRecipient = deployer.address;
  const feePercent = 1;

  // --- Deploy EscrowFactory ---
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy(feeRecipient);

  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("EscrowFactory deployed to:", escrowFactoryAddress);

  // --- Deploy SimpleEscrow (for testing purposes) ---
  const depositor = deployer.address;
  const payee = await hre.ethers.Wallet.createRandom().getAddress();
  const deadline = Math.round(Date.now() / 1000) + 3600;

  const SimpleEscrow = await hre.ethers.getContractFactory("SimpleEscrow");
  const simpleEscrow = await SimpleEscrow.deploy(
    escrowFactoryAddress,
    depositor,
    payee,
    deadline,
    feePercent
  );

  await simpleEscrow.waitForDeployment();
  const simpleEscrowAddress = await simpleEscrow.getAddress();
  console.log("SimpleEscrow deployed to:", simpleEscrowAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});