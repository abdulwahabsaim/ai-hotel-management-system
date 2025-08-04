// --- Core Dependencies ---
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const passport = require('passport');
const passportConfig = require('./config/passport');

// --- Local Imports ---
const connectDB = require('./config/database');
const User = require('./models/User');
const { ensureAdmin } = require('./middleware/auth');

// --- Database Connection ---
connectDB();

const app = express();

// --- Core Middleware Configuration ---

// View Engine Setup - This should be near the top
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static folder for CSS, images, etc.
app.use(express.static(path.join(__dirname, 'public')));

// Method Override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// 1. Session configuration (THIS MUST COME FIRST FOR SESSION-DEPENDENT MIDDLEWARE)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

// 2. Passport middleware (These come AFTER session configuration)
app.use(passport.initialize());
app.use(passport.session());

// 3. Flash messages middleware (This comes AFTER session and Passport initialization)
app.use(flash());

// Configure Passport Strategies (This should be called after passport is initialized)
passportConfig(passport);


// --- Global Middleware for User and Flash Messages ---
app.use(async (req, res, next) => {
    // Make flash messages available
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');

    // Set default user value
    res.locals.user = null;

    // If Passport has authenticated a user, req.user will be available
    if (req.isAuthenticated()) {
        res.locals.user = req.user;
    } else if (req.session.userId) { // Fallback for old session or direct userId setting (less common with Passport)
        try {
            const user = await User.findById(req.session.userId).lean();
            if (user) {
                res.locals.user = user;
            }
        } catch (err) {
            console.error('Error fetching user for global middleware:', err);
        }
    }
    next();
});


// --- Route Definitions ---
const indexRouter = require('./routes/index');
const roomsRouter = require('./routes/rooms');
const bookingsRouter = require('./routes/bookings');
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');

// Assign routers to URL paths
app.use('/', indexRouter);
app.use('/rooms', roomsRouter);
app.use('/bookings', bookingsRouter);
app.use('/auth', authRouter);
app.use('/user', userRouter);

app.use('/api', apiRouter);

app.use('/admin', ensureAdmin, adminRouter);


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));