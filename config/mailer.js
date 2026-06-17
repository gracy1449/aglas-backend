const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

transporter.verify((err, success) => {
    if (err) console.error('Email service error:', err.message);
    else console.log('Email service ready!');
});

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function sendAccountCreated(email, fullName) {
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Welcome to AGLAS - Account Created',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;font-size:28px;">AGLAS</h1>
                <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading and Learning Assessment System</p>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">Welcome, ${fullName}!</h2>
                <p style="color:#374151;">Your account has been created successfully. You can now log in to AGLAS.</p>
                <div style="text-align:center;margin:24px 0;">
                    <a href="${baseUrl}/auth/login" style="background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Login to AGLAS</a>
                </div>
                <p style="color:#6b7280;font-size:14px;">Federal University of Lafia - Department of Computer Science</p>
            </div>
        </div>`
    });
}

async function sendLoginSuccess(email, fullName) {
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'AGLAS - Login Notification',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;">AGLAS</h1>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">Login Alert</h2>
                <p style="color:#374151;">Hello ${fullName}, your account was just logged into.</p>
                <p style="color:#374151;">Time: ${new Date().toLocaleString('en-GB')}</p>
                <p style="color:#6b7280;font-size:14px;">If this was not you please reset your password immediately.</p>
            </div>
        </div>`
    });
}

async function sendPasswordReset(email, fullName, resetToken) {
    const resetLink = `${baseUrl}/auth/reset-password?token=${resetToken}`;
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'AGLAS - Password Reset Request',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;">AGLAS</h1>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">Password Reset</h2>
                <p style="color:#374151;">Hello ${fullName}, click the button below to reset your password.</p>
                <p style="color:#374151;">This link expires in 1 hour.</p>
                <div style="text-align:center;margin:24px 0;">
                    <a href="${resetLink}" style="background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
                </div>
                <p style="color:#6b7280;font-size:14px;">If you did not request this, ignore this email.</p>
            </div>
        </div>`
    });
}

async function sendAssessmentPublished(email, fullName, assessmentTitle) {
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'AGLAS - New Assessment Available',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;">AGLAS</h1>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">New Assessment</h2>
                <p style="color:#374151;">Hello ${fullName}, a new assessment has been published for you.</p>
                <p style="color:#7c3aed;font-weight:bold;font-size:18px;">${assessmentTitle}</p>
                <div style="text-align:center;margin:24px 0;">
                    <a href="${baseUrl}/student/dashboard" style="background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Take Assessment</a>
                </div>
            </div>
        </div>`
    });
}

async function sendExamScore(email, fullName, assessmentTitle, score, totalMarks, percentage) {
    const grade = percentage >= 70 ? 'A' : percentage >= 60 ? 'B' : percentage >= 50 ? 'C' : percentage >= 45 ? 'D' : 'F';
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'AGLAS - Your Exam Result',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;">AGLAS</h1>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">Exam Result</h2>
                <p style="color:#374151;">Hello ${fullName}, your exam has been graded.</p>
                <p style="color:#374151;font-weight:bold;">${assessmentTitle}</p>
                <div style="background:#f5f3ff;padding:24px;border-radius:12px;text-align:center;margin:16px 0;">
                    <p style="font-size:48px;font-weight:900;color:#7c3aed;margin:0;">${score}/${totalMarks}</p>
                    <p style="font-size:24px;color:#374151;margin:8px 0;">${percentage}% - Grade ${grade}</p>
                </div>
                <div style="text-align:center;margin:24px 0;">
                    <a href="${baseUrl}/student/dashboard" style="background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">View Full Results</a>
                </div>
            </div>
        </div>`
    });
}

async function sendActivationEmail(email, fullName, activationToken) {
    const activationLink = `${baseUrl}/auth/activate?token=${activationToken}`;
    await transporter.sendMail({
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'AGLAS - Activate Your Account',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0ff;padding:20px;border-radius:16px;">
            <div style="background:linear-gradient(135deg,#1a0a35,#3b0764);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
                <h1 style="color:white;margin:0;">AGLAS</h1>
            </div>
            <div style="background:white;padding:32px;border-radius:12px;">
                <h2 style="color:#1a0a35;">Activate Your Account</h2>
                <p style="color:#374151;">Hello ${fullName}, click the button below to activate your account.</p>
                <div style="text-align:center;margin:24px 0;">
                    <a href="${activationLink}" style="background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Activate Account</a>
                </div>
                <p style="color:#6b7280;font-size:14px;">If you did not register, ignore this email.</p>
            </div>
        </div>`
    });
}

module.exports = {
    sendAccountCreated,
    sendLoginSuccess,
    sendPasswordReset,
    sendAssessmentPublished,
    sendExamScore,
    sendActivationEmail
};