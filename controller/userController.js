const userModel = require('../models/userModel')
const productModel = require('../models/productModel')
const brandModel = require('../models/brandModel')
const categoryModel = require('../models/categoryModel')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')
const saltRounds = 10;

// loding homepage

const loadHome = async (req, res) => {
    try {
        const userId = req.session.user;

        let userData = null;
        if (userId) {
            userData = await userModel.findById(userId);
            if (!userData) {

                req.session.user = null;
                console.warn('User not found for session ID:', userId);
            }
        }
        const listedCategories = await categoryModel.find({ isListed: true }).select('name');
        const listedBrands = await brandModel.find({ isListed: true }).select('name');


        const products = await productModel.find({
            category: { $in: listedCategories.map(cat => cat.name) }, //only showing listed category
            brand: { $in: listedBrands.map(brand => brand.name) }, //only showing listed brand
        })
            .sort({ createdAt: -1 })
            .limit(8);


        res.render('user/landing', {
            products,
            user: userData,
            findUser: userData
        }); //while rendering home page passing userdata, 8 latest products.

    } catch (error) {
        console.error('Error in loadHome:', error);
        res.status(500).redirect('/pagenotfound'); //if any error occured redirect into errorpage
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); //generating 6 digit random number for Otp
}

async function sentVerificationEmail(email, otp) { //Generated otp sent to  user using node mailer
    try {

        const transporter = nodemailer.createTransport({

            service: 'gmail',
            port: 587,
            secure: false.valueOf,
            requireTLS: true,
            auth: {
                user: process.env.APP_EMAIL,
                pass: process.env.APP_PASS
            }
        })

        const info = await transporter.sendMail({
            from: process.env.APP_EMAIL,
            to: email,
            subject: "Verify your account | Dialogue Digital",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        })

        return info.accepted.length > 0


    } catch (error) {
        console.log("Error while sending email", error);
        res.redirect('/pagenotfound')
        return;
    }
}

//signup function, here checking regex and removing spaces using trim.

const signup = async (req, res) => {
    try {


        const { username, email, password, cpassword } = req.body

        let emailRegex = /^[a-zA-Z0-9]+@[a-zA-Z0-9]+\.[a-zA-Z]{2,}$/;
        let passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        let nameRegex = /^[A-Za-z\s]+$/;

        if (username.trim() === "" || email.trim() === "" || password.trim() === "" || cpassword.trim() === "") {
            req.session.userMsg = "All fields are required!"
            return res.redirect('/signup');
        }

        if (!nameRegex.test(username.trim())) {
            req.session.userMsg = "Name can only contain alphabets and spaces"
            return res.redirect('/signup');
        }

        if (!emailRegex.test(email.trim())) {
            req.session.userMsg = "Invalid email!"
            return res.redirect('/signup');
        }

        if (!passwordRegex.test(password.trim())) {
            req.session.userMsg = "Password must be at least 8 characters with numbers!"
            return res.redirect('/signup');
        }

        if (password !== cpassword) {
            req.session.userMsg = "Passwords do not match!"
            return res.redirect('/signup');
        }

        const findUser = await userModel.findOne({ email })

        if (findUser) {
            req.session.userMsg = "User already exist"
            return res.redirect('/signup')
        }

        const otp = generateOtp() // if all the validation is passed generating Otp.

        const emailSent = await sentVerificationEmail(email, otp) // after generating otp sent to user;

        if (!emailSent) {
            req.session.userMsg = "Error while sending email!"
            return res.redirect('/signup')
        }

        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 30 * 1000;
        req.session.userData = { username, email, password };

        res.render('user/otpverification')
        console.log("OTP Sent " + otp);
        return;


    } catch (error) {
        console.log(error, 'Error while signup')
        return res.redirect('/pagenotfound')

    }
}

