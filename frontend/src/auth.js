// auth.js — Frontend-only authentication & allergy profile (no backend required)
// All data is stored in localStorage.

const USERS_KEY = 'avaris_users';
const SESSION_KEY = 'avaris_session';

function _getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

function _saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function _getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function _saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

// Register a new user. Returns { ok, error }
export function register(name, email, password) {
  const users = _getUsers();
  const key = email.toLowerCase().trim();
  if (!name || !email || !password) return { ok: false, error: 'All fields are required.' };
  if (users[key]) return { ok: false, error: 'An account with this email already exists.' };
  const user = { name, email: key, password, allergies: [] };
  users[key] = user;
  _saveUsers(users);
  _saveSession(user);
  return { ok: true, user };
}

// Login. Returns { ok, error }
export function login(email, password) {
  const users = _getUsers();
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user) return { ok: false, error: 'No account found with this email.' };
  if (user.password !== password) return { ok: false, error: 'Incorrect password.' };
  _saveSession(user);
  return { ok: true, user };
}

// Logout — clears session
export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

// Get current logged-in user or null
export function getUser() {
  return _getSession();
}

// Save user's allergy profile and persist
export function saveAllergies(allergies) {
  const session = _getSession();
  if (!session) return;
  const users = _getUsers();
  const key = session.email;
  if (users[key]) {
    users[key].allergies = allergies;
    _saveUsers(users);
    _saveSession({ ...users[key] });
  }
}

// Get current user's allergies
export function getAllergies() {
  const user = _getSession();
  return user?.allergies || [];
}
