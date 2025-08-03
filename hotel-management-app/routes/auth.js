const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ensureGuest, ensureAuth } = require('../middleware/auth');
const passport = require('passport'); // ADD THIS

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
// @desc    Handle Magic Link request
// @route   POST /auth/send-magic-link
router.post('/send-magic-link', async (req, res, next) => {
    passport.authenticate('magiclogin', (err, user, info) => {
        if (err) {
            console.error('Magic link send error:', err);
            req.flash('error_msg', 'There was an error sending the magic link. Please try again.');
            return res.redirect('/auth/login');
        }
        if (info && info.message) { // Info message from strategy (e.g., email sent)
            req.flash('success_msg', info.message);
        } else {
            req.flash('success_msg', 'Magic login link sent to your email address!');
        }
        res.redirect('/auth/magic-link-sent');
    })(req, res, next);
});

// @desc    Magic Link verification endpoint
// @route   GET /auth/verify-magic-link
router.get('/verify-magic-link', (req, res, next) => {
    passport.authenticate('magiclogin', (err, user, info) => {
        if (err) {
            console.error('Magic link verification error:', err);
            req.flash('error_msg', 'Error logging in with magic link. It might have expired or be invalid.');
            return res.redirect('/auth/login');
        }
        if (!user) { // No user returned by strategy (e.g., verification failed)
            req.flash('error_msg', info.message || 'Magic link is invalid or expired. Please request a new one.');
            return res.redirect('/auth/login');
        }
        // User successfully authenticated by magic link
        req.login(user, (loginErr) => {
            if (loginErr) {
                console.error('Error auto-logging in after magic link:', loginErr);
                req.flash('error_msg', 'Login failed after magic link verification.');
                return res.redirect('/auth/login');
            }
            req.flash('success_msg', 'Successfully logged in with magic link!');
            res.redirect('/user/dashboard');
        });
    })(req, res, next);
});

// @desc    Page to confirm magic link sent
// @route   GET /auth/magic-link-sent
router.get('/magic-link-sent', ensureGuest, (req, res) => {
    res.render('auth/magic-link-sent', {
        title: 'Magic Link Sent'
    });
});

module.exports = router;