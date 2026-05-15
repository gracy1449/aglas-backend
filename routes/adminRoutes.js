const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const path = require('path');

// Middleware to protect admin routes
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

// Admin dashboard page
router.get('/dashboard', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
});

// Get stats
router.get('/stats', isAdmin, (req, res) => {
    const stats = {};

    db.query('SELECT COUNT(*) as total FROM users', (err, result) => {
        stats.totalUsers = result[0].total;

        db.query('SELECT COUNT(*) as total FROM users WHERE role = "lecturer"', (err, result) => {
            stats.totalLecturers = result[0].total;

            db.query('SELECT COUNT(*) as total FROM users WHERE role = "student"', (err, result) => {
                stats.totalStudents = result[0].total;

                db.query('SELECT COUNT(*) as total FROM courses', (err, result) => {
                    stats.totalCourses = result[0].total;

                    db.query('SELECT user_id, full_name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5', (err, result) => {
                        stats.recentUsers = result;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// Get all users
router.get('/users', isAdmin, (req, res) => {
    db.query('SELECT user_id, full_name, email, role, created_at FROM users ORDER BY created_at DESC', (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        res.json({ users: results });
    });
});

// Add user
router.post('/users/add', isAdmin, (req, res) => {
    const { fullName, email, role, password } = req.body;

    if (!fullName || !email || !role || !password) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (results.length > 0) {
            return res.json({ success: false, message: 'Email already exists.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        db.query(
            'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
            [fullName, email, hashedPassword, role],
            (err, result) => {
                if (err) return res.json({ success: false, message: 'Failed to add user.' });
                res.json({ success: true });
            }
        );
    });
});

// Delete user
router.delete('/users/delete/:id', isAdmin, (req, res) => {
    const userId = req.params.id;
    
    // First delete related records
    db.query('DELETE FROM student_answers WHERE submission_id IN (SELECT submission_id FROM submissions WHERE student_id = ?)', [userId], () => {
        db.query('DELETE FROM submissions WHERE student_id = ?', [userId], () => {
            db.query('DELETE FROM enrollments WHERE student_id = ?', [userId], () => {
                db.query('DELETE FROM users WHERE user_id = ?', [userId], (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to delete user.' });
                    res.json({ success: true });
                });
            });
        });
    });
});

// Get all lecturers (for course assignment dropdown)
router.get('/lecturers', isAdmin, (req, res) => {
    db.query('SELECT user_id, full_name FROM users WHERE role = "lecturer"', (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ lecturers: results });
    });
});

// Get all courses
router.get('/courses', isAdmin, (req, res) => {
    db.query(`
        SELECT c.course_id, c.course_code, c.course_title, u.full_name as lecturer_name
        FROM courses c
        LEFT JOIN users u ON c.lecturer_id = u.user_id
        ORDER BY c.created_at DESC
    `, (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ courses: results });
    });
});

// Add course
router.post('/courses/add', isAdmin, (req, res) => {
    const { courseCode, courseTitle, lecturerId } = req.body;

    if (!courseCode || !courseTitle) {
        return res.json({ success: false, message: 'Code and title are required.' });
    }

    db.query(
        'INSERT INTO courses (course_code, course_title, lecturer_id) VALUES (?, ?, ?)',
        [courseCode, courseTitle, lecturerId || null],
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Course code already exists.' });
            res.json({ success: true });
        }
    );
});

// Delete course
router.delete('/courses/delete/:id', isAdmin, (req, res) => {
    const courseId = req.params.id;

    // Delete related records first
    db.query('DELETE FROM enrollments WHERE course_id = ?', [courseId], () => {
        db.query(`DELETE FROM student_answers WHERE submission_id IN 
            (SELECT submission_id FROM submissions WHERE assessment_id IN 
            (SELECT assessment_id FROM assessments WHERE course_id = ?))`, [courseId], () => {
            db.query(`DELETE FROM submissions WHERE assessment_id IN 
                (SELECT assessment_id FROM assessments WHERE course_id = ?)`, [courseId], () => {
                db.query(`DELETE FROM mcq_options WHERE question_id IN 
                    (SELECT question_id FROM questions WHERE assessment_id IN 
                    (SELECT assessment_id FROM assessments WHERE course_id = ?))`, [courseId], () => {
                    db.query(`DELETE FROM answer_keys WHERE question_id IN 
                        (SELECT question_id FROM questions WHERE assessment_id IN 
                        (SELECT assessment_id FROM assessments WHERE course_id = ?))`, [courseId], () => {
                        db.query(`DELETE FROM questions WHERE assessment_id IN 
                            (SELECT assessment_id FROM assessments WHERE course_id = ?)`, [courseId], () => {
                            db.query('DELETE FROM assessments WHERE course_id = ?', [courseId], () => {
                                db.query('DELETE FROM courses WHERE course_id = ?', [courseId], (err) => {
                                    if (err) return res.json({ success: false, message: 'Failed to delete course.' });
                                    res.json({ success: true });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Get all assessments
router.get('/assessments', isAdmin, (req, res) => {
    db.query(`
        SELECT a.assessment_id, a.title, a.type, a.is_published, c.course_code
        FROM assessments a
        LEFT JOIN courses c ON a.course_id = c.course_id
        ORDER BY a.created_at DESC
    `, (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ assessments: results });
    });
});

// Update profile
router.post('/settings/profile', isAdmin, (req, res) => {
    const { fullName, email } = req.body;
    db.query('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?',
        [fullName, email, req.session.user.id], (err) => {
            if (err) return res.json({ success: false, message: 'Email already in use.' });
            req.session.user.fullName = fullName;
            res.json({ success: true });
        });
});

// Update password
router.post('/settings/password', isAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    db.query('SELECT * FROM users WHERE user_id = ?', [req.session.user.id], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'User not found.' });
        const isMatch = bcrypt.compareSync(currentPassword, results[0].password);
        if (!isMatch) return res.json({ success: false, message: 'Current password is incorrect.' });
        const hashed = bcrypt.hashSync(newPassword, 10);
        db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashed, req.session.user.id], (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        });
    });
});

// Clear all submissions
router.delete('/settings/clear-submissions', isAdmin, (req, res) => {
    db.query('DELETE FROM student_answers', (err) => {
        if (err) return res.json({ success: false });
        db.query('DELETE FROM submissions', (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        });
    });
});

// Get all enrollments
router.get('/enrollments', isAdmin, (req, res) => {
    db.query(`SELECT e.enrollment_id, e.enrolled_at,
        u.full_name as student_name,
        c.course_code, c.course_title
        FROM enrollments e
        JOIN users u ON e.student_id = u.user_id
        JOIN courses c ON e.course_id = c.course_id
        ORDER BY e.enrolled_at DESC`,
        (err, results) => {
            if (err) return res.json({ success: false });
            res.json({ enrollments: results });
        });
});

// Add enrollment
router.post('/enrollments/add', isAdmin, (req, res) => {
    const { studentId, courseId } = req.body;
    db.query(`SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?`,
        [studentId, courseId], (err, existing) => {
            if (existing && existing.length > 0) {
                return res.json({ success: false, message: 'Student already enrolled in this course.' });
            }
            db.query(`INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)`,
                [studentId, courseId], (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to enroll.' });
                    res.json({ success: true });
                });
        });
});

// Remove enrollment
router.delete('/enrollments/remove/:id', isAdmin, (req, res) => {
    db.query('DELETE FROM enrollments WHERE enrollment_id = ?',
        [req.params.id], (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        });
});

module.exports = router;