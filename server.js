const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname));
app.get('/host',   (req, res) => res.sendFile(__dirname + '/host.html'));
app.get('/player', (req, res) => res.sendFile(__dirname + '/player.html'));

const QUESTIONS = [
  { emoji:'🎬', q:'What is the first movie Jolo and Krista saw together?',
    opts:['Avengers: Infinity War','Punch Drunk Love','Spider-Man: Into the Spider-Verse','The Batman'],
    correct:2, lore:'Spider-Man: Into the Spider-Verse — what a way to start! 🕷️' },
  { emoji:'🚗', q:"What is the name of Jolo's car (Blue Yaris Cross)?",
    opts:['Jessica','LeBron','Samantha','Nadine'],
    correct:3, lore:"Nadine — Jolo's beloved Blue Yaris Cross! 🚙" },
  { emoji:'🎵', q:'What was the last concert Jolo and Krista saw together?',
    opts:['Laufey','Harry Styles','UP Fair','Tyler the Creator'],
    correct:3, lore:'Tyler the Creator brought the house down! 🎤' },
  { emoji:'🤝', q:'Where did Krista and Jolo first hold hands?',
    opts:['UP','Bali','Westgrove','Capitol Commons'],
    correct:3, lore:'Capitol Commons — a big moment in a beautiful spot! 💑' },
  { emoji:'💼', q:'Where did Krista and Jolo intern together?',
    opts:['Shell','NEDA','BPI','Citibank'],
    correct:3, lore:'Citibank — where work and love mixed! 🏦' },
  { emoji:'💬', q:"What's the couple's favorite catchphrase together?",
    opts:['My precious','Libre ba to?','You had me at hello','Ay kawawa'],
    correct:3, lore:'Ay kawawa — said in every situation possible! 😄' },
  { emoji:'🏠', q:'What was the first home item they purchased?',
    opts:['Bidet','Refrigerator','Bed','Aircon'],
    correct:3, lore:'Priorities! An aircon first — very Filipino! ❄️' },
  { emoji:'🍳', q:'What was the first meal that Jolo cooked for Krista?',
    opts:['Steak','Omelette','Calamares','Burger'],
    correct:3, lore:'A burger — simple, classic, and made with love! 🍔' },
  { emoji:'🤸', q:'Out of all his attempts, what was the only hobby Krista picked up from Jolo?',
    opts:['Cooking','Playing video games','Editing videos','Pilates'],
    correct:3, lore:'Pilates! Jolo started it, Krista mastered it 💪' },
  { emoji:'💍', q:"Who is Krista's least liked Lord of the Rings character?",
    opts:['Sauron','Gollum','Frodo','Eowyn'],
    correct:3, lore:"Eowyn! Don't ask Krista why — just don't. 😂" }
];

const QUESTION_TIME = 15;
let game = { phase:'lobby', qi:-1, timeLeft:0, timer:null, players:{}, answers:{}, leaderboard:[] };

function getState() {
  const q = game.qi >= 0 && game.qi < QUESTIONS.length ? QUESTIONS[game.qi] : null;
  return {
    phase: game.phase,
    qi: game.qi,
    total: QUESTIONS.length,
    timeLeft: game.timeLeft,
    question: q ? { emoji:q.emoji, q:q.q, opts:q.opts } : null,
    playerCount: Object.keys(game.players).length,
    answeredCount: Object.values(game.players).filter(p=>p.answered).length,
    leaderboard: game.leaderboard,
    correctIndex: game.phase==='reveal' && q ? q.correct : undefined,
    lore: game.phase==='reveal' && q ? q.lore : undefined
  };
}

function broadcast() {
  console.log('BROADCAST phase=' + game.phase + ' players=' + Object.keys(game.players).length);
  io.emit('state', getState());
}

function resetGame() {
  clearInterval(game.timer);
  const players = game.players;
  game = { phase:'lobby', qi:-1, timeLeft:0, timer:null, players, answers:{}, leaderboard:[] };
  Object.values(game.players).forEach(p => { p.score=0; p.answered=false; });
}

function startQuestion() {
  game.qi++;
  console.log('startQuestion qi=' + game.qi);
  if (game.qi >= QUESTIONS.length) { endGame(); return; }
  game.phase = 'question';
  game.answers = {};
  game.timeLeft = QUESTION_TIME;
  Object.values(game.players).forEach(p => p.answered = false);
  broadcast();
  clearInterval(game.timer);
  game.timer = setInterval(() => {
    game.timeLeft--;
    io.emit('tick', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) { clearInterval(game.timer); revealAnswer(); }
  }, 1000);
}

function revealAnswer() {
  game.phase = 'reveal';
  const q = QUESTIONS[game.qi];
  Object.entries(game.answers).forEach(([sid, ans]) => {
    if (!game.players[sid]) return;
    const ok = ans === q.correct;
    const pts = ok ? Math.round(500 + (game.players[sid]._timeLeft / QUESTION_TIME) * 500) : 0;
    if (ok) game.players[sid].score += pts;
    io.to(sid).emit('answer_result', { correct:ok, pts, lore:q.lore });
  });
  Object.keys(game.players).forEach(sid => {
    if (!game.answers.hasOwnProperty(sid))
      io.to(sid).emit('answer_result', { correct:false, pts:0, lore:q.lore, timedOut:true });
  });
  game.leaderboard = Object.values(game.players)
    .map(p => ({ name:p.name, score:p.score }))
    .sort((a,b) => b.score - a.score).slice(0, 10);
  broadcast();
}

function endGame() {
  game.phase = 'done';
  game.leaderboard = Object.values(game.players)
    .map(p => ({ name:p.name, score:p.score }))
    .sort((a,b) => b.score - a.score).slice(0, 10);
  broadcast();
}

io.on('connection', (socket) => {
  console.log('CONNECT ' + socket.id + ' total=' + io.sockets.sockets.size);
  socket.emit('state', getState());

  socket.on('host_start',   () => { console.log('host_start'); resetGame(); startQuestion(); });
  socket.on('host_next',    () => { console.log('host_next'); if (game.phase==='reveal') startQuestion(); });
  socket.on('host_reveal',  () => { console.log('host_reveal'); if (game.phase==='question') { clearInterval(game.timer); revealAnswer(); } });
  socket.on('host_restart', () => { console.log('host_restart'); resetGame(); broadcast(); });

  socket.on('join', ({ name }) => {
    console.log('JOIN ' + name);
    game.players[socket.id] = { name:name.trim().slice(0,20), score:0, answered:false, _timeLeft:0 };
    socket.emit('joined', { name: game.players[socket.id].name });
    socket.emit('state', getState());
    io.emit('player_joined', { playerCount:Object.keys(game.players).length, name });
  });

  socket.on('answer', ({ idx }) => {
    if (game.phase!=='question' || game.answers.hasOwnProperty(socket.id) || !game.players[socket.id]) return;
    game.players[socket.id].answered = true;
    game.players[socket.id]._timeLeft = game.timeLeft;
    game.answers[socket.id] = idx;
    socket.emit('answer_ack');
    io.emit('answered_count', {
      answeredCount: Object.values(game.players).filter(p=>p.answered).length,
      playerCount: Object.keys(game.players).length
    });
  });

  socket.on('disconnect', () => {
    console.log('DISCONNECT ' + socket.id);
    delete game.players[socket.id];
    io.emit('player_left', { playerCount:Object.keys(game.players).length });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('🌿 Running on port ' + PORT));
