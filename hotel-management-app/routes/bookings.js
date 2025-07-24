const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const { ensureAuth } = require('../middleware/auth');

/**
 * @route   GET /bookings/new/:roomId
 * @desc    Show the form to book a specific room.
 * @access  Private (User must be logged in)
 */
router.get('/new/:roomId', ensureAuth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.roomId);
        if (!room) {
            req.flash('error_msg', 'The requested room could not be found.');
            return res.redirect('/rooms');
        }
        // This page is obsolete now as booking is on room-detail page, but kept for legacy
        // A better approach would be to remove this route and view entirely.
        res.render('book', { 
            title: `Book Room ${room.roomNumber}`, 
            room 
        });
    } catch (err) {
        console.error('Error fetching room for booking:', err);
        req.flash('error_msg', 'A server error occurred.');
        res.redirect('/rooms');
    }
});

/**
 * @route   POST /bookings
 * @desc    Process the booking form submission from the room-detail page.
 * @access  Private (User must be logged in)
 */
router.post('/', ensureAuth, async (req, res) => {
    const { roomId, checkIn, checkOut } = req.body;
    const { name, email } = req.user;

    try {
        const room = await Room.findById(roomId);

        // --- Validation Checks with Flash Messages ---
        if (!room) {
            req.flash('error_msg', 'The room you tried to book does not exist.');
            return res.redirect('/rooms'); // Redirect to main rooms list if room is invalid
        }

        if (!room.isAvailable) {
            req.flash('error_msg', 'Sorry! That room is no longer available. Please choose another.');
            return res.redirect('/rooms');
        }
        
        if (!checkIn || !checkOut || new Date(checkIn) >= new Date(checkOut)) {
            req.flash('error_msg', 'Invalid check-in or check-out dates provided. Please try again.');
            // Redirect back to the specific room detail page so user can retry
            return res.redirect(`/rooms/${roomId}`);
        }
        
        // --- Process Booking ---
        const newBooking = new Booking({
            guestName: name,
            guestEmail: email,
            room: roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
        });

        await newBooking.save();
        
        // Update room status
        room.isAvailable = false;
        await room.save();
        
        // Set the success flash message
        req.flash('success_msg', `Booking confirmed! Room ${room.roomNumber} is yours.`);
        
        // Redirect to the user's dashboard to see the new booking
        res.redirect('/user/dashboard');

    } catch (err) {
        console.error('Error creating booking:', err);
        req.flash('error_msg', 'A server error occurred while processing your booking.');
        res.redirect('/rooms');
    }
});

module.exports = router;