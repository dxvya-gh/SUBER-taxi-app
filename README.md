#  SUBER — Real-Time Taxi Carpooling App

A full-stack web app that connects taxi riders heading in the same direction — making shared rides cheaper, smarter, and more efficient. Built as a proof-of-concept for a real-world carpooling platform.

---

##  Features

- **Live Ride Matching** — Passengers post ride requests that instantly appear on nearby drivers' screens via WebSockets
- **Carpool Bidding Engine** — Multiple drivers compete for carpool requests in real-time; a race-condition guard ensures no two drivers grab the same passenger
- **OTP Verification** — Every pickup and dropoff is secured with a randomly generated 4-digit OTP
- **Interactive Map** — Routes rendered on a Leaflet map using OSRM for road-snapped polylines
- **Dynamic Fare Calculation** — Pricing uses the Haversine formula with a 1.3x urban detour multiplier; carpool rides get a discounted per-km rate
- **Co-Passenger Sync** — A progress-bar pausing algorithm ensures riders who share a cab see accurate trip progress when one passenger drops off earlier
- **User Profiles** — Register/login system with persistent profiles and ride history stored in SQLite
- **Google OAuth** — Supports sign-in via Google

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React-Leaflet |
| Backend | Node.js, Express 5 |
| Real-Time | Socket.IO |
| Database | SQLite3 |
| Maps | Leaflet + OSRM (open-source routing) |
| Auth | Google OAuth (`@react-oauth/google`), JWT |

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/dxvya-gh/SUBER-taxi-app.git
   cd SUBER-taxi-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the backend server**
   ```bash
   node server.js
   ```
   The backend runs on `http://localhost:3001`

4. **Start the frontend** (in a new terminal)
   ```bash
   npm run dev
   ```
   The app runs on `http://localhost:5173`

---

##  How It Works

### Ride Matching
When a passenger submits a carpool request, the server broadcasts an `incoming_carpool_bid` event to all available drivers with remaining seat capacity. The first driver to accept locks in the ride — any late acceptances are rejected with a friendly "too slow!" message.

### Fare Calculation
Distance is computed using the **Haversine formula** (great-circle distance between two GPS coordinates), then multiplied by `1.3` to realistically account for road detours. Carpool rides use a lower per-km multiplier than solo rides.

### Co-Passenger Progress Sync
The frontend uses a `useMemo` hook to compare each passenger's dropoff distance. If a co-passenger has a shorter route, the progress bar pauses at 50% until the driver verifies their dropoff OTP — then continues automatically to 100%.

For a deeper dive into the algorithms, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

##  Project Structure

```
SUBER-taxi-app/
├── src/               # React frontend (components, pages, hooks)
├── server.js          # Express + Socket.IO backend
├── database.js        # SQLite3 setup and query helpers
├── ARCHITECTURE.md    # Algorithm documentation
├── vite.config.js
└── package.json
```

---

## 📌 Notes

- This is a **proof-of-concept** — passwords are stored in plaintext and there is no HTTPS. Not intended for production use.
- The app uses `sessionStorage` to cache polyline data, reducing redundant map API calls.
- Driver capacity defaults to 2 seats per carpool vehicle.

---

##  Author

Made by [@dxvya-gh](https://github.com/dxvya-gh)
