const express = require('express');
const router = express.Router();
const axios = require('axios');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const { ensureAuth } = require('../middleware/auth');

// --- Step 1: Pre-Booking and AI Analysis ---
// This route now finds options, calls the AI, and redirects to the confirmation page.
router.post('/', ensureAuth, async (req, res) => {
    const { roomId, checkIn, checkOut } = req.body;

    if (!checkIn || !checkOut || new Date(checkIn) >= new Date(checkOut)) {
        req.flash('error_msg', 'Invalid check-in or check-out dates.');
        return res.redirect(`/rooms/${roomId}`);
    }

    try {
        const requestedRoom = await Room.findById(roomId);
        const roomType = requestedRoom.type;

        // Find all truly available rooms for the requested dates
        const allRoomsOfSameType = await Room.find({ type: roomType }).select('_id').lean();
        const roomIdsOfSameType = allRoomsOfSameType.map(r => r._id);
        const overlappingBookings = await Booking.find({
            room: { $in: roomIdsOfSameType },
            status: 'Active',
            $or: [
                { checkInDate: { $lt: new Date(checkOut), $gte: new Date(checkIn) } },
                { checkOutDate: { $gt: new Date(checkIn), $lte: new Date(checkOut) } },
                { checkInDate: { $lte: new Date(checkIn) }, checkOutDate: { $gte: new Date(checkOut) } }
            ]
        }).select('room').lean();
        const occupiedRoomIds = new Set(overlappingBookings.map(b => b.room.toString()));
        const availableRooms = await Room.find({ type: roomType, _id: { $nin: Array.from(occupiedRoomIds) } }).lean();

        if (availableRooms.length === 0) {
            req.flash('error_msg', `Sorry, all of our '${roomType}' rooms are booked for those dates.`);
            return res.redirect('/rooms');
        }

        // If only one room is available, book it directly without showing options.
        if (availableRooms.length === 1) {
            const roomToBookId = availableRooms[0]._id;
            await Booking.create({ guestName: req.user.name, guestEmail: req.user.email, room: roomToBookId, checkInDate, checkOutDate });
            req.flash('success_msg', `Booking confirmed! You got the last available '${roomType}' room: Room #${availableRooms[0].roomNumber}.`);
            return res.redirect('/user/dashboard');
        }

        // If multiple rooms are available, call the AI
        let aiRecommendedRoomId = null;
        try {
            const allRoomsForContext = await Room.find({}).lean();
            const simpleAllRooms = allRoomsForContext.map(r => ({ roomNumber: r.roomNumber, isAvailable: !occupiedRoomIds.has(r._id.toString()) }));
            const aiResponse = await axios.post('http://localhost:5000/smart-assign', {
                available_rooms: availableRooms,
                all_rooms: simpleAllRooms
            });
            aiRecommendedRoomId = aiResponse.data.best_room_id;
        } catch (err) {
            console.error("AI service call failed, proceeding without recommendation.");
        }

        // --- Store the options in the user's session ---
        req.session.bookingOptions = {
            availableRooms,
            aiRecommendedRoomId,
            checkIn,
            checkOut,
            roomType
        };

        // Redirect to the confirmation page
        res.redirect('/bookings/confirm');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'A server error occurred.');
        res.redirect('/rooms');
    }
});

// --- Step 2: Display the Confirmation Page ---
// This route reads the data from the session and renders the new view.
router.get('/confirm', ensureAuth, (req, res) => {
    if (!req.session.bookingOptions) {
        req.flash('error_msg', 'Your booking session has expired. Please try again.');
        return res.redirect('/rooms');
    }

    const { availableRooms, aiRecommendedRoomId, checkIn, checkOut, roomType } = req.session.bookingOptions;
    
    const aiChoice = aiRecommendedRoomId ? availableRooms.find(r => r._id.toString() === aiRecommendedRoomId) : null;
    
    res.render('confirm-booking', {
        title: 'Confirm Your Booking',
        availableRooms,
        aiChoice,
        checkIn,
        checkOut,
        roomType
    });
});

// --- Step 3: Finalize the Booking ---
// This route handles the form submission from the confirmation page.
router.post('/finalize', ensureAuth, async (req, res) => {
    const { roomId, checkIn, checkOut } = req.body;
    
    // Clear the booking options from the session to prevent re-use
    if (req.session.bookingOptions) {
        delete req.session.bookingOptions;
    }

    try {
        await Booking.create({
            guestName: req.user.name,
            guestEmail: req.user.email,
            room: roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut
        });
        
        const bookedRoom = await Room.findById(roomId).lean();
        req.flash('success_msg', `Booking complete! You have successfully booked Room #${bookedRoom.roomNumber}.`);
        res.redirect('/user/dashboard');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'A server error occurred while finalizing your booking.');
        res.redirect('/rooms');
    }
});


module.exports = router;