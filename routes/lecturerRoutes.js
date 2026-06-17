const express = require('express');
const router = express.Router();
const db = require('../config/db');
const path = require('path');
const { sendAssessmentPublished } = require('../config/mailer');
const { uploadMaterial, cloudinary } = require('../config/cloudinary');

function isLecturer(req, res, next) {
    if (req.session.user && req.session.user.role === 'lecturer') return next();
    res.status(403).json({ success: false, message: 'Access denied.' });
}

router.get('/dashboard', isLecturer, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/lecturer/dashboard.html'));
});

function calculateSimilarity(textA, textB) {
    if (!textA || !textB) return 0;
    const wordsA = new Set(textA.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
    const wordsB = new Set(textB.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w=>w.length>2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    wordsA.forEach(w => { if (wordsB.has(w)) intersection++; });
    const union = wordsA.size + wordsB.size - intersection;
    return Math.round((intersection / union) * 100);
}
// ── SIMILARITY HELPER ────────────────────────────────────

// ── DASHBOARD STATS ───────────────────────────────────────
router.get('/stats', isLecturer, (req, res) => {
    const lecturerId = req.session.user.id;
    const stats = {};
    db.query('SELECT course_id, course_code, course_title FROM courses WHERE lecturer_id = ?', [lecturerId], (err, courses) => {
        stats.totalCourses = courses ? courses.length : 0;
        stats.courses = courses || [];
        const courseIds = (courses || []).map(c => c.course_id);
        if (courseIds.length === 0) {
            stats.totalAssessments = 0; stats.totalSubmissions = 0; stats.totalGraded = 0;
            return res.json(stats);
        }
        db.query('SELECT COUNT(*) as total FROM assessments WHERE course_id IN (?)', [courseIds], (err, r1) => {
            stats.totalAssessments = r1 ? r1[0].total : 0;
            db.query(`SELECT COUNT(*) as total FROM submissions s
                JOIN assessments a ON s.assessment_id = a.assessment_id
                WHERE a.course_id IN (?)`, [courseIds], (err, r2) => {
                stats.totalSubmissions = r2 ? r2[0].total : 0;
                db.query(`SELECT COUNT(*) as total FROM submissions s
                    JOIN assessments a ON s.assessment_id = a.assessment_id
                    WHERE a.course_id IN (?) AND s.status = 'graded'`, [courseIds], (err, r3) => {
                    stats.totalGraded = r3 ? r3[0].total : 0;
                    res.json(stats);
                });
            });
        });
    });
});

// ── COURSES ───────────────────────────────────────────────
router.get('/courses', isLecturer, (req, res) => {
    db.query('SELECT * FROM courses WHERE lecturer_id = ?', [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, courses: [] });
        res.json({ success: true, courses: results || [] });
    });
});

