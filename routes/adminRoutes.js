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
router.post('/settings/profile', (req, res) => {
    const { fullName, email } = req.body;
    if (!fullName || !email) return res.json({ success: false, message: 'Name and email are required.' });
    db.query('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?',
        [fullName, email, req.session.user.id], (err) => {
        if (err) return res.json({ success: false, message: 'Failed to update profile.' });
        req.session.user.fullName = fullName;
        req.session.user.email = email;
        res.json({ success: true });
    });
});

// Update password
router.post('/settings/password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.json({ success: false, message: 'All fields are required.' });

    db.query('SELECT password FROM users WHERE user_id = ?', [req.session.user.id], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'User not found.' });

        bcrypt.compare(currentPassword, results[0].password, (err, match) => {
            if (!match) return res.json({ success: false, message: 'Current password is incorrect.' });

            bcrypt.hash(newPassword, 10, (err, hash) => {
                if (err) return res.json({ success: false, message: 'Failed to update password.' });
                db.query('UPDATE users SET password = ? WHERE user_id = ?', [hash, req.session.user.id], (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to update password.' });
                    res.json({ success: true });
                });
            });
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

// System reports
router.get('/reports', (req, res) => {
    const reports = {};

    // Average score per course
    db.query(`SELECT c.course_code, c.course_title,
        AVG((s.total_score / a.total_marks) * 100) as avg_score,
        COUNT(s.submission_id) as total_submissions
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE s.status = 'graded'
        GROUP BY c.course_id
        ORDER BY avg_score DESC`, (err, courseScores) => {
        reports.courseScores = (courseScores || []).map(c => ({
            ...c,
            avg_score: Math.round(c.avg_score * 10) / 10
        }));

        // Most active students (by submission count)
        db.query(`SELECT u.full_name, u.matric_number, COUNT(s.submission_id) as submission_count,
            AVG((s.total_score / a.total_marks) * 100) as avg_score
            FROM submissions s
            JOIN users u ON s.student_id = u.user_id
            JOIN assessments a ON s.assessment_id = a.assessment_id
            WHERE s.status = 'graded'
            GROUP BY u.user_id
            ORDER BY submission_count DESC
            LIMIT 10`, (err, activeStudents) => {
            reports.activeStudents = (activeStudents || []).map(s => ({
                ...s,
                avg_score: Math.round(s.avg_score * 10) / 10
            }));

            // Assessment type distribution
            db.query(`SELECT type, COUNT(*) as count FROM assessments GROUP BY type`, (err, typeDistribution) => {
                reports.typeDistribution = typeDistribution || [];

                // Pass/Fail rates overall
                db.query(`SELECT
                    SUM(CASE WHEN (s.total_score / a.total_marks) * 100 >= 45 THEN 1 ELSE 0 END) as passed,
                    SUM(CASE WHEN (s.total_score / a.total_marks) * 100 < 45 THEN 1 ELSE 0 END) as failed,
                    COUNT(*) as total
                    FROM submissions s
                    JOIN assessments a ON s.assessment_id = a.assessment_id
                    WHERE s.status = 'graded'`, (err, passFail) => {
                    reports.passFail = passFail && passFail[0] ? passFail[0] : { passed:0, failed:0, total:0 };

                    // Submissions per month (last 6 months)
                    db.query(`SELECT DATE_FORMAT(submitted_at, '%Y-%m') as month, COUNT(*) as count
                        FROM submissions
                        WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                        GROUP BY month
                        ORDER BY month ASC`, (err, monthly) => {
                        reports.monthlySubmissions = monthly || [];

                        // Top performing lecturers (by avg student score on their assessments)
                        db.query(`SELECT u.full_name as lecturer_name,
                            AVG((s.total_score / a.total_marks) * 100) as avg_score,
                            COUNT(DISTINCT a.assessment_id) as assessment_count
                            FROM submissions s
                            JOIN assessments a ON s.assessment_id = a.assessment_id
                            JOIN courses c ON a.course_id = c.course_id
                            JOIN users u ON c.lecturer_id = u.user_id
                            WHERE s.status = 'graded'
                            GROUP BY u.user_id
                            ORDER BY avg_score DESC`, (err, lecturerStats) => {
                            reports.lecturerStats = (lecturerStats || []).map(l => ({
                                ...l,
                                avg_score: Math.round(l.avg_score * 10) / 10
                            }));

                            res.json({ success: true, reports });
                        });
                    });
                });
            });
        });
    });
});

module.exports = router;