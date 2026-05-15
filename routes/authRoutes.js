const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
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

// Landing page alternative route
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
    const { surname, firstName, fullName, email, role, password, idNumber } = req.body;

    if (!email || !role || !password) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.json({ success: false, message: 'Please enter a valid email address.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length > 0) {
            return res.json({ success: false, message: 'Email already registered.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const matricNumber = role === 'student' ? (idNumber || null) : null;
        const staffNumber = role === 'lecturer' ? (idNumber || null) : null;
        const surnameUpper = surname ? surname.toUpperCase() : '';
        const firstNameVal = firstName || '';
        const fullNameVal = fullName || (surnameUpper + ' ' + firstNameVal);

        // Generate activation token
        const crypto = require('crypto');
        const activationToken = crypto.randomBytes(32).toString('hex');

        db.query(
            `INSERT INTO users (full_name, first_name, surname, email, password, role,
            matric_number, staff_number, is_active, activation_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [fullNameVal, firstNameVal, surnameUpper, email, hashedPassword,
            role, matricNumber, staffNumber, activationToken],
            (err, result) => {
                if (err) return res.json({ success: false, message: 'Could not create account.' });

                // Send activation email
                const activationLink = `http://localhost:3000/auth/activate?token=${activationToken}`;
                mailer.sendActivationEmail(email, fullNameVal, activationLink);
                mailer.sendAccountCreated(email, fullNameVal, role);

                res.json({
                    success: true,
                    message: 'Account created! Please check your email to activate your account.'
                });
            }
        );
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
        const isMatch = bcrypt.compareSync(password, user.password);

        if (!isMatch) {
            return res.json({ success: false, message: 'Invalid email or password.' });
        }

        // Check if account is activated
        if (!user.is_active) {
            return res.json({
                success: false,
                message: '⚠️ Account not activated. Please check your email and click the activation link.'
            });
        }

        // Save last login time
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

        // Send login notification email
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

const crypto = require('crypto');

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/auth/forgot-password.html'));
});

// Forgot password logic
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.json({ success: false, message: 'Email is required.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length === 0) {
            return res.json({ success: false, message: 'No account found with this email.' });
        }

        const user = results[0];

        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 hour

        db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE user_id = ?',
            [token, expiry, user.user_id], (err) => {
                if (err) return res.json({ success: false, message: 'Failed to generate reset token.' });

                const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;
                mailer.sendPasswordReset(email, user.full_name, resetLink);

                res.json({ success: true, message: 'Password reset link sent to your email!' });
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

    if (!token || !newPassword) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    db.query('SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
        [token], (err, results) => {
            if (err) return res.json({ success: false, message: 'Database error.' });

            if (results.length === 0) {
                return res.json({ success: false, message: 'Invalid or expired reset link.' });
            }

            const hashed = bcrypt.hashSync(newPassword, 10);

            db.query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = ?',
                [hashed, results[0].user_id], (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to reset password.' });
                    res.json({ success: true, message: 'Password reset successfully!' });
                });
        });
});

// Activate account
router.get('/activate', (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.redirect('/auth/login');
    }

    db.query('SELECT * FROM users WHERE activation_token = ?', [token], (err, results) => {
        if (err || results.length === 0) {
            return res.send(`
                <html>
                <head>
                  <title>AGLAS - Activation Failed</title>
                  <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-50 flex items-center justify-center min-h-screen">
                  <div class="bg-white rounded-2xl p-12 text-center shadow-sm max-w-md">
                    <div class="text-5xl mb-4">❌</div>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h2>
                    <p class="text-gray-500 mb-6">This activation link is invalid or has already been used.</p>
                    <a href="/auth/login" class="bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold">Go to Login</a>
                  </div>
                </body>
                </html>`);
        }

        db.query('UPDATE users SET is_active = 1, activation_token = NULL WHERE user_id = ?',
            [results[0].user_id], (err) => {
                if (err) return res.redirect('/auth/login');

                return res.send(`
                    <html>
                    <head>
                      <title>AGLAS - Account Activated</title>
                      <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="bg-gray-50 flex items-center justify-center min-h-screen">
                      <div class="bg-white rounded-2xl p-12 text-center shadow-sm max-w-md">
                        <div class="text-5xl mb-4">🎉</div>
                        <h2 class="text-2xl font-bold text-gray-900 mb-2">Account Activated!</h2>
                        <p class="text-gray-500 mb-6">Your AGLAS account has been successfully activated. You can now login!</p>
                        <a href="/auth/login" class="bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-800">
                          Login Now →
                        </a>
                      </div>
                    </body>
                    </html>`);
            });
    });
});

// Upload profile photo
router.post('/upload-photo', upload.single('photo'), (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: 'Not logged in.' });
    }
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded.' });
    }

    const photoPath = '/uploads/profiles/' + req.file.filename;

    // Delete old photo if exists
    db.query('SELECT profile_photo FROM users WHERE user_id = ?',
        [req.session.user.id], (err, results) => {
        if (!err && results[0] && results[0].profile_photo) {
            const oldPath = 'public' + results[0].profile_photo;
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
    });

    // Save new photo path
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