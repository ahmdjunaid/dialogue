const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const userModel = require('../models/userModel')
const env = require('dotenv').config()


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // find user by googleId
        let user = await userModel.findOne({ googleId: profile.id });

        if (!user) {
            // If no user found with googleId, check email
            user = await userModel.findOne({ email: profile.emails[0].value });

            if (user) {
                // If user exists with email but no googleId, update their googleId
                user.googleID = profile.id;
                await user.save();
                return done(null, user);
            }

            // create new one if no user exists
            user = new userModel({
                username: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                isVerified: true
            });
            await user.save();
        }

        

        return done(null, user);

        
    } catch (error) {
        console.log("Google Auth Error:", error);
        return done(error, null);
    }
}));



passport.serializeUser((user, done) => {

    done(null, user.id)

})

passport.deserializeUser((id, done) => {
    userModel.findById(id)
        .then((user) => {
            done(null, user)
        })
        .catch((error) => {
            done(error, null)
        })
})


module.exports = passport;