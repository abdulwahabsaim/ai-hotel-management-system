const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MagicLoginStrategy = require('passport-magic-login').default;
const User = require('../models/User'); // Import your User model
const nodemailer = require('nodemailer'); // For sending magic link emails
const bcrypt = require('bcryptjs'); // Needed if combining with local password strategy, or for hashing if you store email verification tokens

module.exports = function (passport) {
    // --- Passport Session Setup ---
    // These two functions are essential for passport to work with sessions.
    // They determine what data from the user object should be stored in the session.
    // When a user is authenticated, Passport serializes (stores) the user's ID in the session.
    passport.serializeUser((user, done) => {
        done(null, user.id); // Store user ID in session
    });

    // When subsequent requests are made, Passport deserializes (retrieves) the user object
    // from the stored ID in the session and attaches it to req.user.
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user); // Attach user object to req.user
        } catch (err) {
            done(err, null); // Pass any error
        }
    });

    // --- Google OAuth Strategy ---
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL,
                passReqToCallback: true // Allows us to access 'req' in the callback, useful for flashing messages
            },
            async (req, accessToken, refreshToken, profile, done) => {
                // This callback function is executed after Google authenticates the user.

                // Prepare new user data from Google profile
                const newUser = {
                    googleId: profile.id, // Google's unique ID for the user
                    name: profile.displayName, // User's display name from Google
                    email: profile.emails[0].value, // User's primary email from Google
                    isVerified: true // Accounts coming from Google are implicitly verified
                    // No password field here, as it's a social login
                };

                try {
                    // 1. Check if a user already exists with this Google ID
                    let user = await User.findOne({ googleId: profile.id });

                    if (user) {
                        return done(null, user); // User found, proceed to log them in
                    }

                    // 2. If no user with Google ID, check if a user exists with the same email
                    // This handles scenarios where a user might have previously signed up with email/password
                    // and is now trying to link their Google account.
                    user = await User.findOne({ email: profile.emails[0].value });
                    if (user) {
                        // User exists with this email but without a googleId, link the Google ID
                        user.googleId = profile.id;
                        user.isVerified = true; // Ensure they are marked as verified
                        await user.save(); // Save the updated user record
                        console.log('Existing user linked with Google:', user.email);
                        req.flash('success_msg', 'Your existing account has been linked with Google!');
                        return done(null, user);
                    }

                    // 3. If no existing user found by Google ID or email, create a new user
                    user = await User.create(newUser);
                    console.log('New user created via Google:', user.email);
                    req.flash('success_msg', 'Welcome! Your account has been created via Google.');
                    done(null, user); // Successfully created and authenticated
                } catch (err) {
                    console.error('Error in Google Strategy callback:', err);
                    req.flash('error_msg', 'Error during Google sign-in. Please try again.');
                    done(err, null); // Pass the error to Passport
                }
            }
        )
    );

    // --- Magic Link Strategy (Passwordless Login) ---
    // Setup Nodemailer transporter to send emails
    // IMPORTANT: Use 'outlook' service for Outlook accounts.
    // If you were using Gmail and had "App Passwords" working, you would use 'gmail'.
    // If you need more granular control or are using a custom SMTP, configure host, port, secure, etc.
    const transporter = nodemailer.createTransport({
        service: 'outlook', // This tells Nodemailer to use Outlook's predefined SMTP settings
        auth: {
            user: process.env.NODEMAILER_EMAIL, // Your Outlook email address
            pass: process.env.NODEMAILER_PASSWORD // Your generated Outlook App Password
        }
    });

    passport.use(
        new MagicLoginStrategy({
            secret: process.env.MAGIC_LINK_SECRET, // Secret key for signing magic links
            callbackUrl: '/auth/verify-magic-link', // The URL that the magic link will point to
            sendMagicLink: async (destination, href) => {
                // This function is called by the strategy when a user requests a magic link.
                // 'destination' is the email address, 'href' is the complete magic link URL.
                try {
                    console.log(`Sending magic link to ${destination}: ${href}`);
                    await transporter.sendMail({
                        from: `"AI Hotel" <${process.env.NODEMAILER_EMAIL}>`, // Sender display name and email
                        to: destination, // Recipient email address
                        subject: 'Your AI Hotel Magic Login Link', // Email subject
                        html: `
                            <p>Hello,</p>
                            <p>Click the link below to securely log in to your AI Hotel account:</p>
                            <p><a href="${href}" style="display: inline-block; padding: 10px 20px; font-family: sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #3B82F6; border-radius: 5px; text-decoration: none;">Log in to AI Hotel</a></p>
                            <p>This link is valid for a short period of time. If you didn't request this, you can ignore this email.</p>
                            <br>
                            <p>Thanks,<br>The AI Hotel Team</p>
                        `, // HTML content of the email
                    });
                    console.log(`Magic link sent successfully to ${destination}`);
                } catch (error) {
                    console.error(`Failed to send magic link to ${destination}:`, error);
                    // Important: The strategy itself doesn't directly handle the user-facing error here.
                    // The error will be caught by the authenticate callback in auth.js.
                }
            },
            // This function is called by the strategy when a user clicks the magic link.
            // 'payload' contains the data encoded in the magic link (e.g., email),
            // 'callback' is used to return the authenticated user or an error.
            verify: async (payload, callback) => {
                const email = payload.destination; // The email extracted from the magic link
                try {
                    let user = await User.findOne({ email: email });

                    if (!user) {
                        // If no user exists with this email, create a new one (passwordless signup)
                        // Assign a default name from the email
                        user = await User.create({
                            email: email,
                            name: email.split('@')[0], // Take part before @ as default name
                            isVerified: true // Mark as verified as they just clicked a valid link
                        });
                        console.log('New user signed up via magic link:', email);
                    } else {
                        // If user exists, ensure they are marked as verified (if they weren't already)
                        // This handles cases where they might have signed up traditionally but not verified their email,
                        // or if they had an account but no password.
                        if (!user.isVerified) {
                            user.isVerified = true;
                            await user.save();
                        }
                        console.log('Existing user logged in via magic link:', email);
                    }
                    callback(null, user); // Authenticate the user successfully
                } catch (err) {
                    console.error('Error verifying magic link:', err);
                    callback(err); // Pass the error to the strategy
                }
            }
        })
    );
}; // <--- Ensure this is the very last line, and nothing follows it. No extra characters like backticks.