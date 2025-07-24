const express = require('express');
const router = express.Router();

// Import the specialized routers
const dashboardRouter = require('./admin/dashboard');
const usersRouter = require('./admin/users');
const bookingsRouter = require('./admin/bookings');

// --- Define URL prefixes for each router ---

// Any URL starting with /admin/dashboard will be handled by dashboardRouter
router.use('/dashboard', dashboardRouter);

// Any URL starting with /admin/users will be handled by usersRouter
router.use('/users', usersRouter);

// Any URL starting with /admin/bookings will be handled by bookingsRouter
router.use('/bookings', bookingsRouter);

// A helpful redirect for the base /admin URL
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

module.exports = router;