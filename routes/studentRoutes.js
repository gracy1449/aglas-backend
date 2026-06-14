const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const path = require('path');

// Middleware to protect student routes
function isStudent(req, res, next) {
    if (req.session.user && req.session.user.role === 'student') {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

// Student dashboard page
router.get('/dashboard', isStudent, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/student/dashboard.html'));
});

// Get student stats
router.get('/stats', isStudent, (req, res) => {
    const studentId = req.session.user.id;
    const stats = {};

    db.query(`SELECT COUNT(*) as total FROM enrollments WHERE student_id = ?`,
        [studentId], (err, result) => {
        if (err) return res.json({ error: true });
        stats.totalCourses = result[0].total;

        db.query(`SELECT DISTINCT a.assessment_id, a.title, a.type,
            a.duration_minutes, a.total_marks, c.course_code
            FROM assessments a
            JOIN courses c ON a.course_id = c.course_id
            JOIN enrollments e ON c.course_id = e.course_id
            WHERE e.student_id = ? AND a.is_published = 1
            AND a.assessment_id NOT IN (
                SELECT assessment_id FROM submissions WHERE student_id = ?
            )`, [studentId, studentId], (err, assessments) => {
            stats.totalAssessments = assessments ? assessments.length : 0;
            stats.assessments = assessments || [];

            db.query(`SELECT COUNT(*) as total FROM submissions 
                WHERE student_id = ?`,
                [studentId], (err, result) => {
                stats.totalSubmitted = result[0].total;

                db.query(`SELECT s.total_score, a.total_marks, 
                    a.title as assessment_title, s.submitted_at
                    FROM submissions s
                    JOIN assessments a ON s.assessment_id = a.assessment_id
                    WHERE s.student_id = ? AND s.status = 'graded'
                    ORDER BY s.submitted_at DESC`,
                    [studentId], (err, grades) => {
                    stats.grades = grades || [];

                    if (grades && grades.length > 0) {
                        const avg = grades.reduce((sum, g) =>
                            sum + Math.round((g.total_score / g.total_marks) * 100), 0
                        ) / grades.length;
                        stats.averageScore = Math.round(avg);
                    } else {
                        stats.averageScore = null;
                    }

                    res.json(stats);
                });
            });
        });
    });
});

// Get student courses
router.get('/courses', isStudent, (req, res) => {
    db.query(`SELECT c.course_id, c.course_code, c.course_title, u.full_name as lecturer_name
        FROM courses c
        JOIN enrollments e ON c.course_id = e.course_id
        LEFT JOIN users u ON c.lecturer_id = u.user_id
        WHERE e.student_id = ?`, [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ courses: results });
    });
});

// Get available courses (not yet enrolled)
router.get('/courses/available', isStudent, (req, res) => {
    const studentId = req.session.user.id;
    db.query(`SELECT c.course_id, c.course_code, c.course_title, u.full_name as lecturer_name
        FROM courses c
        LEFT JOIN users u ON c.lecturer_id = u.user_id
        WHERE c.course_id NOT IN (
            SELECT course_id FROM enrollments WHERE student_id = ?
        )`, [studentId], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ courses: results });
    });
});

// Self enroll
router.post('/courses/enroll', isStudent, (req, res) => {
    const { courseId } = req.body;
    const studentId = req.session.user.id;

    if (!courseId) {
        return res.json({ success: false, message: 'Course ID is required.' });
    }

    db.query(`SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?`,
        [studentId, courseId], (err, existing) => {
            if (err) return res.json({ success: false, message: 'Database error.' });
            if (existing && existing.length > 0) {
                return res.json({ success: false, message: 'Already enrolled in this course.' });
            }
            db.query(`INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)`,
                [studentId, courseId], (err) => {
                    if (err) return res.json({ success: false, message: 'Failed to enroll.' });
                    res.json({ success: true });
                });
        });
});

