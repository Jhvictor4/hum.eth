require('dotenv').config();

console.log('Provider URL:', process.env.PROVIDER_URL);
console.log('Private Key:', process.env.PRIVATE_KEY);
console.log('Contract Address:', process.env.CONTRACT_ADDRESS);

const express = require('express');
const { ethers } = require('ethers');
const { create } = require('ipfs-http-client');

const app = express();
app.use(express.json());

// 인메모리 데이터 구조
const votes = {}; // { "voterAddress_questionId_answerId": true }
const userReputation = {}; // { "userAddress": reputationScore }

const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractAddress = process.env.CONTRACT_ADDRESS;
const contractABI = require('./HumanKnowledgeProtocol.abi.json');
const contract = new ethers.Contract(contractAddress, contractABI, wallet);

// IPFS 클라이언트 설정 (프로젝트 환경에 맞게 변경)
const ipfs = create({ url: 'http://localhost:5001' });

// 서버 지갑 주소 출력
console.log('Server Wallet Address:', wallet.address);

// 기본 라우트
app.get('/', (req, res) => {
  res.send('Hello! Welcome to the Q&A platform API');
});

// 유저 등록 (init HUM tokens)
app.post('/users', async (req, res) => {
  try {
    const tx = await contract.connect(wallet).init();
    await tx.wait();
    res.json({ message: 'User init HUM tokens minted on-chain' });
  } catch (error) {
    console.error('Error initializing user:', error);
    res.status(500).json({ error: 'Failed to initialize user' });
  }
});

// 사용자 정보 조회 및 평판 초기화
app.post('/users/info', async (req, res) => {
  try {
    const { address } = req.body;

    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const balance = await contract.balanceOf(address);
    const allowance = await contract.allowance(address, wallet.address); // 예시: 서버의 지갑이 허용한 양

    // 사용자 평판 조회 또는 초기화
    const addressLower = address.toLowerCase();
    if (!(addressLower in userReputation)) {
      userReputation[addressLower] = 0; // 초기 평판 점수
    }

    res.json({
      address,
      balance: ethers.utils.formatEther(balance),
      allowance: ethers.utils.formatEther(allowance),
      reputation: userReputation[addressLower],
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// 질문 등록
app.post('/questions', async (req, res) => {
  try {
    const { content, userAddress } = req.body;

    if (!ethers.utils.isAddress(userAddress)) {
      return res.status(400).json({ error: 'Invalid user Ethereum address' });
    }

    // IPFS에 질문 내용 추가
    const { cid } = await ipfs.add(content);
    const ipfsHash = cid.toString(); // 문자열로 그대로 전달

    // 스마트 컨트랙트의 askQuestion 함수 호출
    const tx = await contract.connect(wallet).askQuestion(ipfsHash);
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'QuestionAsked');
    const questionId = event.args.questionId.toNumber();

    res.json({ questionId, ipfsHash, cid: cid.toString() });
  } catch (error) {
    console.error('Error asking question:', error);
    res.status(500).json({ error: 'Failed to ask question' });
  }
});

// 질문 열람
app.get('/questions/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;
    const q = await contract.questions(questionId);
    const cid = q.ipfsHash; // 문자열로 직접 사용
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString('utf8');

    const answerCount = q.answerCount.toNumber();
    let answers = [];
    for (let i = 1; i <= answerCount; i++) {
      const ans = await contract.answers(questionId, i);
      const ansCid = ans.ipfsHash; // 문자열로 직접 사용
      const ansChunks = [];
      for await (const chunk of ipfs.cat(ansCid)) {
        ansChunks.push(chunk);
      }
      const ansContent = Buffer.concat(ansChunks).toString('utf8');
      answers.push({ answerId: i, responder: ans.responder, content: ansContent, votes: ans.votes.toNumber() });
    }

    res.json({
      questionId,
      creator: q.creator,
      content,
      acceptedAnswerId: q.acceptedAnswerId.toNumber(),
      answers
    });
  } catch (error) {
    console.error('Error fetching question details:', error);
    res.status(500).json({ error: 'Failed to fetch question details' });
  }
});

// 답변 등록
app.post('/answers', async (req, res) => {
  try {
    const { questionId, content, userAddress } = req.body;

    if (!ethers.utils.isAddress(userAddress)) {
      return res.status(400).json({ error: 'Invalid user Ethereum address' });
    }

    // IPFS에 답변 내용 추가
    const { cid } = await ipfs.add(content);
    const ipfsHash = cid.toString();

    // 스마트 컨트랙트의 submitAnswer 함수 호출
    const tx = await contract.submitAnswer(questionId, ipfsHash);
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'AnswerSubmitted');
    const answerId = event.args.answerId.toNumber();

    res.json({ questionId, answerId, cid: cid.toString() });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// 투표
app.post('/answers/:questionId/:answerId/vote', async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { voter } = req.body; // 투표자의 Ethereum 주소

    if (!ethers.utils.isAddress(voter)) {
      return res.status(400).json({ error: 'Invalid voter Ethereum address' });
    }

    const voterLower = voter.toLowerCase();
    const voteKey = `${voterLower}_${questionId}_${answerId}`;

    // 이미 투표했는지 확인
    if (votes[voteKey]) {
      return res.status(400).json({ error: 'You have already voted for this answer' });
    }

    // HUM 토큰 지불 로직 추가 (필요 시)
    // 예: 사용자로부터 VOTE_COST 만큼의 HUM 토큰을 전송받는 로직

    // 스마트 컨트랙트의 voteAnswer 함수 호출
    const tx = await contract.voteAnswer(questionId, answerId, { from: voter });
    await tx.wait();

    // 투표 내역 저장
    votes[voteKey] = true;

    // 사용자 평판 업데이트 (예시: REP 포인트 추가)
    if (!(voterLower in userReputation)) {
      userReputation[voterLower] = 0;
    }
    userReputation[voterLower] += 1; // REP 포인트 1 추가

    res.json({ message: 'Voted successfully', questionId, answerId });
  } catch (error) {
    console.error('Error voting answer:', error);
    res.status(500).json({ error: 'Failed to vote answer' });
  }
});

// 채택
app.post('/questions/:questionId/accept', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answerId, accepter } = req.body; // 채택하는 사용자의 Ethereum 주소

    if (!ethers.utils.isAddress(accepter)) {
      return res.status(400).json({ error: 'Invalid accepter Ethereum address' });
    }

    const accepterLower = accepter.toLowerCase();

    // 스마트 컨트랙트의 cronCheckAndAccept 함수 호출
    // 원래 cronCheckAndAccept는 questionId만 받으므로, answerId를 추가하려면 스마트 컨트랙트가 이를 지원해야 합니다.
    // 하지만 스마트 컨트랙트를 수정할 수 없으므로, answerId를 수동으로 지정할 수 없습니다.
    // 따라서, answerId를 포함하지 않고 질문Id만 전달합니다.
    const tx = await contract.cronCheckAndAccept(questionId, { from: accepter });
    await tx.wait();

    // 채택된 답변자에게 보상 로직 추가 (오프체인)
    // 예: 평판 점수 증가, HUM 토큰 전송 등

    // 채택된 답변의 responder 주소 가져오기
    const answer = await contract.answers(questionId, answerId);
    const responder = answer.responder.toLowerCase();

    if (!(responder in userReputation)) {
      userReputation[responder] = 0;
    }
    userReputation[responder] += 2; // REP 포인트 2 추가

    res.json({ message: 'Answer accepted successfully', questionId, answerId });
  } catch (error) {
    console.error('Error accepting answer:', error);
    res.status(500).json({ error: 'Failed to accept answer' });
  }
});

