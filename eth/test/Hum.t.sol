// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HumanKnowledgeProtocol.sol";

contract HumanKnowledgeProtocolTest is Test {
    HumanKnowledgeProtocol hkp;
    address owner;
    address user1;
    address user2;
    address user3;
    address user4;

    function setUp() public {
        owner = address(this);
        user1 = vm.addr(0x1);
        user2 = vm.addr(0x2);
        user3 = vm.addr(0x3);
        user4 = vm.addr(0x4);

        hkp = new HumanKnowledgeProtocol();
    }

    function testInitOnce() public {
        // user1 init
        vm.prank(user1);
        hkp.init();
        assertEq(hkp.balanceOf(user1), 5 ether);

        // user1 init again -> revert
        vm.prank(user1);
        vm.expectRevert("Already have HUM");
        hkp.init();

        // user2 init
        vm.prank(user2);
        hkp.init();
        assertEq(hkp.balanceOf(user2), 5 ether);
    }

    function testAskQuestion() public {
        // user1 init
        vm.prank(user1);
        hkp.init();

        // ask question costs 1 HUM
        bytes32 qHash = keccak256(abi.encodePacked("Q1"));
        vm.startPrank(user1);
        hkp.askQuestion(qHash);
        vm.stopPrank();

        // user1: started with 5, asked with 1 HUM -> now should have 4
        assertEq(hkp.balanceOf(user1), 4 ether);
    }

    function testViewQuestion() public {
        // user1 init & ask
        vm.startPrank(user1);
        hkp.init();
        bytes32 qHash = keccak256(abi.encodePacked("Q1"));
        hkp.askQuestion(qHash);
        vm.stopPrank();

        // user2 init & view
        vm.startPrank(user2);
        hkp.init();
        vm.expectEmit(true, true, false, true);
        emit HumanKnowledgeProtocol.Verified(user2, 1);
        hkp.viewQuestion(1);
        vm.stopPrank();

        // user2: started 5, view cost 1 -> now 4
        assertEq(hkp.balanceOf(user2), 4 ether);
    }

    function testSubmitAnswer() public {
        // user1: init & ask
        vm.startPrank(user1);
        hkp.init();
        bytes32 qHash = keccak256(abi.encodePacked("Q1"));
        hkp.askQuestion(qHash);
        vm.stopPrank();

        // user2: init & view, then answer
        vm.startPrank(user2);
        hkp.init();
        hkp.viewQuestion(1);

        bytes32 aHash = keccak256(abi.encodePacked("A1"));
        vm.expectEmit(true, true, true, true);
        emit HumanKnowledgeProtocol.AnswerSubmitted(1, 1, user2, aHash);
        hkp.submitAnswer(1, aHash);
        vm.stopPrank();

        // user2: started 5, -1 view, -1 answer = 3 left
        assertEq(hkp.balanceOf(user2), 3 ether);
    }

    function testVoteAnswer() public {
        // setup: user1 ask Q, user2 view&answer, user3 view
        vm.startPrank(user1);
        hkp.init();
        bytes32 qHash = keccak256(abi.encodePacked("Q1"));
        hkp.askQuestion(qHash);
        vm.stopPrank();

        vm.startPrank(user2);
        hkp.init();
        hkp.viewQuestion(1);
        bytes32 aHash = keccak256(abi.encodePacked("A1"));
        hkp.submitAnswer(1, aHash);
        vm.stopPrank();

        vm.startPrank(user3);
        hkp.init();
        hkp.viewQuestion(1);
        vm.expectEmit(true, true, true, true);
        emit HumanKnowledgeProtocol.Voted(1, 1, user3);
        hkp.voteAnswer(1, 1);

        // double vote
        vm.expectRevert("Already voted this answer");
        hkp.voteAnswer(1,1);
        vm.stopPrank();
    }

    function testCronCheckAndAccept() public {
        // u1 ask Q
        vm.startPrank(user1);
        hkp.init();
        bytes32 qHash = keccak256(abi.encodePacked("Q1"));
        hkp.askQuestion(qHash);
        vm.stopPrank();

        // u2 view & answer A1
        vm.startPrank(user2);
        hkp.init();
        hkp.viewQuestion(1);
        bytes32 aHash1 = keccak256(abi.encodePacked("A1"));
        hkp.submitAnswer(1, aHash1);
        vm.stopPrank();

        // u3 view & answer A2
        vm.startPrank(user3);
        hkp.init();
        hkp.viewQuestion(1);
        bytes32 aHash2 = keccak256(abi.encodePacked("A2"));
        hkp.submitAnswer(1, aHash2);
        vm.stopPrank();

        // u4 view & vote A2
        vm.startPrank(user4);
        hkp.init();
        hkp.viewQuestion(1);
        hkp.voteAnswer(1,2);
        vm.stopPrank();

        // mine 3000 blocks
        uint256 target = block.number + 3000;
        while(block.number < target){
            vm.roll(block.number + 1);
        }

        // check and accept
        vm.expectEmit(true, true, false, true);
        emit HumanKnowledgeProtocol.Accepted(1, 2);
        hkp.cronCheckAndAccept(1);

        (,,,,uint256 ansCount) = hkp.questions(1);
        (, , uint256 acceptedId, , ) = hkp.questions(1);
        assertEq(acceptedId, 2);
        assertEq(ansCount, 2);
    }
}