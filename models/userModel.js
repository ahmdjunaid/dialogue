const mongoose = require('mongoose');
const { type } = require('os');

const { Schema, ObjectId } = mongoose;

const userSchema = new Schema({
username: {
    type: String,
    required:true
},
firstName: {
    type: String,
    required:false
},
lastName: {
    type: String,
    required:false
},
gender: {
    type: String,
    required:false
},
email: {
    type:String,
    required:true,
    unique:true
},
phone:{
    type:String,
    required:false,
    unique:false,
    sparse:true,
    default:'N/A'
},
profileImage:{
    type:String,
    required:false
},
googleID:{
    type:String,
    required:false,
    unique:true,
    sparse:true,
},
password:{
    type:String,
    required:false,
    default:null
},
isBlocked:{
    type:Boolean,
    default:false
},
isAdmin:{
    type:Boolean,
    default:false
},
createdOn:{
    type:Date,
    default:Date.now,
},
appliedCoupons:[{
    type: Schema.Types.ObjectId,
    ref: 'Coupon',
    required:false
}]
});

const User = mongoose.model('User', userSchema);

module.exports = User;