const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const DB_NAME = 'qna_platform';
let pool; // pool을 나중에 초기화

// 데이터베이스 및 테이블 생성 함수
async function ensureDatabaseAndTables() {
  try {
    // 1. 데이터베이스 없는 상태로 임시 연결
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'password', // MySQL 비밀번호 설정
    });

    // 2. 데이터베이스 확인 및 생성
    console.log(`Checking if database "${DB_NAME}" exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME};`);
    console.log(`Database "${DB_NAME}" is ready.`);

    connection.close(); // 임시 연결 닫기

    // 3. pool 초기화 (데이터베이스 포함)
    pool = mysql.createPool({
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: DB_NAME, // 이제 데이터베이스가 존재하므로 지정
      waitForConnections: true,
      connectionLimit: 10,
    });

    // 4. 스키마 파일 읽기
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.error(`Schema file does not exist at ${schemaPath}`);
      return;
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const statements = schema.split(';').map(stmt => stmt.trim()).filter(stmt => stmt);

    // 5. 스키마 적용
    console.log('Applying schema...');
    const connectionPool = await pool.getConnection();
    for (const statement of statements) {
      try {
        if (statement) {
          await connectionPool.query(statement);
        }
      } catch (error) {
        console.error(`Error executing statement: ${statement}`);
        console.error(error.message);
      }
    }
    console.log('Schema successfully applied.');
    connectionPool.release();
  } catch (error) {
    console.error('Error ensuring database and tables:', error.message);
  }
}

// 애플리케이션 시작 시 데이터베이스와 테이블 확인 및 생성
ensureDatabaseAndTables();

/*

ENDPOINTS

- app.get('/')
- app.get('/users')
- app.get('/questions/:questionId')

- app.post('/users')
- app.post('/questions')
- app.post('/answers')
- app.post('/answers/:answerId/votes')
*/

// 기본 라우트
app.get('/', (req, res) => {
  res.send('Hello! Welcome to the Q&A platform API');
});

