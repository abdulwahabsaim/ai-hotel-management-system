const express = require('express');
const router = express.Router();
const User = require('../../models/User'); // <-- CORRECTED PATH

// @desc    Display all users with search
// @route   GET /admin/users
router.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search || '';
        let query = {};
        if (searchQuery) {
            query = { $or: [{ name: { $regex: searchQuery, $options: 'i' } }, { email: { $regex: searchQuery, $options: 'i' } }] };
        }
        const users = await User.find(query);
        res.render('admin/users', { title: 'Manage Users', users, searchQuery });
    } catch (err) {
        res.render('error', { title: 'Error', message: 'Error fetching users.' });
    }
});

// @desc    Update user role
// @route   POST /admin/users/:id/role
router.post('/:id/role', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
        req.flash('success_msg', 'User role updated.');
        res.redirect('/admin/users');
    } catch (err) {
        req.flash('error_msg', 'Error updating user role.');
        res.redirect('/admin/users');
    }
});

module.exports = router;