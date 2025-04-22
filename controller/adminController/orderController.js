const orderModel = require('../../models/orderModel')
const productModel = require('../../models/productModel')
const userModel = require('../../models/userModel')
const walletModel = require('../../models/walletModel')

const loadOrders = async (req, res) => {
    try {

        let search = '';

        if (req.query.search) {
            search = req.query.search;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const users = await userModel.find({
            username: { $regex: ".*" + search + ".*", $options: "i" }
        }).select("_id");

        const userIds = users.map(user => user._id);

        const orders = await orderModel
            .find({
                $or: [
                    { status: { $regex: ".*" + search + ".*", $options: "i" } },
                    { userId: { $in: userIds } }
                ]
            })
            .populate([
                { path: 'orderedItems.product' },
                { path: 'userId' }
            ])
            .lean()
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);


        const totalOrders = await orderModel
            .countDocuments({})

        const totalPages = Math.ceil(totalOrders / limit)

        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }

        res.render('admin/orders', {
            orders: orders,
            currentPage: page,
            totalPages: totalPages,
            totalOrders: totalOrders,
            message
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const viewOrder = async (req, res) => {
    try {
        const orderId = req.query.orderId

        const order = await orderModel.findOne({ orderId: orderId })
            .populate({
                path: 'orderedItems.product',
                model: 'Product'
            })
            .populate({
                path: 'userId',
                model: 'User'
            })
            .populate({
                path: 'orderedItems',
                model: 'Order'
            })

        if (!order) {
            req.session.admMsg = 'Order not found'
            return res.redirect('/admin/orders')
        }

        return res.render('admin/vieworder', { order })

    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        const order = await orderModel.findOne({ orderId }).populate('orderedItems');

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        order.status = status;

        if (order.orderedItems && order.orderedItems.length > 0) {
            order.orderedItems.forEach(item => {
                if(item.status !== 'Cancelled'){
                    item.status = status;
                } 
            });
        }

        await order.save();

        return res.json({ success: true, message: 'Order status updated successfully' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId, action } = req.body

        const order = await orderModel.findOne({ orderId: orderId }).populate('orderedItems')

        const userId = order.userId

        if (!order) {
            return res.json({ success: false, message: 'Order not found' })
        }

        if (action === 'accept') {
            if (order.status === 'Return Requested') {
                order.status = "Returned"
                order.orderedItems.map(items => {
                    if(items.status==='Return Requested'){
                        items.status = 'Returned'
                    }
                })

                await Promise.all(
                    order.orderedItems
                        .filter(item => item.status == 'Returned')
                        .map(item =>
                            productModel.findByIdAndUpdate(item.product, {
                                $inc: { stock: item.quantity }
                            })
                        )
                );

                const refundAmount = order.finalAmount - order.cancelOrReturn
                order.revokedCoupon = order.couponDiscount || 0

                let wallet = await walletModel.findOne({ userId });
                const transactionId = generateCode()

                if (!wallet) {
                    wallet = new walletModel({
                        userId,
                        balance: refundAmount,
                        transactions: [{
                            amount: refundAmount,
                            type: 'credit',
                            description: `Refund for returned order ORD:${order.orderId}`,
                            transactionId:transactionId,
                            orderId:order.orderId,
                            date: new Date()
                        }]
                    });
                } else {
                    wallet.balance += refundAmount;
                    wallet.transactions.push({
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for cancelled order ORD:${order.orderId}`,
                        transactionId:transactionId,
                        orderId:order.orderId,
                        date: new Date()
                    });
                }

                await wallet.save();

                order.cancelOrReturn += order.finalAmount - order.cancelOrReturn;

                await order.save({ suppressWarning: true })

                return res.json({ success: true, message: 'Return request accepted succesfully' })

            }

            return res.json({ success: false, message: 'Check return status and try again.' })

        } else {

            if (order.status === 'Return Requested') {
                order.status = "Return Rejected"
                order.orderedItems.map(items => {
                    items.status = 'Return Rejected'
                })

                await order.save({ suppressWarning: true })

                return res.json({ success: false, message: 'Return request rejected!' })

            } else {

                return res.json({ success: false, message: 'Check return status and try again.' })

            }

        }

    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const returnItem = async (req, res) => {
    try {
        const { orderId, productId, action } = req.body;

        const order = await orderModel.findOne({ orderId: orderId })
            .populate('orderedItems.product')
            .populate('couponApplied')

        const userId = order.userId

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        const item = order.orderedItems.find(items => items.product._id.toString() === productId.toString());

        if (!item) {
            return res.json({ success: false, message: "Product not found in this order" });
        }

        if (item.status !== 'Return Requested') {
            return res.json({ success: false, message: "Item cannot be returned at this stage" });
        }

        if (action === 'accept') {

            item.status = 'Returned';

            await productModel.findOneAndUpdate(
                { _id: productId },
                { $inc: { stock: item.quantity } }
            );
            const returnedValue = item.price * item.quantity

            order.cancelOrReturn += returnedValue

            const finalAmount = order.finalAmount - order.cancelOrReturn

            let couponRedeemed = 0;

            if (order.couponApplied && finalAmount < order.couponApplied.minCartValue) {
                couponRedeemed = order.couponDiscount;

                order.couponApplied = null;
                order.revokedCoupon = couponRedeemed || 0
                order.cancelOrReturn -= order.revokedCoupon || 0

                order.finalAmount = Math.max(0, order.finalAmount);
            }

            const refundAmount = returnedValue - couponRedeemed;

            let wallet = await walletModel.findOne({ userId });
            const transactionId = generateCode();
            
            if (!wallet) {
              wallet = new walletModel({
                userId,
                balance: refundAmount,
                transactions: [{
                  amount: refundAmount,
                  type: 'credit',
                  description: `Refund for cancelled order ORD:${order.orderId}`,
                  transactionId,
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
                transactionId,
                orderId: order.orderId,
                date: new Date()
              });
            }

            await wallet.save();


            if (finalAmount == 0) {
                order.status = 'Returned'
            }

            await order.save();

            return res.json({ success: true, message: "Return request accepted" });
        } else {

            item.status = 'Return Rejected';

            await order.save();

            return res.json({ success: true, message: "Return request rejected" });
        }
    } catch (error) {
        console.error(error);
        return res.redirect('/admin/loaderror');
    }
};

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'WLT';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

module.exports = {
    loadOrders,
    viewOrder,
    updateStatus,
    returnOrder,
    returnItem
}