// 사용자 목록 조회
app.get('/users', async (req, res) => {
  try {
    const [users] = await pool.execute('SELECT id, username, hum_balance, rep_score FROM users');
    res.json(users); // 사용자 데이터를 JSON 형식으로 반환
  } catch (error) {
    console.error('Error in /users:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 질문 열람
app.get('/questions/:questionId', async (req, res) => {
  const { questionId } = req.params;
  try {
    const [question] = await pool.execute('SELECT * FROM questions WHERE id=?', [questionId]);
    const [answers] = await pool.execute('SELECT * FROM answers WHERE question_id=?', [questionId]);

    if (question.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ question: question[0], answers });
  } catch (error) {
    console.error('Error in /questions/:questionId:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 사용자 등록 (회원가입)
app.post('/users', async (req, res) => {
  const { username } = req.body;
  try {
    const [rows] = await pool.execute('INSERT INTO users (username) VALUES (?)', [username]);
    res.json({ userId: rows.insertId, username, hum_balance: 5, rep_score: 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 질문 등록 (3 HUM 소비)
app.post('/questions', async (req, res) => {
  const { userId, title, content, category } = req.body;
  
  // 1) 사용자 HUM 잔액 체크
  // 2) HUM 차감 및 질문 등록
  try {
    const [user] = await pool.execute('SELECT hum_balance FROM users WHERE id=?', [userId]);
    if (user.length === 0) return res.status(404).json({error:'User not found'});
    let humBalance = user[0].hum_balance;
    if (humBalance < 3) {
      return res.status(400).json({error:'Not enough HUM to post a question'});
    }

    await pool.execute('UPDATE users SET hum_balance=? WHERE id=?',[humBalance,userId]);

    const [result] = await pool.execute(
      'INSERT INTO questions (user_id, title, content, category, hum_spent) VALUES (?,?,?,?,?)',
      [userId, title, content, category, 3]
    );
    const questionId = result.insertId;
    // 트랜잭션 기록
    await pool.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?,?,?)',
      [userId, -3, 'QUESTION']);
    
    res.json({questionId, title, content, category, humSpent:3});
    humBalance -= 3;
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Internal Server Error'});
  }
});


// 답변 등록 (2 HUM 소비)
app.post('/answers', async (req, res) => {
  const { userId, questionId, content } = req.body;
  try {
    const [user] = await pool.execute('SELECT hum_balance FROM users WHERE id=?', [userId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });
    let humBalance = user[0].hum_balance;
    if (humBalance < 2) {
      return res.status(400).json({ error: 'Not enough HUM to post an answer' });
    }

    await pool.execute('UPDATE users SET hum_balance=? WHERE id=?', [humBalance, userId]);

    const [result] = await pool.execute(
      'INSERT INTO answers (question_id, user_id, content, hum_spent) VALUES (?,?,?,?)',
      [questionId, userId, content, 2]
    );

    await pool.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?,?,?)', [userId, -2, 'ANSWER']);

    res.json({ answerId: result.insertId, questionId, content, humSpent: 2 });
    humBalance -= 2;
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 답변 투표 (2 HUM 소비)
app.post('/answers/:answerId/votes', async (req, res) => {
  const { voterId } = req.body;
  const { answerId } = req.params;
  try {
    const [user] = await pool.execute('SELECT hum_balance FROM users WHERE id=?', [voterId]);
    if (user.length === 0) return res.status(404).json({error:'User not found'});
    let humBalance = user[0].hum_balance;
    if (humBalance < 2) {
      return res.status(400).json({error:'Not enough HUM to vote'});
    }

    humBalance -= 2;
    await pool.execute('UPDATE users SET hum_balance=? WHERE id=?',[humBalance,voterId]);

    const [vote] = await pool.execute(
      'INSERT INTO votes (answer_id, voter_id, hum_spent) VALUES (?,?,?)',
      [answerId, voterId, 2]
    );

    await pool.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?,?,?)',
      [voterId, -2, 'VOTE']);

    res.json({voteId: vote.insertId, answerId, voterId, humSpent:2});
  } catch (error) {
    console.error(error);
    res.status(500).json({error:'Internal Server Error'});
  }
});

// 답변 채택 로직 (간략히)
app.post('/questions/:questionId/adopt', async (req, res) => {
  const { questionId } = req.params;
  const { answerId } = req.body;

  try {
    // 채택된 답변과 질문 정보 가져오기
    const [qRow] = await pool.execute('SELECT is_closed, hum_spent, user_id FROM questions WHERE id=?', [questionId]);
    if (qRow.length === 0) return res.status(404).json({ error: 'Question not found' });
    if (qRow[0].is_closed === 1) return res.status(400).json({ error: 'Question already closed' });

    const questionOwnerId = qRow[0].user_id;
    const [aRow] = await pool.execute('SELECT user_id FROM answers WHERE id=? AND question_id=?', [answerId, questionId]);
    if (aRow.length === 0) return res.status(404).json({ error: 'Answer not found' });

    const answerOwnerId = aRow[0].user_id;

    // 투표된 토큰 총합 계산
    const [votes] = await pool.execute('SELECT SUM(hum_spent) AS totalVotes FROM votes WHERE answer_id=?', [answerId]);
    const totalVotes = votes[0].totalVotes || 0;

    // 채택된 답변자 보상
    const reward = totalVotes * 2;
    await pool.execute('UPDATE users SET hum_balance = hum_balance + ? WHERE id=?', [reward, answerOwnerId]);
    await pool.execute('UPDATE users SET rep_score = rep_score + 2 WHERE id=?', [answerOwnerId]);

    // 채택되지 못한 답변자 보상 (1 HUM 반환)
    const [otherAnswers] = await pool.execute('SELECT id, user_id FROM answers WHERE question_id=? AND id<>?', [questionId, answerId]);
    for (const answer of otherAnswers) {
      await pool.execute('UPDATE users SET hum_balance = hum_balance + 1 WHERE id=?', [answer.user_id]);
    }

    // 채택된 답변에 투표한 사람들 보상 (HUM 반환 및 REP 추가)
    const [voters] = await pool.execute('SELECT voter_id FROM votes WHERE answer_id=?', [answerId]);
    for (const voter of voters) {
      await pool.execute('UPDATE users SET hum_balance = hum_balance + 2, rep_score = rep_score + 1 WHERE id=?', [voter.voter_id]);
    }

    // 채택 처리
    await pool.execute('UPDATE questions SET is_closed=1, adopted_answer_id=? WHERE id=?', [answerId, questionId]);
    await pool.execute('UPDATE answers SET is_adopted=1 WHERE id=?', [answerId]);

    res.json({ message: 'Answer adopted', answerId, reward });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// 열람 (1 HUM 소비)
app.post('/questions/:questionId/view', async (req, res) => {
  const { userId } = req.body;
  const { questionId } = req.params;

  try {
    // 열람 비용 1 HUM
    const [user] = await pool.execute('SELECT hum_balance FROM users WHERE id=?',[userId]);
    if(user.length === 0) return res.status(404).json({error:'User not found'});
    if(user[0].hum_balance < 1) return res.status(400).json({error:'Not enough HUM to view'});

    // HUM 차감
    await pool.execute('UPDATE users SET hum_balance=hum_balance-1 WHERE id=?',[userId]);
    await pool.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?,?,?)',[userId, -1, 'VIEW']);

    // 실제 질문/답변 조회 로직
    const [question] = await pool.execute('SELECT * FROM questions WHERE id=?',[questionId]);
    const [answers] = await pool.execute('SELECT * FROM answers WHERE question_id=?',[questionId]);

    res.json({question: question[0], answers});
  } catch (error) {
    console.error(error);
    res.status(500).json({error:'Internal Server Error'});
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});