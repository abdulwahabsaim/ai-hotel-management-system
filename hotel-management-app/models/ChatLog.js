const mongoose = require('mongoose');

const ChatLogSchema = new mongoose.Schema({
    userInput: {
        type: String,
        required: true,
        trim: true
    },
    aiResponse: {
        type: String,
        required: true
    },
    intent: {
        type: String,
        default: 'general_question'
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ChatLog', ChatLogSchema);