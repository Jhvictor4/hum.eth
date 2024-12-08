# offchain

Q&A 플랫폼의 백엔드를 구현한 API로, 사용자가 질문과 답변을 작성하고, 다른 사용자의 질문에 답변을 달거나, 투표 및 채택을 통해 보상받을 수 있는 시스템입니다. Node.js와 MySQL로 구현하였습니다.

- **회원가입**: 계정을 생성하고 기본 정보를 입력할 수 있습니다.
- **질문 등록**: 질문을 작성하고 3 HUM을 소비하여 질문을 등록할 수 있습니다.
- **답변 등록**: 질문에 답변을 작성하고 2 HUM을 소비하여 답변을 등록할 수 있습니다.
- **답변 투표**: 답변에 대해 2 HUM을 소비하여 투표할 수 있습니다.
- **답변 채택**: 채택된 답변자 등에게 보상을 지급합니다.
- **질문 열람**: 질문을 열람하고 1 HUM을 소비할 수 있습니다.

## 0. 서버 구동

```bash
$ npm start

> qna-offchain@1.0.0 start
> node app.js

Server running on port 3000
Checking if database "qna_platform" exists...
Database "qna_platform" is ready.
Applying schema...
Schema successfully applied.
```

## 1. 서버 상태 확인

```bash
$ curl -X GET http://localhost:3000/

Hello! Welcome to the Q&A platform API
```


## 2. 사용자 등록

```bash
$ curl -X POST http://localhost:3000/users \
-H "Content-Type: application/json" \
-d '{"username": "aaa"}'

{
  "userId": 1,
  "username": "aaa",
  "hum_balance": 5,
  "rep_score": 0
}
```

## 3. 사용자 목록 조회

```bash
$ curl -X GET http://localhost:3000/users

[
  {
    "id": 1,
    "username": "aaa",
    "hum_balance": 5,
    "rep_score": 0
  }
]
```

## 4. 질문 등록

```bash
$ curl -X POST http://localhost:3000/questions \
-H "Content-Type: application/json" \
-d '{"userId": 1, "title": "What is blockchain?", "content": "Can you explain?", "category": "General"}'

{
  "questionId": 1,
  "title": "What is blockchain?",
  "content": "Can you explain?",
  "category": "General",
  "humSpent": 3
}
```

## 5. 질문 열람

```bash
$ curl -X GET http://localhost:3000/questions/1

{
  "question": {
    "id": 1,
    "user_id": 1,
    "title": "What is blockchain?",
    "content": "Can you explain?",
    "category": "General",
    "hum_spent": 3,
    "is_closed": 0,
    "adopted_answer_id": null
  },
  "answers": []
}
```

## 6. 답변 등록

```bash
$ curl -X POST http://localhost:3000/answers \
-H "Content-Type: application/json" \
-d '{"userId": 2, "questionId": 1, "content": "idk lol"}'

{
  "answerId": 1,
  "questionId": 1,
  "content": "idk lol",
  "humSpent": 2
}
```

## 7. 답변 투표

```bash
$ curl -X POST http://localhost:3000/answers/1/votes \
-H "Content-Type: application/json" \
-d '{"voterId": 3}'

{
  "voteId": 1,
  "answerId": "1",
  "voterId": 3,
  "humSpent": 2
}
```

## 8. 답변 채택

```bash
$ curl -X POST http://localhost:3000/questions/1/adopt \
-H "Content-Type: application/json" \
-d '{"answerId": 1}'

{
  "message": "Answer adopted",
  "answerId": 1,
  "reward": 4
}
```

## 9. 질문 열람 (HUM 소비)

```bash
$ curl -X POST http://localhost:3000/questions/1/view \
-H "Content-Type: application/json" \
-d '{"userId": 4}'

{
  "question": {
    "id": 1,
    "user_id": 1,
    "title": "What is blockchain?",
    "content": "Can you explain?",
    "category": "General",
    "hum_spent": 3,
    "is_closed": 1,
    "adopted_answer_id": 1
  },
  "answers": [
    {
      "id": 1,
      "question_id": 1,
      "user_id": 2,
      "content": "idk lol",
      "hum_spent": 2,
      "is_adopted": 1
    }
  ]
}
```