//verifying entered otp
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        // Check if OTP expired
        if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
            req.session.forgotOtp = null;
            req.session.userOtp = null;
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }

        // Forgot Password OTP verification
        if (req.session.forgotOtp && otp === req.session.forgotOtp) {
            req.session.forgotOtp = null;
            req.session.otpExpires = null;
            return res.json({ success: true, redirectUrl: "/resetpass" });
        }

        // If forgotOtp is present, do not proceed to registration logic
        if (req.session.forgotOtp) {
            return res.status(400).json({ success: false, message: "OTP verification failed. Try again." });
        }

        // Registration OTP verification
        if (req.session.userOtp && otp === req.session.userOtp) {
            const user = req.session.userData;

            if (!user) {
                return res.status(400).json({ success: false, message: "User data missing in session" });
            }

            // Hash password before saving
            const hashedPass = await bcrypt.hash(user.password, 10);
            const saveUserData = new userModel({
                username: user.username,
                email: user.email,
                password: hashedPass
            });

            await saveUserData.save();

            // Clear session OTPs
            req.session.userOtp = null;
            req.session.userData = null;
            req.session.otpExpires = null;

            return res.json({ success: true, redirectUrl: "/login" });
        }

        return res.status(400).json({ success: false, message: "Invalid OTP" });

    } catch (error) {
        console.error("Error while verifying OTP:", error);
        return res.status(500).json({ success: false, message: "Error while verifying OTP" });
    }
};

//If otp timeout, resend otp
const resendOtp = async (req, res) => {
    try {

        const  {email}  = req.session.userData;
        
        if (!email) {
            req.session.userMsg = "Email not found in session"
            return res.redirect('/forgot')
        }

        const otp = generateOtp()

        //if session have reset data, otp will be stored to forgotOtp. otherwise otp stored to userOtp.
        if(req.session.resetData){
            req.session.forgotOtp = otp
        }else{
            req.session.userOtp = otp
        }
        
        req.session.otpExpires = Date.now() + 30 * 1000;

        const emailSent = await sentVerificationEmail(email, otp)

        if (emailSent) {
            console.log("Resend OTP :", otp);
            res.status(200).json({ success: true, message: "OTP Resend Successfully" })
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP" })
        }

    } catch (error) {
        console.error("Error while resending OTP", error)
        req.session.userMsg = "Error while resending OTP"
        return res.redirect('/forgot')
    }
}

// loading loginpage
const loadLogin = async (req, res) => {

    try {
        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }

        if (!req.session.user) {
            res.render('user/login', { message });
            return;
        } else {
            res.redirect('/')
            return;
        }

    } catch (error) {
        console.error(error)
        res.redirect('/pagenotfound')
    }
}


//login function, checking username and password.
const login = async (req, res) => {
    try {
        const { email, password } = req.body

        //confirming whether admin or user
        const findUser = await userModel.findOne({ isAdmin: 0, email: email }) 

        if (!findUser) {
            req.session.userMsg = 'User does not exist!'
            return res.redirect('/login')
        }

        if (findUser.password == null) {
            req.session.userMsg = 'Try with Google SignIn'
            return res.redirect('/login')
        }

        //if user is blocked by admin, a message will displayed
        if (findUser.isBlocked) { 
            req.session.userMsg = 'Action restriced by Admin!'
            return res.redirect('/login')
        }

        //checking entered password and database password
        const isMatch = await bcrypt.compare(password, findUser.password);

        if (!isMatch) {
            req.session.userMsg = 'Invalid Credentials'
            return res.redirect('/login')
        }


        req.session.user = findUser._id;

        res.redirect('/')



    } catch (error) {
        console.log(error);
        req.session.userMsg = 'Something went wrong'
        return res.redirect('/login')

    }

}


//logout function
const logout = async (req, res) => {
    req.session.user = null
    res.redirect('/')
}

//rendering signup page.
const loadSignup = async (req, res) => {

    if(req.session.user){
        res.redirect('/')
        return;
    }

    try {
        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg;
            req.session.userMsg = null
        }
        res.render('user/signup', { message });
        return;
    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound')
    }
}

//rendering error page
const loadError = async (req, res) => {
    try {
        res.render('user/404error')
    } catch (error) {
        console.error(error);
    }
}

//rendering forgot page.
const loadForgot = async (req, res) => {
    try {
        res.render('user/forgot')
    } catch (error) {
        console.error(error)
        res.redirect('/pagenotfound')
    }
}

