# SUBER: Technical Architecture & Algorithm Documentation

This document outlines the core structural frameworks and specific mathematical algorithms fueling SUBER's carpooling ecosystem.

---

## 1. System Architecture Details

### Frontend (`React 19`, `Vite`, `React-Leaflet`)
The frontend is designed as a dynamic, component-driven SPA running entirely on React functional states and hooks (`useState`, `useEffect`, `useMemo`). 
*   **Decoupled Rendering:** Instead of choking the main JavaScript Event Loop by tracking GPS movement natively on the Leaflet Maps canvas, the application visually decouples the trace mapping. Polyline shapes render statically utilizing browser `sessionStorage` caching, while Trip Progress is driven dynamically on a mathematically decoupled Interval.
*   **Live Web Socket Linking:** The frontend integrates globally using `socket.io-client`, constantly filtering the `activeRequests` global queue via memoized dependencies, providing instant 0-latency map feedback.

### Backend (`Node.js`, `Express`, `Socket.IO`, `SQLite3`)
The server operates as a concurrent Real-Time bidding engine. 
*   **Non-Blocking State Machines:** The server retains global state over memory Arrays (`activeRequests`, `activeDrivers`). When a passenger initiates a request, the server securely assigns randomly generated Dropoff/Pickup OTP tokens. 
*   **Driver Sync Engine:** It checks the active driver pools dynamically against a rigid `capacity` framework. If multiple requests stream in, the server evaluates available seats (`capacity > 0`) and directly beams `incoming_carpool_bid` packets straight to the nearest driver's screen in real-time.

---

## 2. Mathematical Algorithms & Calculations

SUBER utilizes multiple embedded math engines to process mapping and concurrent rides safely. It employs a **Dual-Algorithm Split** between visual mapping and mathematical pricing logic to bypass external rate limits and ensure maximum speed.

### A. Visual Route Tracing (Dijkstra's Algorithm / Contraction Hierarchies)
When the application draws the fully curved purple polyline path snapping precisely onto the Leaflet map roads, it queries an external open-source mapping engine (`router.project-osrm.org`). 
*   **The Physics:** The OSRM backend mathematically resolves the shortest and fastest driveable geometry utilizing **Dijkstra's Algorithm** layered securely over **Contraction Hierarchies**. This graph-theory mechanism pre-calculates the fastest physical connections intersecting OpenStreetMap data instantly.

### B. The Curvature Haversine Formula (Map Pricing & Logic)
Relying on live routing APIs often breaks down due to server lag or strict Rate Limits (e.g., `429 Too Many Requests`). Instead of waiting for routing servers to dictate cost, the app calculates realistic terrain distance mathematically.

The application computes distance over the Earth's curvature using the profound **Haversine Algorithm**. It accounts for spherical latitude and longitude scaling.

```javascript
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radius of Earth in meters
  const rad = Math.PI / 180;
  
  // Convert coordinate deltas into radians
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  
  // Trigonometric curve calculus
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  // Earth Arc distance factored against a 1.3x Urban Detour Multiplier!
  return R * c * 1.3; 
};
```
> [!NOTE]  
> Pure bird's-eye distance in a city is unrealistic. To correctly quote a fair price, the app inflates the spherical line perfectly by a `1.3x` modifier mechanically mirroring natural right angles, road detours, and traffic round-a-bouts without ever needing to query an expensive external mapping server.

### C. Dynamic Tiered Fare Scaling
Fares in SUBER scale exponentially rather than linearly based on Carpool mechanics, distance penalties, and Vehicle class (Standard, Premium, XL). 

```javascript
const extraKm = Math.max(0, km - 1);
let fare = baseCost + (extraKm * kmMultiplier);
```
- **The Threshold Check:** The very first Kilometer is absorbed directly into a heavy locked `baseCost`. 
- **Carpool vs Solo Matrix:** If users select Carpool, the `kmMultiplier` scaling is slashed dynamically (e.g. ₹40 per extra km instead of ₹75).

### D. The Co-Passenger Synchronization Algorithm
When multiple riders are sharing a single vehicle, the frontend dynamically measures the Dropoff Vector length of every simultaneous passenger using a `useMemo` computation loop. 

```javascript
  const hasEarlierDropoff = useMemo(() => {
     // ...
     const myDist = calculateDistance(myPickup, myDropoff);
     
     for (const co of coPassengers) {
         const coDist = calculateDistance(coPickup, coDropoff);
         if (coDist < myDist) return true; // Someone physically arrives earlier!
     }
     return false;
  }, [activeRide, coPassengers]);
```
#### Progress Pausing Matrix:
1. Every client app tracks progress locally based on a native `setInterval` that ascends precisely `1%` every `150ms`.
2. As the Progress approaches the `50%` threshold barricade, the interval loop tests the `hasEarlierDropoff` bool.
3. If True (meaning someone else physically needs to drop off earlier), the loop forcibly intercepts and returns `50`, capping the visualization bar permanently natively mirroring "waiting in the vehicle."
4. The exact millisecond the Driver tabs Verify on the Co-Passenger's Dropoff OTP, the Backend removes them from the global map query.
5. The true computation dynamically resolves to `false`, evaporating the barricade from memory and letting the script slide identically on its own weight to 100%!
