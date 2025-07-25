const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Room = require('../../models/Room');

/**
 * @route   GET /admin/dashboard
 * @desc    Display the main admin dashboard with KPIs and AI predictions.
 * @access  Private (Admin only)
 */
router.get('/', async (req, res) => {
    try {
        // --- Fetch Base Metrics ---
        const totalUsers = await User.countDocuments();
        const totalRooms = await Room.countDocuments();
        const availableRooms = await Room.countDocuments({ isAvailable: true });

        // --- 1. Calculate Occupancy Rate ---
        // (Occupied Rooms / Total Rooms) * 100
        const occupiedRooms = totalRooms - availableRooms;
        const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0;

        // --- 2. Calculate Total Revenue from COMPLETED Bookings ---
        // Use MongoDB Aggregation Pipeline for efficiency
        const revenueResult = await Booking.aggregate([
            {
                $match: { status: 'Completed' } // Only calculate revenue from completed stays
            },
            {
                $lookup: { // Join with rooms collection to get price per night
                    from: 'rooms',
                    localField: 'room',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            {
                $unwind: '$roomDetails' // Flatten the roomDetails array
            },
            {
                $project: { // Calculate the price for each booking
                    totalPrice: {
                        $multiply: [
                            { // Calculate total nights
                                $ceil: {
                                    $divide: [
                                        { $subtract: ["$checkOutDate", "$checkInDate"] },
                                        1000 * 60 * 60 * 24 // milliseconds in a day
                                    ]
                                }
                            },
                            '$roomDetails.price' // room price
                        ]
                    }
                }
            },
            {
                $group: { // Sum up the prices of all matched bookings
                    _id: null,
                    totalRevenue: { $sum: '$totalPrice' }
                }
            }
        ]);
        // Extract the final value, defaulting to 0 if no completed bookings exist
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // --- 3. Get AI Prediction ---
        let prediction = 'N/A';
        try {
            const nextMonth = new Date().getMonth() + 2; // +1 for 0-index, +1 for next month
            const aiResponse = await axios.post('http://localhost:5000/predict', {
                // Handle year wrap-around for December
                month_to_predict: nextMonth > 12 ? 1 : nextMonth,
            });
            prediction = aiResponse.data.predicted_bookings;
        } catch (aiError) {
            console.error("Could not connect to AI Service for prediction:", aiError.message);
            // The dashboard will still render, but with 'N/A' for the prediction
        }

        // --- Render the Dashboard View with all calculated data ---
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            totalRevenue,
            totalUsers,
            availableRooms,
            occupancyRate,
            predictedBookings: prediction
        });

    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.render('error', { title: 'Error', message: 'Error loading the admin dashboard.' });
    }
});

module.exports = router;