//forgot password function.
const forgot = async (req, res) => {
    try {

        const { email } = req.body

        let emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(email)) {
            req.session.userMsg = "Invalid email!"
            return res.redirect('/forgot');
        }

        const findUser = await userModel.findOne({ email })

        if (!findUser) {
            req.session.userMsg = "Invalid email"
            return res.redirect('/forgot')
        }


        const otp = generateOtp()

        const emailSent = await sentVerificationEmail(email, otp)

        if (!emailSent) {
            req.session.userMsg = "Error while sending email!"
            return res.redirect('/forgot')
        }

        req.session.forgotOtp = otp;
        req.session.resetData = email;
        req.session.userData = findUser
        req.session.otpExpires = Date.now() + 30 * 1000;
        

        res.render('user/otpverification')
        console.log("OTP Sent " + otp);
        return;


    } catch (error) {
        console.log(error, 'Error while forgot password')
        return res.redirect('/pagenotfound')

    }
}

const loadreset = async (req, res) => {
    try {
        res.render('user/passwordreset')
    } catch (error) {
        res.redirect('/pagenotfound')
    }
}

const passreset = async (req, res) => {
    try {

        const { password } = req.body
        let email = req.session.resetData

        const hashed = await bcrypt.hash(password, saltRounds)


        await userModel.findOneAndUpdate({ email }, { $set: { password: hashed } })

        req.session.userMsg = 'Password reset successfully'
        res.redirect('/login')
        return;

    } catch (error) {
        console.log(error);

        res.redirect('/pagenotfound')
    }
}

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await userModel.findById(user);
        const listedCategories = await categoryModel.find({ isListed: true }).select('name');
        const listedBrands = await brandModel.find({ isListed: true }).select('name');


        let { search, sort, brandf, categoryf, minValue, maxValue } = req.query;
        const page = parseInt(req.query.page) || 1;
        const perPage = 6;

        if(!minValue){
            minValue = 0
        }
        
        if(!maxValue){
            maxValue = Infinity
        }

        let filter = {
            isDeleted: false,
            stock: { $gt: 0 },
            category: { $in: listedCategories.map(cat => cat.name) },
            brand: { $in: listedBrands.map(brand => brand.name) },
            $and: [
                { salePrice: { $gte: minValue } },
                { salePrice: { $lte: maxValue } }
            ]
        };
        
        if (search) {
            filter.productName = { $regex: search, $options: "i" };
        }


        if (categoryf) {
            filter.category = categoryf;
        }


        if (brandf) {
            filter.brand = brandf;
        }

        let sortOptions = {};
        switch (sort) {
            case 'A-Z':
                sortOptions = { productName: 1 };
                break;
            case 'Z-A':
                sortOptions = { productName: -1 };
                break;
            case 'Price : low - high':
                sortOptions = { salePrice: 1 };
                break;
            case 'Price : high - low':
                sortOptions = { salePrice: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        const brand = await brandModel.find({ isListed: true, isDeleted: false });
        const category = await categoryModel.find({ isListed: true, isDeleted: false });

        const totalProducts = await productModel.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / perPage);
        const currentPage = Math.max(1, Math.min(page, totalPages));

        const products = await productModel.find(filter)
            .sort(sortOptions)
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .populate('category');

        res.render("user/shop", {
            products,
            totalPages,
            currentPage,
            search,
            sort,
            categoryf,
            brandf,
            category,
            brand,
            findUser: userData
        });
    } catch (error) {
        console.error("Error loading shop page:", error);
        res.redirect('/admin/loaderror');
    }
}

const productDetails = async (req, res) => {

    try {

        const userId = req.session.user;
        const userData = await userModel.findById(userId);
        const productId = req.params.id;
        const product = await productModel.findById(productId)
        // console.log("productId", productId)
        // const productOffer = product.productOffer || 0;



        const products = await productModel.find({
            isBlocked: false,
            stock: { $gt: 0 },
        })
            .sort({ createdOn: -1 })
            .skip(0)
            .limit(9);

        res.render("user/product-details", {
            findUser: userData,
            product: product,
            products: products,
            quantity: product.stock,
        })
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.redirect('/pagenotfound');
    }
};



module.exports = {
    loadLogin,
    loadSignup,
    loadHome,
    loadError,
    loadForgot,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    loadShoppingPage,
    productDetails,
    forgot,
    loadreset,
    passreset
}