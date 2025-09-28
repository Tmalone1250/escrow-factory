const { expect } = require("chai");
const { ethers } = require("hardhat");

describe( "Escrow Happy Path", function() {
    let EscrowFactory;
    let SimpleEscrow;
    let deployer;
    let depositor;
    let payee;
    let feeRecipient;

    const feePercent = 1;
    const depositAmount = ethers.parseEther("1.0");
    const salt = ethers.keccak256(ethers.toUtf8Bytes("random_salt_for_deployment"));

    beforeEach(async function() {
        [deployer, depositor, payee, feeRecipient] = await ethers.getSigners();

        EscrowFactory = await ethers.getContractFactory("EscrowFactory");
        SimpleEscrow = await ethers.getContractFactory("SimpleEscrow");

        // Deploy EscrowFactory
        escrowFactory = await EscrowFactory.deploy(feeRecipient.address);
        await escrowFactory.waitForDeployment();
    });

    it("should deploy a SimpleEscrow at a predictable address, fund it, and release funds correctly with a 1% fee", async function() {
        // Use a far future deadline
        const { time } = require("@nomicfoundation/hardhat-network-helpers");
        const currentTime = await time.latest();
        const deadline = currentTime + 3600; // 1 hour from now
        
        // Predict address
        const predictedAddress = await escrowFactory.predictAddress(depositor.address, payee.address, deadline, salt);
        console.log("Predicted Escrow Address:", predictedAddress);

        // Deploy the escrow contract (using correct function name)
        const tx = await escrowFactory.createEscrow(depositor.address, payee.address, deadline, salt);
        const receipt = await tx.wait();
        const escrowAddress = receipt.logs.find(log => {
            try {
                const parsed = escrowFactory.interface.parseLog(log);
                return parsed.name === "EscrowCreated";
            } catch {
                return false;
            }
        });
        const deployedAddress = escrowFactory.interface.parseLog(escrowAddress).args.escrowAddress;
        console.log("Deployed Escrow Address:", deployedAddress);

        // Predict the address again to ensure it matches
        expect(deployedAddress).to.equal(predictedAddress);

        // Get a reference to the deployed escrow contract
        const escrow = SimpleEscrow.attach(deployedAddress);

        // Fund the escrow contract (using correct function name)
        const depositorInitialBalance = await ethers.provider.getBalance(depositor.address);
        await escrow.connect(depositor).fund({ value: depositAmount });
        const depositorFinalBalance = await ethers.provider.getBalance(depositor.address);
        expect(depositorFinalBalance).to.be.closeTo(depositorInitialBalance - depositAmount, ethers.parseEther("0.01"));
        
        expect(await ethers.provider.getBalance(deployedAddress)).to.equal(depositAmount);

        // Sign off-chain approval message
        const messageHash = ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["RELEASE", deployedAddress, depositAmount]));
        const signature = await depositor.signMessage(ethers.getBytes(messageHash));

        // Release funds to payee
        const payeeInitialBalance = await ethers.provider.getBalance(payee.address);
        const feeRecipientInitialBalance = await ethers.provider.getBalance(feeRecipient.address);

        await escrow.connect(payee).release(depositAmount, signature);

        // Verify balances and split fees
        const feeAmount = depositAmount * BigInt(feePercent) / BigInt(100);
        expect(await ethers.provider.getBalance(feeRecipient.address)).to.be.closeTo(feeRecipientInitialBalance + feeAmount, ethers.parseEther("0.01"));

        // Payee should receive the remaining amount after fee
        const amountAfterFee = depositAmount - feeAmount;
        expect(await ethers.provider.getBalance(payee.address)).to.be.closeTo(payeeInitialBalance + amountAfterFee, ethers.parseEther("0.01"));

        // The escrow contract should have a zero balance after release
        expect(await ethers.provider.getBalance(deployedAddress)).to.equal(0);
    });
});
