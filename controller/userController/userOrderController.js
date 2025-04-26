const productModel = require('../../models/productModel')
const userModel = require('../../models/userModel')
const cartModel = require('../../models/cartModel')
const addressModel = require('../../models/addressModel')
const orderModel = require('../../models/orderModel')
const wishlistModel = require('../../models/wishlistModel')
const couponModel = require('../../models/couponModel')
const walletModel = require('../../models/walletModel')
const mongoose = require("mongoose");
const { login } = require('./userController')
const razorpay = require('../../config/razorpay')
const crypto = require("crypto");
const PDFDocument = require('pdfkit');
const path = require('path');


const payment = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        let payMethod = req.query.payment

        const selectedAddress = req.session.selectedAddress;

        const selectedProduct = req.session.forPayment;

        const totalAmount = calculateCheckoutTotals(selectedProduct, req.session.couponApplied)

        if (payMethod == 'wallet') {

            payMethod = 'wallet'

            const wallet = await walletModel.findOne({ userId: findUser._id })

            if (!wallet) {
                req.session.userMsg = 'Wallet not found!'
                return res.redirect('/paymentpage')
            }

            if (wallet.balance < totalAmount.total) {
                req.session.userMsg = 'Insufficient wallet balance. Continue with other methods.'
                return res.redirect('/paymentpage');
            }
        }

        if (payMethod == 'cash' && 20000 < totalAmount.total) {
            req.session.userMsg = "Orders exceeding ₹20,000 may not be accepted using this payment method. Kindly choose a different one."
            return res.redirect('/paymentpage');
        }

        const userAddresses = await addressModel.findOne({ userId: findUser._id })

        const deliveryAddress = userAddresses.address.find(
            address => address._id.toString() === selectedAddress.toString()
        );

        const insufficientStock = [];

        await Promise.all(
            selectedProduct.map(async (item) => {
                const product = await productModel.findById(item.product.productId);

                if (!product) {
                    insufficientStock.push(`Product not found: ${item.product.productId}`);
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
                    { _id: item.product.productId },
                    { $inc: { stock: -item.product.quantity } },
                );
            })
        );


        await Promise.all(
            selectedProduct.map(async (item) => {
                await cartModel.findOneAndUpdate(
                    { userId: findUser._id },
                    { $pull: { items: { productId: item.product.productId } } },
                );
            })
        );

        const ordered = {
            orderedItems: selectedProduct.map((item) => {
                const product = item.product.product;
                const order = item.product
                const offer = item.bestOffer;
                let finalPrice = product.salePrice;

                if (offer) {
                    if (offer.discountType === 'flat') {
                        finalPrice = product.salePrice - offer.discountAmount;
                    } else if (offer.discountType === 'percentage') {
                        finalPrice = product.salePrice - (product.salePrice * offer.discountAmount) / 100;
                    }
                    finalPrice = Math.round(finalPrice);
                }

                return {
                    product: product._id,
                    quantity: order.quantity,
                    price: finalPrice,
                    offerAmount: offer ? offer.discountType === "flat" ? offer.discountAmount : (product.salePrice * offer.discountAmount) / 100 : 0,
                    offerId: offer ? offer._id : null,
                    imageurl: product.productImage[0],
                    status: 'Pending'
                };
            })
        };

        if (payMethod == 'wallet') {

            payMethod = 'Wallet'

            const wallet = await walletModel.findOne({ userId: findUser._id })
            const transactionId = generateCode()

            wallet.transactions.push({
                amount: totalAmount.total,
                type: 'debit',
                description: `Payment done for order`,
                transactionId: transactionId,
                date: new Date()
            })

            wallet.balance -= totalAmount.total;

            await wallet.save()

        } else {
            payMethod = 'Cash on Delivery'
        }

        const newOrder = new orderModel({
            userId: findUser._id,
            orderedItems: ordered.orderedItems,
            totalPrice: totalAmount.subtotal,
            discount: totalAmount.offerDiscount,
            couponDiscount: totalAmount.couponDiscount,
            couponApplied: req.session.couponApplied ? req.session.couponApplied.couponId : null,
            finalAmount: totalAmount.total,
            paymentMethod: payMethod,
            shippingaddress: deliveryAddress,
            status: 'Pending'
        })

        req.session.payment = null
        req.session.checkOut = null
        req.session.couponApplied = null

        const savedOrder = await newOrder.save();
        req.session.lastOrder = savedOrder._id

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

        if (order.status !== 'Pending' && order.status !== 'Processing') {
            return res.status(400).json({
                status: 'error',
                message: "Order cannot be cancelled at this stage"
            });
        }

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.revokedCoupon = order.couponDiscount || 0

        if (order.paymentMethod !== 'Cash on Delivery') {
            const refundAmount = order.finalAmount - order.cancelOrReturn;


            let wallet = await walletModel.findOne({ userId });
            const transactionId = generateCode()

            if (!wallet) {
                wallet = new walletModel({
                    userId,
                    balance: refundAmount,
                    transactions: [{
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for cancelled order ORD:${orderId}`,
                        transactionId: transactionId,
                        orderId: orderId,
                        date: new Date()
                    }]
                });
            } else {
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for cancelled order ORD:${orderId}`,
                    transactionId: transactionId,
                    orderId: orderId,
                    date: new Date()
                });
            }

            await wallet.save();
        }


        await Promise.all(
            order.orderedItems
                .filter(item => item.status !== 'Cancelled')
                .map(item =>
                    productModel.findByIdAndUpdate(item.product, {
                        $inc: { stock: item.quantity }
                    })
                )
        );

        order.orderedItems.forEach(item => {
            item.status = 'Cancelled';
            item.cancellationReason = reason;
        });

        order.cancelOrReturn += order.finalAmount - order.cancelOrReturn;

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

        const order = await orderModel.findOne({
            orderId: orderId,
            userId: userId
        }).populate('couponApplied')

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
        let itemFound = false;

        for (let item of order.orderedItems) {
            if (item.product.toString() === productId.toString()) {
                itemFound = true;

                if (item.status === 'Pending' || item.status === 'Processing') {
                    item.status = 'Cancelled';
                    item.cancellationReason = reason;
                    cancelledAmount = item.price * item.quantity;
                } else {
                    return res.status(400).json({
                        status: 'error',
                        message: "Cannot be cancelled at this stage"
                    });
                }
                break;
            }
        }

        if (!itemFound) {
            return res.status(404).json({
                status: 'error',
                message: "Product not found in this order"
            });
        }


        order.cancelOrReturn += cancelledAmount;

        const orderAmount = order.finalAmount - order.cancelOrReturn

        let couponRedeemed = 0;

        if (order.couponApplied && orderAmount < order.couponApplied.minCartValue) {
            couponRedeemed = order.couponDiscount;

            order.couponApplied = null;
            order.revokedCoupon = couponRedeemed || 0
            order.cancelOrReturn -= order.revokedCoupon || 0

            order.finalAmount = Math.max(0, order.finalAmount);
        }

        if (order.paymentMethod !== 'Cash on Delivery') {
            const refundAmount = cancelledAmount - couponRedeemed;

            let wallet = await walletModel.findOne({ userId });
            const transactionId = generateCode()

            if (!wallet) {
                wallet = new walletModel({
                    userId,
                    balance: refundAmount,
                    transactions: [{
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for cancelled order ORD:${order.orderId}`,
                        transactionId: transactionId,
                        orderId: order.orderId,
                        date: new Date()
                    }]
                });
            } else {
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for cancelled order ORD:${order.orderId}`,
                    transactionId: transactionId,
                    orderId: order.orderId,
                    date: new Date()
                });
            }

            await wallet.save();
        }

        if (orderAmount == 0) {
            order.status = 'Cancelled'
        }

        await order.save();

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
        res.json({
            status: 'error',
            message: "Error cancelling order",
            error: error.message
        });
    }
};

const requestReturn = async (req, res) => {
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

        // Check if order is returnable (must be Delivered)
        if (order.status !== 'Delivered') {
            return res.status(400).json({
                status: 'error',
                message: "Order cannot be return at this stage"
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

            if (orderedItem.status === 'Delivered') {
                orderedItem.status = 'Return Requested';
                orderedItem.returnReason = reason;

            } else {
                return res.status(404).json({
                    status: 'error',
                    message: "Item cannot be return at this stage"
                });
            }


        } else {
            if (order.status = 'Delivered') {
                order.status = 'Return Requested';
                order.returnReason = reason;

                order.orderedItems.forEach(item => {
                    if (item.status == 'Delivered') {
                        item.status = 'Return Requested';
                        item.returnReason = reason;
                    }
                });
            } else {
                return res.status(404).json({
                    status: 'error',
                    message: "Order cannot be return at this stage"
                });
            }
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

        const selectedProduct = req.session.forPayment;

        const totalAmount = calculateCheckoutTotals(selectedProduct, req.session.couponApplied)

        const userAddresses = await addressModel.findOne({ userId: findUser._id })

        const deliveryAddress = userAddresses.address.find(
            address => address._id.toString() === selectedAddress.toString()
        );

        const insufficientStock = [];

        await Promise.all(
            selectedProduct.map(async (item) => {
                const product = await productModel.findById(item.product.productId);

                if (!product) {
                    insufficientStock.push(`Product not found: ${item.product.productId}`);
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

        const ordered = {
            orderedItems: selectedProduct.map((item) => {
                const product = item.product.product;
                const order = item.product
                const offer = item.bestOffer;
                let finalPrice = product.salePrice;

                if (offer) {
                    if (offer.discountType === 'flat') {
                        finalPrice = product.salePrice - offer.discountAmount;
                    } else if (offer.discountType === 'percentage') {
                        finalPrice = product.salePrice - (product.salePrice * offer.discountAmount) / 100;
                    }
                    finalPrice = Math.round(finalPrice);
                }

                return {
                    product: product._id,
                    quantity: order.quantity,
                    price: finalPrice,
                    offerAmount: offer ? offer.discountType === "flat" ? offer.discountAmount : (product.salePrice * offer.discountAmount) / 100 : 0,
                    offerId: offer ? offer._id : null,
                    imageurl: product.productImage[0],
                    status: 'Pending'
                };
            })
        };

        payMethod = 'Razorpay'

        req.session.newOrder = {
            userId: findUser._id,
            orderedItems: ordered.orderedItems,
            totalPrice: totalAmount.subtotal,
            discount: totalAmount.offerDiscount,
            couponDiscount: totalAmount.couponDiscount,
            couponApplied: req.session.couponApplied ? req.session.couponApplied.couponId : null,
            finalAmount: totalAmount.total,
            paymentMethod: payMethod,
            shippingaddress: deliveryAddress,
            status: 'Pending'
        }

        const options = {
            amount: totalAmount.total * 100,
            currency: "INR",
            receipt: `order_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            order,
            key: process.env.RAZ_PAY_ID,
        });

    } catch (error) {
        console.error(error)
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
        req.session.couponApplied = null

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
        const {couponCode, cartVal} = req.query;
        

        const userId = req.session.user;

        const coupon = await couponModel.findOne({ couponCode: couponCode });

        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code." });
        }

        const currentDate = new Date();
        if (!coupon.isList || currentDate > coupon.validUpto || currentDate < coupon.validFrom) {
            return res.json({ success: false, message: "Coupon expired or not active." });
        }

        const cart = await cartModel.findOne({ userId: userId })

        if (!cart) {
            return res.json({ success: false, message: "Cart not found." });
        }

        if (cartVal < coupon.minCartValue) {
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

        req.session.couponApplied = { couponId: coupon._id, offerAmount: coupon.offerAmount, minValue: coupon.minCartValue }

        return res.json({ 
            success: true, 
            message: "Coupon applied successfully.",
            couponAmount: coupon.offerAmount,
            couponName: coupon.couponName,
            valid:coupon.validUpto,
            couponId:coupon._id
        });

    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound');
    }
};

const couponCancel = async (req, res) => {
    try {
        const Id = req.query.couponId;

        if (req.session.couponApplied && !req.session.couponApplied.couponId === Id) {
            return res.json({ success: false, message: "Coupon doesn/t found!." });
        }

        const cancelled = req.session.couponApplied ? req.session.couponApplied.offerAmount : 0

        req.session.couponApplied = null

        return res.json({ success: true, message: "Coupon cancelled successfully.", cancelledAmount:cancelled });

    } catch (error) {
        console.error(error);
        res.redirect('/pagenotfound');
    }
};

function calculateCheckoutTotals(products, sessionCoupon = null) {
    let subtotal = 0;
    let offerDiscount = 0;

    products.forEach(item => {
        const { quantity } = item.product;
        const { salePrice } = item.product.product;
        const totalPrice = salePrice * quantity;
        subtotal += totalPrice;

        const offer = item.bestOffer;
        if (offer) {
            if (offer.discountType === 'percentage') {
                offerDiscount += Math.round((salePrice * offer.discountAmount / 100) * quantity);
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

const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        // Find the order in the database
        const order = await orderModel.findOne({ orderId: orderId })
            .populate('orderedItems.product')
            .populate('couponApplied');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);

        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Pipe the PDF to the response
        doc.pipe(res);

        // Add company logo or name
        doc.fontSize(20).text('Dialogue digital', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('Thamarassery, Kozhikode, Kerala, India - 673585', { align: 'center' });
        doc.text('Phone: +91 0000000000| Email: info@dialogue.com', { align: 'center' });

        // Add a horizontal line
        doc.moveDown();
        doc.moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke();
        doc.moveDown();

        // Invoice header
        doc.font('Helvetica-Bold').fontSize(16).text('INVOICE', { align: 'center' });
        doc.moveDown();

        // Order and customer information
        doc.fontSize(12).text(`Invoice Date: ${new Date().toLocaleDateString()}`);
        doc.text(`Order ID: ${order.orderId}`);
        doc.text(`Order Date: ${new Date(order.createdOn).toLocaleDateString()}`);
        doc.moveDown();

        // Shipping address
        doc.font('Helvetica-Bold').fontSize(14).text('Shipping Address:');
        doc.font('Helvetica').fontSize(12).text(`${order.shippingaddress.name}`);
        doc.text(`Address Type${order.shippingaddress.addressType}`);
        if (order.shippingaddress.landmark) {
            doc.text(`${order.shippingaddress.landmark}`);
        }
        doc.text(`${order.shippingaddress.city}, ${order.shippingaddress.state}, ${order.shippingaddress.pincode}`);
        doc.text(`Phone: ${order.shippingaddress.mobile}`);
        if (order.shippingaddress.altNumber) {
            doc.text(`Alt. Phone: ${order.shippingaddress.altNumber}`);
        }
        doc.moveDown();

        // Payment information
        doc.font('Helvetica-Bold').fontSize(14).text('Payment Information:');
        doc.font('Helvetica').fontSize(12).text(`Method: ${order.paymentMethod}`);
        doc.moveDown();

        // Table header for items
        const itemsTableTop = doc.y;
        doc.fontSize(12);

        // Column positions
        const itemX = 50;
        const qtyX = 300;
        const priceX = 380;
        const totalX = 480;

        // Draw table headers
        doc.font('Helvetica-Bold')
            .text('Item Description', itemX, itemsTableTop)
            .text('Qty', qtyX, itemsTableTop)
            .text('Price', priceX, itemsTableTop)
            .text('Total', totalX, itemsTableTop);

        // Draw line below headers
        doc.moveTo(50, doc.y + 5)
            .lineTo(550, doc.y + 5)
            .stroke();


        doc.registerFont('NotoSans', 'public/fonts/NotoSans.ttf');

        doc.font('NotoSans');
        let itemY = doc.y + 15;

        order.orderedItems.forEach(item => {
            const productName = item.product ? item.product.productName : 'Product';

            doc.text(productName, itemX, itemY);
            doc.text(item.quantity.toString(), qtyX, itemY);
            doc.text(`₹ ${item.price.toFixed(2)}`, priceX, itemY);
            doc.text(`₹ ${(item.price * item.quantity).toFixed(2)}`, totalX, itemY);

            itemY += 20;

            if (itemY > doc.page.height - 100) {
                doc.addPage();
                itemY = 50;
            }
        });

        doc.moveTo(50, itemY)
            .lineTo(550, itemY)
            .stroke();

        let summaryY = itemY + 20;

        doc.font('NotoSans')
            .text('Subtotal:', 350, summaryY)
            .text(`₹ ${order.totalPrice.toFixed(2)}`, totalX, summaryY);

        if (order.discount > 0) {
            summaryY += 20;
            doc.text('Discount:', 350, summaryY)
                .text(`-₹ ${order.discount.toFixed(2)}`, totalX, summaryY);
        }

        if (order.couponDiscount > 0) {
            summaryY += 20;
            const couponCode = order.couponApplied ? order.couponApplied.couponName : 'Coupon';
            doc.text(`Coupon (${couponCode}):`, 350, summaryY)
                .text(`-₹ ${order.couponDiscount.toFixed(2)}`, totalX, summaryY);
        }

        summaryY += 25;
        doc.font('NotoSans')
            .text('Total Amount:', 350, summaryY)
            .text(`₹ ${order.finalAmount.toFixed(2)}`, totalX, summaryY);

        const footerY = doc.page.height - 100;
        doc.fontSize(10)
            .font('Helvetica')
            .text('Thank you for your purchase!', 50, footerY, { align: 'center' })
            .text('For any questions or support, please contact our customer service.', 50, footerY + 15, { align: 'center' });

        doc.end();
    } catch (error) {
        console.error(error)
    }
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'WLT';
    for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
    couponCancel,
    downloadInvoice
}