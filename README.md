# Hand Cricket Arena

A premium, responsive Hand Cricket website starter built with HTML, CSS, vanilla JavaScript, Node.js, Express, and Socket.IO.

## What is included

- Premium dark-green responsive interface.
- Three modes: Quick Play, Custom Match, Tournament.
- Quick Play room codes with anonymous Player 1 / Player 2 labels.
- Custom Match with player names and private room codes.
- Real-time 1v1 choices: batter picks 0–6; bowler picks 1–6.
- Choices stay hidden until both players submit.
- Matching numbers dismiss the batter, except batter 0 is always safe and scores zero.
- Custom overs, T20, ODI, and Test format selection.
- Rematch button and live scoreboard.
- Tournament builder with configurable teams, player rosters, format selection, and fixture planning saved in browser local storage.

## Requirements

- Node.js 18 or newer
- VS Code
- Internet access for the first `npm install` (to download Express and Socket.IO)

## Run locally

1. Extract the ZIP file.
2. Open the extracted `hand-cricket-website` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open `http://localhost:3000` in your browser.

Keep the terminal running while playing.

## Test multiplayer on one computer

Open `http://localhost:3000` in two separate browser windows (or one normal and one incognito window). Create a room in one window and join with the room code in the other.

## Test with a friend on another device

Both devices must be able to reach the same running server. For a quick same-Wi-Fi test, run the server on your computer and open `http://YOUR_COMPUTER_LOCAL_IP:3000` on the phone, while both are on the same Wi-Fi and your firewall permits port 3000.

For internet play, deploy the Node.js server to a Node-capable host and the website/server together, or configure a suitable proxy. Netlify static hosting alone cannot run this Socket.IO server.

## Current scope / honest limitations

This is a working starter, not a finished production cricket simulator.

- The online server currently implements a two-player room and one active batter per side. Quick Play is single-wicket as requested.
- Custom Match currently supports named 1v1 players, but full multi-batter batting rotations and team scorecards are not yet implemented in the live server.
- Tournament setup, teams, player names, and fixture planning are saved in the current browser only. The tournament builder does not yet run fixtures online or calculate completed match statistics.
- T20 and ODI use their selected over limits in the online match engine. Test is currently a simplified format selection, not a complete five-day Test engine with declarations, follow-on, and four full innings.
- Room state is held in server memory. Restarting the server clears active rooms. Tournament setup is stored in that browser's local storage.
- No accounts, persistent cloud database, anti-cheat hardening, or production reconnection recovery yet.

## Core rules

- Batter: 0, 1, 2, 3, 4, 5, 6
- Bowler: 1, 2, 3, 4, 5, 6
- Matching non-zero numbers: wicket
- Different numbers: batter scores their chosen number
- Batter chooses 0: dot ball, never out
- Both choices are submitted privately and revealed when both players have locked in

## Folder structure

```text
hand-cricket-website/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```