// Get available assessments
router.get('/assessments', isStudent, (req, res) => {
    const studentId = req.session.user.id;
    db.query(`SELECT DISTINCT a.assessment_id, a.title, a.type,
        a.duration_minutes, a.total_marks, c.course_code
        FROM assessments a
        JOIN courses c ON a.course_id = c.course_id
        JOIN enrollments e ON c.course_id = e.course_id
        WHERE e.student_id = ? AND a.is_published = 1
        AND a.assessment_id NOT IN (
            SELECT assessment_id FROM submissions WHERE student_id = ?
        )`, [studentId, studentId], (err, results) => {
        if (err) return res.json({ success: false });
        res.json({ assessments: results });
    });
});

// Start exam — load questions
router.get('/assessments/:id/start', isStudent, (req, res) => {
    const assessmentId = req.params.id;
    const studentId = req.session.user.id;

    // Check if already submitted
    db.query('SELECT * FROM submissions WHERE student_id = ? AND assessment_id = ?',
        [studentId, assessmentId], (err, existing) => {
        if (existing && existing.length > 0) {
            return res.json({ success: false, message: 'You have already submitted this assessment.' });
        }

        // Get assessment info
        db.query(`SELECT a.*, c.course_code FROM assessments a
            JOIN courses c ON a.course_id = c.course_id
            WHERE a.assessment_id = ?`, [assessmentId], (err, assessments) => {
            if (err || assessments.length === 0) {
                return res.json({ success: false, message: 'Assessment not found.' });
            }

            const assessment = assessments[0];

            // Get questions
            db.query('SELECT * FROM questions WHERE assessment_id = ?',
                [assessmentId], (err, questions) => {
                if (err) return res.json({ success: false });

                // Get options for MCQ questions
                const questionIds = questions.map(q => q.question_id);
                if (questionIds.length === 0) {
                    return res.json({
                        success: true,
                        assessment_id: assessment.assessment_id,
                        title: assessment.title,
                        type: assessment.type,
                        course_code: assessment.course_code,
                        duration_minutes: assessment.duration_minutes,
                        total_marks: assessment.total_marks,
                        questions: []
                    });
                }

                db.query(`SELECT * FROM mcq_options WHERE question_id IN (?)`,
                    [questionIds], (err, options) => {

                    // Attach options to questions
                    const questionsWithOptions = questions.map(q => {
                        const qOptions = options.filter(o => o.question_id === q.question_id);
                        return { ...q, options: qOptions.length > 0 ? qOptions : null };
                    });

                    res.json({
                        success: true,
                        assessment_id: assessment.assessment_id,
                        title: assessment.title,
                        type: assessment.type,
                        course_code: assessment.course_code,
                        duration_minutes: assessment.duration_minutes,
                        total_marks: assessment.total_marks,
                        questions: questionsWithOptions
                    });
                });
            });
        });
    });
});

