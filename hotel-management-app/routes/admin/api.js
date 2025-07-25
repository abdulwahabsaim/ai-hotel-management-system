const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking');
const Room = require('../../models/Room');

// @desc    Provide data for dashboard charts
// @route   GET /admin/api/chart-data
router.get('/chart-data', async (req, res) => {
    try {
        // --- 1. Monthly Revenue Calculation ---
        const monthlyRevenue = await Booking.aggregate([
            {
                $match: { status: { $in: ['Active', 'Completed'] } } // Only count revenue from non-canceled bookings
            },
            {
                $lookup: { // Join with the rooms collection to get the price
                    from: 'rooms',
                    localField: 'room',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            { $unwind: '$roomDetails' }, // Deconstruct the roomDetails array
            {
                $project: {
                    month: { $month: "$bookingDate" },
                    // Calculate total nights for each booking
                    totalNights: {
                        $ceil: {
                            $divide: [
                                { $subtract: ["$checkOutDate", "$checkInDate"] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    },
                    price: '$roomDetails.price'
                }
            },
            {
                $group: {
                    _id: '$month', // Group by month number (1-12)
                    totalRevenue: { $sum: { $multiply: ['$totalNights', '$price'] } } // Sum up the revenue for the month
                }
            },
            { $sort: { '_id': 1 } } // Sort by month
        ]);

        // Format data for Chart.js
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const chartData = new Array(12).fill(0);
        monthlyRevenue.forEach(item => {
            chartData[item._id - 1] = item.totalRevenue; // a
        });
        
        res.json({
            labels,
            revenueData: chartData
        });

    } catch (err) {
        console.error("Chart data API error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;