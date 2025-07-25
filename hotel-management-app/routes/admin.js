// in hotel-management-app/routes/admin.js

const express = require('express');
const router = express.Router();

// Import the specialized routers
const dashboardRouter = require('./admin/dashboard');
const usersRouter = require('./admin/users');
const bookingsRouter = require('./admin/bookings');
const roomsRouter = require('./admin/rooms');
const apiRouter = require('./admin/api'); // <-- ADD THIS

// --- Define URL prefixes for each router ---
router.use('/dashboard', dashboardRouter);
router.use('/users', usersRouter);
router.use('/bookings', bookingsRouter);
router.use('/rooms', roomsRouter);
router.use('/api', apiRouter); // <-- ADD THIS

router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

module.exports = router;