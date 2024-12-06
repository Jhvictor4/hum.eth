// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HumanKnowledge {
    struct Fact {
        uint256 id;
        address submitter;
        string content;
    }

    Fact[] private facts;
    mapping(uint256 => bool) private verified;

    event FactSubmitted(uint256 id, address indexed submitter, string content);
    event FactVerified(uint256 id);

    // Submit a new fact
    function submitFact(string memory fact) public {
        uint256 factId = facts.length;
        facts.push(Fact(factId, msg.sender, fact));
        emit FactSubmitted(factId, msg.sender, fact);
    }

    // Verify a fact by ID
    function verifyFact(uint256 id) public {
        require(id < facts.length, "Invalid fact ID");
        verified[id] = true;
        emit FactVerified(id);
    }

    // Get a fact by ID
    function getFact(uint256 id) public view returns (Fact memory, bool) {
        require(id < facts.length, "Invalid fact ID");
        return (facts[id], verified[id]);
    }

    // Get all facts
    function getAllFacts() public view returns (Fact[] memory) {
        return facts;
    }
}