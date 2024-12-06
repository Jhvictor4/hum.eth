// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract HumanKnowledgeProtocol {
    // === HUM Token (간단한 ERC20 구현) ===
    string public name = "HUMAN_KNOWLEDGE";
    string public symbol = "HUM";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function _mint(address to, uint256 amount) internal {
        // 발급된 적 있으면 1 HUM 을 증거로 가지고 있고 절대 말소 안 됨
        // 발급된 적 없으면 0 이라서 mint 가능
        require(balanceOf[msg.sender] == 0, "Already have HUM");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        // 1 HUM 은 무조건 남겨야 함
        require((balanceOf[msg.sender] - amount) >= 1, "Not enough HUM");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Not enough HUM");
        require(allowance[from][msg.sender] >= amount, "Not approved");
        require((balanceOf[from] - amount) >= 1, "Can't transfer if balance == 1");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // === Protocol Logic ===
    // 비용 정의(예시)
    uint256 public constant INIT_MINT = 5 ether;
    uint256 public constant ASK_COST = 1 ether;
    uint256 public constant VIEW_COST = 1 ether;
    uint256 public constant ANSWER_COST = 1 ether;

    struct Question {
        address creator;
        bytes32 ipfsHash; // 질문 내용 hash된 파일의 IPFS 경로
        uint256 acceptedAnswerId; // 0이면 아직 채택 없음
        uint256 creationBlock;
        uint256 answerCount;
    }

    // 답변은 암호화x, IPFS hash로 관리 가능.
    struct Answer {
        address responder;
        bytes32 ipfsHash;
        uint256 votes;
    }

    // questionId => Question
    mapping(uint256 => Question) public questions;
    uint256 public questionCount;

    // questionId => answerId => Answer
    mapping(uint256 => mapping(uint256 => Answer)) public answers;

    // 열람 기록: questionId => viewer => viewedBlock
    // viewedBlock 기록을 통해 1000 블록 내 투표 여부 확인 가능(오프체인)
    mapping(uint256 => mapping(address => uint256)) public viewedBlock;

    event QuestionAsked(uint256 indexed questionId, address indexed creator, bytes32 ipfsHash);
    event Verified(address indexed viewer, uint256 indexed questionId);
    event AnswerSubmitted(uint256 indexed questionId, uint256 indexed answerId, address indexed responder, bytes32 ipfsHash);
    event Voted(uint256 indexed questionId, uint256 indexed answerId, address indexed voter);
    event Accepted(uint256 indexed questionId, uint256 indexed answerId);

    // 유저 초기화: init 호출 시 5 HUM 민팅해서 user에게 전송
    function init() external {
        _mint(msg.sender, INIT_MINT);
    }

    // 질문 생성
    function askQuestion(bytes32 ipfsHash) external {
        // 유저가 ASK_COST HUM 지불
        require(balanceOf[msg.sender] >= ASK_COST, "Not enough HUM to ask");
        balanceOf[msg.sender] -= ASK_COST;
        balanceOf[address(this)] += ASK_COST;
        emit Transfer(msg.sender, address(this), ASK_COST);

        questionCount++;
        questions[questionCount] = Question({
            creator: msg.sender,
            ipfsHash: ipfsHash,
            acceptedAnswerId: 0,
            creationBlock: block.number,
            answerCount: 0
        });

        emit QuestionAsked(questionCount, msg.sender, ipfsHash);
    }

    // 질문 열람
    // HUM 지불 후 Verified 이벤트 발생 -> 오프체인에서 secret 해제
    function viewQuestion(uint256 questionId) external {
        require(questionId > 0 && questionId <= questionCount, "Invalid questionId");
        require(balanceOf[msg.sender] >= VIEW_COST, "Not enough HUM to view");
        balanceOf[msg.sender] -= VIEW_COST;
        balanceOf[address(this)] += VIEW_COST;
        emit Transfer(msg.sender, address(this), VIEW_COST);

        viewedBlock[questionId][msg.sender] = block.number;
        emit Verified(msg.sender, questionId);
    }

    // 답변 작성: 질문에 채택된 답이 없고, 질문을 열람한 적이 있는 유저만 가능
    // ANSWER_COST 지불
    function submitAnswer(uint256 questionId, bytes32 answerIpfsHash) external {
        require(questionId > 0 && questionId <= questionCount, "Invalid questionId");
        Question storage q = questions[questionId];
        require(q.acceptedAnswerId == 0, "Already accepted answer exists");
        require(viewedBlock[questionId][msg.sender] != 0, "You must have viewed the question");

        require(balanceOf[msg.sender] >= ANSWER_COST, "Not enough HUM to answer");
        balanceOf[msg.sender] -= ANSWER_COST;
        balanceOf[address(this)] += ANSWER_COST;
        emit Transfer(msg.sender, address(this), ANSWER_COST);

        q.answerCount++;
        uint256 answerId = q.answerCount;
        answers[questionId][answerId] = Answer({
            responder: msg.sender,
            ipfsHash: answerIpfsHash,
            votes: 0
        });

        emit AnswerSubmitted(questionId, answerId, msg.sender, answerIpfsHash);
    }

    // 투표: 열람 후 1000 블록 내에 해야 함(오프체인에서 검증)
    // 투표 비용 명시 안되어있으므로 무료라고 가정
    // 1인 1표 제한 (문제 명시X, 가정)
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public voted;
    function voteAnswer(uint256 questionId, uint256 answerId) external {
        require(questionId > 0 && questionId <= questionCount, "Invalid questionId");
        Question storage q = questions[questionId];
        require(answerId > 0 && answerId <= q.answerCount, "Invalid answerId");
        require(viewedBlock[questionId][msg.sender] != 0, "You must have viewed the question");
        require(!voted[questionId][answerId][msg.sender], "Already voted this answer");

        // 1000블록 내 투표 (오프체인에서 회수 가능성을 명시했으나, 여기서는 제약 안검)
        // 여기서는 블록 체크 로직 없이 투표 가능하도록 함.
        // 오프체인에서 viewedBlock +1000 블록 후 투표 안 했을 시 HUM 회수 로직은 오프체인 처리.

        voted[questionId][answerId][msg.sender] = true;
        answers[questionId][answerId].votes++;

        emit Voted(questionId, answerId, msg.sender);
    }

    // 3000 블록 후 채택: 가장 많은 votes를 얻은 답변 채택
    // 외부에서 cron job 형태로 호출
    function cronCheckAndAccept(uint256 questionId) external {
        require(questionId > 0 && questionId <= questionCount, "Invalid questionId");
        Question storage q = questions[questionId];
        require(q.acceptedAnswerId == 0, "Already accepted");
        require(block.number >= q.creationBlock + 3000, "Not time yet");

        uint256 maxVotes = 0;
        uint256 bestId = 0;
        for (uint256 i = 1; i <= q.answerCount; i++) {
            uint256 v = answers[questionId][i].votes;
            if (v > maxVotes) {
                maxVotes = v;
                bestId = i;
            }
        }

        if (bestId != 0) {
            q.acceptedAnswerId = bestId;
            emit Accepted(questionId, bestId);
        }
        // 만약 답변이 하나도 없거나 투표가 전부 0이면 acceptedAnswerId 그대로 0
    }
}