const hre = require("hardhat");

async function main() {
  const AuctionSystem = await hre.ethers.getContractFactory("AuctionSystem");
  const auctionSystem = await AuctionSystem.deploy();

  await auctionSystem.waitForDeployment();

  console.log("AuctionSystem deployed to:", await auctionSystem.getAddress());

  console.log("Waiting for block confirmations...");
  await auctionSystem.deploymentTransaction().wait(5);

  console.log("Verifying contract on Etherscan...");
  await hre.run("verify:verify", {
    address: await auctionSystem.getAddress(),
    constructorArguments: [],
  });

  console.log("Contract verified on Etherscan");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });