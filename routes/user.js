const express = require('express')
const router = express.Router()
const passport = require('passport')
const userController = require('../controller/userController')
const productController = require('../controller/productController')
const profileController = require('../controller/profileController')
const orderController = require('../controller/orderController')
const { userAuth } = require('../middlewares/auth')
const { singleupload } = require('../config/multer')

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

router.get("/shop", userAuth, productController.loadShoppingPage);

router.get("/product/:id", userAuth, productController.productDetails);

// profile management

router.get("/profile", userAuth, profileController.loadProfile);

router.get("/editprofile", userAuth, profileController.editProfile);

router.post("/editprofile", userAuth, singleupload, profileController.editdetails);

router.post("/editemail", userAuth, userController.editcredentials);

router.get("/address", userAuth, profileController.address);

router.post("/add_address", userAuth, profileController.addaddress);

router.post("/edit_address", userAuth, profileController.editaddress);

router.get("/delete_address", userAuth, profileController.deleteaddress);

// cart management

router.get("/cart", userAuth, orderController.loadcart);

router.get("/addtocart", userAuth, orderController.addToCart);

router.post('/update-cart-quantity', userAuth, orderController.updateCartQuantity);

router.post('/remove-from-cart', userAuth, orderController.removeFromCart);

// checkout

router.post('/checkout',userAuth, orderController.Checkout)

router.get('/checkout',userAuth, orderController.loadCheckout)

router.post('/payment',userAuth, orderController.proceedToPayment)

router.get('/paymentoptions',userAuth, orderController.paymentPage)

router.post('/payment',userAuth, orderController.payment)


module.exports = router;