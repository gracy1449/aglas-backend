const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const path = require('path');

// Middleware to protect lecturer routes
function isLecturer(req, res, next) {
    if (req.session.user && req.session.user.role === 'lecturer') {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

// Lecturer dashboard page
router.get('/dashboard', isLecturer, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/lecturer/dashboard.html'));
});

// Get lecturer stats
router.get('/stats', isLecturer, (req, res) => {
    const lecturerId = req.session.user.id;
    const stats = {};

    db.query('SELECT COUNT(*) as total FROM courses WHERE lecturer_id = ?', [lecturerId], (err, result) => {
        stats.totalCourses = result[0].total;

        db.query(`SELECT COUNT(*) as total FROM assessments a
            JOIN courses c ON a.course_id = c.course_id
            WHERE c.lecturer_id = ?`, [lecturerId], (err, result) => {
            stats.totalAssessments = result[0].total;

            db.query(`SELECT COUNT(*) as total FROM submissions s
                JOIN assessments a ON s.assessment_id = a.assessment_id
                JOIN courses c ON a.course_id = c.course_id
                WHERE c.lecturer_id = ?`, [lecturerId], (err, result) => {
                stats.totalSubmissions = result[0].total;

                db.query(`SELECT COUNT(*) as total FROM submissions s
                    JOIN assessments a ON s.assessment_id = a.assessment_id
                    JOIN courses c ON a.course_id = c.course_id
                    WHERE c.lecturer_id = ? AND s.status = 'graded'`, [lecturerId], (err, result) => {
                    stats.totalGraded = result[0].total;

                    db.query('SELECT course_id, course_code, course_title FROM courses WHERE lecturer_id = ?', [lecturerId], (err, result) => {
                        stats.courses = result;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// Get lecturer courses
router.get('/courses', isLecturer, (req, res) => {
    db.query('SELECT course_id, course_code, course_title FROM courses WHERE lecturer_id = ?',
        [req.session.user.id], (err, results) => {
            if (err) return res.json({ success: false });
            res.json({ courses: results });
        });
});

// Get lecturer assessments
router.get('/assessments', isLecturer, (req, res) => {
    db.query(`SELECT a.assessment_id, a.title, a.type, a.is_published, a.duration_minutes,
        c.course_code FROM assessments a
        JOIN courses c ON a.course_id = c.course_id
        WHERE c.lecturer_id = ?
        ORDER BY a.created_at DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ assessments: results });
    });
});

// Create assessment
router.post('/assessments/create', isLecturer, (req, res) => {
    const { title, type, courseId, duration, publish, questions } = req.body;

    if (!title || !type || !courseId) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    db.query(
        'INSERT INTO assessments (course_id, title, type, duration_minutes, is_published) VALUES (?, ?, ?, ?, ?)',
        [courseId, title, type, duration || 30, publish ? 1 : 0],
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Failed to create assessment.' });

            const assessmentId = result.insertId;

            if (!questions || questions.length === 0) {
                if (publish) {
                    db.query(`SELECT u.email, u.full_name FROM users u
                        JOIN enrollments e ON u.user_id = e.student_id
                        WHERE e.course_id = ?`, [courseId], (err, students) => {
                        if (!err && students.length > 0) {
                            const mailer = require('../config/mailer');
                            db.query('SELECT course_code FROM courses WHERE course_id = ?',
                                [courseId], (err, courses) => {
                                const courseCode = courses && courses[0] ? courses[0].course_code : '';
                                students.forEach(s => {
                                    mailer.sendAssessmentPublished(
                                        s.email, s.full_name,
                                        title, courseCode, duration || 30
                                    );
                                });
                            });
                        }
                    });
                }
                return res.json({ success: true });
            }

            // Insert questions one by one
            let inserted = 0;
            questions.forEach((q) => {
                db.query(
                    'INSERT INTO questions (assessment_id, question_text, question_type, marks) VALUES (?, ?, ?, ?)',
                    [assessmentId, q.question_text, q.question_type, q.marks || 1],
                    (err, qResult) => {
                        if (err) return;
                        const questionId = qResult.insertId;

                        // Insert answer key
                        if (type === 'objective') {
                            // Insert options
                            const opts = q.options;
                            ['A', 'B', 'C', 'D'].forEach(label => {
                                if (opts[label]) {
                                    db.query(
                                        'INSERT INTO mcq_options (question_id, option_label, option_text) VALUES (?, ?, ?)',
                                        [questionId, label, opts[label]], () => {}
                                    );
                                }
                            });
                            // Insert correct answer
                            db.query(
                                'INSERT INTO answer_keys (question_id, correct_answer) VALUES (?, ?)',
                                [questionId, q.correct_answer], () => {}
                            );
                        } else if (type === 'theory') {
                            db.query(
                                'INSERT INTO answer_keys (question_id, correct_answer, keywords) VALUES (?, ?, ?)',
                                [questionId, q.keywords, q.keywords], () => {}
                            );
                        } else if (type === 'programming') {
                            db.query(
                                'INSERT INTO answer_keys (question_id, correct_answer) VALUES (?, ?)',
                                [questionId, q.test_case], () => {}
                            );
                        }

                       inserted++;
                        if (inserted === questions.length) {
                            if (publish) {
                                db.query(`SELECT u.email, u.full_name FROM users u
                                    JOIN enrollments e ON u.user_id = e.student_id
                                    WHERE e.course_id = ?`, [courseId], (err, students) => {
                                    if (!err && students.length > 0) {
                                        const mailer = require('../config/mailer');
                                        db.query('SELECT course_code FROM courses WHERE course_id = ?',
                                            [courseId], (err, courses) => {
                                            const courseCode = courses && courses[0] ? courses[0].course_code : '';
                                            students.forEach(s => {
                                                mailer.sendAssessmentPublished(
                                                    s.email, s.full_name,
                                                    title, courseCode, duration || 30
                                                );
                                            });
                                        });
                                    }
                                });
                            }
                            res.json({ success: true });
                        } 
                    }
                );
            });
        }
    );
});

// Get submissions
router.get('/submissions', isLecturer, (req, res) => {
    db.query(`SELECT s.submission_id, s.total_score, s.status, s.submitted_at,
        u.full_name as student_name, a.title as assessment_title, a.total_marks
        FROM submissions s
        JOIN users u ON s.student_id = u.user_id
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE c.lecturer_id = ?
        ORDER BY s.submitted_at DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ submissions: results });
    });
});

// Update profile
router.post('/settings/profile', isLecturer, (req, res) => {
    const { fullName, email } = req.body;
    db.query('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?',
        [fullName, email, req.session.user.id], (err) => {
            if (err) return res.json({ success: false, message: 'Email already in use.' });
            req.session.user.fullName = fullName;
            req.session.user.email = email;
            res.json({ success: true });
        });
});

// Update password
router.post('/settings/password', isLecturer, (req, res) => {
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

// Get results
router.get('/results', isLecturer, (req, res) => {
    db.query(`SELECT s.total_score, s.submitted_at, a.total_marks,
        a.title as assessment_title, u.full_name as student_name, c.course_code
        FROM submissions s
        JOIN users u ON s.student_id = u.user_id
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE c.lecturer_id = ? AND s.status = 'graded'
        ORDER BY s.submitted_at DESC`,
        [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ results });
    });
});

// Get students offering my courses
router.get('/students', isLecturer, (req, res) => {
    db.query(`SELECT DISTINCT u.user_id, u.full_name, u.email,
        u.matric_number, c.course_code, c.course_title, e.enrolled_at
        FROM enrollments e
        JOIN users u ON e.student_id = u.user_id
        JOIN courses c ON e.course_id = c.course_id
        WHERE c.lecturer_id = ?
        ORDER BY c.course_code, u.full_name`,
        [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ students: results });
    });
});

// Get per-question analytics
router.get('/assessments/:id/analytics', isLecturer, (req, res) => {
    const assessmentId = req.params.id;

    db.query(`SELECT a.title, a.total_marks, a.type,
        COUNT(DISTINCT s.student_id) as total_submissions
        FROM assessments a
        LEFT JOIN submissions s ON a.assessment_id = s.assessment_id
        WHERE a.assessment_id = ?`, [assessmentId], (err, assessInfo) => {
        if (err || assessInfo.length === 0) return res.json({ success: false });

        db.query(`SELECT q.question_id, q.question_text, q.marks, q.question_type,
            COUNT(sa.student_answer_id) as total_answers,
            SUM(CASE WHEN sa.score_awarded = q.marks THEN 1 ELSE 0 END) as correct_count,
            SUM(CASE WHEN sa.score_awarded = 0 THEN 1 ELSE 0 END) as wrong_count,
            AVG(sa.score_awarded) as avg_score
            FROM questions q
            LEFT JOIN student_answers sa ON q.question_id = sa.question_id
            WHERE q.assessment_id = ?
            GROUP BY q.question_id`, [assessmentId], (err, questions) => {
            if (err) return res.json({ success: false });

            res.json({
                success: true,
                assessment: assessInfo[0],
                questions: questions || []
            });
        });
    });
});

module.exports = router;