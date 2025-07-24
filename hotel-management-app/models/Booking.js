const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    guestName: { type: String, required: true },
    guestEmail: { type: String, required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    bookingDate: { type: Date, default: Date.now },
    // --- NEW FIELD ---
    status: {
        type: String,
        enum: ['Active', 'Canceled', 'Completed'],
        default: 'Active'
    }
});

// Virtual property to calculate total nights
BookingSchema.virtual('totalNights').get(function() {
    const diffTime = Math.abs(this.checkOutDate - this.checkInDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
});

// Virtual property to calculate total price
BookingSchema.virtual('totalPrice').get(function() {
    if (!this.room || !this.room.price) return 0; // Check if room is populated
    return this.totalNights * this.room.price;
});

// Ensure virtuals are included when converting to JSON/Object
BookingSchema.set('toObject', { virtuals: true });
BookingSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Booking', BookingSchema);