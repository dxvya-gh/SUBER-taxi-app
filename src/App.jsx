import { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { User, Menu, Settings, Clock, Star, MapPin, Navigation, Moon, Sun, ShieldCheck, CheckCircle, Mail, Lock, ArrowLeft } from 'lucide-react';
import './index.css';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const socket = io('http://localhost:3001');
const VIT_VELLORE = [12.9692, 79.1559];

const LOCATIONS = [
  { name: 'Current Location (VIT Gate)', lat: 12.9692, lng: 79.1559 },
  { name: 'New bus stand', lat: 12.93444, lng: 79.13617 },
  { name: 'Chitoor bus stand', lat: 12.96635, lng: 79.13748 },
  { name: 'Katpadi railway station', lat: 12.97167, lng: 79.13790 },
  { name: 'Mcdonalds', lat: 12.96822, lng: 79.14921 },
  { name: 'KFC', lat: 12.96083, lng: 79.13707 },
  { name: 'Lenskart', lat: 12.93304, lng: 79.13866 },
  { name: 'PVR Velocity', lat: 12.94990, lng: 79.13740 },
  { name: 'Vellore Kitchen', lat: 12.94990, lng: 79.13740 },
  { name: 'Inox selvam square', lat: 12.96821, lng: 79.15036 },
  { name: 'CMC', lat: 12.92817, lng: 79.14154 },
  { name: 'Naruvi Hospital', lat: 12.93376, lng: 79.14154 },
  { name: 'Vellore Fort', lat: 12.92132, lng: 79.12941 },
  { name: 'Amirtha Fine Dine', lat: 12.95128, lng: 79.13667 }
];

const CAR_OPTIONS = [
  { id: 'standard', name: 'Standard', maxCoPax: 2, img: '/standard.png' },
  { id: 'premium', name: 'Premium', maxCoPax: 1, img: '/premium.png' },
  { id: 'xl', name: 'SUV XL', maxCoPax: 4, img: '/xl.png' }
];

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1.3; // Factor in 1.3 multiplier to mimic authentic curved road networks vs linear birds-eye math!
};

const calculateFare = (meters, isCarpool, carType) => {
   const km = meters / 1000;
   let baseCost = 40;
   let kmMultiplier = 60; // 60 extra per kilometer after 1st km
   if (carType === 'premium') baseCost = 80;
   if (carType === 'xl') baseCost = 60;
   if (isCarpool) kmMultiplier = 40; else kmMultiplier = 75;
   
   const extraKm = Math.max(0, km - 1);
   return `₹${Math.floor(baseCost + (extraKm * kmMultiplier))}`;
};

const GlowingSLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', margin: '40px auto 24px' }}>
    <div className="glow-s">S</div>
  </div>
);

const TripProgressBar = ({ progress, carPref }) => {
   const carImg = CAR_OPTIONS.find(c => c.name === carPref)?.img || '/standard.png';
   return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0', backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
         <div style={{ width: '60px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <img src={carImg} alt="car class" style={{ width: '100%', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
             <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase' }}>{carPref}</div>
         </div>
         <div style={{ position: 'relative', height: '12px', flexGrow: 1, backgroundColor: 'var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
             <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.2s ease' }} />
         </div>
         <div style={{ fontSize: '14px', fontWeight: 'bold', width: '40px', textAlign: 'right', color: progress === 100 ? '#22c55e' : 'var(--text-main)' }}>
             {Math.round(progress)}%
         </div>
      </div>
   );
};

function OSRMRoute({ start, end, color = '#0055ff' }) {
  const [points, setPoints] = useState([]);

  const startStr = start?.join(',');
  const endStr = end?.join(',');

  useEffect(() => {
    if (!startStr || !endStr) return;
    
    // Check Cache so we NEVER lose the beautifully curved purple line!
    const cacheKey = `route-${startStr}-${endStr}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        setPoints(JSON.parse(cached));
        return;
    }

    const tStart = startStr.split(',').map(Number);
    const tEnd = endStr.split(',').map(Number);

    fetch(`https://router.project-osrm.org/route/v1/driving/${tStart[1]},${tStart[0]};${tEnd[1]},${tEnd[0]}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        if(data.routes && data.routes[0]) {
           const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
           setPoints(coords);
           sessionStorage.setItem(cacheKey, JSON.stringify(coords));
        } else {
           setPoints([ tStart, tEnd ]);
        }
      }).catch(err => {
           console.error("OSRM Route Error:", err);
           setPoints([ tStart, tEnd ]);
      });
  }, [startStr, endStr]);

  if (!points.length) return null;
  return <Polyline positions={points} pathOptions={{ color: color, dashArray: '10, 10', weight: 5 }} className="animated-path" />;
}

