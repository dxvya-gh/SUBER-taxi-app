import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup database connection and serialize table execution
const dbPath = join(__dirname, 'suber.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite:', err.message);
    process.exit(1);
  }
  
  // Create our tables
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      fullName TEXT,
      email TEXT UNIQUE,
      password TEXT,
      age INTEGER,
      gender TEXT,
      defaultAddress TEXT,
      preferences TEXT
    )`);
    
    // Attempt to seamlessly alter an older schema if it exists without crashing
    db.run("ALTER TABLE users ADD COLUMN password TEXT", (err) => { /* ignore if already exists */ });


    db.run(`CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      passengerId TEXT,
      driverId TEXT,
      pickup TEXT,
      dropoff TEXT,
      rideType TEXT,
      fare TEXT,
      date TEXT
    )`);
  });
});

export const getUser = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      if (row) {
         try { row.preferences = JSON.parse(row.preferences); } catch(e){}
      }
      resolve(row);
    });
  });
};

export const getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      if (row) {
         try { row.preferences = JSON.parse(row.preferences); } catch(e){}
      }
      resolve(row);
    });
  });
};

export const saveUser = (user) => {
  return new Promise((resolve, reject) => {
    const prefs = JSON.stringify(user.preferences || {});
    db.run(
      `INSERT OR REPLACE INTO users (id, fullName, email, password, age, gender, defaultAddress, preferences) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.fullName, user.email, user.password, user.age, user.gender, user.defaultAddress, prefs],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
};

export const createTrip = (trip) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO trips (passengerId, driverId, pickup, dropoff, rideType, fare, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [trip.passengerId, trip.driverId, trip.pickup, trip.dropoff, trip.rideType, trip.fare, new Date().toISOString()],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
};

export const getTrips = (passengerId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM trips WHERE passengerId = ? ORDER BY id DESC', [passengerId], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

export default db;
