const mongoose = require('mongoose')
const {Schema} = mongoose
const {v4:uuidv4} = require('uuid')

const orderSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User",
    },
    orderId:{
        type:String,
        default:()=>uuidv4(),
        unique:true
    },
    orderedItems:[{
        product:{
            type:Schema.Types.ObjectId,
            ref:"Product",
            required:true
        },
        quantity:{
            type:Number,
            required:true
        },
        price:{
            type:Number,
            required:true
        },
        offerAmount:{
            type:Number,
            required:false
        },
        offerId:{
            type:Schema.Types.ObjectId,
            ref:"Offer",
            required:false
        },
        imageurl:{
            type:Array,
            required:true
        },
        status:{
            type:String,
            required:true,
            enum:["Pending","Processing","Shipped","Delivered","Cancelled","Return Requested","Return Rejected","Returned"]
        },
        cancellationReason:{
            type:String,
            required:false
        },
        returnReason:{
            type:String,
            required:false
        }
    }],
    totalPrice:{
        type:Number,
        required:true
    },
    discount:{
        type:Number,
        default:0
    },
    couponDiscount:{
        type:Number,
        default:0
    },
    couponApplied:{
        type: Schema.Types.ObjectId, 
        ref: "Coupon",
        required:false
    },
    finalAmount:{
        type:Number,
        required:true
    },
    paymentMethod:{
        type:String,
        required:true
    },
    shippingaddress:{ 
        addressType:{type:String,required:true},
        name:{type:String,required:true},
        city:{type:String,required:true},
        landmark:{type:String,required:false},
        state:{type:String,required:true},
        pincode:{type:Number,required:true},
        mobile:{type:String,required:true},
        altNumber:{type:String,required:false}},
    status:{
        type:String,
        required:true,
        enum:["Pending","Processing","Shipped","Delivered","Cancelled","Return Requested","Return Rejected","Returned"]
    },
    createdOn:{
        type:Date,
        default:Date.now,
        required:true
    },
    cancellationReason:{
        type:String,
        required:false
    },
    returnReason:{
        type:String,
        required:false
    }
})


const Order = mongoose.model("Order",orderSchema)

module.exports = Order;