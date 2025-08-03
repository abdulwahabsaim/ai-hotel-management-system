const express = require('express');
const router = express.Router();
const Room = require('../../models/Room');

// @desc    Display all rooms for management
router.get('/', async (req, res) => {
    try {
        const rooms = await Room.find().sort({ roomNumber: 'asc' });
        res.render('admin/rooms/index', { title: 'Manage Rooms', rooms });
    } catch (err) {
        console.error(err);
        res.render('error', { title: 'Error', message: 'Error fetching rooms.' });
    }
});

// @desc    Show page to create a new room
router.get('/new', (req, res) => {
    res.render('admin/rooms/new', { title: 'Add New Room' });
});

// @desc    Handle creation of a new room
router.post('/', async (req, res) => {
    try {
        const { roomNumber, type, price, description, amenities, images, virtualTourImages } = req.body;
        
        if (!roomNumber || !type || !price) {
            req.flash('error_msg', 'Room Number, Type, and Price are required.');
            return res.redirect('/admin/rooms/new');
        }
        await Room.create({
            roomNumber, type, price, description,
            amenities: amenities ? amenities.split(',').map(item => item.trim()) : [],
            images: images ? images.split(',').map(item => item.trim()) : [],
            virtualTourImages: virtualTourImages ? virtualTourImages.split(',').map(item => item.trim()).filter(url => url) : []
        });
        req.flash('success_msg', 'New room has been created successfully.');
        res.redirect('/admin/rooms');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error creating room. The room number might already exist.');
        res.redirect('/admin/rooms/new');
    }
});

// @desc    Show page to edit a room
router.get('/edit/:id', async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) {
            req.flash('error_msg', 'Room not found.');
            return res.redirect('/admin/rooms');
        }
        res.render('admin/rooms/edit', { title: `Edit Room ${room.roomNumber}`, room });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/rooms');
    }
});

// @desc    Handle updating a room
router.put('/:id', async (req, res) => {
    try {
        const { roomNumber, type, price, description, amenities, images, isAvailable, virtualTourImages } = req.body;
        
        await Room.findByIdAndUpdate(req.params.id, {
            roomNumber, type, price, description,
            amenities: amenities ? amenities.split(',').map(item => item.trim()) : [],
            images: images ? images.split(',').map(item => item.trim()) : [],
            isAvailable: isAvailable === 'true',
            virtualTourImages: virtualTourImages ? virtualTourImages.split(',').map(item => item.trim()).filter(url => url) : []
        });
        req.flash('success_msg', 'Room updated successfully.');
        res.redirect('/admin/rooms');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating room.');
        res.redirect(`/admin/rooms/edit/${req.params.id}`);
    }
});

// @desc    Handle deleting a room
router.delete('/:id', async (req, res) => {
    try {
        await Room.deleteOne({ _id: req.params.id });
        req.flash('success_msg', 'Room has been deleted.');
        res.redirect('/admin/rooms');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error deleting room.');
        res.redirect('/admin/rooms');
    }
});

module.exports = router;