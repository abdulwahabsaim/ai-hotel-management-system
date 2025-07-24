// --- Core Dependencies ---
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');

// --- Local Imports ---
const connectDB = require('./config/database');
const User = require('./models/User');
const { ensureAdmin } = require('./middleware/auth'); // Import admin protection middleware

// --- Database Connection ---
connectDB();

const app = express();

// --- Core Middleware Configuration ---

// Method Override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

// Flash messages middleware
app.use(flash());

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static folder for CSS, images, etc.
app.use(express.static(path.join(__dirname, 'public')));


// --- Global Middleware for User and Flash Messages ---
// This runs on every request to make user data and flash messages available in all templates.
app.use(async (req, res, next) => {
    // Make flash messages available
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    
    // Set default user value
    res.locals.user = null;

    // If user is logged in, fetch their data and attach to request and locals
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId).lean();
            if (user) {
                req.user = user;
                res.locals.user = user;
            }
        } catch (err) {
            console.error('Error fetching user for global middleware:', err);
        }
    }
    next();
});


// --- Route Definitions ---
// Import all the route handlers
const indexRouter = require('./routes/index');
const roomsRouter = require('./routes/rooms');
const bookingsRouter = require('./routes/bookings');
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin'); // The main admin router

// Assign routers to URL paths
app.use('/', indexRouter);
app.use('/rooms', roomsRouter);
app.use('/bookings', bookingsRouter);
app.use('/auth', authRouter);
app.use('/user', userRouter);

// ** MAIN ADMIN ROUTE **
// Any request starting with '/admin' will first be checked by 'ensureAdmin' middleware.
// If authorized, it will be passed to the main admin router file.
app.use('/admin', ensureAdmin, adminRouter);


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));