const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Room = require('../../models/Room');

router.get('/', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalRooms = await Room.countDocuments();
        
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));
        const activeBookingsToday = await Booking.find({ status: 'Active', checkInDate: { $lte: endOfDay }, checkOutDate: { $gt: startOfDay } });
        const occupiedRoomIds = new Set(activeBookingsToday.map(b => b.room.toString()));
        const occupancyRate = totalRooms > 0 ? ((occupiedRoomIds.size / totalRooms) * 100).toFixed(1) : 0;
        
        const revenueResult = await Booking.aggregate([ { $match: { status: 'Completed' } }, { $lookup: { from: 'rooms', localField: 'room', foreignField: '_id', as: 'roomDetails' } }, { $unwind: '$roomDetails' }, { $project: { totalPrice: { $multiply: [ { $max: [1, { $ceil: { $divide: [{ $subtract: ["$checkOutDate", "$checkInDate"] }, 1000 * 60 * 60 * 24] } }] }, '$roomDetails.price' ] } } }, { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' } } } ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        const nextMonthDate = new Date();
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
        const nextMonth = nextMonthDate.getMonth() + 1;
        const year = nextMonthDate.getFullYear();
        
        const startOfNextMonth = new Date(year, nextMonth - 1, 1);
        const endOfNextMonth = new Date(year, nextMonth, 0, 23, 59, 59);

        let predictedBookings = 0;
        try {
            const aiResponse = await axios.post('http://localhost:5000/predict', { month_to_predict: nextMonth });
            predictedBookings = aiResponse.data.predicted_bookings;
        } catch (err) { console.error("AI Prediction service failed."); }

        const activeBookingsNextMonth = await Booking.countDocuments({
            status: 'Active',
            $or: [
                { checkInDate: { $lte: endOfNextMonth, $gte: startOfNextMonth } },
                { checkOutDate: { $gte: startOfNextMonth, $lte: endOfNextMonth } },
                { checkInDate: { $lt: startOfNextMonth }, checkOutDate: { $gt: endOfNextMonth } }
            ]
        });

        let priceSuggestion = { suggestion_percent: 0, reason: 'AI service unavailable.' };
        try {
            const suggestionResponse = await axios.post('http://localhost:5000/dynamic-price-suggestion', {
                predicted_bookings_next_month: predictedBookings,
                active_bookings_next_month: activeBookingsNextMonth,
                total_rooms: totalRooms
            });
            priceSuggestion = suggestionResponse.data;
        } catch (err) { console.error("AI Pricing Suggestion service failed."); }


        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            totalRevenue,
            totalUsers,
            occupancyRate,
            predictedBookings, // Pass the prediction
            priceSuggestion    // Pass the suggestion
        });

    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.render('error', { title: 'Error', message: 'Error loading the admin dashboard.' });
    }
});

module.exports = router;