const mongoose = require('mongoose')
const {Schema} = mongoose

const walletSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    balance:[{
        amount:{
           type:Number,
           default:0,
           required:true
        },
        addedOn:{
            type:Date,
            default:Date.now
        }
    }]
})


const wallet = mongoose.model("Wallet", walletSchema)

module.exports = wallet;