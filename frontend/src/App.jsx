import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Thermometer,
  Droplets,
  Wind,
  Camera,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  X,
  Upload,
  RefreshCw,
  Search,
  AlertTriangle,
  Cpu,
  User,
  FolderOpen,
} from 'lucide-react';
import './App.css';
import AuthModal from './AuthModal.jsx';
import { getUser, getAllergies } from './auth.js';

const API_BASE = 'http://localhost:8000/api';
const ESP32_CAM_IP = '192.168.1.40';

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

// ─── Root App ──────────────────────────────────────────────────────────────

function App() {
  const [sensorData, setSensorData]     = useState({ temperature: 0, humidity: 0, dust: 0 });
  const [riskData, setRiskData]         = useState({ risk_level: 'LOADING', confidence: 0 });
  const [forecast, setForecast]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [showCamera, setShowCamera]     = useState(false);
  const [foodResult, setFoodResult]     = useState(null);
  const [systemOnline, setSystemOnline] = useState(false);
  const [showAuth, setShowAuth]         = useState(false);
  const [currentUser, setCurrentUser]   = useState(getUser());
  const [userAllergies, setUserAllergies] = useState(getAllergies());
  const [heroFile, setHeroFile]         = useState(null);
  const heroFileRef = useRef(null);

  const fetchData = async () => {
    try {
      const [sRes, rRes, fRes] = await Promise.allSettled([
        fetch(`${API_BASE}/latest-sensor-data`),
        fetch(`${API_BASE}/risk-prediction`),
        fetch(`${API_BASE}/forecast`),
      ]);

      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        setSensorData(await sRes.value.json());
        setSystemOnline(true);
      } else {
        setSystemOnline(false);
      }

      if (rRes.status === 'fulfilled' && rRes.value.ok) {
        setRiskData(await rRes.value.json());
      }

      if (fRes.status === 'fulfilled' && fRes.value.ok) {
        const data = await fRes.value.json();
        if (!data.error) setForecast(data);
      }
    } catch {
      setSystemOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, []);

  const handleUserChange = (user) => {
    setCurrentUser(user);
    setUserAllergies(user?.allergies || []);
  };

  const handleHeroFile = (e) => {
    const f = e.target.files[0];
    if (f) setHeroFile(f);
  };

  if (loading) {
    return (
      <div className="app-loader">
        <div className="spinner" />
        <h2>Initializing AVARIS Core</h2>
        <p>Establishing connection to environmental sensors...</p>
      </div>
    );
  }

  return (
    <div className="app-container fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="header">
        <div className="brand">
          <h1>AVARIS</h1>
          <p>Advanced Environmental Intelligence</p>
        </div>
        <div className="header-right">
          <div className="system-status">
            <div className={`status-badge ${systemOnline ? 'online' : ''}`}>
              {systemOnline ? 'System Online' : 'System Offline'}
            </div>
            <small>{systemOnline ? 'Real-time sync active' : 'Waiting for hardware...'}</small>
          </div>
          <button
            className={`profile-btn ${currentUser ? 'logged-in' : ''}`}
            onClick={() => setShowAuth(true)}
            title={currentUser ? currentUser.name : 'Sign In / Register'}
          >
            {currentUser
              ? <span className="avatar-sm">{currentUser.name.charAt(0).toUpperCase()}</span>
              : <User size={18} />}
          </button>
        </div>
      </header>

      {/* ── Hero Button ────────────────────────────────── */}
      <div className="hero-actions">
        <button className="btn-primary hero-btn" onClick={() => setShowCamera(true)}>
          <Camera size={18} /> Launch AVARIS Vision
        </button>
        <input type="file" accept="image/*" id="hero-file-input" ref={heroFileRef} onChange={handleHeroFile} style={{ display: 'none' }} />
        <label htmlFor="hero-file-input" className="btn-secondary hero-btn" title="Upload product image for analysis">
          <FolderOpen size={18} /> Upload Image
        </label>
      </div>

      {/* ── Dashboard Grid ─────────────────────────────── */}
      <main className="dashboard-grid">
        {/* Sensor Cards */}
        <div className="sensors-container">
          <SensorCard title="Temperature" value={sensorData.temperature} unit="°C"
            icon={<Thermometer size={20} />}
            trend={forecast ? (forecast.predicted_temperature > sensorData.temperature ? 'up' : 'down') : null}
          />
          <SensorCard title="Humidity" value={sensorData.humidity} unit="%"
            icon={<Droplets size={20} />}
            trend={forecast ? (forecast.predicted_humidity > sensorData.humidity ? 'up' : 'down') : null}
          />
          <SensorCard title="Air Quality" value={sensorData.dust} unit="µg/m³"
            icon={<Wind size={20} />}
            trend={forecast ? (forecast.predicted_dust > sensorData.dust ? 'up' : 'down') : null}
          />
        </div>

        {/* Risk Card */}
        <div className="card risk-container">
          <div className="card-title">
            <span>Safety Index</span>
            <ShieldAlert size={15} className="icon-sm" />
          </div>
          <div className="risk-level-display">
            <div className={`risk-badge risk-${riskData.risk_level}`}>{riskData.risk_level}</div>
            <div className="confidence-level">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(riskData.confidence * 100).toFixed(0)}%` }} />
              </div>
              <p>Confidence: {(riskData.confidence * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>

        {/* Forecast */}
        <div className="card forecast-container">
          <div className="card-title">
            <span>Predictive Intelligence — T+30 min</span>
            <Activity size={15} className="icon-sm" />
          </div>
          {forecast ? (
            <div className="forecast-layout">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Predicted</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Temperature</td>
                    <td>{sensorData.temperature.toFixed(1)}°C</td>
                    <td className="prediction-highlight">{forecast.predicted_temperature.toFixed(1)}°C</td>
                    <td><TrendIcon rising={forecast.predicted_temperature > sensorData.temperature} /></td>
                  </tr>
                  <tr>
                    <td>Humidity</td>
                    <td>{sensorData.humidity.toFixed(1)}%</td>
                    <td className="prediction-highlight">{forecast.predicted_humidity.toFixed(1)}%</td>
                    <td><TrendIcon rising={forecast.predicted_humidity > sensorData.humidity} /></td>
                  </tr>
                  <tr>
                    <td>Particulate Matter</td>
                    <td>{sensorData.dust.toFixed(1)} µg/m³</td>
                    <td className="prediction-highlight">{forecast.predicted_dust.toFixed(1)} µg/m³</td>
                    <td><TrendIcon rising={forecast.predicted_dust > sensorData.dust} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">Collecting baseline data for forecasting...</p>
          )}
        </div>
      </main>

      {/* ── Extended Panels ────────────────────────────── */}
      <EnvironmentAnalysisPanel />
      <FoodAnalysisPanel
        cameraResult={foodResult}
        onResultUpdate={setFoodResult}
        userAllergies={userAllergies}
        heroFile={heroFile}
        clearHeroFile={() => setHeroFile(null)}
      />

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="footer">
        <p>&copy; 2026 AVARIS Environmental Intelligence</p>
        <div className="footer-links">
          <span>Documentation</span>
          <span>Security</span>
          <span>Privacy</span>
        </div>
      </footer>

      {/* ── Floating Modals ────────────────────────────── */}
      {showCamera && (
        <CameraPanel
          onClose={() => setShowCamera(false)}
          onCapture={(data) => { setFoodResult(data); setShowCamera(false); }}
        />
      )}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onUserChange={handleUserChange}
        />
      )}
    </div>
  );
}

// ─── Trend Icon ────────────────────────────────────────────────────────────

function TrendIcon({ rising }) {
  return rising
    ? <TrendingUp size={16} className="trend-rising" />
    : <TrendingDown size={16} className="trend-falling" />;
}

// ─── Sensor Card ───────────────────────────────────────────────────────────

function SensorCard({ title, value, unit, icon, trend }) {
  return (
    <div className="card sensor-card">
      <div className="sensor-header">
        <div className="sensor-icon">{icon}</div>
        {trend && (
          <div className={`sensor-trend-icon trend-${trend}`}>
            {trend === 'up' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </div>
        )}
      </div>
      <div className="sensor-body">
        <div className="card-label">{title}</div>
        <div className="sensor-value">
          {value.toFixed(1)}<span className="sensor-unit">{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Environment Analysis Panel ────────────────────────────────────────────

function EnvironmentAnalysisPanel() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/analyze-environment`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setAnalysis(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card analysis-panel">
      <div className="card-title">
        <span>AI Environment Analysis</span>
        <Search size={15} className="icon-sm" />
      </div>
      <div className="analysis-intro">
        <p className="muted-text" style={{ padding: 0 }}>Deep AI insights powered by live sensor data.</p>
        <button className="btn-primary" onClick={handleAnalyze} disabled={loading}>
          {loading ? <><RefreshCw size={15} className="spin-icon" /> Processing...</> : <><Search size={15} /> Generate Report</>}
        </button>
      </div>

      {error && <div className="error-box"><AlertTriangle size={15} /> {error}</div>}

      {analysis && (
        <div className="ai-reasoning-grid fade-in">
          <div className="readings-summary">
            <h5>Snapshot</h5>
            <div className="summary-item"><strong>Temp</strong><span>{analysis.sensor_data.temperature.toFixed(1)}°C</span></div>
            <div className="summary-item"><strong>Humidity</strong><span>{analysis.sensor_data.humidity.toFixed(1)}%</span></div>
            <div className="summary-item"><strong>Dust</strong><span>{analysis.sensor_data.dust.toFixed(1)} µg/m³</span></div>
            <div className="summary-item"><strong>Risk</strong><span className={`risk-text risk-${analysis.risk_level}`}>{analysis.risk_level}</span></div>
          </div>
          <div className="ai-output-box">
            <h4><Cpu size={16} /> AI Insights</h4>
            <div dangerouslySetInnerHTML={{ __html: formatMarkdown(analysis.analysis) }} />
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Food Analysis Panel ───────────────────────────────────────────────────

function FoodAnalysisPanel({ cameraResult, onResultUpdate, userAllergies, heroFile, clearHeroFile }) {
  const [file, setFile]       = useState(null);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // When heroFile is passed from the hero upload button, auto-populate local file state
  useEffect(() => {
    if (heroFile) { setFile(heroFile); clearHeroFile?.(); }
  }, [heroFile]);

  useEffect(() => {
    if (cameraResult) { setResult(cameraResult); return; }
    fetch(`${API_BASE}/latest-food-analysis`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { setResult(data); onResultUpdate(data); } })
      .catch(() => {});
  }, [cameraResult]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch(`${API_BASE}/upload-food-image`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data); onResultUpdate(data); setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Merge detected allergens with user's personal allergens
  const personalHits = result
    ? (result.detected_allergens || []).filter(a =>
        userAllergies.some(ua => ua.toLowerCase() === a.toLowerCase())
      )
    : [];

  return (
    <section className="card food-analysis-panel">
      <div className="card-title">
        <span>Smart Allergen Detection</span>
        <ShieldAlert size={15} className="icon-sm" />
      </div>

      <div className="food-actions">
        <div className="upload-container">
          <input type="file" accept="image/*" id="food-input" onChange={e => setFile(e.target.files[0])} />
          <label htmlFor="food-input" className="upload-label">
            <Upload size={16} /> {file ? file.name : 'Select a product image'}
          </label>
          <button className="btn-primary" onClick={handleUpload} disabled={loading || !file}>
            {loading ? <><RefreshCw size={15} className="spin-icon" /> Analyzing...</> : <><Search size={15} /> Analyze</>}
          </button>
        </div>
        {error && <p className="error-text"><AlertTriangle size={13} /> {error}</p>}
      </div>

      {result && (
        <div className="food-result-card fade-in">
          <div className="preview-image">
            <img src={`http://localhost:8000${result.image_url || '/' + result.image_path}`} alt="Product" />
          </div>
          <div className="details">
            <h3>{result.food_item}</h3>

            {personalHits.length > 0 && (
              <div className="personal-alert">
                <AlertTriangle size={15} />
                <strong>Personal Allergen Alert:</strong> This product contains {personalHits.join(', ')} — which match your allergy profile.
              </div>
            )}

            <h5>Ingredients</h5>
            <div className="tags">
              {(result.ingredients || []).map((ing, i) => <span key={i} className="tag">{ing}</span>)}
            </div>

            {result.detected_allergens?.length > 0 && (
              <>
                <h5><AlertTriangle size={13} /> Allergens Detected</h5>
                <div className="tags">
                  {result.detected_allergens.map((alg, i) => (
                    <span key={i} className={`tag allergen-tag ${personalHits.includes(alg) ? 'personal-allergen' : ''}`}>
                      {alg}
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="ai-report">
              <h5>Safety Guidance</h5>
              <div dangerouslySetInnerHTML={{ __html: formatMarkdown(result.ai_explanation) }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Camera Panel ──────────────────────────────────────────────────────────

function CameraPanel({ onClose, onCapture }) {
  const [status, setStatus] = useState('connecting');
  const [stage, setStage]   = useState('');
  const [error, setError]   = useState(null);
  const imgRef = useRef(null);

  const startCapture = async () => {
    setStatus('processing');
    setStage('Capturing frame...');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/capture-and-analyze`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({cam_ip: ESP32_CAM_IP}) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStage('Analysis complete');
      setTimeout(() => onCapture(data), 800);
    } catch (err) {
      setError(err.message);
      setStatus('live');
    }
  };

  return (
    <div className="camera-panel-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="camera-panel">
        <div className="camera-header">
          <h3>AVARIS Vision</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="camera-stream-container">
          <img
            ref={imgRef}
            src={`http://${ESP32_CAM_IP}/stream`}
            className={`live-feed${status === 'processing' ? ' processing' : ''}`}
            onLoad={() => { if (status === 'connecting') setStatus('live'); }}
            onError={() => setError('Cannot reach ESP32-CAM at ' + ESP32_CAM_IP)}
            alt="ESP32-CAM live stream"
          />

          <div className="capture-controls">
            {status === 'processing' ? (
              <div className="instruction-badge">
                <RefreshCw size={13} className="spin-icon" /> {stage}
              </div>
            ) : (
              <>
                <button
                  className="capture-btn"
                  onClick={startCapture}
                  disabled={status !== 'live'}
                  aria-label="Capture image for allergen analysis"
                >
                  <div className="inner-circle"><Camera size={28} /></div>
                </button>
                <div className="instruction-badge">
                  {status === 'connecting' ? 'Connecting to camera...' : 'Tap to capture'}
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="stream-error">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;