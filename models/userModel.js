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
cart:[{
    type:Schema.Types.ObjectId,
    ref:"Cart"
}],
wallet:{
    type:Number,
    default:0,
},
wishlist:[{
    type:Schema.Types.ObjectId,
    ref:"Wishlist"
}],
orderHistory:[{
    type:Schema.Types.ObjectId,
    ref:"Order"
}],
createdOn:{
    type:Date,
    default:Date.now,
},
referalCode:{
    type:String,
},
redeemed:{
    type:Boolean,
},
redeemedUsers:[{
    type : Schema.Types.ObjectId,
    ref:"User"
}],
searchHistory:{
    brand:{
        type:Schema.Types.ObjectId,
        ref:"Brand"
    },
    searchOn:{
        type:Date,
        default:Date.now
    }
}
});

const User = mongoose.model('User', userSchema);

module.exports = User;