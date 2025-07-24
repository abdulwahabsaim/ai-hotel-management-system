const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');

// @desc    Show all rooms (the main room listing page)
// @route   GET /rooms
router.get('/', async (req, res) => {
    try {
        const rooms = await Room.find({});
        res.render('rooms', { title: 'Our Rooms', rooms });
    } catch (err) {
        console.error(err);
        res.render('error', { message: 'Error fetching rooms.' });
    }
});

// @desc    Show single room detail page
// @route   GET /rooms/:id
router.get('/:id', async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) {
            return res.status(404).render('error', { message: 'Room not found.' });
        }
        
        // --- Availability Logic ---
        // Find all bookings for this room that have not ended yet.
        const bookings = await Booking.find({ 
            room: room._id, 
            checkOutDate: { $gte: new Date() } 
        });

        // We will pass the bookings to the view to handle date disabling.
        // For a full-blown calendar, a more complex library would be needed.
        
        res.render('room-detail', { 
            title: `${room.type} Room`, 
            room,
            bookings // Pass bookings to the view
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Server error.' });
    }
});

module.exports = router;