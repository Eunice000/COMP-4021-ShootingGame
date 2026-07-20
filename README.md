<div align="center">

# 🔫 SmashFire — Online Multiplayer Shooter

**A real-time, two-player platformer shooting game playable in the browser.**
Built for **COMP 4021** with an authoritative Node.js game server, live Socket.IO networking, and account-based matchmaking.

![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socketdotio&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-HTML5_Canvas-F7DF1E?logo=javascript&logoColor=black)

</div>

---

## Overview

SmashFire is a fast-paced **1-vs-1 online battle** set on a multi-platform arena. Two players
register, join the same room, and fight until one runs out of lives or the round timer expires.
The game state is simulated **on the server** (authoritative model) and streamed to both clients in
real time, so both players always see a consistent match.

## Features

- 🎮 **Real-time 1-vs-1 multiplayer** over WebSockets (Socket.IO)
- 🕹️ **Platformer movement** — running, **double jump**, fast-fall, and drop-through platforms
- 🔫 **Shooting & weapon system** with multiple guns
- 🎁 **Power-ups** that spawn during the match and grant random weapons
- ⏱️ **Round timer** with win-by-lives tiebreak (last player standing, or most lives when time runs out)
- 👤 **Accounts & lobby** — register/login (passwords hashed with bcrypt), create or join rooms, ready-up flow
- 🔊 Background music and sound effects

## Tech Stack

| Layer | Technology |
| --- | --- |
| Server | Node.js, Express 5, Socket.IO |
| Auth / Session | `express-session`, `bcrypt` |
| Game engine | Custom authoritative simulation (fixed-timestep loop, server-side collision & hit detection) |
| Client | HTML5 Canvas, vanilla JavaScript |

## Getting Started

**Prerequisites:** Node.js and npm installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start        # or: node server.js
```

The server runs at **http://localhost:8000** (override with the `PORT` environment variable).

## How to Play

1. Open **http://localhost:8000** in your browser.
2. **Register** or **log in** to an account.
3. **Create** a room, or **join** an existing one.
4. Once **both players** are in the room and **ready**, click **Start Game**.
5. Battle it out — the winner is decided when a player runs out of lives, or by most lives remaining when the round timer hits zero.

> For local testing, open the game in **two browser windows/tabs** (or two devices on the same network) and log in as two different accounts.

### Controls

| Key | Action |
| --- | --- |
| **← / →** | Move left / right |
| **↑** | Jump (press again mid-air for a **double jump**) |
| **↓** | On a platform: drop through it · In the air: fast-fall |
| **Z** | Shoot |

## Project Structure

```
COMP-4021-ShootingGame/
├── server.js         # Express + Socket.IO entry point (HTTP, sessions, room routing)
├── server/           # Authoritative game engine & match host
│   ├── gameEngine.js #   simulation loop, timer, win conditions, stats
│   └── ...           #   world, entities, players, guns, power-ups
├── js/               # Client-side code
│   ├── auth.js, lobby.js, findRooms.js, start_game.js
│   └── netgame/      #   networked client: renderer, input, game states, UI
├── css/              # Styles
├── image/            # Sprites & backgrounds (players, guns, arena)
├── music/            # Background music
├── sound_effect/     # SFX
├── data/             # Runtime data (rooms, accounts)
└── index.html        # Client entry page
```

## Troubleshooting

- Make sure the server is running and reachable at the port shown in the console.
- Check the browser console for errors if the game doesn't load.
- Confirm **both players are connected to the same room** before starting.
- If a match won't start, verify both players have clicked **Ready**.

---

*Course project for COMP 4021 (Internet Computing).*