// ── CREATE ASSESSMENT ─────────────────────────────────────
router.post('/assessments/create', isLecturer, (req, res) => {
    const { title, type, courseId, duration, totalMarks, publish, questions, mode, dueDate } = req.body;
    if (!title || !courseId || !type) return res.json({ success: false, message: 'Missing required fields.' });

    const isTimed = mode === 'assignment' ? 0 : 1;
    const durationVal = mode === 'assignment' ? 0 : (duration || 30);
    const dueDateVal = mode === 'assignment' ? dueDate : null;

    db.query(
        'INSERT INTO assessments (course_id, title, type, duration_minutes, total_marks, is_published, is_timed, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [courseId, title, type, durationVal, totalMarks || 100, publish ? 1 : 0, isTimed, dueDateVal],
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Failed to create assessment.' });
            const assessmentId = result.insertId;
            if (!questions || questions.length === 0) return finalize();

            let completed = 0;
            questions.forEach(q => {
                db.query('INSERT INTO questions (assessment_id, question_text, question_type, marks) VALUES (?, ?, ?, ?)',
                    [assessmentId, q.question_text, q.question_type, q.marks], (err, qResult) => {
                    const questionId = qResult ? qResult.insertId : null;
                    if (questionId) {
                        if (q.question_type === 'mcq') {
                            const opts = q.options || {};
                            const optionInserts = ['A','B','C','D'].map(label => [questionId, label, opts[label] || '']);
                            db.query('INSERT INTO mcq_options (question_id, option_label, option_text) VALUES ?', [optionInserts], () => {});
                            db.query('INSERT INTO answer_keys (question_id, correct_answer) VALUES (?, ?)', [questionId, q.correct_answer], () => {});
                        } else if (q.question_type === 'theory') {
                            db.query('INSERT INTO answer_keys (question_id, keywords) VALUES (?, ?)', [questionId, q.keywords], () => {});
                        } else if (q.question_type === 'programming') {
                            db.query('INSERT INTO answer_keys (question_id, test_case) VALUES (?, ?)', [questionId, q.test_case], () => {});
                        }
                    }
                    completed++;
                    if (completed === questions.length) finalize();
                });
            });

            function finalize() {
                if (publish) {
                    db.query(`SELECT u.email, u.full_name FROM users u
                        JOIN enrollments e ON u.user_id = e.student_id
                        WHERE e.course_id = ?`, [courseId], (err, students) => {
                        (students || []).forEach(s => {
                            sendAssessmentPublished(s.email, s.full_name, title).catch(() => {});
                        });
                    });
                }
                res.json({ success: true, assessmentId });
            }
        }
    );
});

