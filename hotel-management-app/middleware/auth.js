module.exports = {
    // Middleware to ensure a user is logged in
    ensureAuth: function (req, res, next) {
        // The global middleware in server.js has already attached req.user if logged in.
        // We just need to check if it exists.
        if (req.user) {
            return next();
        } else {
            res.redirect('/auth/login');
        }
    },

    // Middleware to ensure the logged-in user is an admin
    ensureAdmin: function (req, res, next) {
        if (req.user && req.user.role === 'admin') {
            return next();
        } else {
            // Render a proper error page instead of a blank "Forbidden" message.
            res.status(403).render('error', { 
                title: 'Access Denied', 
                message: 'You do not have permission to view this page.' 
            });
        }
    },

    // Middleware to ensure a user is a guest (not logged in)
    ensureGuest: function (req, res, next) {
        if (req.user) {
            res.redirect('/user/dashboard'); // Redirect logged-in users away from login/signup
        } else {
            return next();
        }
    },
};