const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User'); // Import your User model
const nodemailer = require('nodemailer'); // For sending magic link emails
const bcrypt = require('bcryptjs'); // Needed if combining with local password strategy, or for hashing if you store email verification tokens

// Try different import methods for MagicLoginStrategy
let MagicLoginStrategy;
try {
    // Method 1: Try default import
    MagicLoginStrategy = require('passport-magic-login').default;
} catch (error) {
    try {
        // Method 2: Try direct require
        MagicLoginStrategy = require('passport-magic-login');
    } catch (error2) {
        try {
            // Method 3: Try .Strategy property
            MagicLoginStrategy = require('passport-magic-login').Strategy;
        } catch (error3) {
            console.error('❌ Could not import MagicLoginStrategy:', error3);
            console.log('💡 Please install passport-magic-login: npm install passport-magic-login');
        }
    }
}

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
    // Only set up magic link if the strategy was successfully imported
    if (MagicLoginStrategy) {
        // Setup Nodemailer transporter to send emails
        // ENHANCED CONFIGURATION: Multiple fallback options for Gmail
        let transporter;

        // First, try with secure Gmail configuration
        try {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.NODEMAILER_EMAIL,
                    pass: process.env.NODEMAILER_PASSWORD
                },
                // Removed Nodemailer debugging options for cleaner console output
                secure: true, // Use TLS
                pool: true, // Use pooled connections
                maxConnections: 5,
                maxMessages: 100,
                rateDelta: 20000, // Rate limiting
                rateLimit: 5
            });

            console.log('✅ Gmail transporter created successfully with service config');
        } catch (error) {
            console.error('❌ Error creating Gmail service transporter:', error);

            // Fallback: Direct SMTP configuration
            try {
                transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: false, // Use STARTTLS
                    auth: {
                        user: process.env.NODEMAILER_EMAIL,
                        pass: process.env.NODEMAILER_PASSWORD
                    },
                    tls: {
                        rejectUnauthorized: false // For development only
                    },
                    // Removed Nodemailer debugging options for cleaner console output
                });

                console.log('✅ Gmail transporter created with direct SMTP config');
            } catch (fallbackError) {
                console.error('❌ Error creating fallback SMTP transporter:', fallbackError);
            }
        }

        // Verify transporter configuration
        if (transporter) {
            transporter.verify((error, success) => {
                if (error) {
                    console.error('❌ Transporter verification failed:', error);
                    console.log('📧 Email configuration issues detected. Check your Gmail App Password and 2FA settings.');
                } else {
                    console.log('✅ Gmail transporter verified successfully. Ready to send emails.');
                }
            });
        }

        // Create the magic login strategy instance
        const magicLogin = new MagicLoginStrategy({
            secret: process.env.MAGIC_LINK_SECRET, // Secret key for signing magic links
            callbackUrl: '/auth/magiclogin/callback', // The URL that the magic link will point to
            sendMagicLink: async (destination, href) => {
                // This function is called by the strategy when a user requests a magic link.
                // 'destination' is the email address, 'href' is the complete magic link URL.

                try {
                    const mailOptions = {
                        from: `"AI Hotel" <${process.env.NODEMAILER_EMAIL}>`, // Sender display name and email
                        to: destination, // Recipient email address
                        subject: 'Your AI Hotel Magic Login Link', // Email subject
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                                <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                    <h1 style="color: #3B82F6; text-align: center; margin-bottom: 30px;">AI Hotel</h1>
                                    <p style="font-size: 16px; line-height: 1.6; color: #333;">Hello,</p>
                                    <p style="font-size: 16px; line-height: 1.6; color: #333;">Click the link below to securely log in to your AI Hotel account:</p>
                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="${process.env.BASE_URL || 'http://localhost:3000'}${href}" style="display: inline-block; padding: 15px 30px; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #3B82F6; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">Log in to AI Hotel</a>
                                    </div>
                                    <p style="font-size: 14px; line-height: 1.6; color: #666;">This link is valid for a short period of time. If you didn't request this, you can safely ignore this email.</p>
                                    <hr style="border: none; height: 1px; background-color: #eee; margin: 30px 0;">
                                    <p style="font-size: 14px; color: #666;">Thanks,<br>The AI Hotel Team</p>
                                </div>
                            </div>
                        `, // Enhanced HTML content
                        text: `Hello,\n\nClick this link to log in to your AI Hotel account: ${process.env.BASE_URL || 'http://localhost:3000'}${href}\n\nThis link is valid for a short period of time. If you didn't request this, you can safely ignore this email.\n\nThanks,\nThe AI Hotel Team` // Plain text fallback
                    };

                    // *** KEY CHANGE FOR INSTANT FEEDBACK ***
                    // Do NOT await here. This makes the email sending non-blocking.
                    // The promise from sendMail will resolve/reject in the background,
                    // allowing the `magicLogin.send` middleware to proceed immediately.
                    transporter.sendMail(mailOptions)
                        .then(info => {
                            // Optional: Log minimal success in the background if desired
                            // console.log('Magic link email sent in background. Message ID:', info.messageId);
                        })
                        .catch(error => {
                            // Log errors from email sending in the background
                            console.error('❌ Failed to send magic link in background:', error);
                            if (error.code === 'EAUTH') {
                                console.error('🔐 Authentication failed for background email. Verify Gmail App Password/2FA.');
                            }
                        });

                    // The async function implicitly returns a Promise that resolves immediately
                    // since there's no `await` here anymore. This is what the magicLogin strategy expects
                    // to unblock its middleware chain.
                    return;

                } catch (error) {
                    // This catch block will only capture errors from `mailOptions` creation or
                    // very early synchronous Nodemailer setup errors.
                    console.error('❌ Error preparing/initiating magic link email:', error);
                    throw error; // Re-throw to signal an immediate failure to the MagicLoginStrategy
                }
            },
            // This function is called by the strategy when a user clicks the magic link.
            verify: async (payload, callback) => {
                const email = payload.destination; // The email extracted from the magic link
                try {
                    let user = await User.findOne({ email: email });

                    if (!user) {
                        // If no user exists with this email, create a new one (passwordless signup)
                        user = await User.create({
                            email: email,
                            name: email.split('@')[0], // Take part before @ as default name
                            isVerified: true // Mark as verified as they just clicked a valid link
                        });
                    } else {
                        // If user exists, ensure they are marked as verified (if they weren't already)
                        if (!user.isVerified) {
                            user.isVerified = true;
                            await user.save();
                        }
                    }
                    callback(null, user); // Authenticate the user successfully
                } catch (err) {
                    console.error('❌ Error verifying magic link:', err);
                    callback(err); // Pass the error to the strategy
                }
            }
        });

        // Add the passport-magic-login strategy to Passport
        passport.use(magicLogin);

        // Export the magicLogin instance so we can use it in routes
        passport.magicLogin = magicLogin;

        console.log('✅ Magic Link strategy configured successfully');
    } else {
        console.log('❌ Magic Link strategy not available - package not properly installed');
    }
};