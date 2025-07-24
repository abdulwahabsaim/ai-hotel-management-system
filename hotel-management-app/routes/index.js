const express = require('express');
const router = express.Router();

// Home page
router.get('/', (req, res) => {
    res.render('index', { title: 'Welcome to AI Hotel' });
});

// Gallery page
router.get('/gallery', (req, res) => {
    res.render('gallery', { title: 'Our Gallery' });
});

// Handle availability search (temporary)
router.get('/rooms/search', (req, res) => {
    res.redirect('/rooms');
});

module.exports = router;