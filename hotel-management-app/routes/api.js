const express = require('express');
const router = express.Router();
const axios = require('axios');
const ChatLog = require('../models/ChatLog');

// Proxy for the AI Concierge
router.post('/chat', async (req, res) => {
    const { message, history } = req.body; // <-- NEW: Get history from request

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        const aiResponse = await axios.post('http://localhost:5000/chat', {
            message,
            history: history || [], // <-- NEW: Pass history to Python
            token: process.env.GITHUB_TOKEN 
        });

        res.json(aiResponse.data);

    } catch (error) {
        console.error('Error proxying to AI service:', error.message);
        if (error.response && error.response.data) {
             return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: 'Failed to connect to the AI service.' });
    }
});

// Endpoint for the Python service to log chat interactions
router.post('/log-chat', async (req, res) => {
    try {
        const { userInput, aiResponse, intent } = req.body;
        if (!userInput || !aiResponse) {
            return res.status(400).json({ error: 'User input and AI response are required for logging.' });
        }
        const log = new ChatLog({ userInput, aiResponse, intent });
        await log.save();
        res.status(201).json({ success: true, message: 'Chat logged successfully.' });
    } catch (error) {
        console.error('Error logging chat:', error);
        res.status(500).json({ success: false, message: 'Failed to log chat.' });
    }
});

module.exports = router;