import React, { useState, useEffect } from 'react';
import { X, User, LogIn, UserPlus, Save, LogOut, ShieldCheck, Plus, Upload } from 'lucide-react';
import { login, register, logout, getUser, saveAllergies } from './auth.js';

const ALLERGY_PRESETS = [
  'Peanuts', 'Tree Nuts', 'Dairy', 'Eggs', 'Gluten', 'Wheat',
  'Shellfish', 'Fish', 'Soy', 'Sesame', 'Mustard', 'Celery',
  'Sulphites', 'Lupin', 'Molluscs',
];

export default function AuthModal({ onClose, onUserChange }) {
  const [tab, setTab]               = useState('login');
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [selected, setSelected]     = useState([]);
  const [customInput, setCustomInput] = useState('');
  const [error, setError]           = useState('');
  const [user, setUser]             = useState(getUser());
  const [savedMsg, setSavedMsg]     = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) setSelected(u.allergies || []);
  }, []);

  const toggleAllergy = (a) =>
    setSelected(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const addCustomAllergy = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    setSelected(prev => [...prev, trimmed]);
    setCustomInput('');
  };

  const removeAllergy = (a) => setSelected(prev => prev.filter(x => x !== a));

  const handleLogin = () => {
    setError('');
    const res = login(email, password);
    if (!res.ok) { setError(res.error); return; }
    setUser(res.user);
    setSelected(res.user.allergies || []);
    onUserChange(res.user);
  };

  const handleRegister = () => {
    setError('');
    const res = register(name, email, password);
    if (!res.ok) { setError(res.error); return; }
    setUser(res.user);
    setSelected([]);
    onUserChange(res.user);
    setTab('profile');
  };

  const handleSaveAllergies = () => {
    saveAllergies(selected);
    const updated = getUser();
    setUser(updated);
    onUserChange(updated);
    setSavedMsg('Allergy profile saved!');
    setTimeout(() => {
      setSavedMsg('');
      onClose();
    }, 2000);
  };

  const handlePrescriptionUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setSavedMsg('');
    try {
      const form = new FormData();
      form.append('image', file);
      
      const API_BASE = 'http://127.0.0.1:8000/api';
      const res = await fetch(`${API_BASE}/upload-prescription`, {
        method: 'POST',
        body: form
      });
      
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const extracted = data.extracted_allergens || [];
      
      if (extracted.length > 0) {
        setSelected(prev => {
          const newSet = new Set([...prev]);
          extracted.forEach(a => {
            // Check for case-insensitive duplicates
            const exists = Array.from(newSet).some(existing => existing.toLowerCase() === a.toLowerCase());
            if (!exists) newSet.add(a);
          });
          return Array.from(newSet);
        });
        setSavedMsg(`Extracted ${extracted.length} allergens from your document!`);
      } else {
        setSavedMsg('No explicit allergens found in the document.');
      }
    } catch (err) {
      console.error(err);
      setSavedMsg('Failed to process prescription.');
    } finally {
      setIsUploading(false);
      // reset file input
      e.target.value = null;
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setSelected([]);
    onUserChange(null);
    setTab('login');
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-brand">
            <ShieldCheck size={22} />
            <span>AVARIS Profile</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {user ? (
          /* ── Logged-in: Allergy Profile ─────────────── */
          <div className="auth-body">
            <div className="profile-greeting">
              <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
              <div>
                <p className="profile-name">{user.name}</p>
                <p className="profile-email">{user.email}</p>
              </div>
            </div>

            <div className="allergy-section">
              <h4>My Allergy Profile</h4>
              <p className="auth-hint" style={{ marginBottom: '16px' }}>Auto-extract from a medical document or enter manually.</p>

              {/* Smart Extract Button */}
              <label 
                className={`btn-secondary full-width ${isUploading ? 'disabled' : ''}`} 
                style={{ 
                  cursor: isUploading ? 'wait' : 'pointer', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px dashed var(--accent)',
                  backgroundColor: 'rgba(99, 102, 241, 0.05)',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                {isUploading ? <span className="spinner" style={{width: 16, height: 16, borderWidth: 2, borderColor: 'var(--accent)', borderRightColor: 'transparent'}}></span> : <Upload size={16} />}
                <span>{isUploading ? 'Scanning Document via AI...' : 'Smart Extract via Prescription'}</span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePrescriptionUpload} disabled={isUploading} />
              </label>

              {/* Visual Divider */}
              <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', opacity: 0.4 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid currentColor' }} />
                <span style={{ margin: '0 10px', fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px' }}>OR MANUAL ENTRY</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid currentColor' }} />
              </div>

              {/* Custom input */}
              <div className="custom-allergy-row">
                <input
                  className="custom-allergy-input"
                  type="text"
                  placeholder="Type a custom allergen..."
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomAllergy(); }}
                />
                <button className="btn-icon" onClick={addCustomAllergy} title="Add allergen">
                  <Plus size={16} />
                </button>
              </div>

              {/* Preset chips */}
              <div className="allergy-chips">
                {ALLERGY_PRESETS.map(a => (
                  <button
                    key={a}
                    className={`allergy-chip ${selected.includes(a) ? 'selected' : ''}`}
                    onClick={() => toggleAllergy(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>

              {/* Currently selected (with remove) */}
              {selected.length > 0 && (
                <div className="selected-allergies">
                  <p className="auth-hint">Your profile ({selected.length} allergen{selected.length > 1 ? 's' : ''}):</p>
                  <div className="allergy-chips">
                    {selected.map(a => (
                      <span key={a} className="allergy-chip selected removable">
                        {a}
                        <button className="remove-chip" onClick={() => removeAllergy(a)} title={`Remove ${a}`}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {savedMsg && <p className="save-msg"><ShieldCheck size={14} /> {savedMsg}</p>}

            <div className="auth-actions">
              <button className="btn-primary" onClick={handleSaveAllergies}>
                <Save size={16} /> Save & Close
              </button>
              <button className="btn-ghost" onClick={handleLogout}>
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* ── Guest: Login / Register ────────────────── */
          <div className="auth-body">
            <div className="auth-tabs">
              <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
                <LogIn size={15} /> Sign In
              </button>
              <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
                <UserPlus size={15} /> Register
              </button>
            </div>

            {tab === 'register' && (
              <div className="auth-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') tab === 'login' ? handleLogin() : handleRegister();
                }}
              />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <div className="auth-actions">
              {tab === 'login' ? (
                <button className="btn-primary full-width" onClick={handleLogin}>
                  <LogIn size={16} /> Sign In
                </button>
              ) : (
                <button className="btn-primary full-width" onClick={handleRegister}>
                  <UserPlus size={16} /> Create Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
