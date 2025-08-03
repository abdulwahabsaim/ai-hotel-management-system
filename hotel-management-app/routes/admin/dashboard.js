const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Room = require('../../models/Room');
const ChatLog = require('../../models/ChatLog');

router.get('/', async (req, res) => {
    try {
        // --- Fetch all primary data in parallel for speed ---
        const [
            totalUsers,
            totalRooms,
            activeBookingsToday,
            revenueResult,
            totalChatInteractions,
            topQuestions
        ] = await Promise.all([
            User.countDocuments(),
            Room.countDocuments(),
            Booking.find({ status: 'Active', checkInDate: { $lte: new Date() }, checkOutDate: { $gt: new Date() } }),
            Booking.aggregate([ { $match: { status: 'Completed' } }, { $lookup: { from: 'rooms', localField: 'room', foreignField: '_id', as: 'roomDetails' } }, { $unwind: '$roomDetails' }, { $project: { totalPrice: { $multiply: [ { $max: [1, { $ceil: { $divide: [{ $subtract: ["$checkOutDate", "$checkInDate"] }, 1000 * 60 * 60 * 24] } }] }, '$roomDetails.price' ] } } }, { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' } } } ]),
            ChatLog.countDocuments(),
            ChatLog.aggregate([ { $match: { intent: 'general_question' } }, { $group: { _id: "$userInput", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 } ])
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
        const occupiedRoomIds = new Set(activeBookingsToday.map(b => b.room.toString()));
        const occupancyRate = totalRooms > 0 ? ((occupiedRoomIds.size / totalRooms) * 100).toFixed(1) : 0;

        // --- Make a SINGLE consolidated call to the AI Service ---
        let predictedBookings = 0;
        let priceSuggestion = { suggestion_percent: 0, reason: 'AI service unavailable.' };
        
        try {
            // Prepare data for the AI service
            const nextMonthDate = new Date();
            nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
            const month_to_predict = nextMonthDate.getMonth() + 1;
            const year = nextMonthDate.getFullYear();
            const startOfNextMonth = new Date(year, month_to_predict - 1, 1);
            const endOfNextMonth = new Date(year, month_to_predict, 0, 23, 59, 59);
            const active_bookings_next_month = await Booking.countDocuments({
                status: 'Active',
                $or: [
                    { checkInDate: { $lte: endOfNextMonth, $gte: startOfNextMonth } },
                    { checkOutDate: { $gte: startOfNextMonth, $lte: endOfNextMonth } },
                    { checkInDate: { $lt: startOfNextMonth }, checkOutDate: { $gt: endOfNextMonth } }
                ]
            });

            // Make the single API call
            const aiResponse = await axios.post('http://localhost:5000/dashboard-stats', {
                month_to_predict,
                active_bookings_next_month,
                total_rooms: totalRooms
            });
            
            predictedBookings = aiResponse.data.predicted_bookings;
            priceSuggestion = aiResponse.data.price_suggestion;

        } catch (err) { 
            console.error("AI Dashboard Stats service failed:", err.message);
        }

        // --- Render the view with all collected data ---
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            totalRevenue,
            totalUsers,
            occupancyRate,
            predictedBookings,
            priceSuggestion,
            totalChatInteractions,
            topQuestions
        });

    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.render('error', { title: 'Error', message: 'Error loading the admin dashboard.' });
    }
});

module.exports = router;