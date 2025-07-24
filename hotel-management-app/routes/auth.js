const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ensureGuest, ensureAuth } = require('../middleware/auth');

// @desc    Show Login Page
// @route   GET /auth/login
router.get('/login', ensureGuest, (req, res) => {
    // Also add the flash message partial to the login page itself for errors
    res.render('auth/login', { title: 'Login' });
});

// @desc    Handle Login
// @route   POST /auth/login
router.post('/login', ensureGuest, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please try again.');
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please try again.');
            return res.redirect('/auth/login');
        }

        req.session.userId = user._id;
        // No success message needed here, as the welcome message on the dropdown serves this purpose.
        res.redirect('/user/dashboard');

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

// @desc    Handle Signup
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

        const newUser = new User({ name, email, password });
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(password, salt);
        await newUser.save();

        // Log the user in immediately after signup
        req.session.userId = newUser._id;
        
        // --- ADDED SUCCESS MESSAGE ---
        req.flash('success_msg', 'Welcome! Your account has been created successfully.');
        res.redirect('/user/dashboard');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Please try again.');
        res.redirect('/auth/signup');
    }
});

// @desc    Handle Logout
// @route   GET /auth/logout
router.get('/logout', ensureAuth, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            return res.redirect('/');
        }
        // We can't flash a message to the session we just destroyed.
        // A common workaround is to redirect with a query parameter,
        // but for simplicity, we'll just redirect to the login page.
        // A "You have logged out" message could be displayed on the login page based on this.
        res.clearCookie('connect.sid'); // Clear the session cookie
        // Redirecting to login page is clear feedback itself.
        res.redirect('/auth/login');
    });
});

module.exports = router;