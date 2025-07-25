const express = require('express');
const router = express.Router();
const { spawn } = require('child_process'); // Use 'spawn' for non-blocking processes
const path = require('path');
const Booking = require('../../models/Booking');

// @desc    Provide aggregated data for dashboard charts
// @route   GET /admin/api/chart-data
router.get('/chart-data', async (req, res) => {
    try {
        // This aggregation pipeline calculates total revenue per month for completed or active stays.
        // It groups by the month the stay BEGAN (checkInDate).
        const monthlyRevenue = await Booking.aggregate([
            {
                $match: { status: { $in: ['Active', 'Completed'] } }
            },
            {
                $lookup: { from: 'rooms', localField: 'room', foreignField: '_id', as: 'roomDetails' }
            },
            { $unwind: '$roomDetails' },
            {
                $project: {
                    month: { $month: "$checkInDate" },
                    totalPrice: {
                        $multiply: [
                            { $max: [1, { $ceil: { $divide: [{ $subtract: ["$checkOutDate", "$checkInDate"] }, 1000 * 60 * 60 * 24] } }] },
                            '$roomDetails.price'
                        ]
                    }
                }
            },
            {
                $group: { _id: '$month', totalRevenue: { $sum: '$totalPrice' } }
            },
            { $sort: { '_id': 1 } }
        ]);

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const chartData = new Array(12).fill(0);
        monthlyRevenue.forEach(item => {
            chartData[item._id - 1] = item.totalRevenue;
        });
        
        res.json({
            labels,
            revenueData: chartData
        });

    } catch (err) {
        console.error("Chart data API error:", err);
        res.status(500).json({ error: 'Server error retrieving chart data.' });
    }
});


// @desc    Trigger the AI model training script as a background process
// @route   POST /admin/api/retrain-ai
router.post('/retrain-ai', (req, res) => {
    // Define the absolute path to the ai_service directory
    const aiServicePath = path.join(__dirname, '..', '..', '..', 'ai_service');
    
    // Define the command and arguments based on the operating system
    let command;
    let args;

    if (process.platform === 'win32') {
        command = 'cmd';
        args = ['/c', `venv\\Scripts\\activate && python train.py`];
    } else { // For macOS/Linux
        command = 'bash';
        args = ['-c', `source venv/bin/activate && python train.py`];
    }
    
    // --- THE FIX: Immediately respond to the browser ---
    // This tells the frontend that the process has started successfully.
    res.status(202).json({ 
        success: true, 
        message: 'AI model retraining has been initiated successfully. This will run in the background.'
    });

    // --- Spawn the process in the background ---
    console.log('Spawning AI training script in the background...');
    const child = spawn(command, args, { 
        cwd: aiServicePath, // Set the correct working directory
        shell: true,        // Necessary for commands like 'source' and '&&'
        detached: true,     // Detach the child from the parent Node.js process
        stdio: 'ignore'     // We don't need to pipe input/output
    });

    // Allow the Node.js process to exit independently of the child
    child.unref();

    // Optional: Log events for debugging purposes on the server console
    child.on('error', (error) => {
        console.error(`[AI Training] Failed to start subprocess: ${error.message}`);
    });

    child.on('exit', (code) => {
        if (code === 0) {
            console.log(`[AI Training] Subprocess completed successfully.`);
        } else {
            console.error(`[AI Training] Subprocess exited with error code ${code}.`);
        }
    });
});


module.exports = router;