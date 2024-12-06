// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/HumanKnowledge.sol";

contract HumanKnowledgeTest is Test {
    HumanKnowledge public knowledge;

    function setUp() public {
        knowledge = new HumanKnowledge();
    }

    function testSubmitFact() public {
        knowledge.submitFact("The earth orbits the sun.");

        (HumanKnowledge.Fact memory fact, bool verified) = knowledge.getFact(0);
        assertEq(fact.content, "The earth orbits the sun.", "Fact content mismatch");
        assertEq(fact.submitter, address(this), "Submitter address mismatch");
        assertEq(verified, false, "Fact should not be verified initially");
    }

    function testVerifyFact() public {
        knowledge.submitFact("Water boils at 100C");

        knowledge.verifyFact(0);

        (, bool isVerified) = knowledge.getFact(0);
        assertTrue(isVerified, "Fact should be verified");
    }

    function testGetAllFacts() public {
        knowledge.submitFact("Fact 1");
        knowledge.submitFact("Fact 2");

        HumanKnowledge.Fact[] memory allFacts = knowledge.getAllFacts();

        assertEq(allFacts.length, 2, "Fact count mismatch");
        assertEq(allFacts[0].content, "Fact 1", "Fact 1 content mismatch");
        assertEq(allFacts[1].content, "Fact 2", "Fact 2 content mismatch");
    }

    function testInvalidFactId() public {
        vm.expectRevert("Invalid fact ID");
        knowledge.getFact(0);
    }
}