// -----------------------------------------------------
// DRIVER UNIFIED MULTI-ZOOM MAP CONTROLLER
// -----------------------------------------------------
const DriverUnifiedMapController = ({ assignedPax }) => {
   const map = useMap();
   useEffect(() => {
      if (!assignedPax || assignedPax.length === 0) return;
      let allCoords = [];
      assignedPax.forEach(p => {
         allCoords.push(p.pickupCoords);
         allCoords.push(p.dropoffCoords);
      });
      if (allCoords.length > 0) {
         map.fitBounds(allCoords, { padding: [50, 50] });
      }
   }, [assignedPax, map]);
   return null;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
  }, [darkMode]);

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;
  return <MainApp user={currentUser} onLogout={() => setCurrentUser(null)} darkMode={darkMode} setDarkMode={setDarkMode} setUser={setCurrentUser} />;
}

// -----------------------------------------------------
// AUTH SCREEN
// -----------------------------------------------------
function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('passenger');

  const submitAuth = async () => {
    if (!email || !password) return alert("Email and Password required!");
    const endpoint = isLogin ? '/api/login' : '/api/register';
    const payload = isLogin ? { email, password } : { email, password, fullName: name, role };
    
    const res = await fetch(`http://localhost:3001${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    
    if (res.ok) onLogin(await res.json());
    else { const err = await res.json(); alert(err.error); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100svh', padding: '24px', justifyContent: 'center', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))' }}>
      <h1 style={{ color: 'white', fontSize: '56px', marginBottom: '8px', fontStyle: 'italic', textAlign: 'center' }}>SUBER</h1>
      <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: '48px', fontSize: '18px', textAlign: 'center' }}>Vellore's smartest carpool network.</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', maxWidth: '400px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', borderBottom: '2px solid var(--border)', paddingBottom: '8px' }}>
           <button onClick={() => setIsLogin(true)} style={{ fontWeight: 'bold', borderBottom: isLogin ? '3px solid var(--primary)' : 'none', color: isLogin ? 'var(--primary)' : 'var(--text-muted)', padding: '8px' }}>Sign In</button>
           <button onClick={() => setIsLogin(false)} style={{ fontWeight: 'bold', borderBottom: !isLogin ? '3px solid var(--primary)' : 'none', color: !isLogin ? 'var(--primary)' : 'var(--text-muted)', padding: '8px' }}>Register Account</button>
        </div>

        {!isLogin && (
           <>
              <div style={{ position: 'relative' }}>
                 <input placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} style={{ padding: '16px 16px 16px 48px', borderRadius: '12px', border: '1px solid var(--border)' }} />
                 <User style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} size={20} />
              </div>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                 <option value="passenger">Sign up as Passenger</option><option value="driver">Sign up as Driver</option>
              </select>
           </>
        )}
        <div style={{ position: 'relative' }}>
           <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '16px 16px 16px 48px', borderRadius: '12px', border: '1px solid var(--border)' }} />
           <Mail style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} size={20} />
        </div>
        <div style={{ position: 'relative' }}>
           <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '16px 16px 16px 48px', borderRadius: '12px', border: '1px solid var(--border)' }} />
           <Lock style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} size={20} />
        </div>
        
        <button onClick={submitAuth} className="btn-primary" style={{ marginTop: '8px' }}>{isLogin ? 'Access Account' : 'Create Account'}</button>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// MAIN APP WRAPPER & HORIZONTAL ABSOLUTE NAVIGATION
// -----------------------------------------------------
function MainApp({ user, onLogout, darkMode, setDarkMode, setUser }) {
  const isDriver = user.id.includes('driver');
  const [role, setRole] = useState(isDriver ? 'driver' : 'passenger'); 
  const [activeScreen, setActiveScreen] = useState('map'); 
  const [activeRequests, setActiveRequests] = useState([]);

  useEffect(() => {
    const handleGlobalUpdates = (reqs) => setActiveRequests(reqs);
    socket.on('updateRequests', handleGlobalUpdates);
    socket.emit('getRequests'); 
    return () => { socket.off('updateRequests', handleGlobalUpdates); }
  }, []);

  return (
    <>
      <div style={{ height: '60px', display: 'flex', alignItems: 'center', padding: '0 24px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)', justifyContent: 'space-between', zIndex: 1000, position: 'relative' }}>
         <h1 style={{ fontSize: '24px', fontStyle: 'italic', fontWeight: '900', color: 'var(--primary)', margin: 0, flex: 1 }}>SUBER</h1>
         
         {/* ABSOLUTE CENTERED ICON NAV */}
         <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '32px' }}>
            <button onClick={() => setActiveScreen('map')} style={{ color: activeScreen === 'map' ? 'var(--primary)' : 'var(--text-muted)' }}><MapPin size={24} /></button>
            <button onClick={() => setActiveScreen('history')} style={{ color: activeScreen === 'history' ? 'var(--primary)' : 'var(--text-muted)' }}><Clock size={24} /></button>
            <button onClick={() => setActiveScreen('settings')} style={{ color: activeScreen === 'settings' ? 'var(--primary)' : 'var(--text-muted)' }}><Settings size={24} /></button>
         </div>

         <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
             {isDriver && activeScreen === 'map' && (
                 <div style={{ display: 'flex', backgroundColor: 'var(--bg-main)', borderRadius: '20px', padding: '2px' }}>
                   <button onClick={() => setRole('passenger')} style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '16px', fontWeight: 'bold', backgroundColor: role === 'passenger' ? 'var(--primary)' : 'transparent', color: role === 'passenger' ? 'white' : 'var(--text-muted)' }}>Pax</button>
                   <button onClick={() => setRole('driver')} style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '16px', fontWeight: 'bold', backgroundColor: role === 'driver' ? 'var(--primary)' : 'transparent', color: role === 'driver' ? 'white' : 'var(--text-muted)' }}>Drv</button>
                </div>
             )}
         </div>
      </div>

      <div className="desktop-layout">
        {activeScreen === 'map' ? (
          role === 'passenger' ? <PassengerView user={user} activeRequests={activeRequests} /> : <DriverView user={user} activeRequests={activeRequests} />
        ) : activeScreen === 'history' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}><TripsHistoryView user={user} /></div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}><SettingsView user={user} setUser={setUser} onLogout={onLogout} darkMode={darkMode} setDarkMode={setDarkMode} /></div>
        )}
      </div>
    </>
  );
}

// -----------------------------------------------------
// COMPONENTS
// -----------------------------------------------------
const LocationAutocomplete = ({ placeholder, value, onSelect, icon, enableGps }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value?.name || '');
  
  useEffect(() => { if (value) setSearch(value.name); }, [value]);

  const filtered = LOCATIONS.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  const handleGPS = (e) => {
     e.preventDefault();
     if (navigator.geolocation) {
       navigator.geolocation.getCurrentPosition(pos => {
          onSelect({ name: "My Precise GPS Location", lat: pos.coords.latitude, lng: pos.coords.longitude });
          setSearch("My Precise GPS Location");
          setOpen(false);
       }, err => alert("GPS Error: " + err.message));
     } else { alert("Geolocation relies on browser capabilities, not present."); }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
         <input type="text" placeholder={placeholder} value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
           style={{ width: '100%', padding: '16px 48px 16px 48px', borderRadius: '16px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', fontSize: '18px', fontWeight: '500', color: 'var(--text-main)' }} />
         <div style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }}>{icon}</div>
         {enableGps && (
             <button onClick={handleGPS} style={{ position: 'absolute', right: '16px', color: 'var(--primary)', fontWeight: 'bold' }}>
                 GPS 🎯
             </button>
         )}
      </div>
      {open && filtered.length > 0 && (
         <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', zIndex: 100, boxShadow: 'var(--shadow)', maxHeight: '200px', overflowY: 'auto' }}>
           {filtered.map(l => (
              <div key={l.name} onClick={() => { onSelect(l); setSearch(l.name); setOpen(false); }} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)' }}>{l.name}</div>
           ))}
         </div>
      )}
    </div>
  );
};

// -----------------------------------------------------
// PASSENGER FLOW (With OSRM Sync)
// -----------------------------------------------------
function PassengerView({ user, activeRequests }) {
  const [step, setStep] = useState('home'); 
  const defaultLoc = LOCATIONS.find(l => l.name === user.preferences?.defaultPickup);
  const [pickupData, setPickupData] = useState(defaultLoc || null);
  const [dropoffData, setDropoffData] = useState(null);
  const [rideType, setRideType] = useState('carpool');
  const [selectedCar, setSelectedCar] = useState('standard');
  const [prefs, setPrefs] = useState(user.preferences || {});
  
  const [activeRide, setActiveRide] = useState(null); 
  const [rideStatus, setRideStatus] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [carpoolFare, setCarpoolFare] = useState("₹0");
  const [soloFare, setSoloFare] = useState("₹0");
  const [calcLoad, setCalcLoad] = useState(false);
  const [rideProgress, setRideProgress] = useState(0);

  // Identify Co-Passengers and logically measure Dropoff Sequencing
  const coPassengers = useMemo(() => {
     return activeRequests.filter(r => r.driverId === activeRide?.driverId && r.id !== activeRide?.id && r.status === 'picked_up');
  }, [activeRequests, activeRide]);

  const hasEarlierDropoff = useMemo(() => {
     if (!activeRide || !activeRide.pickupCoords || !activeRide.dropoffCoords) return false;
     const myDist = calculateDistance(activeRide.pickupCoords[0], activeRide.pickupCoords[1], activeRide.dropoffCoords[0], activeRide.dropoffCoords[1]);
     for (const co of coPassengers) {
         if (!co.pickupCoords || !co.dropoffCoords) continue;
         const coDist = calculateDistance(co.pickupCoords[0], co.pickupCoords[1], co.dropoffCoords[0], co.dropoffCoords[1]);
         if (coDist < myDist) return true; // Someone physically arrives earlier!
     }
     return false;
  }, [activeRide, coPassengers]);

  // Independent Progress Bar Math (15 seconds simulated trip)
  useEffect(() => {
     let interval;
     if (rideStatus === 'picked_up') {
         // Deliberately do NOT unconditionally clear setRideProgress(0) so we don't accidentally wipe progress when copassenger state changes!
         interval = setInterval(() => {
             setRideProgress(prev => {
                if (prev >= 100) { clearInterval(interval); return 100; }
                // Pause at 50% if another passenger is statically assigned to drop off before us!
                if (hasEarlierDropoff && prev >= 50) return 50;
                return prev + 1; // 1% every 150ms = 15s absolute trip completion
             });
         }, 150); 
     } else {
         setRideProgress(0);
     }
     return () => clearInterval(interval);
  }, [rideStatus, hasEarlierDropoff]);

  useEffect(() => {
    const handlePaxUpdates = (reqs) => {
       const myReq = reqs.find(r => r.id === socket.id);
       if (myReq) setActiveRide(myReq);
    };
    
    const handlePaxStatus = (data) => {
      setRideStatus(data.action);
      if (data.action === 'completed') {
         setShowReceipt(true);
         fetch('http://localhost:3001/api/trips', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ passengerId: user.id, driverId: data.driverId, pickup: pickupData.name, dropoff: dropoffData.name, rideType, fare: rideType === 'carpool' ? carpoolFare : soloFare })
         });
      } else {
         setStep('active');
      }
    };

    socket.on('updateRequests', handlePaxUpdates);
    socket.on('ride_status', handlePaxStatus);

    return () => { socket.off('updateRequests', handlePaxUpdates); socket.off('ride_status', handlePaxStatus); }
  }, [pickupData, dropoffData, rideType, carpoolFare, soloFare, user.id]);

  // Instant Math calculation trigger for BOTH Carpool & Solo seamlessly (0ms lag!)
  useEffect(() => {
      if (pickupData && dropoffData && step === 'select_ride') {
         setCalcLoad(true);
         const dist = calculateDistance(pickupData.lat, pickupData.lng, dropoffData.lat, dropoffData.lng);
         setCarpoolFare(calculateFare(dist, true, selectedCar));
         setSoloFare(calculateFare(dist, false, selectedCar));
         setCalcLoad(false);
      }
  }, [pickupData, dropoffData, selectedCar, step]);

  const MapController = () => {
    const map = useMap();
    useEffect(() => {
      if (pickupData && dropoffData) map.fitBounds([[pickupData.lat, pickupData.lng], [dropoffData.lat, dropoffData.lng]], { padding: [50, 50] });
    }, [pickupData, dropoffData, map]);
    return null;
  };

  const requestRide = () => {
    setStep('active'); setRideStatus('searching');
    socket.emit('passenger_request', {
      passengerName: user.fullName, passengerId: user.id,
      pickup: pickupData.name, dropoff: dropoffData.name,
      pickupCoords: [pickupData.lat, pickupData.lng], dropoffCoords: [dropoffData.lat, dropoffData.lng],
      rideType, carPref: CAR_OPTIONS.find(c => c.id === selectedCar).name, prefs: prefs, fareEstimate: rideType === 'carpool' ? carpoolFare : soloFare
    });
  };

  const cancelRide = () => { socket.emit('remove_request', socket.id); setStep('home'); setActiveRide(null); };
  const closeReceipt = () => { setShowReceipt(false); setStep('home'); setRideStatus(null); setActiveRide(null); setPickupData(null); setDropoffData(null); };

  return (
    <>  
      {showReceipt && (
        <div className="sliding-receipt">
           <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ width: '80px', height: '80px', background: 'var(--success)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><CheckCircle size={40} /></div>
              <h2 style={{ fontSize: '32px' }}>Trip Completed</h2>
              <p style={{ color: 'var(--text-muted)' }}>Thank you for riding with SUBER.</p>
           </div>
           
           <div style={{ backgroundColor: 'var(--bg-main)', padding: '24px', borderRadius: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '12px', marginBottom: '12px' }}>
                 <span>Final Route Fare</span><span style={{ fontWeight: 'bold' }}>{activeRide?.fareEstimate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <span>Payment</span><span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Auto-deducted Wallet</span>
              </div>
           </div>
           
           <button onClick={closeReceipt} className="btn-primary" style={{ marginTop: 'auto' }}>Done</button>
        </div>
      )}

      <div className="map-container-wrapper">
         <MapContainer center={VIT_VELLORE} zoom={15} style={{ height: '100%', width: '100%', zIndex: 0 }} zoomControl={false}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            <MapController />
            {pickupData && <Marker position={[pickupData.lat, pickupData.lng]}><Popup>PICKUP</Popup></Marker>}
            {dropoffData && <Marker position={[dropoffData.lat, dropoffData.lng]}><Popup>DROPOFF</Popup></Marker>}
            {pickupData && dropoffData && rideStatus !== 'picked_up' && <OSRMRoute start={[pickupData.lat, pickupData.lng]} end={[dropoffData.lat, dropoffData.lng]} color="#0055ff" />}
            {pickupData && dropoffData && rideStatus === 'picked_up' && <OSRMRoute start={[pickupData.lat, pickupData.lng]} end={[dropoffData.lat, dropoffData.lng]} color="#8a2be2" />}
            {rideStatus === 'en_route' && <Marker position={[12.9680, 79.1550]}><Popup>Driver En Route</Popup></Marker>}
         </MapContainer>
         <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, var(--bg-card), transparent 30%)', zIndex: 1 }} />
      </div>

      <div className="ui-container-wrapper">
        {step === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '24px' }}>Let's Ride, {user.fullName.split(' ')[0]}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
               <LocationAutocomplete placeholder="Pickup location" value={pickupData} onSelect={setPickupData} icon={<Navigation size={20} />} enableGps={true} />
               <LocationAutocomplete placeholder="Dropoff location" value={dropoffData} onSelect={setDropoffData} icon={<MapPin size={20} />} />
            </div>
            <button className="btn-primary" onClick={() => { if(pickupData && dropoffData) setStep('select_ride'); else alert("Select exact locations from dropdown.") }}>Find Routes</button>
          </div>
        )}

        {step === 'select_ride' && (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button onClick={() => setStep('home')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--text-main)', fontWeight: 'bold', width: 'fit-content' }}>
               <ArrowLeft size={18} /> Re-Align Map
            </button>
            <h3 style={{ fontSize: '20px' }}>Vehicle Class</h3>
            <div className="scroll-container">
              {CAR_OPTIONS.map(car => (
                <div key={car.id} className={`car-card ${selectedCar === car.id ? 'selected' : ''}`} onClick={() => setSelectedCar(car.id)}><img src={car.img} alt={car.name} /><div style={{ fontWeight: 'bold' }}>{car.name}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Up to {car.maxCoPax} Pax</div></div>
              ))}
            </div>

            <button onClick={() => setRideType('carpool')} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', border: rideType === 'carpool' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '16px', alignItems: 'center', backgroundColor: rideType === 'carpool' ? 'var(--primary-light)' : 'transparent' }}>
              <div style={{ textAlign: 'left' }}><div style={{ fontWeight: 'bold', fontSize: '18px', color: rideType === 'carpool' ? 'var(--primary-dark)' : 'var(--text-main)' }}>Smart Carpool</div><div style={{ fontSize: '12px', color: rideType === 'carpool' ? 'var(--primary)' : 'var(--text-muted)' }}>Share ride within Vellore</div></div>
              <div style={{ fontWeight: 'bold', fontSize: '20px', color: rideType === 'carpool' ? 'var(--primary-dark)' : 'var(--text-main)' }}>
                 {calcLoad ? '...' : carpoolFare}
              </div>
            </button>
            <button onClick={() => setRideType('solo')} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', border: rideType === 'solo' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '16px', alignItems: 'center', backgroundColor: rideType === 'solo' ? 'var(--primary-light)' : 'transparent' }}>
              <div style={{ textAlign: 'left' }}><div style={{ fontWeight: 'bold', fontSize: '18px', color: rideType === 'solo' ? 'var(--primary-dark)' : 'var(--text-main)' }}>Solo Ride</div><div style={{ fontSize: '12px', color: rideType === 'solo' ? 'var(--primary)' : 'var(--text-muted)' }}>Direct, no passengers</div></div>
              <div style={{ fontWeight: 'bold', fontSize: '20px', color: rideType === 'solo' ? 'var(--primary-dark)' : 'var(--text-main)' }}>
                 {calcLoad ? '...' : soloFare}
              </div>
            </button>
            <button onClick={requestRide} disabled={calcLoad} className="btn-primary" style={{ marginTop: '16px', padding: '18px', fontSize: '20px' }}>Confirm & Start Search</button>
           </div>
        )}

        {step === 'active' && activeRide && (
           <div style={{ paddingBottom: '16px', display: 'flex', flexDirection: 'column' }}>
              {rideStatus === 'searching' && (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <GlowingSLoader />
                  <h3 style={{ marginTop: '16px', fontSize: '20px' }}>Finding Your Driver...</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Scanning Route for available vehicles.</p>
                  <button onClick={cancelRide} style={{ marginTop: '24px', color: 'var(--error)', textDecoration: 'underline' }}>Cancel Request</button>
                </div>
              )}
              {rideStatus === 'en_route' && (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <h3 style={{ color: 'var(--primary)', fontSize: '24px' }}>Driver is Navigating to You</h3>
                  <div style={{ margin: '16px 0', border: '2px dashed var(--primary)', padding: '16px', borderRadius: '16px', backgroundColor: 'var(--primary-light)' }}>
                     <ShieldCheck style={{ color: 'var(--primary)', margin: '0 auto 8px' }} size={32} />
                     <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>Share this OTP with Driver for Pickup</div>
                     <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '8px', color: 'var(--primary-dark)' }}>{activeRide.pickupOTP}</div>
                  </div>
                </div>
              )}
              {rideStatus === 'picked_up' && (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <TripProgressBar progress={rideProgress} carPref={activeRide.carPref} />
                  <h3 style={{ color: 'var(--success)', fontSize: '24px', marginTop: '8px' }}>{rideProgress === 100 ? 'Arrived at Destination!' : 'Tracking Route...'}</h3>
                  
                  <div style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: 'var(--shadow)', textAlign: 'left', marginTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
                       <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={24} color="var(--primary)" /></div>
                       <div><div style={{ fontWeight: 'bold' }}>Your SUBER Driver</div><div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>4.9 <Star size={12} display="inline" fill="gold" /></div></div>
                    </div>
                    <div style={{ marginBottom: '16px' }}><strong>Vehicle Class:</strong> {activeRide.carPref}</div>
                    
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', paddingBottom: '4px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                       <div><strong style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Pickup</strong><div style={{ fontWeight: 'bold' }}>{activeRide.pickup}</div></div>
                       <div><strong style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Destination</strong><div style={{ fontWeight: 'bold' }}>{activeRide.dropoff}</div></div>
                    </div>

                    {activeRequests.filter(r => r.driverId === activeRide.driverId && r.id !== activeRide.id).length > 0 && (
                       <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                          <strong style={{ color: 'var(--primary)' }}>Co-Passengers:</strong>
                          {activeRequests.filter(r => r.driverId === activeRide.driverId && r.id !== activeRide.id).map(p => 
                             <div key={p.id} style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>• {p.passengerName} ({p.status === 'en_route' ? 'Pending Pickup' : 'Riding'})</div>
                          )}
                       </div>
                    )}
                  </div>

                  {rideProgress < 100 ? (
                      <div style={{ margin: '16px 0', border: '2px dashed #8a2be2', padding: '16px', borderRadius: '16px', backgroundColor: 'rgba(138, 43, 226, 0.1)', opacity: 0.8 }}>
                         <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8a2be2', marginBottom: '8px' }}>
                             {hasEarlierDropoff && rideProgress >= 50 ? 'Waiting for Co-Passenger Dropoff...' : 'Navigating to Destination...'}
                         </div>
                         <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>The securely encrypted Dropoff OTP will unveil strictly upon final arrival.</div>
                      </div>
                  ) : (
                      <div style={{ margin: '16px 0', border: '2px dashed var(--success)', padding: '16px', borderRadius: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                         <ShieldCheck style={{ color: 'var(--success)', margin: '0 auto 8px' }} size={32} />
                         <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>You have arrived! Share this OTP.</div>
                         <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '8px', color: 'var(--success)' }}>{activeRide.dropoffOTP}</div>
                      </div>
                  )}
                </div>
              )}
           </div>
        )}
      </div>
    </>
  );
}

// -----------------------------------------------------
// CONCURRENT DRIVER FLOW (Unified Map & Broadcast Bids)
// -----------------------------------------------------
function DriverView({ user, activeRequests }) {
  const pendingRequests = activeRequests.filter(r => r.status === 'searching');
  const assignedPax = activeRequests.filter(r => r.driverId === socket.id && r.status !== 'completed');
  
  const [activePaxIndex, setActivePaxIndex] = useState(0); 
  const [otpInput, setOtpInput] = useState('');
  
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastFare, setLastFare] = useState('');
  
  const [incomingBid, setIncomingBid] = useState(null);

  const currentReq = assignedPax[activePaxIndex] || assignedPax[0]; 

  useEffect(() => {
    socket.on('incoming_carpool_bid', (reqInfo) => { 
        setIncomingBid(reqInfo);
    });
    
    socket.on('otp_error', data => alert(data.message));
    
    socket.on('ride_status_driver_sync', data => {
       // STRICLY PREVENT UI BUG: Only show success popup when actually verifying an OTP, not accepting the match!
       if (data.action === 'picked_up' || data.action === 'completed') {
           setOtpInput(''); // Instantly wipe OTP for clean UX
           setVerifySuccess(true);
           setTimeout(() => {
              setVerifySuccess(false);
              if (data.action === 'completed') {
                 setLastFare(data.fare || "Paid");
                 setShowReceipt(true);
                 setActivePaxIndex(0);
              }
              setOtpInput('');
           }, 1500);
       }
    });

    return () => { socket.off('incoming_carpool_bid'); socket.off('otp_error'); socket.off('ride_status_driver_sync'); }
  }, []);

  const acceptRequest = (req) => { 
     socket.emit('driver_action', { requestId: req.id, action: 'en_route', otp: '', fare: req.fareEstimate }); 
     setIncomingBid(null);
  };
  
  const advanceDriverState = () => {
    if (!currentReq) return;
    if (otpInput.length !== 4) return alert("Please enter the 4-digit OTP from the passenger.");
    socket.emit('driver_action', { requestId: currentReq.id, action: currentReq.status === 'en_route' ? 'picked_up' : 'completed', otp: otpInput, fare: currentReq.fareEstimate });
    setOtpInput(''); // Instantly reset prior to sync
  };
  
  const closeReceipt = () => { setShowReceipt(false); }

  return (
    <>
      {/* GLOBAL DRIVER OVERLAYS SO THEY DONT UNMOUNT WHEN PASSENGER DROPS OFF MAP */}
      {verifySuccess && (
         <div className="success-overlay">
            <CheckCircle size={48} style={{ marginBottom: '8px' }} />
            <h3 style={{ fontSize: '20px' }}>OTP Verified</h3>
         </div>
      )}
      
      {incomingBid && (
         <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--primary)', color: 'white', padding: '24px', borderRadius: '16px', zIndex: 10000, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Incoming Carpool!</h3>
            <div><strong>{incomingBid.passengerName}</strong> is near your route!</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '12px' }}>
               <button onClick={() => setIncomingBid(null)} style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>Ignore</button>
               <button onClick={() => acceptRequest(incomingBid)} style={{ backgroundColor: 'white', color: 'var(--primary)', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold' }}>Bid & Accept (+{incomingBid.fareEstimate})</button>
            </div>
         </div>
      )}

      {showReceipt && (
        <div className="sliding-receipt">
           <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ width: '80px', height: '80px', background: 'var(--success)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><CheckCircle size={40} /></div>
              <h2 style={{ fontSize: '32px' }}>Route Completed</h2>
              <p style={{ color: 'var(--text-muted)' }}>Passenger successfully dropped off.</p>
           </div>
           <div style={{ backgroundColor: 'var(--bg-main)', padding: '24px', borderRadius: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <span>Amount Earned</span><span style={{ fontWeight: 'bold', color: 'var(--success)' }}>+{lastFare}</span>
              </div>
           </div>
           <button onClick={closeReceipt} className="btn-primary" style={{ marginTop: 'auto' }}>Return to Navigation</button>
        </div>
      )}

      {currentReq ? (
        <>
          <div className="map-container-wrapper">
             <MapContainer center={VIT_VELLORE} zoom={14} style={{ height: '100%', width: '100%', zIndex: 0 }} zoomControl={false}>
               <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
               
               {/* Global Map Pins & Lines for ALL passengers */ }
               {assignedPax.map((p, i) => (
                  <div key={p.id}>
                    <Marker position={p.pickupCoords}><Popup>{p.passengerName} Pickup</Popup></Marker>
                    <Marker position={p.dropoffCoords}><Popup>{p.passengerName} Dropoff</Popup></Marker>
                    <OSRMRoute start={p.pickupCoords} end={p.dropoffCoords} color={i === activePaxIndex ? '#0055ff' : '#8a2be2'} />
                  </div>
               ))}
               <DriverUnifiedMapController assignedPax={assignedPax} />
             </MapContainer>
             <div style={{ position: 'absolute', top: '24px', left: '24px', right: '24px', backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: 'var(--shadow)', zIndex: 1000 }}>
               {assignedPax.length > 1 && (
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                     {assignedPax.map((p, idx) => (
                        <button key={p.id} onClick={() => setActivePaxIndex(idx)} style={{ fontWeight: 'bold', padding: '6px 12px', border: activePaxIndex === idx ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '8px', backgroundColor: activePaxIndex === idx ? 'var(--primary)' : 'transparent', color: activePaxIndex === idx ? 'white' : 'var(--text-main)', whiteSpace: 'nowrap' }}>
                           {p.passengerName.split(' ')[0]} ({p.status === 'en_route' ? 'Wait' : 'Riding'})
                        </button>
                     ))}
                  </div>
               )}
               <h3 style={{ color: currentReq.status === 'en_route' ? 'var(--primary)' : '#8a2be2', marginBottom: '8px' }}>
                 {currentReq.status === 'en_route' ? `Navigating to ${currentReq.passengerName}` : `Dropping off ${currentReq.passengerName}`}
               </h3>
               <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                 <span>Target:</span><span style={{ color: 'var(--text-muted)' }}>{currentReq.status === 'en_route' ? currentReq.pickup : currentReq.dropoff}</span>
               </p>
             </div>
          </div>
          
          <div className="ui-container-wrapper" style={{ justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--text-muted)' }}>{currentReq.status === 'en_route' ? 'Pickup OTP Security' : 'Dropoff OTP Security'}</div>
              <input type="text" maxLength="4" placeholder="Enter OTP" value={otpInput} onChange={e => setOtpInput(e.target.value)} 
                     style={{ padding: '24px', borderRadius: '12px', border: '2px solid var(--border)', width: '100%', fontSize: '32px', textAlign: 'center', fontWeight: 'bold', letterSpacing: '8px', color: 'var(--text-main)', backgroundColor: 'var(--bg-main)' }} />
            </div>
            <button onClick={advanceDriverState} className="btn-primary" style={{ background: currentReq.status === 'en_route' ? 'var(--success)' : '#8a2be2', fontSize: '20px', padding: '20px' }}>
              Verify & {currentReq.status === 'en_route' ? 'Pick Up' : 'Drop Off'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ height: '100%', padding: '24px', backgroundColor: 'var(--bg-main)', flex: 1, overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'var(--primary-dark)', color: 'white', padding: '20px', borderRadius: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow)' }}>
            <div><h3 style={{ margin: 0 }}>Driver Online</h3><p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>Listening in Vellore...</p></div>
            <div style={{ width: '12px', height: '12px', backgroundColor: 'var(--success)', borderRadius: '50%', boxShadow: '0 0 0 4px rgba(52, 199, 89, 0.2)' }} />
          </div>
          {pendingRequests.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '64px', color: 'var(--text-muted)' }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div><p>Searching for nearby requests...</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pendingRequests.map(req => (
                <div key={req.id} style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '16px', boxShadow: 'var(--shadow)', border: '2px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h3 style={{ color: 'var(--primary)' }}>{req.rideType === 'carpool' ? 'Carpool' : 'Solo'}</h3><span style={{ fontSize: '14px', fontWeight: 'bold' }}>{req.carPref}</span></div>
                  <div style={{ marginBottom: '16px' }}><div style={{ fontWeight: 'bold', fontSize: '18px', color: 'var(--text-main)' }}>{req.passengerName}</div><div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{req.pickup} &rarr; {req.dropoff}</div></div>
                  <button onClick={() => acceptRequest(req)} className="btn-primary">Accept Route - {req.fareEstimate}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// -----------------------------------------------------
// DATABASE VIEWS (History / Configs)
// -----------------------------------------------------
function TripsHistoryView({ user }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     fetch(`http://localhost:3001/api/trips/${user.id}`)
       .then(r => r.json())
       .then(data => { setTrips(data); setLoading(false); })
       .catch(err => setLoading(false));
  }, [user.id]);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
       <h2 style={{ fontSize: '28px', marginBottom: '24px', color: 'var(--text-main)' }}>Trip History</h2>
       {loading ? <p>Loading databases...</p> : trips.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No completed rides found for your account.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {trips.map(trip => (
                <div key={trip.id} style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '16px', boxShadow: 'var(--shadow)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{new Date(trip.date).toLocaleDateString()}</span>
                      <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{trip.fare}</span>
                   </div>
                   <div style={{ color: 'var(--text-main)' }}>
                      <div style={{ marginBottom: '8px' }}><strong>Pickup:</strong> {trip.pickup}</div>
                      <div><strong>Dropoff:</strong> {trip.dropoff}</div>
                   </div>
                   <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{trip.rideType} Ride</div>
                </div>
             ))}
          </div>
       )}
    </div>
  );
}

