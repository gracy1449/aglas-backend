require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');

const app = express();

app.set('trust proxy', 1);

// ── MIDDLEWARE ────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SESSION STORE ─────────────────────────────────────
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autograder_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'aglas_secret_2025',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// ── ROUTES ────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lecturerRoutes = require('./routes/lecturerRoutes');
const studentRoutes = require('./routes/studentRoutes');

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/lecturer', lecturerRoutes);
app.use('/student', studentRoutes);

// ── HOME ROUTE ────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/auth/index.html'));
});

// ── 404 ───────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views/auth/index.html'));
});

// ── START SERVER ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});