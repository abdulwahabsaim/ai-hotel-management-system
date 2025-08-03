const express = require('express');
const router = express.Router();
const axios = require('axios');

// This route will be public-facing
router.post('/chat', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        // Here, we securely add the GITHUB_TOKEN from our server's environment
        // and forward the request to the Python AI service.
        const aiResponse = await axios.post('http://localhost:5000/chat', {
            message: userMessage,
            token: process.env.GITHUB_TOKEN 
        });

        res.json(aiResponse.data);

    } catch (error) {
        console.error('Error proxying to AI service:', error.message);
        // Pass the error from the Python service to the frontend if it exists
        if (error.response && error.response.data) {
             return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: 'Failed to connect to the AI service.' });
    }
});

module.exports = router;