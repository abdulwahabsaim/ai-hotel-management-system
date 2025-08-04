const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ensureGuest, ensureAuth } = require('../middleware/auth');
const passport = require('passport');

// @desc    Show Login Page
// @route   GET /auth/login
router.get('/login', ensureGuest, (req, res) => {
    res.render('auth/login', { title: 'Login' });
});

// @desc    Handle Traditional Login
// @route   POST /auth/login
router.post('/login', ensureGuest, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user || !user.password) { // Check if user exists AND has a password
            req.flash('error_msg', 'Invalid credentials or no password set for this account. Try magic link or Google login.');
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please try again.');
            return res.redirect('/auth/login');
        }

        // Manually log in the user via Passport.js after successful bcrypt check
        req.login(user, (err) => {
            if (err) {
                console.error(err);
                req.flash('error_msg', 'A server error occurred during login.');
                return res.redirect('/auth/login');
            }
            // No success message needed here, as the welcome message on the dropdown serves this purpose.
            res.redirect('/user/dashboard');
        });

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'A server error occurred.');
        res.redirect('/auth/login');
    }
});

// @desc    Show Signup Page
// @route   GET /auth/signup
router.get('/signup', ensureGuest, (req, res) => {
    res.render('auth/signup', { title: 'Sign Up' });
});

// @desc    Handle Traditional Signup
// @route   POST /auth/signup
router.post('/signup', ensureGuest, async (req, res) => {
    const { name, email, password, password2 } = req.body;

    // --- Server-side validation ---
    if (password !== password2) {
        req.flash('error_msg', 'Passwords do not match.');
        return res.redirect('/auth/signup');
    }
    if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long.');
        return res.redirect('/auth/signup');
    }

    try {
        let user = await User.findOne({ email: email });
        if (user) {
            req.flash('error_msg', 'An account with that email already exists.');
            return res.redirect('/auth/signup');
        }

        const newUser = new User({ name, email, password, isVerified: true }); // Mark as verified if they set a password
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(password, salt);
        await newUser.save();

        // Log the user in immediately after signup using Passport.js
        req.login(newUser, (err) => {
            if (err) {
                console.error(err);
                req.flash('error_msg', 'Something went wrong during auto-login after signup.');
                return res.redirect('/auth/signup');
            }
            req.flash('success_msg', 'Welcome! Your account has been created successfully.');
            res.redirect('/user/dashboard');
        });

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Please try again.');
        res.redirect('/auth/signup');
    }
});

// @desc    Handle Logout
// @route   GET /auth/logout
router.get('/logout', ensureAuth, (req, res, next) => {
    req.logout((err) => { // Passport.js logout method
        if (err) { return next(err); }
        req.session.destroy((err) => { // Destroy the session after Passport logout
            if (err) {
                console.error(err);
                return res.redirect('/');
            }
            res.clearCookie('connect.sid'); // Clear the session cookie
            req.flash('success_msg', 'You have been logged out.'); // Flash message for logout
            res.redirect('/auth/login');
        });
    });
});

// --- Google OAuth Routes ---
// @desc    Auth with Google
// @route   GET /auth/google
router.get(
    '/google',
    ensureGuest, // Prevent logged-in users from initiating OAuth
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// @desc    Google auth callback
// @route   GET /auth/google/callback
router.get(
    '/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/auth/login', // Redirect on failure
        failureFlash: true // Use flash messages for failure
    }),
    (req, res) => {
        // Successful authentication, redirect home. Passport's done() function handles flashing success.
        res.redirect('/user/dashboard');
    }
);

// --- Magic Link (Passwordless) Routes ---
// Only set up magic link routes if the strategy is available
if (passport.magicLogin) {
    // @desc    Handle Magic Link request - FIXED VERSION
    // @route   POST /auth/magiclogin
    router.post('/auth/magiclogin', passport.magicLogin.send);

    // @desc    Magic Link verification endpoint - FIXED VERSION
    // @route   GET /auth/magiclogin/callback
    router.get('/auth/magiclogin/callback', passport.authenticate('magiclogin', {
        successRedirect: '/user/dashboard',
        failureRedirect: '/auth/login',
        failureFlash: 'Magic link is invalid or expired. Please request a new one.',
        successFlash: 'Successfully logged in with magic link!'
    }));
} else {
    // Fallback routes if magic login is not available
    router.post('/auth/magiclogin', (req, res) => {
        req.flash('error_msg', 'Magic link authentication is not available. Please use password or Google login.');
        res.redirect('/auth/login');
    });
    
    console.log('⚠️ Magic Link routes not available - using fallback routes');
}

// @desc    Page to confirm magic link sent
// @route   GET /auth/magic-link-sent
router.get('/magic-link-sent', ensureGuest, (req, res) => {
    res.render('auth/magic-link-sent', {
        title: 'Magic Link Sent'
    });
});

// TEMPORARY TEST ROUTE - Remove after testing email functionality
// @desc    Test email configuration
// @route   GET /auth/test-email
router.get('/test-email', async (req, res) => {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD
        },
        logger: true,
        debug: true
    });

    try {
        console.log('🧪 Testing email configuration...');
        console.log('📧 Sending test email to:', process.env.NODEMAILER_EMAIL);
        
        const info = await transporter.sendMail({
            from: `"AI Hotel Test" <${process.env.NODEMAILER_EMAIL}>`,
            to: process.env.NODEMAILER_EMAIL, // Send to yourself for testing
            subject: 'Test Email from AI Hotel - Email Configuration Working!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #3B82F6;">🎉 Email Configuration Test</h1>
                    <p>If you receive this email, your Gmail configuration is working perfectly!</p>
                    <p><strong>Configuration Details:</strong></p>
                    <ul>
                        <li>Email: ${process.env.NODEMAILER_EMAIL}</li>
                        <li>Service: Gmail</li>
                        <li>Authentication: App Password</li>
                        <li>Test Time: ${new Date().toLocaleString()}</li>
                    </ul>
                    <p>You can now use the magic link functionality with confidence!</p>
                    <hr>
                    <p><small>This is a test email from your AI Hotel application.</small></p>
                </div>
            `,
            text: `Email Configuration Test\n\nIf you receive this, your email configuration is working!\n\nEmail: ${process.env.NODEMAILER_EMAIL}\nService: Gmail\nTest Time: ${new Date().toLocaleString()}`
        });
        
        console.log('✅ Test email sent successfully!');
        console.log('📧 Message ID:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Test email sent successfully!',
            messageId: info.messageId,
            response: info.response,
            to: process.env.NODEMAILER_EMAIL
        });
    } catch (error) {
        console.error('❌ Test email failed:', error);
        res.json({ 
            success: false, 
            message: 'Test email failed',
            error: error.message,
            code: error.code,
            details: {
                command: error.command,
                response: error.response,
                responseCode: error.responseCode
            }
        });
    }
});

module.exports = router;