const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['guest', 'admin'], default: 'guest' },
    createdAt: { type: Date, default: Date.now },
    // --- NEW FIELDS FOR GUEST PREFERENCES ---
    preferredFloor: {
        type: String,
        enum: ['High Floor', 'Low Floor', 'No Preference'],
        default: 'No Preference'
    },
    roomLocation: {
        type: String,
        enum: ['Near Elevator', 'Away from Elevator', 'No Preference'],
        default: 'No Preference'
    },
    interests: {
        type: [String], // Array of strings
        default: []
    }
});

module.exports = mongoose.model('User', UserSchema);