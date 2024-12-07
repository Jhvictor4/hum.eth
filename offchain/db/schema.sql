-- 유저 테이블
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  hum_balance INT DEFAULT 5,       -- 초기 HUM 지급
  rep_score FLOAT DEFAULT 0        -- REP 점수
);

-- 질문 테이블
CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  hum_spent INT DEFAULT 0,
  is_closed TINYINT(1) DEFAULT 0,  -- 채택 완료 여부
  adopted_answer_id INT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 답변 테이블
CREATE TABLE IF NOT EXISTS answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  hum_spent INT DEFAULT 0,
  is_adopted TINYINT(1) DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 투표 테이블 (답변에 대한 투표)
CREATE TABLE IF NOT EXISTS votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  answer_id INT NOT NULL,
  voter_id INT NOT NULL,
  hum_spent INT DEFAULT 0,
  FOREIGN KEY (answer_id) REFERENCES answers(id),
  FOREIGN KEY (voter_id) REFERENCES users(id)
);

-- 토큰 흐름 기록용 트랜잭션 테이블(옵션)
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(50), -- ex: 'QUESTION', 'ANSWER', 'VOTE', 'VIEW', 'REWARD'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
