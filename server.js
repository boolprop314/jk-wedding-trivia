const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── QUESTIONS ──────────────────────────────────────────────
const QUESTIONS = [
  {
    emoji: '🏛️',
    q: 'How did Krista and Jolo meet?',
    opts: ['Poveda x LSGH soiree', 'UPD Econ coursemates', 'Kas 1 classmates', 'Met at TK 😜'],
    correct: 1,
    lore: 'They crossed paths in the halls of UPD Econ — an unlikely fellowship that changed everything! ✨'
  },
  {
    emoji: '🎬',
    q: 'What is their favorite movie saga?',
    opts: ['Twilight', 'Shrek', 'The Lord of the Rings', 'Harry Potter'],
    correct: 2,
    lore: 'Even this quiz is inspired by their love for Middle-earth. One ring to rule them all! 💍'
  },
  {
    emoji: '🛋️',
    q: 'What is their favorite activity to do together?',
    opts: ['Hiking', 'Cooking', 'Binge watching TV series', 'Traveling to new cities'],
    correct: 2,
    lore: 'Like true hobbits, they love a good story by the fireside — just with a screen! 📺'
  },
  {
    emoji: '🎵',
    q: 'Which concert have they NOT attended?',
    opts: ['Laufey', 'Harry Styles', 'Chance the Rapper', 'Tyler the Creator'],
    correct: 2,
    lore: 'Chance the Rapper remains on the bucket list — maybe he\'ll play at the after-party? 🎤'
  },
  {
    emoji: '📅',
    q: 'How many years have they been together?',
    opts: ['2 years', '8 years', '6 years', '10 years'],
    correct: 1,
    lore: 'Eight wonderful years — nearly the length of the War of the Ring, but with far more joy! 🥂'
  }
];

const QUESTION_TIME = 10; // seconds

// ── GAME STATE ─────────────────────────────────────────────
let game = {
  phase: 'lobby',       // lobby | question | reveal | leaderboard | done
  qi: -1,
  timeLeft: 0,
  timer: null,
  players: {},          // socketId -> { name, score, answered }
  answers: {},          // socketId -> answerIndex (current question)
  leaderboard: []       // sorted at reveal
};

function resetGame() {
  clearInterval(game.timer);
  game = {
    phase: 'lobby',
    qi: -1,
    timeLeft: 0,
    timer: null,
    players: game.players, // keep players between rounds
    answers: {},
    leaderboard: []
  };
  // reset scores
  Object.values(game.players).forEach(p => { p.score = 0; p.answered = false; });
}

function broadcastState(extra = {}) {
  const q = game.qi >= 0 && game.qi < QUESTIONS.length ? QUESTIONS[game.qi] : null;
  io.emit('state', {
    phase: game.phase,
    qi: game.qi,
    total: QUESTIONS.length,
    timeLeft: game.timeLeft,
    question: q ? { emoji: q.emoji, q: q.q, opts: q.opts } : null,
    playerCount: Object.keys(game.players).length,
    answeredCount: Object.values(game.players).filter(p => p.answered).length,
    leaderboard: game.leaderboard,
    ...extra
  });
}

function startQuestion() {
  game.qi++;
  if (game.qi >= QUESTIONS.length) {
    endGame();
    return;
  }
  game.phase = 'question';
  game.answers = {};
  game.timeLeft = QUESTION_TIME;
  Object.values(game.players).forEach(p => { p.answered = false; });

  broadcastState();

  game.timer = setInterval(() => {
    game.timeLeft--;
    io.emit('tick', { timeLeft: game.timeLeft });

    if (game.timeLeft <= 0) {
      clearInterval(game.timer);
      revealAnswer();
    }
  }, 1000);
}

function revealAnswer() {
  game.phase = 'reveal';
  const q = QUESTIONS[game.qi];

  // score players who answered correctly
  Object.entries(game.answers).forEach(([sid, ans]) => {
    if (ans === q.correct && game.players[sid]) {
      const timeBonus = Math.round((game.players[sid]._timeLeft / QUESTION_TIME) * 500);
      const pts = 500 + timeBonus;
      game.players[sid].score += pts;
      io.to(sid).emit('answer_result', { correct: true, pts, lore: q.lore });
    } else if (game.players[sid]) {
      io.to(sid).emit('answer_result', { correct: false, pts: 0, lore: q.lore });
    }
  });

  // players who didn't answer
  Object.keys(game.players).forEach(sid => {
    if (!game.answers.hasOwnProperty(sid)) {
      io.to(sid).emit('answer_result', { correct: false, pts: 0, lore: q.lore, timedOut: true });
    }
  });

  // build leaderboard
  game.leaderboard = Object.entries(game.players)
    .map(([, p]) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  broadcastState({ correctIndex: q.correct, lore: q.lore });
}

function endGame() {
  game.phase = 'done';
  game.leaderboard = Object.entries(game.players)
    .map(([, p]) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  broadcastState();
}

// ── SOCKET EVENTS ──────────────────────────────────────────
io.on('connection', (socket) => {

  // HOST events
  socket.on('host_start', () => {
    if (game.phase === 'lobby' || game.phase === 'done') {
      resetGame();
      startQuestion();
    }
  });

  socket.on('host_next', () => {
    if (game.phase === 'reveal') startQuestion();
  });

  socket.on('host_reveal', () => {
    if (game.phase === 'question') {
      clearInterval(game.timer);
      revealAnswer();
    }
  });

  socket.on('host_restart', () => {
    resetGame();
    broadcastState();
  });

  // PLAYER events
  socket.on('join', ({ name }) => {
    game.players[socket.id] = { name: name.trim().slice(0, 20), score: 0, answered: false, _timeLeft: 0 };
    socket.emit('joined', { name: game.players[socket.id].name });
    // send current state so late joiners see right screen
    const q = game.qi >= 0 && game.qi < QUESTIONS.length ? QUESTIONS[game.qi] : null;
    socket.emit('state', {
      phase: game.phase,
      qi: game.qi,
      total: QUESTIONS.length,
      timeLeft: game.timeLeft,
      question: q ? { emoji: q.emoji, q: q.q, opts: q.opts } : null,
      playerCount: Object.keys(game.players).length,
      answeredCount: Object.values(game.players).filter(p => p.answered).length,
      leaderboard: game.leaderboard
    });
    // notify host of new player
    io.emit('player_joined', { playerCount: Object.keys(game.players).length, name: game.players[socket.id].name });
  });

  socket.on('answer', ({ idx }) => {
    if (game.phase !== 'question') return;
    if (game.answers.hasOwnProperty(socket.id)) return; // already answered
    if (!game.players[socket.id]) return;

    game.players[socket.id].answered = true;
    game.players[socket.id]._timeLeft = game.timeLeft;
    game.answers[socket.id] = idx;

    socket.emit('answer_ack'); // lock their screen
    io.emit('answered_count', {
      answeredCount: Object.values(game.players).filter(p => p.answered).length,
      playerCount: Object.keys(game.players).length
    });
  });

  socket.on('disconnect', () => {
    delete game.players[socket.id];
    io.emit('player_left', { playerCount: Object.keys(game.players).length });
  });
});

// ── START ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🌿 Wedding Quiz running → http://localhost:${PORT}`));
