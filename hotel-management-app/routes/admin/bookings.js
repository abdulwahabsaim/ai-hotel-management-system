const express = require('express');
const router = express.Router();
const axios = require('axios'); // Required for calling the AI service
const Booking = require('../../models/Booking');
const Room = require('../../models/Room');
const User = require('../../models/User');

// @desc    Display all bookings with status filter
// @route   GET /admin/bookings
router.get('/', async (req, res) => {
    try {
        let filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const bookings = await Booking.find(filter).populate('room').sort({ bookingDate: -1 });
        res.render('admin/bookings', {
            title: 'Manage Bookings',
            bookings,
            currentStatus: req.query.status || 'all'
        });
    } catch (err) {
        console.error(err);
        res.render('error', { title: 'Error', message: 'Error fetching bookings.' });
    }
});

// @desc    Show form to add a new manual booking (select by room type)
// @route   GET /admin/bookings/new
router.get('/new', async (req, res) => {
    try {
        const users = await User.find().lean();
        // We only need to pass the list of users to the form.
        res.render('admin/new-booking', { title: 'Add New Booking', users });
    } catch (err) {
        console.error(err);
        res.render('error', { title: 'Error', message: 'Error loading the new booking form.' });
    }
});

// @desc    Handle creation of manual booking using SMART ASSIGN AI
// @route   POST /admin/bookings
router.post('/', async (req, res) => {
    const { userId, roomType, checkIn, checkOut } = req.body;

    try {
        // --- Step 1: Find all available rooms of the selected type ---
        const availableRooms = await Room.find({ type: roomType, isAvailable: true }).lean();

        if (availableRooms.length === 0) {
            req.flash('error_msg', `Sorry, no available rooms of type '${roomType}' were found for the selected dates.`);
            return res.redirect('/admin/bookings/new');
        }

        // --- Step 2: Call the Python AI service to pick the best room ---
        // We also send all rooms to give the AI context about the hotel layout and occupancy.
        const allRooms = await Room.find({}).lean();
        
        let bestRoomId;
        try {
            console.log('Calling AI Smart Assign service...');
            const aiResponse = await axios.post('http://localhost:5000/smart-assign', {
                available_rooms: availableRooms,
                all_rooms: allRooms
            });
            bestRoomId = aiResponse.data.best_room_id;
        } catch (aiError) {
            console.error("AI Smart Assign service failed:", aiError.message);
            req.flash('error_msg', 'The AI service could not be reached. Assigning the first available room as a fallback.');
            // Fallback strategy: if the AI service is down, just pick the first available room.
            bestRoomId = availableRooms[0]._id;
        }
        
        // --- Step 3: Create the booking with the AI-selected room ---
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'Selected user not found.');
            return res.redirect('/admin/bookings/new');
        }
        
        await Booking.create({
            guestName: user.name,
            guestEmail: user.email,
            room: bestRoomId, // Use the ID returned by the AI (or the fallback)
            checkInDate: checkIn,
            checkOutDate: checkOut
        });

        // --- Step 4: Mark the selected room as unavailable in the database ---
        await Room.findByIdAndUpdate(bestRoomId, { isAvailable: false });

        const assignedRoom = await Room.findById(bestRoomId).lean();
        req.flash('success_msg', `Booking created! The AI has assigned Room #${assignedRoom.roomNumber}.`);
        res.redirect('/admin/bookings');

    } catch (err) {
        console.error("Error in booking creation process:", err);
        req.flash('error_msg', 'A server error occurred while creating the booking.');
        res.redirect('/admin/bookings/new');
    }
});

// @desc    Handle marking a booking as "Completed" (Check-Out)
// @route   POST /admin/bookings/:id/checkout
router.post('/:id/checkout', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (booking) {
            booking.status = 'Completed';
            await booking.save();
            // Make the room available again upon check-out.
            await Room.findByIdAndUpdate(booking.room, { isAvailable: true });
            req.flash('success_msg', 'Booking marked as completed and room is now available.');
        } else {
            req.flash('error_msg', 'Booking not found.');
        }
        res.redirect('/admin/bookings');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error processing check-out.');
        res.redirect('/admin/bookings');
    }
});

module.exports = router;