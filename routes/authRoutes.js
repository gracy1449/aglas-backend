const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const path = require('path');
const mailer = require('../config/mailer');
const multer = require('multer');
const fs = require('fs');

// Multer storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/profiles/');
    },
    filename: (req, file, cb) => {
        const ext = file.originalname.split('.').pop();
        cb(null, `user_${req.session.user.id}_${Date.now()}.${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
    }
});

// Landing page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/index.html'));
});

// Legacy /landing path — kept for compatibility with redirects
router.get('/landing', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/index.html'));
});

// Login page
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/login.html'));
});

// Register page
router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/register.html'));
});

// Register logic
router.post('/register', (req, res) => {
    const { surname, firstName, email, password, role, idNumber } = req.body;

    if (!surname || !firstName || !email || !password || !role) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const fullName = surname.toUpperCase() + ' ' + firstName;
    const matricNumber = role === 'student' ? (idNumber || null) : null;
    const staffNumber  = role === 'lecturer' ? (idNumber || null) : null;

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length > 0) return res.json({ success: false, message: 'Email already registered.' });

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.json({ success: false, message: 'Error hashing password.' });

            db.query(
                'INSERT INTO users (full_name, first_name, surname, email, password, role, matric_number, staff_number, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
                [fullName, firstName, surname.toUpperCase(), email, hash, role, matricNumber, staffNumber],
                (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to register user.' });
                    mailer.sendAccountCreated(email, fullName, role);
                    res.json({ success: true, message: 'Account created successfully. You can now log in.' });
                }
            );
        });
    });
});

// Login logic
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: 'Email and password are required.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length === 0) {
            return res.json({ success: false, message: 'Invalid email or password.' });
        }

        const user = results[0];

        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, message: 'Invalid email or password.' });
        }

        db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id], () => {});

        req.session.user = {
            id: user.user_id,
            fullName: user.full_name,
            firstName: user.first_name || '',
            surname: user.surname || '',
            email: user.email,
            role: user.role,
            matricNumber: user.matric_number || null,
            staffNumber: user.staff_number || null
        };

        mailer.sendLoginSuccess(email, user.full_name);
        res.json({ success: true, role: user.role });
    });
});

// Get current logged in user
router.get('/me', (req, res) => {
    if (req.session.user) {
        db.query('SELECT last_login, profile_photo FROM users WHERE user_id = ?',
            [req.session.user.id], (err, results) => {
            const lastLogin = results && results[0] ? results[0].last_login : null;
            const profilePhoto = results && results[0] ? results[0].profile_photo : null;
            res.json({
                fullName:     req.session.user.fullName,
                firstName:    req.session.user.firstName || '',
                surname:      req.session.user.surname || '',
                role:         req.session.user.role,
                email:        req.session.user.email,
                matricNumber: req.session.user.matricNumber || null,
                staffNumber:  req.session.user.staffNumber || null,
                lastLogin,
                profilePhoto
            });
        });
    } else {
        res.json({});
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/forgot-password.html'));
});

// Forgot password logic
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email is required.' });

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
        }

        const user = results[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000);

        db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE user_id = ?',
            [token, expiry, user.user_id], (err) => {
            if (err) return res.json({ success: false, message: 'Failed to process request.' });
            const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;
            mailer.sendPasswordReset(email, user.full_name, resetLink);
            res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
        });
    });
});

// Reset password page
router.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/reset-password.html'));
});

// Reset password logic
router.post('/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.json({ success: false, message: 'Invalid request.' });

    db.query('SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
        [token], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: 'Invalid or expired reset link.' });
        }

        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) return res.json({ success: false, message: 'Failed to reset password.' });
            db.query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = ?',
                [hash, results[0].user_id], (err) => {
                if (err) return res.json({ success: false, message: 'Failed to reset password.' });
                res.json({ success: true, message: 'Password reset successfully!' });
            });
        });
    });
});

// Upload profile photo
router.post('/upload-photo', upload.single('photo'), (req, res) => {
    if (!req.session.user) return res.json({ success: false, message: 'Not logged in.' });
    if (!req.file) return res.json({ success: false, message: 'No file uploaded.' });

    const photoPath = '/uploads/profiles/' + req.file.filename;

    db.query('SELECT profile_photo FROM users WHERE user_id = ?',
        [req.session.user.id], (err, results) => {
        if (!err && results[0] && results[0].profile_photo) {
            const oldPath = 'public' + results[0].profile_photo;
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
    });

    db.query('UPDATE users SET profile_photo = ? WHERE user_id = ?',
        [photoPath, req.session.user.id], (err) => {
        if (err) return res.json({ success: false, message: 'Failed to save photo.' });
        req.session.user.profilePhoto = photoPath;
        res.json({ success: true, photoPath });
    });
});

// Remove profile photo
router.post('/remove-photo', (req, res) => {
    if (!req.session.user) return res.json({ success: false });

    db.query('SELECT profile_photo FROM users WHERE user_id = ?',
        [req.session.user.id], (err, results) => {
        if (!err && results[0] && results[0].profile_photo) {
            const oldPath = 'public' + results[0].profile_photo;
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        db.query('UPDATE users SET profile_photo = NULL WHERE user_id = ?',
            [req.session.user.id], (err) => {
            if (err) return res.json({ success: false });
            req.session.user.profilePhoto = null;
            res.json({ success: true });
        });
    });
});

module.exports = router;