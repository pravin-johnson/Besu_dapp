async function main() {
  const ROM = await ethers.getContractFactory("ROM");

  const rom = await ROM.deploy();

  await rom.waitForDeployment();

  console.log(
    "ROM deployed to:",
    await rom.getAddress()
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
