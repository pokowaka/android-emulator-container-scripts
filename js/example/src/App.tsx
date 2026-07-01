import React, { useState, useRef } from 'react';
import { Emulator, logger } from '../../src';

logger.setLevel("debug");

function App() {
  // Retrieve default connection URI from URL query parameters (e.g. ?url=localhost:8080 or ?uri=localhost:8080)
  const getInitialUri = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("url") || params.get("uri") || window.location.host;
  };

  const hasDefaultUri = () => {
    const params = new URLSearchParams(window.location.search);
    return params.has("url") || params.has("uri");
  };

  const [uri, setUri] = useState(getInitialUri());
  const [connected, setConnected] = useState(hasDefaultUri());
  const [gps, setGps] = useState({ latitude: 37.4220, longitude: -122.0841 });
  const [inputGps, setInputGps] = useState({ lat: '37.4220', lng: '-122.0841' });
  const emulatorRef = useRef(null);

  const handleConnect = (e) => {
    if (e) e.preventDefault();
    setConnected(true);
  };

  const handleDisconnect = () => {
    setConnected(false);
  };

  const sendKey = (key) => {
    if (emulatorRef.current) {
      emulatorRef.current.sendKey(key);
    }
  };

  const handleGpsSubmit = (e) => {
    e.preventDefault();
    setGps({
      latitude: parseFloat(inputGps.lat),
      longitude: parseFloat(inputGps.lng),
    });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Android Emulator WebRTC Demo</h1>

      {!connected ? (
        <form onSubmit={handleConnect} style={{ marginBottom: '20px', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Emulator Gateway URI:</label>
            <input
              type="text"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
              placeholder="e.g. localhost:8080"
              required
            />
          </div>
          <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Connect to Emulator
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {/* Emulator Display */}
          <div style={{ background: '#000', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'inline-block' }}>
            <Emulator
              ref={emulatorRef}
              uri={uri}
              width={360}
              height={640}
              gps={gps}
              onStateChange={(state) => console.log('Emulator State:', state)}
              onError={(err) => console.error('Emulator Error:', err)}
            />
          </div>

          {/* Controls Panel */}
          <div style={{ flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Connection Status */}
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h3>Connection Info</h3>
              <p>Connected to: <strong>{uri}</strong></p>
              <button onClick={handleDisconnect} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Disconnect
              </button>
            </div>

            {/* Hardware Keys */}
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h3>Hardware Buttons</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => sendKey('GoHome')} style={btnStyle}>Home</button>
                <button onClick={() => sendKey('GoBack')} style={btnStyle}>Back</button>
                <button onClick={() => sendKey('AppSwitch')} style={btnStyle}>App Switch</button>
                <button onClick={() => sendKey('Power')} style={btnStyle}>Power</button>
                <button onClick={() => sendKey('AudioVolumeUp')} style={btnStyle}>Vol +</button>
                <button onClick={() => sendKey('AudioVolumeDown')} style={btnStyle}>Vol -</button>
              </div>
            </div>

            {/* GPS Controls */}
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h3>Location Control (GPS)</h3>
              <form onSubmit={handleGpsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '2px' }}>Latitude:</label>
                  <input
                    type="text"
                    value={inputGps.lat}
                    onChange={(e) => setInputGps({ ...inputGps, lat: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '2px' }}>Longitude:</label>
                  <input
                    type="text"
                    value={inputGps.lng}
                    onChange={(e) => setInputGps({ ...inputGps, lng: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <button type="submit" style={{ ...btnStyle, background: '#28a745', color: '#fff', width: 'fit-content' }}>
                  Update Location
                </button>
              </form>
              <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
                Current GPS: {gps.latitude}, {gps.longitude}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: '8px 16px',
  background: '#e9ecef',
  color: '#495057',
  border: '1px solid #ced4da',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'background 0.2s',
};

const inputStyle = {
  width: '100%',
  padding: '6px',
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: '1px solid #ccc',
};

export default App;
