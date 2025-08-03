const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['Single', 'Double', 'Suite'], required: true },
    price: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true },
    description: {
        type: String,
        required: true,
        default: 'A beautiful and comfortable room.'
    },
    images: {
        type: [String],
        required: true
    },
    // ++ CHANGED: Now an array to support multiple tours ++
    virtualTourImages: {
        type: [String],
        default: [] 
    },
    amenities: {
        type: [String],
        required: true,
        default: ['Free WiFi', 'Air Conditioning', 'Flat-screen TV']
    }
});

module.exports = mongoose.model('Room', RoomSchema);