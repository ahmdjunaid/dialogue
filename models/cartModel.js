const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        name: {
            type: String,
            required: true
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            default: 1
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        offerApplied: {
            type: Schema.Types.ObjectId,
            ref: "Offer",
            required: false
        },
        discount: {
            type: Number,
            default: 0
        }
    }],
    cartTotals: {
        type: Number,
        default: 0
    }
}, { timestamps: true });


cartSchema.pre('save', function (next) {
    this.cartTotals = this.items.reduce((acc, item) => acc + item.totalPrice, 0);
    next();
});

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
