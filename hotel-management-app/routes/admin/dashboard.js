const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../../models/Booking'); // <-- CORRECTED PATH
const User = require('../../models/User');       // <-- CORRECTED PATH
const Room = require('../../models/Room');       // <-- CORRECTED PATH

// @desc    Admin Dashboard
// @route   GET /admin/dashboard
router.get('/', async (req, res) => {
    try {
        const totalBookings = await Booking.countDocuments();
        const totalUsers = await User.countDocuments();
        const availableRooms = await Room.countDocuments({ isAvailable: true });
        
        let prediction = 'Not available';
        try {
            const aiResponse = await axios.post('http://localhost:5000/predict', {
                month_to_predict: new Date().getMonth() + 2,
            });
            prediction = aiResponse.data.predicted_bookings;
        } catch (aiError) {
            console.error("AI Service Error:", aiError.message);
        }

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            totalBookings,
            totalUsers,
            availableRooms,
            predictedBookings: prediction
        });
    } catch (err) {
        console.error(err);
        res.render('error', { title: 'Error', message: 'Error loading dashboard.' });
    }
});

module.exports = router;