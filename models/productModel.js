const mongoose = require('mongoose')
const {Schema} = mongoose


const productSchema = new Schema({
    productName : {
        type:String,
        required : true
    },
    description: {
        type:String,
        required:true
    },
    brand: {
        type:String,
        required:true
    },
    category: {
        type:String,
        required:true
    },
    regularPrice:{
        type:Number,
        required:true
    },
    salePrice:{
        type:Number,
        required:true
    },
    storage:{
        type:String,
        required:true
    },
    ram:{
        type:String,
        required:true
    },
    stock:{
        type:Number,
        required:true
    },
    camera:{
        type:String,
        required:true
    },
    cpu:{
        type:String,
        required:true
    },
    productImage:{
        type:[String],
        required:true
    },
    isDeleted:{
        type:Boolean,
        default:false
    },
    status:{
        type:String,
        enum:["Available","Out of Stock","Discountinued"],
        required:true,
        default:"Available"
    }
},{timestamps:true})

const Product = mongoose.model("Product",productSchema)


module.exports = Product;


