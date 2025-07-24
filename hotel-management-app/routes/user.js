const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { ensureAuth } = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Room = require('../models/Room');

// @desc    Display the user's dashboard with their bookings
// @route   GET /user/dashboard
router.get('/dashboard', ensureAuth, async (req, res) => {
    try {
        const bookings = await Booking.find({ guestEmail: req.user.email })
            .populate('room')
            .sort({ checkInDate: -1 });
        res.render('user/dashboard', {
            title: 'My Dashboard',
            bookings
        });
    } catch (err) {
        console.error(err);
        res.render('error', { title: 'Error', message: 'Could not fetch your bookings.' });
    }
});

// @desc    Display the user profile page
// @route   GET /user/profile
router.get('/profile', ensureAuth, (req, res) => {
    res.render('user/profile', {
        title: 'My Profile'
    });
});

// @desc    Handle updating user profile information (name)
// @route   POST /user/profile
router.post('/profile', ensureAuth, async (req, res) => {
    try {
        const { name } = req.body;
        // Find user by their ID (from req.user) and update their name
        await User.findByIdAndUpdate(req.user._id, { name: name });
        req.flash('success_msg', 'Your profile has been updated successfully.');
        res.redirect('/user/profile');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Could not update profile.');
        res.redirect('/user/profile');
    }
});

// @desc    Handle changing user password
// @route   POST /user/password
router.post('/password', ensureAuth, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        req.flash('error_msg', 'New passwords do not match.');
        return res.redirect('/user/profile');
    }
    if (newPassword.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long.');
        return res.redirect('/user/profile');
    }

    try {
        const user = await User.findById(req.user._id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash('error_msg', 'Incorrect current password.');
            return res.redirect('/user/profile');
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        req.flash('success_msg', 'Password changed successfully.');
        res.redirect('/user/profile');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Could not change password.');
        res.redirect('/user/profile');
    }
});

// @desc    Handle cancellation of a booking
// @route   PUT /user/booking/cancel/:id
router.put('/booking/cancel/:id', ensureAuth, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking || booking.guestEmail !== req.user.email) {
            req.flash('error_msg', 'Booking not found or you are not authorized to cancel it.');
            return res.redirect('/user/dashboard');
        }
        
        // Cancellation is only allowed more than 48 hours before check-in.
        const canCancel = new Date(booking.checkInDate) > new Date(Date.now() + 48 * 60 * 60 * 1000);
        if (!canCancel) {
            req.flash('error_msg', 'This booking cannot be canceled as it is within 48 hours of check-in.');
            return res.redirect('/user/dashboard');
        }

        booking.status = 'Canceled';
        await booking.save();

        // Make the room available again.
        await Room.findByIdAndUpdate(booking.room, { isAvailable: true });

        req.flash('success_msg', 'Your booking has been successfully canceled.');
        res.redirect('/user/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Could not cancel booking.');
        res.redirect('/user/dashboard');
    }
});

// @desc    Display a printable invoice for a booking
// @route   GET /user/invoice/:id
router.get('/invoice/:id', ensureAuth, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('room');

        if (!booking || booking.guestEmail !== req.user.email) {
            req.flash('error_msg', 'Invoice not found.');
            return res.redirect('/user/dashboard');
        }

        res.render('user/invoice', { booking });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Could not retrieve invoice.');
        res.redirect('/user/dashboard');
    }
});

module.exports = router;