// Submit exam and auto-grade
router.post('/assessments/:id/submit', isStudent, (req, res) => {
    const assessmentId = req.params.id;
    const studentId = req.session.user.id;
    const { answers } = req.body;

    // Get assessment total marks
    db.query('SELECT * FROM assessments WHERE assessment_id = ?',
        [assessmentId], (err, assessments) => {
        if (err || assessments.length === 0) {
            return res.json({ success: false, message: 'Assessment not found.' });
        }

        const assessment = assessments[0];

        // Create submission
        db.query(`INSERT INTO submissions (student_id, assessment_id, status)
            VALUES (?, ?, 'pending')`,
            [studentId, assessmentId], (err, result) => {
            if (err) return res.json({ success: false, message: 'Failed to submit.' });

            const submissionId = result.insertId;
            let totalScore = 0;
            let processed = 0;

            if (!answers || answers.length === 0) {
                return res.json({ success: true, score: 0, totalMarks: assessment.total_marks, percentage: 0 });
            }

            answers.forEach(answer => {
                // Get correct answer and marks
                db.query(`SELECT q.marks, q.question_type, ak.correct_answer, ak.keywords
                    FROM questions q
                    LEFT JOIN answer_keys ak ON q.question_id = ak.question_id
                    WHERE q.question_id = ?`, [answer.question_id], (err, results) => {

                    if (err || results.length === 0) {
                        processed++;
                        checkDone();
                        return;
                    }

                    const q = results[0];
                    let scoreAwarded = 0;
                    let feedback = '';

                    // GRADING LOGIC
                    if (q.question_type === 'mcq' || q.question_type === 'true_false') {
                        // Objective: exact match
                        if (answer.answer_text && q.correct_answer &&
                            answer.answer_text.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
                            scoreAwarded = q.marks;
                            feedback = '✅ Correct!';
                        } else {
                            feedback = `❌ Incorrect. Correct answer: ${q.correct_answer}`;
                        }
                    } else if (q.question_type === 'theory') {
                        // Theory: keyword matching
                        if (q.keywords && answer.answer_text) {
                            const keywords = q.keywords.split(',').map(k => k.trim().toLowerCase());
                            const studentAnswer = answer.answer_text.toLowerCase();
                            let matchedKeywords = 0;
                            keywords.forEach(kw => {
                                if (studentAnswer.includes(kw)) matchedKeywords++;
                            });
                            const matchRatio = matchedKeywords / keywords.length;
                            scoreAwarded = Math.round(q.marks * matchRatio);
                            feedback = `Matched ${matchedKeywords}/${keywords.length} keywords. Score: ${scoreAwarded}/${q.marks}`;
                        }
                    } else if (q.question_type === 'programming') {
                        // Programming: simple string match for now
                        if (answer.answer_text && q.correct_answer) {
                            const studentCode = answer.answer_text.trim().toLowerCase();
                            const expectedOutput = q.correct_answer.trim().toLowerCase();
                            if (studentCode.includes(expectedOutput) || expectedOutput.includes(studentCode)) {
                                scoreAwarded = q.marks;
                                feedback = '✅ Test case passed!';
                            } else {
                                scoreAwarded = Math.round(q.marks * 0.5);
                                feedback = '⚠️ Partial credit awarded.';
                            }
                        }
                    }

                    totalScore += scoreAwarded;

                    // Save student answer
                    db.query(`INSERT INTO student_answers
                        (submission_id, question_id, answer_text, score_awarded, feedback)
                        VALUES (?, ?, ?, ?, ?)`,
                        [submissionId, answer.question_id, answer.answer_text, scoreAwarded, feedback],
                        () => {
                            processed++;
                            checkDone();
                        });
                });
            });

         function checkDone() {
                if (processed === answers.length) {
                    db.query(`UPDATE submissions SET total_score = ?, status = 'graded'
                        WHERE submission_id = ?`,
                        [totalScore, submissionId], () => {
                        const percentage = Math.round((totalScore / assessment.total_marks) * 100);

                        // Send score email
                        db.query('SELECT email, full_name FROM users WHERE user_id = ?',
                            [studentId], (err, users) => {
                            if (!err && users.length > 0) {
                                const mailer = require('../config/mailer');
                                mailer.sendExamScore(
                                    users[0].email,
                                    users[0].full_name,
                                    assessment.title,
                                    totalScore,
                                    assessment.total_marks,
                                    percentage
                                );
                            }
                        });

                        res.json({
                            success: true,
                            score: totalScore,
                            totalMarks: assessment.total_marks,
                            percentage: percentage
                        });
                    });
                }
            }   
        });
    });
});

// Get grades
router.get('/grades', isStudent, (req, res) => {
    db.query(`SELECT s.submission_id, s.total_score, s.submitted_at, s.lecturer_comment,
        a.total_marks, a.title as assessment_title, a.type,
        c.course_code
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE s.student_id = ? AND s.status = 'graded'
        ORDER BY s.submitted_at DESC`,
        [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, grades: [] });
        res.json({ success: true, grades: results || [] });
    });
});

// Update profile
router.post('/settings/profile', isStudent, (req, res) => {
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
router.post('/settings/password', isStudent, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    db.query('SELECT * FROM users WHERE user_id = ?', [req.session.user.id], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'User not found.' });
        const isMatch = bcrypt.compareSync(currentPassword, results[0].password);
        if (!isMatch) return res.json({ success: false, message: 'Current password is incorrect.' });
        const hashed = bcrypt.hashSync(newPassword, 10);
        db.query('UPDATE users SET password = ? WHERE user_id = ?',
            [hashed, req.session.user.id], (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        });
    });
});

