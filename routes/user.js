const express = require('express')
const router = express.Router()
const passport = require('passport')
const userController = require('../controller/userController/userController')
const userProductController = require('../controller/userController/userProductController')
const profileController = require('../controller/userController/profileController')
const orderController = require('../controller/userController/userOrderController')
const userCartController = require('../controller/userController/userCartController')
const { userAuth } = require('../middlewares/auth')
const { singleupload } = require('../config/multer')
const razorpay = require("../config/razorpay");
const crypto = require("crypto");

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

router.get("/shop", userAuth, userProductController.loadShoppingPage);

router.get("/product/:id", userAuth, userProductController.productDetails);

// profile management

router.get("/profile", userAuth, profileController.loadProfile);

router.get("/editprofile", userAuth, profileController.editProfile);

router.post("/editprofile", userAuth, singleupload, profileController.editdetails);

router.post("/editemail", userAuth, userController.editcredentials);

router.get("/address", userAuth, profileController.address);

router.post("/add_address", userAuth, profileController.addaddress);

router.post("/edit_address", userAuth, profileController.editaddress);

router.get("/delete_address", userAuth, profileController.deleteaddress);

router.get('/orders',userAuth, profileController.loadOrders)

router.get('/wallet',userAuth, profileController.loadWallet)

// cart management

router.get("/cart", userAuth, userCartController.loadcart);

router.get("/addtocart", userAuth, userCartController.addToCart);

router.post('/update-cart-quantity', userAuth, userCartController.updateCartQuantity);

router.post('/remove-from-cart', userAuth, userCartController.removeFromCart);

router.post('/validate-cart-stock', userAuth,userCartController.validateCartStock);

router.post('/update-cart-item', userAuth,userCartController.updateCartItem);

//wishlist

router.get('/addtowishlist',userAuth, userCartController.addToWishlist)

router.get('/wishlist',userAuth, userCartController.loadWishlist)

router.get('/removewishlist',userAuth, userCartController.removeWishlist)

// checkout

router.post('/checkout',userAuth, userCartController.Checkout)

router.get('/checkout',userAuth, userCartController.loadCheckout)

router.post('/update-checkout',userAuth, userCartController.updateCheckout)

//payment

router.post('/payment',userAuth, userCartController.proceedToPayment)

router.post('/paymentoptions',userAuth, userCartController.paymentPage)

router.get('/paymentpage',userAuth, userCartController.renderPaymentPage)

router.get('/payment',userAuth, orderController.payment)

router.post("/create-order",userAuth, orderController.razorpayPayment)

router.post("/verify-payment",userAuth, orderController.verifyPayment)

//order management

router.get('/ordersuccess',userAuth, orderController.orderSuccess)

router.get('/trackorder',userAuth, orderController.trackOrder)

router.post('/cancelorder',userAuth, orderController.cancelOrder)

router.post('/returnorder',userAuth, orderController.requestReturn)

router.post('/cancelitem',userAuth, orderController.cancelItem)

router.get('/orderfailed',userAuth, orderController.orderFailed)

// coupon management

router.get('/applyCoupon',userAuth, orderController.couponApply)

router.get('/cancel-coupon',userAuth, orderController.couponCancel)


module.exports = router;