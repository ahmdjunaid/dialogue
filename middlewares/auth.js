const userModel = require('../models/userModel')


const userAuth = async (req, res, next) => {
    try {
        if (!req.session.user) {
            next()
            return // Redirect to home page if session is missing
        }

        
        const user = await userModel.findById(req.session.user);

        if (!user || user.isBlocked) {
            req.session.user = null; // Clear session if user is blocked or not found
            next()
            return; // Redirect to home page instead of login
        }

        
        next(); // Proceed if user is valid and not blocked
        
    } catch (error) {
        console.error("Error in user authentication middleware:", error);
        res.redirect('/pagenotfound')
    }
};


const adminAuth = async (req, res, next) => {
    await userModel.findOne({ isAdmin: true })
        .then(data => {
            if (data) {
                next()
            } else {
                res.redirect('/admin/login')
            }
        })
        .catch(error => {
            console.log('Error in admin auth middleware')
            res.redirect('/admin/loaderror')
        })
}


module.exports = {
    userAuth,
    adminAuth
}