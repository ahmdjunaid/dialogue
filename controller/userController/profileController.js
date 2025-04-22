const addressModel = require('../../models/addressModel');
const userModel = require('../../models/userModel')
const mongoose = require('mongoose')
const orderModel = require('../../models/orderModel');
const walletModel = require('../../models/walletModel')
const { log } = require('console');


const loadProfile = async (req, res) => {
    try {
        const User = await userModel.findById(req.session.user);

        if (!User) {
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }

        res.render('user/profile', {
            findUser: User,
            message,

        })

    } catch (error) {
        console.error(error)
        res.redirect('/pagenotfound')
    }
}

const editProfile = async (req, res) => {
    try {
        const User = await userModel.findById(req.session.user)
        if (!User) {
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        res.render('user/editprofile', {
            findUser: User,
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const editdetails = async (req, res) => {
    try {
        const User = await userModel.findById(req.session.user)
        if (!User) {
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        const { firstName, lastName, phone, username, gender } = req.body


        let image;

        // Check if a new cropped image is uploaded
        if (req.file) {
            image = req.file.filename;
        }


        // Find the user and update only the fields that changed
        const updateData = {
            firstName,
            lastName,
            phone,
            username,
            gender,
        };

        // Only update `profileImage` if a new image was uploaded
        if (image) {
            if (User.profileImage) {
                const fs = require('fs');
                const oldImagePath = `uploads/${User.profileImage}`;

                // Check if the file exists before deleting
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            updateData.profileImage = image;
        }

        await userModel.findByIdAndUpdate(req.session.user, { $set: updateData });


        req.session.userMsg = 'Profile edited successfully'
        return res.redirect('/profile')

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const address = async (req, res) => {
    try {
        const findUser = await userModel.findById(req.session.user)

        if(!findUser){
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        let addresses = await addressModel.find({ userId: findUser._id });

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }
        res.render('user/address', { findUser, addresses, message })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const addaddress = async (req, res) => {
    try {
        const findUser = await userModel.findById(req.session.user)

        if(!findUser){
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        let redirect = req.query.redirect

        const userAddress = await addressModel.findOne({ userId: findUser._id });

        const { fullName, type, city, landmark, state, pincode, mobile, altnum } = req.body

        const addAddress = {
            name: fullName,
            addressType: type,
            city,
            state,
            pincode,
            mobile,
        }


        if (altnum != '') {
            addAddress.altNumber = altnum;
        }

        if (landmark !== '') {
            addAddress.landmark = landmark;
        }

        if (!userAddress) {

            const NewAddress = new addressModel({
                userId: findUser._id,
                address: [addAddress]
            })

            await NewAddress.save()

            if(redirect === 'checkout'){
                req.session.userMsg = 'Address added successfully'
                return res.redirect('/checkout')
            }
            req.session.userMsg = 'Address added successfully'
            return res.redirect('/address')
        }else{
            userAddress.address.push(addAddress)
            await userAddress.save()

            if(redirect === 'checkout'){
                req.session.userMsg = 'Address added successfully'
                return res.redirect('/checkout')
            }
            req.session.userMsg = 'Address added successfully'
            return res.redirect('/address')
        }
    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const editaddress = async (req,res)=>{
    try {
        const findUser = await userModel.findById(req.session.user)

        if(!findUser){
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        let redirect = req.query.redirect

        const { fullName, type, city, landmark, state, pincode, mobile, altnum, editId } = req.body

        const userAddress = await addressModel.findOne({ 'address._id': editId });

        if(!userAddress){
            req.session.userMsg = 'Address not found'
            return res.redirect('/address')
        }

        const updateFields = {
            'address.$.addressType': type,
            'address.$.name': fullName,
            'address.$.city': city,
            'address.$.state': state,
            'address.$.pincode': pincode,
            'address.$.mobile': mobile,
        };

        
        if (altnum !== undefined) {
            updateFields["address.$.altNumber"] = altnum.trim() !== "" ? altnum : null;
        }
        
        if (landmark !== undefined) {
            updateFields["address.$.landmark"] = landmark.trim() !== "" ? landmark : null;
        }
        

        const editObjectId = new mongoose.Types.ObjectId(editId);
        
        await addressModel.updateOne(
            { 'address._id': editObjectId },
            { $set: updateFields }
        );

        if(redirect === 'checkout'){
            req.session.userMsg = 'Address edited successfully'
            return res.redirect('/checkout')
        }

        req.session.userMsg = 'Address edited successfully'
        return res.redirect('/address')

    } catch (error) {

        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const deleteaddress = async (req,res)=>{
    try {
        const findUser = await userModel.findById(req.session.user)
        const addressId = req.query.addressId

        if(!addressId){
            req.session.userMsg = 'Address not found!'
            return res.redirect('/login')
        }

        if(!findUser){
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        await addressModel.updateOne(
            { userId: findUser._id },
            { $pull: { address: { _id: addressId } } }
        );

        req.session.userMsg = "Address deleted successfully";
        return res.redirect("/address");

    } catch (error) {
        console.error(error)
        return res.redirec('/pagenotfound')
    }
}

const loadOrders = async (req,res)=>{
    try {
        const findUser = await userModel.findById(req.session.user)

        if(!findUser){
            req.session.userMsg = 'Session timeout!'
            return res.redirect('/login')
        }

        const orders = await orderModel.find({userId:findUser._id}).populate({path:'orderedItems.product'}).lean();
        

        return res.render('user/myorder',{
            findUser,
            orders
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const loadWallet = async (req, res) => {
    try {

        const findUser = await userModel.findById(req.session.user).lean();

        if (!findUser) {
            req.session.userMsg = 'Session timeout!';
            return res.redirect('/login');
        }


        const wallet = await walletModel.findOne({ userId: findUser._id })
            .lean()

        if (!wallet) {
            const newWallet = new walletModel({
                userId: findUser._id,
                balance: 0,
                transactions: []
            });
        
            await newWallet.save();
        
            return res.render('user/wallet', {
                findUser,
                wallet: newWallet,
                message: "A new wallet has been created with zero balance.",
            });
        }

        wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.render('user/wallet', {
            findUser,
            wallet: wallet,
        });

    } catch (error) {
        console.error(error);
        return res.redirect('/pagenotfound');
    }
};

module.exports = {
    loadProfile,
    editProfile,
    editdetails,
    address,
    addaddress,
    editaddress,
    deleteaddress,
    loadOrders,
    loadWallet
}