// ── LIST ASSESSMENTS ──────────────────────────────────────
router.get('/assessments', isLecturer, (req, res) => {
    db.query(`SELECT a.*, c.course_code FROM assessments a
        JOIN courses c ON a.course_id = c.course_id
        WHERE c.lecturer_id = ?
        ORDER BY a.assessment_id DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, assessments: [] });
        res.json({ success: true, assessments: results || [] });
    });
});

// ── DELETE ASSESSMENT ──────────────────────────────────────
router.delete('/assessments/delete/:id', isLecturer, (req, res) => {
    const assessmentId = req.params.id;
    db.query(`DELETE FROM student_answers WHERE submission_id IN
        (SELECT submission_id FROM submissions WHERE assessment_id = ?)`, [assessmentId], () => {
        db.query('DELETE FROM submissions WHERE assessment_id = ?', [assessmentId], () => {
            db.query(`DELETE FROM answer_keys WHERE question_id IN
                (SELECT question_id FROM questions WHERE assessment_id = ?)`, [assessmentId], () => {
                db.query(`DELETE FROM mcq_options WHERE question_id IN
                    (SELECT question_id FROM questions WHERE assessment_id = ?)`, [assessmentId], () => {
                    db.query('DELETE FROM questions WHERE assessment_id = ?', [assessmentId], () => {
                        db.query('DELETE FROM assessments WHERE assessment_id = ?', [assessmentId], (err) => {
                            if (err) return res.json({ success: false, message: 'Failed to delete.' });
                            res.json({ success: true });
                        });
                    });
                });
            });
        });
    });
});

// ── PREVIEW ASSESSMENT ────────────────────────────────────
router.get('/assessments/:id/preview', isLecturer, (req, res) => {
    const assessmentId = req.params.id;
    db.query(`SELECT a.*, c.course_code FROM assessments a
        JOIN courses c ON a.course_id = c.course_id
        WHERE a.assessment_id = ?`, [assessmentId], (err, aResults) => {
        if (err || aResults.length === 0) return res.json({ success: false, message: 'Assessment not found.' });
        const a = aResults[0];

        db.query('SELECT * FROM questions WHERE assessment_id = ? ORDER BY question_id ASC', [assessmentId], (err, questions) => {
            if (err) return res.json({ success: false, message: 'Failed to load questions.' });
            if (!questions || questions.length === 0) {
                return res.json({ success: true, title: a.title, course_code: a.course_code, duration_minutes: a.duration_minutes, total_marks: a.total_marks, questions: [] });
            }

            let completed = 0;
            const enriched = [];
            questions.forEach((q, idx) => {
                if (q.question_type === 'mcq') {
                    db.query('SELECT option_label, option_text FROM mcq_options WHERE question_id = ? ORDER BY option_label ASC', [q.question_id], (err, opts) => {
                        db.query('SELECT correct_answer FROM answer_keys WHERE question_id = ?', [q.question_id], (err, ak) => {
                            enriched[idx] = { ...q, options: opts || [], answer_key: ak && ak[0] ? 'Correct answer: ' + ak[0].correct_answer : null };
                            completed++;
                            if (completed === questions.length) sendResult();
                        });
                    });
                } else if (q.question_type === 'theory') {
                    db.query('SELECT keywords FROM answer_keys WHERE question_id = ?', [q.question_id], (err, ak) => {
                        enriched[idx] = { ...q, answer_key: ak && ak[0] ? 'Keywords: ' + ak[0].keywords : null };
                        completed++;
                        if (completed === questions.length) sendResult();
                    });
                } else {
                    db.query('SELECT test_case FROM answer_keys WHERE question_id = ?', [q.question_id], (err, ak) => {
                        enriched[idx] = { ...q, answer_key: ak && ak[0] ? 'Expected output: ' + ak[0].test_case : null };
                        completed++;
                        if (completed === questions.length) sendResult();
                    });
                }
            });

            function sendResult() {
                res.json({
                    success: true,
                    title: a.title,
                    course_code: a.course_code,
                    duration_minutes: a.duration_minutes,
                    total_marks: a.total_marks,
                    questions: enriched
                });
            }
        });
    });
});

// ── ANALYTICS ──────────────────────────────────────────────
router.get('/assessments/:id/analytics', isLecturer, (req, res) => {
    const assessmentId = req.params.id;
    db.query('SELECT total_marks FROM assessments WHERE assessment_id = ?', [assessmentId], (err, aResults) => {
        if (err || aResults.length === 0) return res.json({ success: false });

        db.query('SELECT COUNT(*) as total_submissions FROM submissions WHERE assessment_id = ?', [assessmentId], (err, subResult) => {
            const totalSubmissions = subResult ? subResult[0].total_submissions : 0;

            db.query('SELECT question_id, question_text, question_type, marks FROM questions WHERE assessment_id = ? ORDER BY question_id ASC', [assessmentId], (err, questions) => {
                if (err) return res.json({ success: false });
                if (!questions || questions.length === 0) {
                    return res.json({ success: true, assessment: { total_marks: aResults[0].total_marks, total_submissions: totalSubmissions }, questions: [] });
                }

                let completed = 0;
                const enriched = [];
                questions.forEach((q, idx) => {
                    db.query(`SELECT
                        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
                        SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_count,
                        AVG(score_awarded) as avg_score
                        FROM student_answers WHERE question_id = ?`, [q.question_id], (err, stats) => {
                        const s = stats && stats[0] ? stats[0] : {};
                        enriched[idx] = {
                            ...q,
                            correct_count: s.correct_count || 0,
                            wrong_count: s.wrong_count || 0,
                            avg_score: s.avg_score || 0
                        };
                        completed++;
                        if (completed === questions.length) {
                            res.json({ success: true, assessment: { total_marks: aResults[0].total_marks, total_submissions: totalSubmissions }, questions: enriched });
                        }
                    });
                });
            });
        });
    });
});

// ── SIMILARITY CHECK ───────────────────────────────────────
router.get('/assessments/:id/similarity/:questionId', isLecturer, (req, res) => {
    db.query(`SELECT sa.answer_text, u.full_name, u.matric_number
        FROM student_answers sa
        JOIN submissions s ON sa.submission_id = s.submission_id
        JOIN users u ON s.student_id = u.user_id
        WHERE sa.question_id = ? AND sa.answer_text IS NOT NULL AND sa.answer_text != ''`,
        [req.params.questionId], (err, answers) => {
        if (err) return res.json({ success: false });
        const pairs = [];
        for (let i = 0; i < answers.length; i++) {
            for (let j = i + 1; j < answers.length; j++) {
                const sim = calculateSimilarity(answers[i].answer_text, answers[j].answer_text);
                if (sim >= 60) {
                    pairs.push({
                        student1: answers[i].full_name, matric1: answers[i].matric_number,
                        student2: answers[j].full_name, matric2: answers[j].matric_number,
                        similarity: sim, answer1: answers[i].answer_text, answer2: answers[j].answer_text
                    });
                }
            }
        }
        pairs.sort((a,b) => b.similarity - a.similarity);
        res.json({ success: true, pairs, totalAnswers: answers.length });
    });
});

// ── SUBMISSIONS LIST ───────────────────────────────────────
router.get('/submissions', isLecturer, (req, res) => {
    db.query(`SELECT s.submission_id, s.total_score, s.status, s.submitted_at, s.reviewed,
        a.total_marks, a.title as assessment_title,
        u.full_name as student_name
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        JOIN users u ON s.student_id = u.user_id
        WHERE c.lecturer_id = ?
        ORDER BY s.submitted_at DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, submissions: [] });
        res.json({ success: true, submissions: results || [] });
    });
});

