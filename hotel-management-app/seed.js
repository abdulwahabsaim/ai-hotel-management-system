require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/database');
const Room = require('./models/Room');
const User = require('./models/User');
const Booking = require('./models/Booking');

connectDB();

const seedDB = async () => {
    try {
        console.log('Clearing old data...');
        await Booking.deleteMany({});
        await Room.deleteMany({});
        await User.deleteMany({});

        // --- 1. SEED ROOMS ---
        console.log('Seeding rooms...');
        const roomData = [
            { roomNumber: '101', type: 'Single', price: 95, description: 'A cozy single room.', images: ['/img/single/1.jpg'], amenities: ['WiFi', 'TV'] },
            { roomNumber: '102', type: 'Single', price: 95, description: 'A cozy single room.', images: ['/img/single/1.jpg'], amenities: ['WiFi', 'TV'] },
            { roomNumber: '201', type: 'Double', price: 140, description: 'A spacious double room.', images: ['/img/double/1.jpg'], amenities: ['WiFi', 'TV', 'Mini Bar'] },
            { roomNumber: '202', type: 'Double', price: 140, description: 'A spacious double room.', images: ['/img/double/1.jpg'], amenities: ['WiFi', 'TV', 'Mini Bar'] },
            { roomNumber: '301', type: 'Suite', price: 220, description: 'A luxurious suite.', images: ['/img/suite/1.jpg'], amenities: ['WiFi', 'TV', 'Lounge Access'] },
            { roomNumber: '302', type: 'Suite', price: 220, description: 'A luxurious suite.', images: ['/img/suite/1.jpg'], amenities: ['WiFi', 'TV', 'Lounge Access'] }
        ];
        const rooms = await Room.insertMany(roomData);
        console.log(`${rooms.length} rooms seeded.`);

        // --- 2. SEED USERS ---
        console.log('Seeding users...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const userData = [
            { name: 'John Doe', email: 'john@example.com', password: hashedPassword, role: 'guest' },
            { name: 'Jane Smith', email: 'jane@example.com', password: hashedPassword, role: 'guest' },
            { name: 'Admin User', email: 'admin@example.com', password: hashedPassword, role: 'admin' }
        ];
        const users = await User.insertMany(userData);
        console.log(`${users.length} users seeded.`);

        // --- 3. SEED HISTORICAL BOOKINGS ---
        console.log('Seeding historical bookings...');
        const bookings = [];
        const today = new Date();

        // Generate bookings for the past 12 months
        for (let month = 1; month <= 12; month++) {
            // Simulate seasonal demand (more bookings in summer/winter holidays)
            const isPeakSeason = (month >= 6 && month <= 8) || month === 12;
            const bookingsThisMonth = isPeakSeason ? Math.floor(Math.random() * 15) + 10 : Math.floor(Math.random() * 8) + 5;

            for (let i = 0; i < bookingsThisMonth; i++) {
                const randomUser = users[Math.floor(Math.random() * users.length)];
                const randomRoom = rooms[Math.floor(Math.random() * rooms.length)];

                // Create a random date within the target month of the last year
                const bookingDate = new Date(today.getFullYear() - 1, month - 1, Math.floor(Math.random() * 28) + 1);
                const checkInDate = new Date(bookingDate);
                const stayDuration = Math.floor(Math.random() * 5) + 1; // 1 to 5 nights
                const checkOutDate = new Date(checkInDate);
                checkOutDate.setDate(checkInDate.getDate() + stayDuration);

                bookings.push({
                    guestName: randomUser.name,
                    guestEmail: randomUser.email,
                    room: randomRoom._id,
                    checkInDate,
                    checkOutDate,
                    bookingDate,
                    status: 'Completed' // All historical bookings are completed
                });
            }
        }
        await Booking.insertMany(bookings);
        console.log(`${bookings.length} historical bookings seeded.`);

        console.log('Database seeding completed successfully!');

    } catch (err) {
        console.error('Error seeding database:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedDB();