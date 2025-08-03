const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');

// @desc    Show all rooms & handle availability search
// @route   GET /rooms
router.get('/', async (req, res) => {
    try {
        const { checkIn, checkOut } = req.query;
        let allRooms = await Room.find({}).sort({ roomNumber: 'asc' }).lean();

        // If user has provided dates, calculate real-time availability for them
        if (checkIn && checkOut) {
            const checkInDate = new Date(checkIn);
            const checkOutDate = new Date(checkOut);

            // Find all bookings that overlap with the user's desired date range
            const overlappingBookings = await Booking.find({
                status: 'Active',
                $or: [
                    { checkInDate: { $lt: checkOutDate, $gte: checkInDate } },
                    { checkOutDate: { $gt: checkInDate, $lte: checkOutDate } },
                    { checkInDate: { $lte: checkInDate }, checkOutDate: { $gte: checkOutDate } }
                ]
            }).select('room').lean();

            const occupiedRoomIds = new Set(overlappingBookings.map(b => b.room.toString()));

            // Add a dynamic 'availability' status to each room object
            allRooms = allRooms.map(room => {
                return {
                    ...room,
                    isAvailableForDates: !occupiedRoomIds.has(room._id.toString())
                };
            });
        }

        res.render('rooms', {
            title: 'Our Rooms',
            rooms: allRooms,
            // Pass the search dates back to the view to keep them in the form
            query: req.query
        });
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
        
        // Find all active bookings for THIS room to disable dates on the calendar
        const bookings = await Booking.find({ room: room._id, status: 'Active' });
        
        // Format dates for Flatpickr. We get check-in and day before check-out
        const disabledDates = bookings.flatMap(b => {
            let dates = [];
            let currentDate = new Date(b.checkInDate);
            while (currentDate < b.checkOutDate) {
                dates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return dates;
        });
        
        res.render('room-detail', { 
            title: `${room.type} Room`, 
            room,
            query: req.query,
            disabledDates: JSON.stringify(disabledDates) // Pass dates to the view
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Server error.' });
    }
});

module.exports = router;