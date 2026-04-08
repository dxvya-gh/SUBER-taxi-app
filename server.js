import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { saveUser, getUser, getUserByEmail, createTrip, getTrips } from './database.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// --- REST API ENDPOINTS ---
app.get('/api/trips/:passengerId', async (req, res) => {
  try {
     const trips = await getTrips(req.params.passengerId);
     res.json(trips);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trips', async (req, res) => {
  try {
     const id = await createTrip(req.body);
     res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/updateUser', async (req, res) => {
  try {
     const user = req.body;
     await saveUser(user);
     res.json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
  const { role, password, fullName, email } = req.body;
  try {
     const existing = await getUserByEmail(email);
     if (existing) return res.status(400).json({ error: "Email already exists! Please Log in." });
     // Base ID is unique
     const id = `suber-${role}-${crypto.randomBytes(4).toString('hex')}`;
     const newUser = { id, password, fullName, email, age: 22, gender: "Any", defaultAddress: "VIT Vellore", preferences: {} };
     await saveUser(newUser);
     res.json(newUser);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    let existing = await getUserByEmail(email);
    if (!existing) return res.status(401).json({ error: "User not found! Register instead." });
    if (existing.password !== password) return res.status(401).json({ error: "Invalid password!" });
    res.json(existing);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/profile/:id', async (req, res) => {
  try { await saveUser(req.body); res.json({ success: true }); } 
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/trips', async (req, res) => {
  try { await createTrip(req.body); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/trips/:passengerId', async (req, res) => {
  try { const trips = await getTrips(req.params.passengerId); res.json(trips); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

let activeRequests = [];
let activeDrivers = [];

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('updateRequests', activeRequests);

  // Allow clients to fetch state upon mounting their React component avoiding race conditions
  socket.on('getRequests', () => {
     socket.emit('updateRequests', activeRequests);
  });

  socket.on('passenger_request', (req) => {
    // Generate secure OTPs at the time of request broadcast
    const newReq = { 
       ...req, id: socket.id, status: 'searching', 
       pickupOTP: generateOTP(), dropoffOTP: generateOTP() 
    };

    // --- CONCURRENT CARPOOL BIDDING ENGINE ---
    if (newReq.rideType === 'carpool') {
      const availableDrivers = activeDrivers.filter(d => d.capacity > 0);
      availableDrivers.forEach(d => {
         io.to(d.id).emit('incoming_carpool_bid', newReq);
      });
    }

    activeRequests.push(newReq);
    io.emit('updateRequests', activeRequests);
  });

  socket.on('driver_action', ({ requestId, action, otp, fare }) => {
    const req = activeRequests.find(r => r.id === requestId);
    if (!req) return;

    // RACE CONDITION CHECK: Prevent 2 drivers from grabbing the same user!
    if (action === 'en_route' && req.status !== 'searching') {
        socket.emit('otp_error', { message: 'Another driver grabbed this co-passenger first! Too slow!' });
        return;
    }

    if (action === 'en_route') {
      req.status = 'en_route';
      req.driverId = socket.id;
      // If saving fare from UI
      if (fare) req.fareEstimate = fare;
      
      // If carpool, register this driver as actively receiving pool members
      if (req.rideType === 'carpool') {
         let d = activeDrivers.find(drv => drv.id === socket.id);
         if (!d) {
            d = { id: socket.id, capacity: 2 }; // Standard default capacity
            activeDrivers.push(d);
         }
         d.capacity -= 1;
         
         // Retro-scan: Check if any OTHER carpool requests were already made mathematically before this driver went active!
         const pendingPools = activeRequests.filter(r => r.status === 'searching' && r.rideType === 'carpool' && r.id !== req.id);
         pendingPools.forEach(poolReq => {
             if (d.capacity > 0) {
                 io.to(d.id).emit('incoming_carpool_bid', poolReq);
             }
         });
      }
    } else if (action === 'picked_up') {
      if (req.pickupOTP !== otp) {
        socket.emit('otp_error', { message: 'Invalid Pickup OTP!' });
        return;
      }
      req.status = 'picked_up';
    } else if (action === 'completed') {
      if (req.dropoffOTP !== otp) {
        socket.emit('otp_error', { message: 'Invalid Dropoff OTP!' });
        return;
      }
      req.status = 'completed';
      activeRequests = activeRequests.filter(r => r.id !== req.id);
      
      // Free up carpool seat capacity!
      if (req.rideType === 'carpool') {
         let d = activeDrivers.find(drv => drv.id === socket.id);
         if (d) d.capacity += 1;
      }
    }
    
    io.to(req.id).emit('ride_status', { action, driverId: socket.id });
    socket.emit('ride_status_driver_sync', { action, reqId: req.id });
    io.emit('updateRequests', activeRequests);
  });

  socket.on('remove_request', (id) => {
    activeRequests = activeRequests.filter(r => r.id !== id);
    // Note: If removing an assigned carpool, we should technically refund capacity, handled in full build.
    io.emit('updateRequests', activeRequests);
  });

  socket.on('disconnect', () => {
    activeRequests = activeRequests.filter(r => r.id !== socket.id);
    io.emit('updateRequests', activeRequests);
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Backend with OTP validation running on port ${PORT}`));
