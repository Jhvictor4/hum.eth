# Offchain 구현

이 README는 Express.js, Ethers.js, IPFS를 사용하여 구현된 Q&A 플랫폼 API 서버의 코드 구조와 각 코드 스니펫에 대한 설명을 제공합니다. 이 서버는 사용자 등록, 질문 및 답변 관리, 투표, 평판 시스템 등을 지원합니다. 현재는 완벽히 구현된 상황이 아니나, 별도의 추가 작업을 통해 구현할 수 있습니다.

## API 엔드포인트

### 사용자 등록
- **라우트:** `POST /users`
- **설명:** 스마트 컨트랙트를 통해 HUM 토큰 초기화.
- **결과:** HUM 토큰이 사용자 지갑에 발행됨.

### 사용자 정보 조회
- **라우트:** `POST /users/info`
- **입력:** 
  ```json
  { "address": "사용자의 이더리움 주소" }
- **설명:** 사용자 지갑의 HUM 잔액, 허용량(allowance), 평판 점수 반환.

### 사용자 평판 조회
- **라우트:** GET /users/:address/reputation
- **설명:** 특정 사용자의 평판 점수 반환.

### 질문 등록
- **라우트:** POST /questions
- **입력:**
  ```json
  {"content": "질문 내용",
    "userAddress": "사용자의 이더리움 주소"}
- **설명:** 질문 내용을 IPFS에 저장하고, 질문 ID를 스마트 컨트랙트에 기록.

### 질문 열람
- **라우트:** GET /questions/:questionId
- **설명:** 질문 내용과 답변 목록을 조회.
- **IPFS 사용:** IPFS에서 질문과 답변 데이터를 가져와 디코딩.


### 질문 정보 조회
- **라우트:** POST /questions/info
- **입력:**
  ```json
  {"questionId": "조회할 질문 ID"}
- **설명:** 질문 생성자, 내용, 답변 수 등 메타데이터 반환.

### 답변 등록
- **라우트:** POST /answers
- **입력:**
  ```json
  {"questionId": "질문 ID",
  "content": "답변 내용",
  "userAddress": "사용자의 이더리움 주소"}
- **설명:** IPFS에 답변 내용을 저장하고 스마트 컨트랙트에 등록.

### 답변 정보 조회
- **라우트:** POST /answers/info
- **입력:**
  ```json
  {"questionId": "질문 ID",
    "answerId": "답변 ID"}
- **설명:** 특정 답변의 작성자, 내용, 투표 수 반환.

### 답변 투표
- **라우트:** POST /answers/:questionId/:answerId/vote
- **입력:**
  ```json
  {"voter": "투표자의 이더리움 주소"}
- **설명:** 특정 답변에 투표하고 사용자의 평판 점수 업데이트.

### 답변 채택
- **라우트:** POST /questions/:questionId/accept
- **입력:**
  ```json
  {"answerId": "채택할 답변 ID",
    "accepter": "질문 작성자의 이더리움 주소"}
- **설명:** 질문 작성자가 답변을 채택.
- **기능:** 
스마트 컨트랙트 호출로 채택 처리.
답변 작성자의 평판 점수를 증가.
