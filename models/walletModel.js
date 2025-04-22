const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    balance: {
        type: Number,
        default: 0,
        required: true
    },
    transactions: [
        {
            amount: {
                type: Number,
                required: true
            },
            type: {
                type: String,
                enum: ['credit', 'debit'],
                required: true
            },
            description: {
                type: String,
                default: ''
            },
            transactionId: {
                type: String,
            },
            orderId:{
                type: String,
            },
            date: {
                type: Date,
                default: Date.now
            }
        }
    ]
});

const wallet = mongoose.model("Wallet", walletSchema);

module.exports = wallet;
