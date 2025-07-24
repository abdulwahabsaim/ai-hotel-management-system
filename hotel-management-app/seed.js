require('dotenv').config();
const mongoose = require('mongoose');
const Room = require('./models/Room');
const connectDB = require('./config/database');

connectDB();

const rooms = [
    {
        roomNumber: '101',
        type: 'Single',
        price: 95,
        description: 'Perfect for the solo traveler, our Executive Single room offers a cozy and quiet space with a productive work area, a plush single bed, and a modern bathroom. Enjoy high-speed internet and a flat-screen TV for your entertainment.',
        images: ['/img/single/1.jpg', '/img/single/2.jpg'],
        amenities: ['Free WiFi', 'Air Conditioning', 'Work Desk', 'Mini Fridge', 'Coffee Maker']
    },
    {
        roomNumber: '102',
        type: 'Single',
        price: 95,
        description: 'Identical in comfort and style to our other single rooms, this space provides a tranquil retreat for business or leisure travelers seeking solitude and efficiency.',
        images: ['/img/single/1.jpg', '/img/single/2.jpg'],
        amenities: ['Free WiFi', 'Air Conditioning', 'Work Desk', 'Mini Fridge', 'Coffee Maker']
    },
    {
        roomNumber: '201',
        type: 'Double',
        price: 140,
        description: 'Ideal for couples or friends, our Deluxe Double rooms combine modern style with ample space. Featuring two comfortable double beds and a chic seating area, it is equipped with all the amenities you need for a relaxing stay.',
        images: ['/img/double/1.jpg', '/img/double/2.jpg', '/img/double/3.jpg'],
        amenities: ['Free WiFi', 'Air Conditioning', 'Flat-screen TV', 'Seating Area', 'Iron & Ironing Board']
    },
    {
        roomNumber: '202',
        type: 'Double',
        price: 140,
        description: 'Enjoy a shared experience without compromising on comfort. This room features two double beds and a beautiful view of the city, making it a great choice for traveling companions.',
        images: ['/img/double/1.jpg', '/img/double/2.jpg', '/img/double/3.jpg'],
        amenities: ['Free WiFi', 'Air Conditioning', 'Flat-screen TV', 'Seating Area', 'Iron & Ironing Board']
    },
    {
        roomNumber: '301',
        type: 'Suite',
        price: 220,
        description: 'Spacious and elegant, our Luxury Suites offer breathtaking views, a separate living room, and premium comfort for the ultimate luxury experience. The suite includes a king-sized bed, a spa-like bathroom, and exclusive access to our club lounge.',
        images: ['/img/suite/1.jpg', '/img/suite/2.jpg', '/img/suite/3.jpg'],
        amenities: ['Free WiFi', 'Separate Living Room', 'King-sized Bed', 'Spa Bathroom', 'Club Lounge Access', 'Nespresso Machine']
    },
];

const seedDB = async () => {
    try {
        console.log('Clearing old data...');
        await Room.deleteMany({});
        console.log('Seeding new room data...');
        await Room.insertMany(rooms);
        console.log('Database seeded successfully!');
    } catch (err) {
        console.error('Error seeding database:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedDB();