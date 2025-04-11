const productModel = require('../../models/productModel')
const userModel = require('../../models/userModel')
const cartModel = require('../../models/cartModel')
const addressModel = require('../../models/addressModel')
const orderModel = require('../../models/orderModel')
const wishlistModel = require('../../models/wishlistModel')
const couponModel = require('../../models/couponModel')
const mongoose = require("mongoose");
const { login } = require('./userController')
const razorpay = require('../../config/razorpay')
const crypto = require("crypto");


const payment = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        let payMethod = req.query.payment

        if (payMethod == 'cash') {

            const selectedAddress = req.session.selectedAddress;

            const selectedProduct = req.session.selectedProducts;

            const totalAmount = calculateCartTotals(selectedProduct,req.session.couponApplied)

            const userAddresses = await addressModel.findOne({userId:findUser._id})

            const deliveryAddress = userAddresses.address.find(
                address => address._id.toString() === selectedAddress.toString()
              );
              

            console.log('^^^^^',deliveryAddress,'^^^^^')

            const insufficientStock = [];

            await Promise.all(
                selectedProduct.map(async (item) => {
                    const product = await productModel.findById(item.product.productId._id);

                    if (!product) {
                        insufficientStock.push(`Product not found: ${item.product.productId._id}`);
                        return;
                    }

                    if (product.stock < item.quantity) {
                        insufficientStock.push(`Not enough stock for ${product.name}`);
                        return;
                    }
                })
            );

            if (insufficientStock.length > 0) {
                req.session.userMsg = 'Oops!...  Some of your required items are sold out.';
                return res.redirect("/cart");
            }

            await Promise.all(
                selectedProduct.map(async (item) => {
                    await productModel.findOneAndUpdate(
                        { _id: item.product.productId._id },
                        { $inc: { stock: -item.product.quantity } }
                    );
                })
            );


            await Promise.all(
                selectedProduct.map(async (item) => {
                    await cartModel.findOneAndUpdate(
                        { userId: findUser._id },
                        { $pull: { items: { _id: item.product._id } } },
                    );
                })
            );


            const ordered = {
                orderedItems: selectedProduct.map((item) => {
                    const product = item.product;
                    const offer = item.bestOffer;
                    let finalPrice = product.price;
            
                    if (offer) {
                        if (offer.discountType === 'flat') {
                            finalPrice = product.price - offer.discountAmount;
                        } else if (offer.discountType === 'percentage') {
                            finalPrice = product.price - (product.price * offer.discountAmount) / 100;
                        }
                        finalPrice = Math.round(finalPrice);
                    }
            
                    return {
                        product: product.productId._id,
                        quantity: product.quantity,
                        price: finalPrice,
                        offerAmount: offer ? offer.discountType === "flat" ? offer.discountAmount : (product.price * offer.discountAmount) / 100 : 0,
                        offerId: offer ? offer._id : null,
                        imageurl: product.productId.productImage[0],
                        status: 'Pending'
                    };
                })
            };
            
            payMethod = 'Cash on Delivery'

            const newOrder = new orderModel({
                userId: findUser._id,
                orderedItems: ordered.orderedItems,
                totalPrice:totalAmount.subtotal,
                discount:totalAmount.offerDiscount,
                couponDiscount:totalAmount.couponDiscount,
                couponApplied:req.session.couponApplied ? req.session.couponApplied.couponId : null,
                finalAmount:totalAmount.total,
                paymentMethod: payMethod,
                shippingaddress: deliveryAddress,
                status: 'Pending'
            })

            req.session.payment = null
            req.session.checkOut = null


            try {
                const savedOrder = await newOrder.save();
                req.session.lastOrder = savedOrder._id
            } catch (error) {
                console.error("Error saving order:", error);
            }
        }

        res.redirect('/ordersuccess')

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const orderSuccess = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const orderDetails = await orderModel.findOne({ _id: req.session.lastOrder })

        return res.render('user/ordersuccess', {
            findUser,
            orderDetails,
        })
    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const trackOrder = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const orderId = req.query.orderId

        const order = await orderModel
            .findOne({ orderId: orderId })
            .populate({
                path: 'orderedItems',
                populate: {
                    path: 'product',
                },
            })
            .lean();


        return res.render('user/trackorder', {
            findUser,
            order
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const userId = req.session.user;

        // Find the order
        const order = await orderModel.findOne({
            orderId: orderId,
            userId: userId
        });

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: "Order not found"
            });
        }

        // Check if order is cancellable (Pending or Processing)
        if (order.status !== 'Pending' && order.status !== 'Processing') {
            return res.status(400).json({
                status: 'error',
                message: "Order cannot be cancelled at this stage"
            });
        }

        // Cancel entire order
        order.status = 'Cancelled';
        order.cancellationReason = reason;


        // Restore product inventory
        await Promise.all(
            order.orderedItems
                .filter(item => item.status !== 'Cancelled') // Filter non-cancelled items
                .map(item =>
                    productModel.findByIdAndUpdate(item.product, {
                        $inc: { stock: item.quantity }
                    })
                )
        );

        // Update all items to cancelled
        order.orderedItems.forEach(item => {
            item.status = 'Cancelled';
            item.cancellationReason = reason;
        });

        // Recalculate total price after cancellation
        order.finalAmount = 0;


        await order.save();

        res.status(200).json({
            status: 'success',
            message: "Order cancelled successfully"
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: "Error cancelling order",
            error: error.message
        });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, productId, reason } = req.body;
        const userId = req.session.user;

        // Find the order
        const order = await orderModel.findOne({
            orderId: orderId,
            userId: userId
        });

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: "Order not found"
            });
        }

        // Check if order is cancellable (Pending or Processing)
        if (order.status !== 'Pending' && order.status !== 'Processing') {
            return res.status(400).json({
                status: 'error',
                message: "Order cannot be cancelled at this stage"
            });
        }

        let cancelledAmount = 0;

        order.orderedItems.map(item => {
            if (item.product.toString() === productId.toString()) {
                item.status = 'Cancelled'
                item.cancellationReason = reason
                cancelledAmount = item.price * item.quantity
            }
        })


        // Recalculate total price after cancellation
        order.finalAmount = order.finalAmount - cancelledAmount;

        if (order.finalAmount == 0) {
            order.status = 'Cancelled'
        }

        await order.save();

        // Restore product inventory
        for (let item of order.orderedItems) {
            if (item.product.toString() === productId.toString()) {
                await productModel.findByIdAndUpdate(item.product, {
                    $inc: { stock: item.quantity }
                });
            }
        }

        res.status(200).json({
            status: 'success',
            message: "Order cancelled successfully"
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: "Error cancelling order",
            error: error.message
        });
    }
};