function SettingsView({ user, onLogout, darkMode, setDarkMode, setUser }) { 
  const [prefs, setPrefs] = useState({ 
      agePref: user.preferences?.agePref || 'Any', 
      genderPref: user.preferences?.genderPref || 'Any', 
      maxDetour: user.preferences?.maxDetour || '15 mins',
      defaultPickup: user.preferences?.defaultPickup || 'Current Location (VIT Gate)'
  });

  const saveSettings = async () => {
      const updatedUser = { ...user, preferences: prefs };
      try {
         const res = await fetch('http://localhost:3001/api/updateUser', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedUser)
         });
         if (res.ok) {
            setUser(updatedUser);
            alert("Preferences Saved Successfully!");
         }
      } catch(e) { alert("Error saving preferences."); }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '28px', color: 'var(--text-main)' }}>Settings & Profile</h2>
      
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
         <h3 style={{ marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Account Details</h3>
         <p><strong>Name:</strong> {user.fullName}</p>
         <p><strong>Email:</strong> {user.email}</p>
         <p><strong>Role Base:</strong> {user.id.includes('driver') ? 'Driver' : 'Passenger'}</p>
      </div>

      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
         <h3 style={{ marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Global Preferences</h3>
         
         <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 'bold' }}>
            Age Preference
            <select value={prefs.agePref} onChange={e => setPrefs({...prefs, agePref: e.target.value})} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
               <option value="Any">Any Age</option><option value="18-25">18 - 25</option><option value="25-40">25 - 40</option><option value="40+">40+</option>
            </select>
         </label>

         <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 'bold' }}>
            Gender Preference
            <select value={prefs.genderPref} onChange={e => setPrefs({...prefs, genderPref: e.target.value})} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
               <option value="Any">No Preference</option><option value="Male Only">Male Only</option><option value="Female Only">Female Only</option>
            </select>
         </label>

         <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 'bold' }}>
            Default Pickup Location
            <select value={prefs.defaultPickup} onChange={e => setPrefs({...prefs, defaultPickup: e.target.value})} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
               {LOCATIONS.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select>
         </label>

         <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 'bold' }}>
            Max Carpool Detour Tolerance
            <select value={prefs.maxDetour} onChange={e => setPrefs({...prefs, maxDetour: e.target.value})} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
               <option value="5 mins">5 Minutes</option><option value="15 mins">15 Minutes</option><option value="30 mins">30 Minutes</option>
            </select>
         </label>

         <button onClick={saveSettings} style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 'bold', fontSize: '18px', marginTop: '16px' }}>Save Global Preferences</button>
      </div>

      <button onClick={() => setDarkMode(!darkMode)} style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '18px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)', borderRadius: '16px', boxShadow: 'var(--shadow)' }}>
         {darkMode ? <Sun /> : <Moon />} Switch Layout
      </button>
      
      <button onClick={onLogout} style={{ color: 'var(--error)', fontWeight: 'bold', fontSize: '18px', padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '16px', marginTop: 'auto' }}>
         Log Out Securely
      </button>
    </div>
  ); 
}
