const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking'); // <-- CORRECTED PATH
const Room = require('../../models/Room');       // <-- CORRECTED PATH
const User = require('../../models/User');       // <-- CORRECTED PATH

// @desc    Display all bookings with filter
// @route   GET /admin/bookings
router.get('/', async (req, res) => {
    try {
        let filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const bookings = await Booking.find(filter).populate('room').sort({ bookingDate: -1 });
        res.render('admin/bookings', { title: 'Manage Bookings', bookings, currentStatus: req.query.status || 'all' });
    } catch (err) {
        res.render('error', { title: 'Error', message: 'Error fetching bookings.' });
    }
});

// @desc    Show form to add a new booking manually
// @route   GET /admin/bookings/new
router.get('/new', async (req, res) => {
    try {
        const users = await User.find().lean();
        const rooms = await Room.find({ isAvailable: true }).lean();
        res.render('admin/new-booking', { title: 'Add New Booking', users, rooms });
    } catch (err) {
        res.render('error', { title: 'Error', message: 'Error loading form.' });
    }
});

// @desc    Handle creation of manual booking
// @route   POST /admin/bookings
router.post('/', async (req, res) => {
    try {
        const { userId, roomId, checkIn, checkOut } = req.body;
        const user = await User.findById(userId);
        await Booking.create({ guestName: user.name, guestEmail: user.email, room: roomId, checkInDate: checkIn, checkOutDate: checkOut });
        await Room.findByIdAndUpdate(roomId, { isAvailable: false });
        req.flash('success_msg', 'Booking created successfully.');
        res.redirect('/admin/bookings');
    } catch (err) {
        req.flash('error_msg', 'Error creating booking.');
        res.redirect('/admin/bookings/new');
    }
});

// @desc    Handle Check-Out
// @route   POST /admin/bookings/:id/checkout
router.post('/:id/checkout', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (booking) {
            booking.status = 'Completed';
            await booking.save();
            await Room.findByIdAndUpdate(booking.room, { isAvailable: true });
            req.flash('success_msg', 'Booking marked as completed.');
        }
        res.redirect('/admin/bookings');
    } catch (err) {
        req.flash('error_msg', 'Error processing check-out.');
        res.redirect('/admin/bookings');
    }
});

module.exports = router;