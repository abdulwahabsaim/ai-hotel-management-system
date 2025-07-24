const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['Single', 'Double', 'Suite'], required: true },
    price: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true },
    // --- NEW FIELDS ---
    description: {
        type: String,
        required: true,
        default: 'A beautiful and comfortable room.'
    },
    images: { // An array to store paths to multiple images
        type: [String],
        required: true
    },
    amenities: { // An array of amenities for this specific room
        type: [String],
        required: true,
        default: ['Free WiFi', 'Air Conditioning', 'Flat-screen TV']
    }
});

module.exports = mongoose.model('Room', RoomSchema);