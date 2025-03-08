const express = require('express')
const router = express.Router()
const passport = require('passport')
const userController = require('../controller/userController')
const { userAuth } = require('../middlewares/auth')

//homepage

router.get('/', userAuth, userController.loadHome);

//user authentication

router.get('/login', userController.loadLogin)

router.post('/login', userController.login)

router.get('/logout', userController.logout)

router.get('/signup', userController.loadSignup)

router.post('/signup', userController.signup)

router.post('/verify-otp', userController.verifyOtp)

router.post('/resend-otp', userController.resendOtp)

//user authentication - forgot password

router.get('/forgot', userController.loadForgot)

router.post('/forgot', userController.forgot)

router.get('/resetpass', userController.loadreset)

router.post('/resetpass', userController.passreset)


//user authentication - single signin

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

router.get("/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/signup",
        failureFlash: true
    }),
    (req, res) => {

        req.session.user = req.user._id;
        res.redirect("/");
    }
);

//error page

router.get('/pagenotfound', userController.loadError)


//shop-page & details page

router.get("/shop", userAuth, userController.loadShoppingPage);

router.get("/product/:id", userAuth, userController.productDetails);


module.exports = router;