## HUM OnChain Implementation:

### init() 호출 시 해당 유저에게 HUM 5토큰이 민팅
- 동일 유저가 여러 번 init 호출하면 추가 민팅 가능하므로, 1회만 허용

### 질문 생성(Ask):
- 유저는 HUM 토큰을 지불(예: 1 HUM) 후 질문을 생성.
- 질문은 (creator, ipfsHash, acceptedAnswerId, creationBlock)를 저장.
- acceptedAnswerId는 처음엔 0 (아직 채택된 답변 없음)
- creationBlock을 저장해서 3000 블록 후에 채택 프로세스 진행

### 질문 열람(View):
- 다른 유저는 HUM 토큰을 지불(예: 1 HUM) 후 질문을 열람할 수 있다. 
- 이 때 Verified 이벤트를 발생시켜 오프체인에서 감지 후 secret 공개. 
- 열람한 유저에 대해 (viewer -> viewBlock) 저장. 이 블록넘버 기반으로 1000블록 내 vote 확인 필요.

### 답변 작성(Answer):
- 열람을 완료한 유저가, 해당 질문에 아직 채택된 답이 없고(acceptedAnswerId=0), HUM 지불(1 HUM) 후 답변을 달 수 있다.
- 답변은 (responder, ipfsHash, votes, answerId) 등 저장. (문제에서 답변 내용 암호화x라 했지만, 여기서는 off-chain 관리 IPFS hash만 저장)

### 투표(Vote):
- 열람한 유저는 열람 후 1000블록 내에 vote 해야 한다(여기서는 vote 시 HUM 비용 없음으로 가정).
- vote 하면 해당 answer의 votes 증가.
- 오프체인에서 1000블록 내에 vote 안 하면 HUM 일부 회수는 오프체인 로직이므로 (transfer) 온체인에서는 그냥 뷰어 블록 기록만 남김.

### 채택(Accept):
- 질문 생성 블록으로부터 3000블록 지난 후, cronCheckAndAccept(questionId)를 호출해 가장 많은 votes 받은 답변을 acceptedAnswerId로 지정. 이 로직은 오프체인 크론 잡 또는 keepers 등을 통해 일정 시점에 호출 가능.

※ 비용(질문 생성, 열람, 답변 작성)에 들어가는 HUM 토큰의 양은 예시로, 문제 요구사항에 맞게 조정 가능.