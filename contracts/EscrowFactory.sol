    // SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SimpleEscrow.sol";

contract EscrowFactory is Pausable, Ownable2Step, ReentrancyGuard {

    //State Variables
    address public immutable feeRecipient;
    uint256 public constant feePercent = 1;

    //Mappings
    mapping(address => address[]) public escrows;

    //Events
    event EscrowCreated(address indexed escrowAddress, address indexed depositor, address indexed payee);

    // Constructor
    constructor(address _feeRecipient) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
    }

    //createEscrow() function - Deploy SimpleEscrow with CREATE2
    function createEscrow(address depositor, address payee, uint256 deadline, bytes32 salt) external whenNotPaused returns (address) {
        require(depositor != address(0), "Invalid Depositor");
        require(payee != address(0), "Invalid Payee");
        require(deadline > block.timestamp, "Invalid Deadline");

        // Get bytecode for SimpleEscrow with constructor parameters
        bytes memory bytecode = abi.encodePacked(type(SimpleEscrow).creationCode, abi.encode(address(this), depositor, payee, deadline, feePercent));

        address escrowAddress;

        // Deploy using CREATE2
        assembly {
            escrowAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        require(escrowAddress != address(0), "Deployment failed");

        // Store the escrow address for the depositor
        escrows[depositor].push(escrowAddress);

        // Emit the event
        emit EscrowCreated(escrowAddress, depositor, payee);

        return escrowAddress;
    }

    //predictAddress() function - Calculate CREATE2 address without deploying contract
    function predictAddress(address depositor, address payee, uint256 deadline, bytes32 salt) external view returns (address) {
        // Get bytecode hash for SimpleEscrow with constructor parameters
        bytes32 bytecodeHash = _getBytecodeHash(depositor, payee, deadline);

        //Calculate CREATE2 address
        bytes32 computedAddress = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash));

        // Convert the computed address to an actual address type
        return address(uint160(uint256(computedAddress)));
    }

    // getEscrows() function - Return arraw of esrows per deporistor
    function getEscrows(address depositor) external view returns (address[] memory) {
        return escrows[depositor];
    }

    // Pausable - Owner can pause/unpause deployments
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // withdrawFees() function - Only owner can withdraw accumulated fees
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");

        (bool success, ) = feeRecipient.call{value: balance}("");
        require(success, "Fee withdrawal failed");
    }

    // Function to receive fees from escrow contract
    receive() external payable {}

    // Helper function to get bytecode hash
    function _getBytecodeHash(address depositor, address payee, uint256 deadline) private view returns (bytes32) {
        return keccak256(abi.encodePacked(type(SimpleEscrow).creationCode, abi.encode(address(this), depositor, payee, deadline, feePercent)));
    }

}