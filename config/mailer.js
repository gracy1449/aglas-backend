const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Verify connection
transporter.verify((err, success) => {
    if (err) console.error('❌ Email service error:', err.message);
    else console.log('✅ Email service ready!');
});

// Send account created email
function sendAccountCreated(to, fullName, role) {
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: '✅ Welcome to AGLAS — Account Created Successfully',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">Welcome, ${fullName}! 🎉</h2>
            <p style="color:#6b7280;line-height:1.6;">Your AGLAS account has been created successfully. You are registered as a <strong style="color:#7c3aed;">${role}</strong>.</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:24px 0;">
              <p style="margin:0;color:#374151;"><strong>Email:</strong> ${to}</p>
              <p style="margin:8px 0 0;color:#374151;"><strong>Role:</strong> ${role}</p>
            </div>
            <p style="color:#6b7280;">You can now log in to your dashboard and get started.</p>
            <div style="text-align:center;margin-top:32px;">
              <a href="http://localhost:3000/auth/login" style="background:linear-gradient(135deg,#581c87,#7c3aed);color:white;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:bold;">Login to AGLAS</a>
            </div>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Account created email sent to', to);
    });
}

// Send login successful email
function sendLoginSuccess(to, fullName) {
    const time = new Date().toLocaleString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: '🔐 AGLAS — Login Successful',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">Login Successful 🔐</h2>
            <p style="color:#6b7280;line-height:1.6;">Hi <strong>${fullName}</strong>, you just logged into your AGLAS account.</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:24px 0;">
              <p style="margin:0;color:#374151;"><strong>Time:</strong> ${time}</p>
              <p style="margin:8px 0 0;color:#374151;"><strong>Email:</strong> ${to}</p>
            </div>
            <p style="color:#6b7280;">If this was not you, please change your password immediately.</p>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Login email sent to', to);
    });
}

// Send exam score email
function sendExamScore(to, fullName, assessmentTitle, score, totalMarks, percentage) {
    const grade = percentage >= 70 ? 'A' : percentage >= 60 ? 'B' : percentage >= 50 ? 'C' : percentage >= 45 ? 'D' : 'F';
    const remark = percentage >= 70 ? 'Excellent! 🌟' : percentage >= 50 ? 'Good effort 👍' : 'Keep practicing 💪';
    const color = percentage >= 70 ? '#16a34a' : percentage >= 50 ? '#d97706' : '#dc2626';
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: `📊 AGLAS — Your Result for ${assessmentTitle}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">Your Result is Ready! 📊</h2>
            <p style="color:#6b7280;">Hi <strong>${fullName}</strong>, your exam has been automatically graded.</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:24px 0;">
              <p style="margin:0;color:#374151;"><strong>Assessment:</strong> ${assessmentTitle}</p>
            </div>
            <div style="text-align:center;background:white;border-radius:16px;padding:32px;border:2px solid #e5e7eb;margin:24px 0;">
              <p style="color:#6b7280;margin:0 0 8px;font-size:14px;">Your Score</p>
              <p style="font-size:52px;font-weight:800;color:#7c3aed;margin:0;">${score}<span style="font-size:24px;color:#9ca3af;">/${totalMarks}</span></p>
              <p style="font-size:28px;font-weight:700;color:${color};margin:8px 0;">${percentage}%</p>
              <p style="font-size:36px;font-weight:800;color:${color};margin:0;">Grade: ${grade}</p>
              <p style="color:#6b7280;margin:12px 0 0;">${remark}</p>
            </div>
            <div style="text-align:center;margin-top:32px;">
              <a href="http://localhost:3000/auth/login" style="background:linear-gradient(135deg,#581c87,#7c3aed);color:white;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:bold;">View Full Results</a>
            </div>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Score email sent to', to);
    });
}

// Send assessment published email
function sendAssessmentPublished(to, fullName, assessmentTitle, courseCode, durationMinutes) {
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: `📝 AGLAS — New Assessment: ${assessmentTitle}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">New Assessment Available! 📝</h2>
            <p style="color:#6b7280;">Hi <strong>${fullName}</strong>, a new assessment has been published for your course.</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin:24px 0;">
              <p style="margin:0;color:#374151;"><strong>Assessment:</strong> ${assessmentTitle}</p>
              <p style="margin:8px 0 0;color:#374151;"><strong>Course:</strong> ${courseCode}</p>
              <p style="margin:8px 0 0;color:#374151;"><strong>Duration:</strong> ${durationMinutes} minutes</p>
            </div>
            <p style="color:#6b7280;">Log in to your dashboard to attempt this assessment.</p>
            <div style="text-align:center;margin-top:32px;">
              <a href="http://localhost:3000/auth/login" style="background:linear-gradient(135deg,#581c87,#7c3aed);color:white;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:bold;">Go to Dashboard</a>
            </div>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Assessment published email sent to', to);
    });
}

// Send password reset email
function sendPasswordReset(to, fullName, resetLink) {
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: '🔑 AGLAS — Password Reset Request',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">Password Reset Request 🔑</h2>
            <p style="color:#6b7280;line-height:1.6;">Hi <strong>${fullName}</strong>, we received a request to reset your AGLAS password.</p>
            <p style="color:#6b7280;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetLink}" style="background:linear-gradient(135deg,#581c87,#7c3aed);color:white;padding:16px 40px;border-radius:50px;text-decoration:none;font-weight:bold;font-size:16px;">Reset My Password</a>
            </div>
            <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px;margin-top:24px;">
              <p style="color:#dc2626;margin:0;font-size:13px;">⚠️ If you did not request this, please ignore this email. Your password will remain unchanged.</p>
            </div>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Password reset email sent to', to);
    });
}

// Send account activation email
function sendActivationEmail(to, fullName, activationLink) {
    const mailOptions = {
        from: `"AGLAS System" <${process.env.GMAIL_USER}>`,
        to,
        subject: '✅ AGLAS — Please Activate Your Account',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:40px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">🎓 AGLAS</h1>
            <p style="color:#e9d5ff;margin:8px 0 0;">Automatic Grading & Learning Assessment System</p>
          </div>
          <div style="padding:40px;">
            <h2 style="color:#1f2937;">Activate Your Account 🎉</h2>
            <p style="color:#6b7280;line-height:1.6;">Hi <strong>${fullName}</strong>, thank you for registering on AGLAS!</p>
            <p style="color:#6b7280;">Please click the button below to activate your account. This link expires in <strong>24 hours</strong>.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${activationLink}"
                style="background:linear-gradient(135deg,#581c87,#7c3aed);color:white;
                padding:16px 40px;border-radius:50px;text-decoration:none;
                font-weight:bold;font-size:16px;">
                ✅ Activate My Account
              </a>
            </div>
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px;margin-top:24px;">
              <p style="color:#16a34a;margin:0;font-size:13px;">
                ✅ Once activated, you can login and start using AGLAS immediately.
              </p>
            </div>
            <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px;margin-top:12px;">
              <p style="color:#dc2626;margin:0;font-size:13px;">
                ⚠️ If you did not create this account, please ignore this email.
              </p>
            </div>
          </div>
          <div style="background:#f3f4f6;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 AGLAS · Federal University of Lafia · Computer Science Dept</p>
          </div>
        </div>`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Email error:', err.message);
        else console.log('✅ Activation email sent to', to);
    });
}

module.exports = {
    sendAccountCreated,
    sendLoginSuccess,
    sendExamScore,
    sendAssessmentPublished,
    sendPasswordReset,
    sendActivationEmail
};