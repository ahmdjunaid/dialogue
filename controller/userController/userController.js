const userModel = require('../../models/userModel')
const productModel = require('../../models/productModel')
const brandModel = require('../../models/brandModel')
const categoryModel = require('../../models/categoryModel')
const walletModel = require('../../models/walletModel')
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
        const listedCategories = await categoryModel.find({ isListed: true }).select('_id');
        const listedBrands = await brandModel.find({ isListed: true }).select('_id');


        const products = await productModel.find({
            isDeleted: false,
            stock: { $gt: 0 },
            category: { $in: listedCategories.map(cat => cat._id) }, //only showing listed category
            brand: { $in: listedBrands.map(brand => brand._id) }, //only showing listed brand
        })
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('brand')

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
        console.error("Error while sending email", error);
        res.redirect('/pagenotfound')
        return;
    }
}

//signup function, here checking regex and removing spaces using trim.
const signup = async (req, res) => {
    try {


        const { username, email, password, cpassword, refferal } = req.body

        if (refferal) {
            const user = await userModel.find({ randomNumber: refferal })
            if (!user) {
                req.session.userMsg = "Refferal code is not valid!"
                return res.redirect('/signup');
            }
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

        req.session.resetData = null
        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 30 * 1000;
        req.session.userData = { username, email, password, refferal };

        res.render('user/otpverification')
        console.log("OTP Sent " + otp);
        return;


    } catch (error) {
        console.error(error, 'Error while signup')
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

            if (!user.username) {
                await userModel.findByIdAndUpdate(req.session.user, { $set: { email: user.email } })
                req.session.userMsg = 'Email updated successfully'
                return res.json({ success: true, redirectUrl: "/profile" })
            }

            const refferal = user.refferal
            if (refferal) {
                const refferedUser = await userModel.findOne({ randomNumber: refferal })

                const userId = refferedUser._id

                let wallet = await walletModel.findOne({ userId });
                const transactionId = generateCode()

                if (!wallet) {
                    wallet = new walletModel({
                        userId,
                        balance: 1000,
                        transactions: [{
                            amount: 1000,
                            type: 'credit',
                            description: `Reward for reffering ${user.username}`,
                            transactionId,
                            date: new Date()
                        }]
                    });
                } else {
                    wallet.balance += 1000;
                    wallet.transactions.push({
                        amount: 1000,
                        type: 'credit',
                        description: `Reward for reffering ${user.username}`,
                        transactionId,
                        date: new Date()
                    });
                }

                await wallet.save();
            }


            const randomNumber = generateRandom8DigitNumber()

            // Hash password before saving
            const hashedPass = await bcrypt.hash(user.password, 10);
            const saveUserData = new userModel({
                username: user.username,
                email: user.email,
                password: hashedPass,
                randomNumber
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

function generateRandom8DigitNumber() {
    return Math.floor(10000000 + Math.random() * 90000000);
}

//If otp timeout, resend otp
const resendOtp = async (req, res) => {
    try {

        const { email } = req.session.userData;

        if (!email) {
            req.session.userMsg = "Email not found in session"
            return res.redirect('/forgot')
        }

        const otp = generateOtp()

        //if session have reset data, otp will be stored to forgotOtp. otherwise otp stored to userOtp.
        if (req.session.resetData) {
            req.session.forgotOtp = otp
        } else {
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
        console.error(error);
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

    if (req.session.user) {
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
        let email = (req.query.email || '').trim();
        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }
        res.render('user/forgot', { message, email })
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
        req.session.userData = findUser
        req.session.otpExpires = Date.now() + 30 * 1000;
        req.session.resetData = email

        res.render('user/otpverification')
        console.log("OTP Sent " + otp);
        return;


    } catch (error) {
        console.error(error, 'Error while forgot password')
        return res.redirect('/pagenotfound')

    }
}

const loadreset = async (req, res) => {
    try {
        res.render('user/passwordreset')
    } catch (error) {
        console.error(error)
        res.redirect('/pagenotfound')
    }
}

const passreset = async (req, res) => {
    try {

        const { password } = req.body
        let email = req.session.resetData


        if (!email) {
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/forgot')
        }

        req.session.resetData = null;

        const hashed = await bcrypt.hash(password, saltRounds)


        await userModel.findOneAndUpdate({ email }, { $set: { password: hashed } })

        if (req.session.user) {
            req.session.userMsg = 'Password reset successfully'
            return res.redirect('/profile')
        }
        req.session.userMsg = 'Password reset successfully'
        res.redirect('/login')
        return;

    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound')
    }
}

const loadAbout = async (req,res) => {
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

        res.render('user/about',{findUser:userData})
        
    } catch (error) {
        console.error(error)
    }
}

const loadContact = async (req,res) => {
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

        res.render('user/contactUs',{findUser:userData})
        
    } catch (error) {
        console.error(error)
    }
}

const editcredentials = async (req, res) => {
    try {
        const findUser = await userModel.findById(req.session.user)
        if (!findUser) {
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        const { email } = req.body

        const exist = await userModel.findOne({ email })
        if (exist) {
            req.session.userMsg = 'Email already exist!'
            return res.redirect('/profile')
        }

        if (findUser.googleID) {
            req.session.userMsg = 'Cannot update email since the account was created with Google Sign-In.'
            return res.redirect('/profile')
        }

        const otp = generateOtp()

        const emailSent = await sentVerificationEmail(email, otp)

        if (!emailSent) {
            req.session.userMsg = "Error while sending email!"
            return res.redirect('/signup')
        }

        req.session.resetData = null
        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 30 * 1000;
        req.session.userData = { email };

        res.render('user/otpverification')
        console.log("OTP Sent " + otp);

    } catch (error) {
        console.error(error);
        return res.redirect('/pagenotfound')

    }
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'WLT';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

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
    forgot,
    loadreset,
    passreset,
    editcredentials,
    loadAbout,
    loadContact
}