const requestReturn = async (req, res) => {
    try {

        const { orderId, productId, reason } = req.body;
        const userId = req.user._id;

        // Find the order
        const order = await orderModel.findOne({
            orderId: orderId,
            userId: userId
        });

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: "Order not found"
            });
        }

        // Check if order is returnable (must be Delivered)
        if (order.status !== 'Delivered') {
            return res.status(400).json({
                status: 'error',
                message: "Order can only be returned if delivered"
            });
        }

        // If returning a specific product
        if (productId) {
            const orderedItem = order.orderedItems.find(
                item => item.product.toString() === productId
            );

            if (!orderedItem) {
                return res.status(404).json({
                    status: 'error',
                    message: "Product not found in order"
                });
            }

            orderedItem.status = 'Return Requested';
            orderedItem.returnReason = reason;
        } else {

            order.status = 'Return Requested';
            order.returnReason = reason;

            order.orderedItems.forEach(item => {
                item.status = 'Return Requested';
                item.returnReason = reason;
            });
        }

        await order.save();

        res.status(200).json({
            status: 'success',
            message: productId
                ? "Product return requested"
                : "Order return requested"
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: "Error requesting return",
            error: error.message
        });
    }
};

const razorpayPayment = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = "Session expired!";
            return res.redirect("/login");
        }

        const selectedAddress = req.session.selectedAddress;
        const selectedProduct = req.session.selectedProducts;

        const totalPrice = selectedProduct.reduce((acc, item) => acc + item.totalPrice, 0);
        const discount = 0;
        const finalAmount = totalPrice - discount;

        const insufficientStock = [];

        await Promise.all(
            selectedProduct.map(async (item) => {
                const product = await productModel.findById(item.productId._id);

                if (!product) {
                    insufficientStock.push(`Product not found: ${item.productId._id}`);
                    return;
                }

                if (product.stock < item.quantity) {
                    insufficientStock.push(`Not enough stock for ${product.name}`);
                    return;
                }
            })
        );

        if (insufficientStock.length > 0) {
            req.session.userMsg = "Oops!... Some of your required items are sold out.";
            return res.redirect("/cart");
        }

        req.session.newOrder = {
            userId: findUser._id,
            orderedItems: selectedProduct.map((item) => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.price,
                imageurl: item.productId.productImage[0],
                status: "Pending",
            })),
            totalPrice,
            discount,
            finalAmount,
            paymentMethod: "Razorpay",
            shippingaddress: selectedAddress,
            status: "Pending",
        };

        const options = {
            amount: finalAmount * 100,
            currency: "INR",
            receipt: `order_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            order,
            key: process.env.RAZ_PAY_ID,
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const hmac = crypto
            .createHmac("sha256", process.env.RAZ_PAY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (hmac !== razorpay_signature) {
            return res.status(400).json({ message: "Invalid payment signature" });
        }

        if (!req.session.newOrder) {
            return res.status(400).json({ message: "Order session expired, please try again." });
        }

        await Promise.all(
            req.session.newOrder.orderedItems.map(async (item) => {
                await productModel.findOneAndUpdate(
                    { _id: item.product },
                    { $inc: { stock: -item.quantity } }
                );
            })
        );

        await cartModel.findOneAndUpdate(
            { userId: req.session.newOrder.userId },
            { $pull: { items: { productId: { $in: req.session.newOrder.orderedItems.map(i => i.product) } } } }
        );

        const newOrder = new orderModel(req.session.newOrder);
        const savedOrder = await newOrder.save();

        req.session.lastOrder = savedOrder._id;
        req.session.newOrder = null;

        res.json({ message: "Payment verified successfully" });

    } catch (error) {
        console.error("Payment verification error:", error);
        return res.redirect("/pagenotfound");
    }
};

const orderFailed = async (req, res) => {
    try {

        const findUser = await userModel.find({ _id: req.session.user })

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        return res.render('user/orderfailed', { findUser })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const couponApply = async (req, res) => {
    try {
        const  couponCode  = req.query.code;

        const userId = req.session.user;

        const coupon = await couponModel.findOne({ couponCode: couponCode });

        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code." });
        }

        const currentDate = new Date();
        if (!coupon.isList || currentDate > coupon.validUpto || currentDate < coupon.validFrom) {
            return res.json({ success: false, message: "Coupon expired or not active." });
        }

        const cart = await cartModel.findOne({userId: userId })

        if (!cart) {
            return res.json({ success: false, message: "Cart not found." });
        }

        if (cart.cartTotals < coupon.minCartValue) {
            return res.json({ success: false, message: "Coupon criteria not fulfilled." });
        }

        const existingCoupon = req.session.couponApplied

        if (existingCoupon) {
            if (coupon._id === existingCoupon.couponId) {
                return res.json({ success: true, message: "Coupon already applied." });
            }

            if (coupon.offerAmount <= existingCoupon.offerAmount) {
                return res.json({
                    success: false,
                    message: "A better coupon is already applied.",
                });
            }
        }

        req.session.couponApplied = {couponId:coupon._id,offerAmount:coupon.offerAmount}

        return res.json({ success: true, message: "Coupon applied successfully." });

    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound');
    }
};

const couponCancel = async (req, res) => {
    try {
        const  Id  = req.query.couponId;

        if(req.session.couponApplied && !req.session.couponApplied.couponId===Id){
            return res.json({ success: false, message: "Coupon doesn/t found!." });
        }

        req.session.couponApplied = null

        return res.json({ success: true, message: "Coupon cancelled successfully." });
    
    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound');
    }
};

function calculateCartTotals(products, sessionCoupon = null) {
    let subtotal = 0;
    let offerDiscount = 0;

    products.forEach(item => {
        const { price, quantity } = item.product;
        const totalPrice = price * quantity;
        subtotal += totalPrice;

        const offer = item.bestOffer;
        if (offer) {
            if (offer.discountType === 'percentage') {
                offerDiscount += Math.round((price * offer.discountAmount / 100) * quantity);
            } else if (offer.discountType === 'flat') {
                offerDiscount += offer.discountAmount * quantity;
            }
        }
    });

    const couponDiscount = sessionCoupon?.offerAmount || 0;

    const total = subtotal - offerDiscount - couponDiscount;

    return {
        subtotal,
        offerDiscount,
        couponDiscount,
        total
    };
}

    module.exports = {
        payment,
        orderSuccess,
        trackOrder,
        cancelOrder,
        requestReturn,
        cancelItem,
        razorpayPayment,
        verifyPayment,
        orderFailed,
        couponApply,
        couponCancel
    }