// ── SUBMISSION DETAIL FOR REVIEW ──────────────────────────
router.get('/submissions/:id', isLecturer, (req, res) => {
    db.query(`SELECT s.*, u.full_name as student_name, u.matric_number, a.title as assessment_title, a.total_marks
        FROM submissions s
        JOIN users u ON s.student_id = u.user_id
        JOIN assessments a ON s.assessment_id = a.assessment_id
        WHERE s.submission_id = ?`, [req.params.id], (err, subResults) => {
        if (err || subResults.length === 0) return res.json({ success: false, message: 'Submission not found.' });
        const submission = subResults[0];

       db.query(`SELECT sa.student_answer_id as answer_id, sa.question_id, sa.answer_text, sa.score_awarded, sa.is_correct, sa.lecturer_feedback,
            q.question_text, q.question_type, q.marks,
            ak.correct_answer, ak.keywords, ak.test_case
            FROM student_answers sa
            JOIN questions q ON sa.question_id = q.question_id
            LEFT JOIN answer_keys ak ON q.question_id = ak.question_id
            WHERE sa.submission_id = ?
            ORDER BY q.question_id ASC`, [req.params.id], (err, answers) => {
            if (err) return res.json({ success: false, message: 'Failed to load answers.' });
            res.json({ success: true, submission, answers: answers || [] });
        });
    });
});

// ── SAVE REVIEW ────────────────────────────────────────────
router.post('/submissions/:id/review', isLecturer, (req, res) => {
    const { scores, comment } = req.body;
    if (!scores || !Array.isArray(scores)) return res.json({ success: false, message: 'Invalid data.' });

    if (scores.length === 0) return finalizeReview();

    let completed = 0;
    let hasError = false;
    scores.forEach(s => {
        db.query('UPDATE student_answers SET score_awarded = ?, lecturer_feedback = ?, is_correct = ? WHERE student_answer_id = ?',
            [s.score_awarded, s.lecturer_feedback || null, s.score_awarded > 0 ? 1 : 0, s.answer_id],
            (err) => {
                if (err) hasError = true;
                completed++;
                if (completed === scores.length) finalizeReview();
            }
        );
    });

    function finalizeReview() {
        if (hasError) return res.json({ success: false, message: 'Failed to update some scores.' });
        db.query('SELECT SUM(score_awarded) as total FROM student_answers WHERE submission_id = ?', [req.params.id], (err, totalResult) => {
            if (err) return res.json({ success: false, message: 'Failed to recalculate total.' });
            const newTotal = totalResult[0].total || 0;
            db.query('UPDATE submissions SET total_score = ?, lecturer_comment = ?, reviewed = 1 WHERE submission_id = ?',
                [newTotal, comment || null, req.params.id], (err) => {
                if (err) return res.json({ success: false, message: 'Failed to save review.' });
                res.json({ success: true, newTotal });
            });
        });
    }
});