// 질문 정보 조회
app.post('/questions/info', async (req, res) => {
  try {
    const { questionId } = req.body;

    if (!questionId || isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid questionId' });
    }

    const q = await contract.questions(questionId);
    if (q.creator === ethers.constants.AddressZero) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // IPFS에서 질문 내용 가져오기
    const cid = q.ipfsHash; // 문자열로 직접 사용
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString('utf8');

    res.json({
      questionId,
      creator: q.creator,
      content,
      acceptedAnswerId: q.acceptedAnswerId.toNumber(),
      answerCount: q.answerCount.toNumber(),
      creationBlock: q.creationBlock.toNumber(),
    });
  } catch (error) {
    console.error('Error fetching question info:', error);
    res.status(500).json({ error: 'Failed to fetch question info' });
  }
});

// 답변 정보 조회
app.post('/answers/info', async (req, res) => {
  try {
    const { questionId, answerId } = req.body;

    if (!questionId || isNaN(questionId) || !answerId || isNaN(answerId)) {
      return res.status(400).json({ error: 'Invalid questionId or answerId' });
    }

    const q = await contract.questions(questionId);
    if (q.creator === ethers.constants.AddressZero) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const ans = await contract.answers(questionId, answerId);
    if (ans.responder === ethers.constants.AddressZero) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    // IPFS에서 답변 내용 가져오기
    const ansCid = ans.ipfsHash; // 문자열로 직접 사용
    const ansChunks = [];
    for await (const chunk of ipfs.cat(ansCid)) {
      ansChunks.push(chunk);
    }
    const ansContent = Buffer.concat(ansChunks).toString('utf8');

    res.json({
      questionId,
      answerId,
      responder: ans.responder,
      content: ansContent,
      votes: ans.votes.toNumber(),
    });
  } catch (error) {
    console.error('Error fetching answer info:', error);
    res.status(500).json({ error: 'Failed to fetch answer info' });
  }
});

// 추가: 평판 조회
app.get('/users/:address/reputation', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const addressLower = address.toLowerCase();
    const reputation = userReputation[addressLower] || 0;

    res.json({
      address,
      reputation,
    });
  } catch (error) {
    console.error('Error fetching user reputation:', error);
    res.status(500).json({ error: 'Failed to fetch user reputation' });
  }
});

// Optional: 인메모리 데이터를 파일에 저장하고 복구하는 로직
// 이 부분은 선택 사항이며, 데이터 영속성이 필요하다면 구현할 수 있습니다.
// 예시로 JSON 파일을 사용하여 데이터를 저장하고 복구하는 방법을 소개합니다.

const fs = require('fs');
const path = require('path');

const VOTES_FILE = path.join(__dirname, 'votes.json');
const REPUTATION_FILE = path.join(__dirname, 'userReputation.json');

// 데이터 로드
const loadData = () => {
  if (fs.existsSync(VOTES_FILE)) {
    const votesData = fs.readFileSync(VOTES_FILE);
    Object.assign(votes, JSON.parse(votesData));
  }

  if (fs.existsSync(REPUTATION_FILE)) {
    const reputationData = fs.readFileSync(REPUTATION_FILE);
    Object.assign(userReputation, JSON.parse(reputationData));
  }
};

// 데이터 저장
const saveData = () => {
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
  fs.writeFileSync(REPUTATION_FILE, JSON.stringify(userReputation, null, 2));
};

// 서버 시작 시 데이터 로드
loadData();

// 서버 종료 시 데이터 저장
process.on('SIGINT', () => {
  console.log('Saving data before exit...');
  saveData();
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('Saving data before exit...');
  saveData();
  process.exit();
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
