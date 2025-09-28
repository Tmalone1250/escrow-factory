// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleEscrow is ReentrancyGuard {
    // Immutable variables set in constructor
    address public immutable factory;
    address public immutable depositor;
    address public immutable payee;
    uint256 public immutable deadline;
    uint256 public immutable feePercent;
    
    // State variables
    bool public funded;
    bool public released;
    uint256 public depositAmount;

    // Events
    event Funded(uint256 amount);
    event Released(address payee, uint256 amountAfterFee);
    event Reclaimed(address depositor, uint256 amount);
    
    constructor(
        address _factory,
        address _depositor,
        address _payee,
        uint256 _deadline,
        uint256 _feePercent
    ) {
        factory = _factory;
        depositor = _depositor;
        payee = _payee;
        deadline = _deadline;
        feePercent = _feePercent;
    }
    
    // fund() function
    function fund() external payable nonReentrant {
        require(msg.sender == depositor, "Only depositor can fund");
        require(!funded, "Already funded");
        require(msg.value > 0, "Must send some Ether");
        
        funded = true;
        depositAmount = msg.value;
        
        emit Funded(msg.value);
    }

    // release() function
    function release(uint256 amount, bytes memory sig) external nonReentrant {
        require(funded, "Not funded");
        require(!released, "Already released");
        require(block.timestamp <= deadline, "Deadline has passed");
        require(amount <= depositAmount, "Amount exceeds deposit");
        
        // Verify signature
        bytes32 messageHash = hashRelease(amount);
        require(verify(messageHash, sig) == depositor, "Invalid signature");
        
        uint256 feeAmount = (amount * feePercent) / 100;
        uint256 amountAfterFee = amount - feeAmount;
        
        released = true;

    // Transfer fee to factory
        (bool feeSuccess, ) = factory.call{value: feeAmount}("");
        require(feeSuccess, "Fee transfer failed");
        
        // Transfer remaining amount to payee
        (bool payeeSuccess, ) = payable(payee).call{value: amountAfterFee}("");
        require(payeeSuccess, "Payee transfer failed");
        
        emit Released(payee, amountAfterFee);
    }

    // Helper function to create the message hash
    function hashRelease(uint256 amount) private view returns (bytes32) {
        return keccak256(abi.encodePacked("RELEASE", address(this), amount));
    }
    
    // Helper function to verify signature
    function verify(bytes32 messageHash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        
        // Add Ethereum message prefix
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        bytes32 r;
        bytes32 s;
        uint8 v;

        // Assembly
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // Return
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    // reclaim() function
    function reclaim() external nonReentrant {
        require(msg.sender == depositor, "Only depositor can reclaim");
        require(block.timestamp > deadline, "Deadline not passed");
        require(!released, "Already released");
        require(funded, "Not funded");

        uint256 amount = depositAmount;
        depositAmount = 0; // Reset to mark as empty
        
        // Transfer remaining funds back to depositor
        (bool success, ) = depositor.call{value: amount}("");
        require(success, "Transfer failed");

        emit Reclaimed(depositor, amount);
    }

    // destroy() function - Only work when the contract balance is zero - Can be called by anyone - Should follow EIP-6780 rules
    function destroy() external {
        require(address(this).balance == 0, "Contract must be empty");
        
        // Send any remaining balance to factory (should be 0)
        selfdestruct(payable(factory));
    }
}