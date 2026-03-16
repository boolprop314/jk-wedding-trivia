# 💍 J & K Wedding Quiz — The Fellowship of the Quiz

Real-time multiplayer wedding trivia. Host screen shows questions on the big display; guests answer on their phones.

---

## How it works

| URL | Who uses it |
|-----|-------------|
| `/` | Landing page with links |
| `/host` | Host/MC — big screen, controls the game |
| `/player` | Guests — open on their phones |

---

## Run locally (test before the wedding)

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

- Open `/host` on your laptop/TV
- Open `/player` on your phone (use your local IP, e.g. `http://192.168.1.x:3000/player`)

---

## Deploy to Railway (free, ~5 min)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo — Railway auto-detects Node.js
4. Set environment variable: `PORT=3000` (Railway may set this automatically)
5. Click Deploy → get your public URL (e.g. `https://jk-quiz.up.railway.app`)

Share the URL with guests:
- **Host screen**: `https://your-url.up.railway.app/host`
- **Players**: `https://your-url.up.railway.app/player`

---

## Deploy to Render (also free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect repo, set:
   - Build command: `npm install`
   - Start command: `node server.js`
4. Deploy → share the URL

> **Note**: Render free tier spins down after 15 min of inactivity. Wake it up before the event by visiting the URL.

---

## Customise questions

Edit the `QUESTIONS` array in `server.js`:

```js
{
  emoji: '💍',
  q: 'Your question here?',
  opts: ['Option A', 'Option B', 'Option C', 'Option D'],
  correct: 0,  // index of correct answer (0 = first option)
  lore: 'Fun fact shown after the answer is revealed!'
}
```

---

## At the wedding

1. Connect host laptop to the venue projector/TV
2. Open `/host` on the host screen — click **"Begin the Quest"** to start
3. Display the player URL (shown on the lobby screen) or print a QR code
4. Guests scan/type the URL on their phones and enter a nickname
5. Host controls pacing — click **"Reveal Answer"** when ready, then **"Next Riddle"**

**Tip**: Put the host laptop on a mobile hotspot as backup in case venue WiFi is spotty.
