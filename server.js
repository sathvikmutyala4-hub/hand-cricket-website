const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const rooms = new Map();
const makeCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();

function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    format: room.format,
    overs: room.overs,
    status: room.status,
    players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready })),
    game: room.game ? {
      status: room.game.status,
      innings: room.game.innings,
      battingIndex: room.game.battingIndex,
      scores: room.game.scores,
      wickets: room.game.wickets,
      balls: room.game.balls,
      target: room.game.target,
      currentBatter: room.game.currentBatter,
      result: room.game.result,
      lastBall: room.game.lastBall,
      choicesLocked: Object.keys(room.game.choices).length,
      choicesSubmitted: room.players.map((_p, i) => room.game.choices[i] != null)
    } : null
  };
}
function emitRoom(room) { io.to(room.code).emit("room:update", publicRoom(room)); }
function cleanName(name, fallback) {
  const v = String(name || "").trim().slice(0, 24);
  return v || fallback;
}
function createGame(room) {
  const names = room.players.map(p => p.name);
  room.game = {
    status: "playing",
    innings: 1,
    battingIndex: 0,
    scores: [0, 0],
    wickets: [0, 0],
    balls: [0, 0],
    target: null,
    currentBatter: [names[0], names[1]],
    choices: {},
    lastBall: null,
    result: null,
    maxWickets: room.mode === "quick" ? 1 : 10
  };
  room.status = "playing";
}
function finishInnings(room) {
  const g = room.game;
  if (g.innings === 1) {
    g.target = g.scores[0] + 1;
    g.innings = 2;
    g.battingIndex = 1;
    g.choices = {};
    g.lastBall = { message: `Innings break. Target: ${g.target}`, runs: 0, wicket: false };
  } else {
    g.status = "finished";
    room.status = "finished";
    if (g.scores[1] > g.scores[0]) g.result = `${room.players[1].name} wins by ${Math.max(1, room.overs * 6 - g.balls[1])} balls remaining`;
    else if (g.scores[0] > g.scores[1]) g.result = `${room.players[0].name} wins by ${g.scores[0] - g.scores[1]} runs`;
    else g.result = "Match tied";
  }
}
function resolveBall(room) {
  const g = room.game;
  const batterIndex = g.battingIndex;
  const bowlerIndex = 1 - batterIndex;
  const batter = g.choices[batterIndex];
  const bowler = g.choices[bowlerIndex];
  if (batter == null || bowler == null) return;
  let runs = 0, wicket = false, message = "";
  if (batter === bowler) {
    wicket = true;
    g.wickets[batterIndex]++;
    message = `WICKET! Both chose ${batter}.`;
  } else {
    runs = batter;
    g.scores[batterIndex] += runs;
    message = runs === 0 ? "Dot ball. The batter chose 0." : `${runs} run${runs === 1 ? "" : "s"} scored.`;
  }
  // A delivery counts as a ball in this simplified hand-cricket ruleset, including a wicket.
  g.balls[batterIndex]++;
  g.lastBall = { batter, bowler, runs, wicket, message };
  g.choices = {};
  const overLimit = room.overs * 6;
  const allOut = g.wickets[batterIndex] >= g.maxWickets;
  const oversDone = g.balls[batterIndex] >= overLimit;
  const chaseDone = g.innings === 2 && g.scores[1] >= g.target;
  if (chaseDone || allOut || oversDone) finishInnings(room);
  emitRoom(room);
}
io.on("connection", socket => {
  socket.on("room:create", (payload = {}, callback = () => {}) => {
    const mode = payload.mode === "custom" ? "custom" : "quick";
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const overs = Math.max(1, Math.min(50, Number(payload.overs) || 2));
    const room = {
      code, mode, format: payload.format || "custom", overs,
      status: "waiting",
      players: [{ id: socket.id, name: mode === "quick" ? "Player 1" : cleanName(payload.name, "Player 1"), ready: true }],
      game: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback({ ok: true, code, room: publicRoom(room) });
    emitRoom(room);
  });
  socket.on("room:join", (payload = {}, callback = () => {}) => {
    const code = String(payload.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ ok: false, error: "Room not found. Check the code and try again." });
    if (room.players.length >= 2) return callback({ ok: false, error: "This room already has two players." });
    if (room.status !== "waiting") return callback({ ok: false, error: "This match has already started." });
    const name = room.mode === "quick" ? "Player 2" : cleanName(payload.name, "Player 2");
    room.players.push({ id: socket.id, name, ready: true });
    socket.join(code);
    socket.data.roomCode = code;
    callback({ ok: true, code, room: publicRoom(room) });
    emitRoom(room);
  });
  socket.on("match:start", (_payload, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return callback({ ok: false, error: "Join a room first." });
    if (room.players[0].id !== socket.id) return callback({ ok: false, error: "Only the room creator can start the match." });
    if (room.players.length !== 2) return callback({ ok: false, error: "Waiting for the second player to join." });
    createGame(room);
    callback({ ok: true });
    emitRoom(room);
  });
  socket.on("match:pick", (payload = {}, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.game || room.game.status !== "playing") return callback({ ok: false, error: "There is no active match." });
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex < 0) return callback({ ok: false, error: "You are not in this room." });
    const choice = Number(payload.choice);
    const battingIndex = room.game.battingIndex;
    const valid = playerIndex === battingIndex ? Number.isInteger(choice) && choice >= 0 && choice <= 6 : Number.isInteger(choice) && choice >= 1 && choice <= 6;
    if (!valid) return callback({ ok: false, error: playerIndex === battingIndex ? "Batter must choose 0–6." : "Bowler must choose 1–6." });
    if (room.game.choices[playerIndex] != null) return callback({ ok: false, error: "Your choice is already locked for this ball." });
    room.game.choices[playerIndex] = choice;
    callback({ ok: true });
    emitRoom(room);
    if (room.game.choices[0] != null && room.game.choices[1] != null) resolveBall(room);
  });
  socket.on("match:rematch", (_payload, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.players.length !== 2) return callback({ ok: false, error: "Both players must be in the room." });
    if (room.players[0].id !== socket.id) return callback({ ok: false, error: "Only the room creator can start a rematch." });
    createGame(room);
    callback({ ok: true });
    emitRoom(room);
  });
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) rooms.delete(code);
    else {
      if (room.game && room.game.status === "playing") {
        room.game.status = "paused";
        room.game.result = "Opponent disconnected. Create a new room to continue.";
        room.status = "paused";
      } else room.status = "waiting";
      emitRoom(room);
    }
  });
});
server.listen(PORT, () => console.log(`Hand Cricket Arena running at http://localhost:${PORT}`));