// Get detailed results
router.get('/results', isStudent, (req, res) => {
    db.query(`SELECT s.submission_id, s.total_score, s.submitted_at,
        a.total_marks, a.title as assessment_title, a.type,
        c.course_code
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE s.student_id = ? AND s.status = 'graded'
        ORDER BY s.submitted_at DESC`,
        [req.session.user.id], (err, results) => {
        if (err) {
            console.error('Results error:', err.message);
            return res.json({ success: false, results: [] });
        }
        res.json({ success: true, results: results || [] });
    });
});

// Get GPA and performance summary
router.get('/gpa', isStudent, (req, res) => {
    const studentId = req.session.user.id;

    db.query(`SELECT s.total_score, a.total_marks, a.title as assessment_title,
        a.type, c.course_code, c.course_title, s.submitted_at
        FROM submissions s
        JOIN assessments a ON s.assessment_id = a.assessment_id
        JOIN courses c ON a.course_id = c.course_id
        WHERE s.student_id = ? AND s.status = 'graded'
        ORDER BY s.submitted_at DESC`,
        [studentId], (err, results) => {
        if (err) {
            console.error('GPA error:', err.message);
            return res.json({ success: false });
        }

        if (!results || results.length === 0) {
            return res.json({
                success: true,
                gpa: 0,
                totalAssessments: 0,
                averageScore: 0,
                bestScore: 0,
                worstScore: 0,
                passed: 0,
                failed: 0,
                coursePerformance: [],
                results: []
            });
        }

        const gradePoints = results.map(r => {
            const pct = Math.round((r.total_score / r.total_marks) * 100);
            let point = 0;
            if (pct >= 70) point = 5.0;
            else if (pct >= 60) point = 4.0;
            else if (pct >= 50) point = 3.0;
            else if (pct >= 45) point = 2.0;
            else if (pct >= 40) point = 1.0;
            else point = 0.0;
            return { ...r, pct, point };
        });

        const gpa = gradePoints.reduce((sum, r) => sum + r.point, 0) / gradePoints.length;
        const scores = gradePoints.map(r => r.pct);
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const bestScore = Math.max(...scores);
        const worstScore = Math.min(...scores);
        const passed = gradePoints.filter(r => r.pct >= 45).length;
        const failed = gradePoints.filter(r => r.pct < 45).length;

        const courseMap = {};
        gradePoints.forEach(r => {
            if (!courseMap[r.course_code]) {
                courseMap[r.course_code] = {
                    course_code: r.course_code,
                    course_title: r.course_title,
                    scores: [],
                    count: 0
                };
            }
            courseMap[r.course_code].scores.push(r.pct);
            courseMap[r.course_code].count++;
        });

        const coursePerformance = Object.values(courseMap).map(c => ({
            ...c,
            average: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
            best: Math.max(...c.scores)
        }));

        res.json({
            success: true,
            gpa: Math.round(gpa * 100) / 100,
            totalAssessments: results.length,
            averageScore: avgScore,
            bestScore,
            worstScore,
            passed,
            failed,
            coursePerformance,
            results: gradePoints
        });
    });
});

// Get materials for student's enrolled courses
router.get('/materials', isStudent, (req, res) => {
    db.query(`SELECT m.*, c.course_code, c.course_title, u.full_name as lecturer_name
        FROM course_materials m
        JOIN courses c ON m.course_id = c.course_id
        JOIN users u ON m.lecturer_id = u.user_id
        JOIN enrollments e ON c.course_id = e.course_id
        WHERE e.student_id = ?
        ORDER BY m.uploaded_at DESC`,
        [req.session.user.id], (err, results) => {
        if (err) return res.json({ success: false, materials: [] });
        res.json({ success: true, materials: results || [] });
    });
});

module.exports = router;