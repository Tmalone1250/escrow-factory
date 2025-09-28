const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Escrow Sad Path", function() {
    let escrowFactory;
    let EscrowFactory;
    let SimpleEscrow;
    let deployer;
    let depositor;
    let payee;
    let feeRecipient;
    let nonOwner;

    const feePercent = 1;
    const depositAmount = ethers.parseEther("1.0");
    const salt = ethers.keccak256(ethers.toUtf8Bytes("sad_path_salt"));

    beforeEach(async function() {
        [deployer, depositor, payee, feeRecipient, nonOwner] = await ethers.getSigners();

        EscrowFactory = await ethers.getContractFactory("EscrowFactory");
        SimpleEscrow = await ethers.getContractFactory("SimpleEscrow");

        // Deploy EscrowFactory
        escrowFactory = await EscrowFactory.deploy(feeRecipient.address);
        await escrowFactory.waitForDeployment();
    });

    describe("Reclaiming Funds After Deadline", function() {
        it("should allow depositor to reclaim funds after deadline passes", async function() {
            // Set deadline to 1 hour from current block timestamp
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
            // Deploy escrow
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            
            // Fund the escrow
            await escrow.connect(depositor).fund({ value: depositAmount });
            expect(await ethers.provider.getBalance(deployedAddress)).to.equal(depositAmount);
            
            // Fast-forward time past deadline
            await time.increaseTo(deadline + 1);
            
            // Reclaim funds
            const depositorInitialBalance = await ethers.provider.getBalance(depositor.address);
            const tx2 = await escrow.connect(depositor).reclaim();
            const receipt2 = await tx2.wait();
            const gasUsed = receipt2.gasUsed * receipt2.gasPrice;
            
            // Verify depositor received funds back (minus gas)
            const depositorFinalBalance = await ethers.provider.getBalance(depositor.address);
            expect(depositorFinalBalance).to.be.closeTo(
                depositorInitialBalance + depositAmount - gasUsed, 
                ethers.parseEther("0.01")
            );
            
            // Verify escrow is empty
            expect(await ethers.provider.getBalance(deployedAddress)).to.equal(0);
        });

        it("should revert if non-depositor tries to reclaim", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Fast-forward time past deadline
            await time.increaseTo(deadline + 1);
            
            // Try to reclaim from non-depositor account
            await expect(escrow.connect(payee).reclaim())
                .to.be.revertedWith("Only depositor can reclaim");
        });

        it("should revert if trying to reclaim before deadline", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Try to reclaim before deadline
            await expect(escrow.connect(depositor).reclaim())
                .to.be.revertedWith("Deadline not passed");
        });
    });

    describe("Invalid Signature Tests", function() {
        it("should revert release with invalid signature", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Create invalid signature (signed by wrong person)
            const messageHash = ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["RELEASE", deployedAddress, depositAmount]));
            const invalidSignature = await payee.signMessage(ethers.getBytes(messageHash)); // Wrong signer
            
            // Try to release with invalid signature
            await expect(escrow.connect(payee).release(depositAmount, invalidSignature))
                .to.be.revertedWith("Invalid signature");
        });

        it("should revert release with malformed signature", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Create malformed signature (wrong length)
            const malformedSignature = "0x1234";
            
            // Try to release with malformed signature
            await expect(escrow.connect(payee).release(depositAmount, malformedSignature))
                .to.be.revertedWith("Invalid signature length");
        });
    });

    describe("Owner-Only Functions Tests", function() {
        it("should revert pause() when called by non-owner", async function() {
            await expect(escrowFactory.connect(nonOwner).pause())
                .to.be.revertedWithCustomError(escrowFactory, "OwnableUnauthorizedAccount")
                .withArgs(nonOwner.address);
        });

        it("should revert unpause() when called by non-owner", async function() {
            // First pause as owner
            await escrowFactory.connect(deployer).pause();
            
            // Try to unpause as non-owner
            await expect(escrowFactory.connect(nonOwner).unpause())
                .to.be.revertedWithCustomError(escrowFactory, "OwnableUnauthorizedAccount")
                .withArgs(nonOwner.address);
        });

        it("should revert withdrawFees() when called by non-owner", async function() {
            await expect(escrowFactory.connect(nonOwner).withdrawFees())
                .to.be.revertedWithCustomError(escrowFactory, "OwnableUnauthorizedAccount")
                .withArgs(nonOwner.address);
        });

        it("should allow owner to pause and unpause", async function() {
            // Pause
            await escrowFactory.connect(deployer).pause();
            expect(await escrowFactory.paused()).to.be.true;
            
            // Try to create escrow while paused
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            await expect(escrowFactory.createEscrow(depositor.address, payee.address, deadline, salt))
                .to.be.revertedWithCustomError(escrowFactory, "EnforcedPause");
            
            // Unpause
            await escrowFactory.connect(deployer).unpause();
            expect(await escrowFactory.paused()).to.be.false;
            
            // Should work now
            await expect(escrowFactory.createEscrow(depositor.address, payee.address, deadline, salt))
                .to.not.be.reverted;
        });
    });

    describe("Edge Cases", function() {
        it("should revert createEscrow with invalid depositor address", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
            await expect(escrowFactory.createEscrow(ethers.ZeroAddress, payee.address, deadline, salt))
                .to.be.revertedWith("Invalid Depositor");
        });

        it("should revert createEscrow with invalid payee address", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
            await expect(escrowFactory.createEscrow(depositor.address, ethers.ZeroAddress, deadline, salt))
                .to.be.revertedWith("Invalid Payee");
        });

        it("should revert createEscrow with past deadline", async function() {
            const currentTime = await time.latest();
            const pastDeadline = currentTime - 3600; // 1 hour ago
            
            await expect(escrowFactory.createEscrow(depositor.address, payee.address, pastDeadline, salt))
                .to.be.revertedWith("Invalid Deadline");
        });

        it("should revert fund() when called by non-depositor", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            
            await expect(escrow.connect(payee).fund({ value: depositAmount }))
                .to.be.revertedWith("Only depositor can fund");
        });

        it("should revert fund() when already funded", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            
            // Fund once
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Try to fund again
            await expect(escrow.connect(depositor).fund({ value: depositAmount }))
                .to.be.revertedWith("Already funded");
        });

        it("should revert release() after deadline passes", async function() {
            const currentTime = await time.latest();
            const deadline = currentTime + 3600;
            
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
            
            const escrow = SimpleEscrow.attach(deployedAddress);
            await escrow.connect(depositor).fund({ value: depositAmount });
            
            // Fast-forward past deadline
            await time.increaseTo(deadline + 1);
            
            // Try to release after deadline
            const messageHash = ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["RELEASE", deployedAddress, depositAmount]));
            const signature = await depositor.signMessage(ethers.getBytes(messageHash));
            
            await expect(escrow.connect(payee).release(depositAmount, signature))
                .to.be.revertedWith("Deadline has passed");
        });
    });
});