// ── RESULTS ────────────────────────────────────────────────
router.get('/results', isLecturer, (req, res) => {
    db.query(`SELECT s.submission_id, s.total_score, s.submitted_at,
        a.total_marks, a.title as assessment_title,
        c.course_code,
        u.full_name as student_name
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        JOIN users u ON s.student_id = u.user_id
        WHERE c.lecturer_id = ? AND s.status = 'graded'
        ORDER BY s.submitted_at DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, results: [] });
        res.json({ success: true, results: results || [] });
    });
});

// ── MY STUDENTS ────────────────────────────────────────────
router.get('/students', isLecturer, (req, res) => {
    db.query(`SELECT u.full_name, u.matric_number, u.email, c.course_code, e.enrolled_at
        FROM enrollments e
        JOIN users u ON e.student_id = u.user_id
        JOIN courses c ON e.course_id = c.course_id
        WHERE c.lecturer_id = ?
        ORDER BY u.full_name ASC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, students: [] });
        res.json({ success: true, students: results || [] });
    });
});

// ── COURSE MATERIALS ───────────────────────────────────────
router.post('/materials/upload', isLecturer, (req, res) => {
    uploadMaterial.single('file')(req, res, (err) => {
        if (err) return res.json({ success: false, message: err.message });
        if (!req.file) return res.json({ success: false, message: 'No file uploaded.' });

        const { courseId, title } = req.body;
        if (!courseId || !title) return res.json({ success: false, message: 'Course and title are required.' });

        const filePath = req.file.path;
        const fileType = req.file.originalname.split('.').pop().toUpperCase();

        db.query('INSERT INTO course_materials (course_id, lecturer_id, title, file_path, file_type) VALUES (?, ?, ?, ?, ?)',
            [courseId, req.session.user.id, title, filePath, fileType], (err) => {
            if (err) return res.json({ success: false, message: 'Failed to save material.' });
            res.json({ success: true });
        });
    });
});

router.get('/materials', isLecturer, (req, res) => {
    db.query(`SELECT m.*, c.course_code, c.course_title FROM course_materials m
        JOIN courses c ON m.course_id = c.course_id
        WHERE m.lecturer_id = ?
        ORDER BY m.uploaded_at DESC`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, materials: [] });
        res.json({ success: true, materials: results || [] });
    });
});

router.delete('/materials/delete/:id', isLecturer, (req, res) => {
    db.query('SELECT file_path FROM course_materials WHERE material_id = ? AND lecturer_id = ?',
        [req.params.id, req.session.user.id], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Material not found.' });

        const fileUrl = results[0].file_path;
        try {
            const urlParts = fileUrl.split('/');
            const filename = urlParts[urlParts.length - 1].split('.')[0];
            const publicId = 'aglas/materials/' + filename;
            cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
        } catch (e) {}

        db.query('DELETE FROM course_materials WHERE material_id = ?', [req.params.id], (err) => {
            if (err) return res.json({ success: false, message: 'Failed to delete.' });
            res.json({ success: true });
        });
    });
});

// ── SETTINGS ───────────────────────────────────────────────
router.post('/settings/profile', isLecturer, (req, res) => {
    const { fullName, email } = req.body;
    if (!fullName || !email) return res.json({ success: false, message: 'Name and email are required.' });
    db.query('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?', [fullName, email, req.session.user.id], (err) => {
        if (err) return res.json({ success: false, message: 'Failed to update profile.' });
        req.session.user.fullName = fullName;
        req.session.user.email = email;
        res.json({ success: true });
    });
});

router.post('/settings/password', isLecturer, (req, res) => {
    const bcrypt = require('bcryptjs');
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

module.exports = router;