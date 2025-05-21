const productModel = require('../../models/productModel')
const userModel = require('../../models/userModel')
const cartModel = require('../../models/cartModel')
const addressModel = require('../../models/addressModel')
const orderModel = require('../../models/orderModel')
const walletModel = require('../../models/walletModel')
const wishlistModel = require('../../models/wishlistModel')
const couponModel = require('../../models/couponModel')
const mongoose = require("mongoose");
const { login } = require('./userController')
const { isNonNullObject } = require('razorpay/dist/utils/razorpay-utils')
const offerModel = require('../../models/offerModel')

const addToWishlist = async (req, res) => {
    try {

        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const { productId } = req.query;

        let wishlist = await wishlistModel.findOne({ userId: findUser._id }).populate("products.productId");

        if (!wishlist) {
            wishlist = new wishlistModel({ userId: findUser._id, products: [] });
        }

        const product = await productModel.findById(productId);
        if (!product) {
            req.session.userMsg = "Product not found!";
            return res.redirect('/shop');
        }

        if (product.isDeleted == true) {
            req.session.userMsg = "Product is unlisted by seller!";
            return res.redirect('/shop');
        }

        const existingItem = wishlist.products.find(
            (item) => item.productId._id.toString() === productId.toString()
        );

        if (!existingItem) {

            wishlist.products.push({
                productId: productId,
            });

            await wishlist.save();

            req.session.userMsg = "Product added to wishlist";
            return res.redirect("/wishlist");
        }

        req.session.userMsg = "Product already in wishlist";
        return res.redirect("/wishlist");

    } catch (error) {
        console.error(error);
        return res.redirect('/pagenotfound');
    }
};

const loadWishlist = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Login to see your wishlist';
            return res.redirect('/login');
        }


        let products = await wishlistModel.findOne({ userId: findUser._id })
            .populate("products.productId");

        if (!products) {
            return res.render('user/wishlistEmpty');
        }

        const currentDate = new Date();

        const allOffers = await offerModel.find({
            isActive: true,
            validFrom: { $lte: new Date(currentDate.setHours(23, 59, 59, 999)) },
            validUpto: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) }
        }).populate('applicableTo') || [];


        if (products) {
            products = products.products;
        }

        const result = products.map(product => {
            const offers = allOffers
                .filter(item => {
                    const offerId = item.applicableTo?._id?.toString();
                    return (
                        offerId === product.productId.category.toString() ||
                        offerId === product.productId.brand.toString() ||
                        offerId === product.productId._id.toString()
                    );
                })

            const bestOffer = getBestOffer(offers, product);

            return {
                product,
                bestOffer
            };
        });

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }


        return res.render('user/wishlist', {
            findUser,
            products,
            message,
            offer:result
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const removeWishlist = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const { productId } = req.query

        await wishlistModel.findOneAndUpdate({ userId: findUser._id }, { $pull: { products: { _id: productId } } })

        req.session.userMsg = 'Item removed from wishlist!'
        return res.redirect('/wishlist')


    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const loadcart = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Login to see your cart';
            return res.redirect('/login');
        }

        let products = await cartModel.findOne({ userId: findUser._id })
            .populate("items.productId")


        const availableCoupons = await couponModel.find({ isList: true })

        if(req.session.couponApplied && req.session.couponApplied.minValue > products.cartTotals){
            req.session.couponApplied = null
        }

        const couponApplied = req.session.couponApplied || {}

        let coupon = {}
        if (couponApplied) {
            const couponId = couponApplied.couponId
            coupon = await couponModel.findOne({ _id: couponId })
        }

        if (!products) {
            return res.render('user/cartEmpty');
        }

        const currentDate = new Date();

        const allOffers = await offerModel.find({
            isActive: true,
            validFrom: { $lte: new Date(currentDate.setHours(23, 59, 59, 999)) },
            validUpto: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) }
        }).populate('applicableTo') || [];

        if (products) {
            products = products.items;
        }

        const result = products.map(product => {
            const offers = allOffers
                .filter(item => {
                    const offerId = item.applicableTo?._id?.toString();
                    return (
                        offerId === product.productId.category.toString() ||
                        offerId === product.productId.brand._id.toString() ||
                        offerId === product.productId._id.toString()
                    );
                })
        
            const bestOffer = getBestOffer(offers, product);
        
            return {
                product,
                bestOffer
            };
        });
        
        const cartTotals = calculateCartTotals(result,req.session.couponApplied)

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }
            

        return res.render('user/cart', {
            findUser,
            cartTotals,
            message,
            availableCoupons,
            coupon: coupon || null,
            products:result
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const addToCart = async (req, res) => {
    try {

        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const { productId, quantity } = req.query;

        const wishlist = await wishlistModel.findOne({ userId: findUser._id, 'products.productId': new mongoose.Types.ObjectId(productId) })

        if (wishlist) {
            await wishlistModel.findOneAndUpdate({ userId: findUser._id }, { $pull: { products: { productId: productId } } })
        }


        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1) {
            req.session.userMsg = "Invalid quantity!";
            return res.redirect('/shop');
        }

        let cart = await cartModel.findOne({ userId: findUser._id }).populate("items.productId");


        const product = await productModel.findById(productId);
        if (!product) {
            req.session.userMsg = "Product not found!";
            return res.redirect('/shop');
        }

        if (product.isDeleted == true) {
            req.session.userMsg = "Product is unlisted by seller!";
            return res.redirect('/shop');
        }

        if (!cart) {
            cart = new cartModel({ userId: findUser._id, items: [] });
        }

        const listed = (cart?.items || []).filter(item =>
            item.productId &&
            !item.productId.isDeleted &&
            item.productId.stock > 0
        );

        const totalItems = listed.reduce((acc, item) => acc + item.quantity, 0);

        if (totalItems + qty > 6) {
            req.session.userMsg = "Cart limit exceeded. You can add up to 6 items only.";
            return res.redirect('/cart');
        }

        const existingItem = cart.items.find(
            (item) => item.productId._id.toString() === productId.toString()
        );

        if (existingItem) {

            if (existingItem.quantity + qty > product.stock) {
                req.session.userMsg = `Cannot add more items. Only ${product.stock} items available in stock.`;
                return res.redirect('/cart');
            }

            existingItem.quantity += qty;
            existingItem.totalPrice = existingItem.quantity * existingItem.price;
        } else {

            if (qty > product.stock) {
                req.session.userMsg = `Cannot add more items. Only ${product.stock} items available in stock.`;
                return res.redirect('/cart');
            }

            cart.items.push({
                name: product.productName,
                productId,
                quantity: qty,
                price: product.salePrice,
                totalPrice: product.salePrice * qty,
            });
        }

        await cart.save();

        req.session.userMsg = "Product added to cart";
        return res.redirect("/cart");

    } catch (error) {
        console.error(error);
        return res.redirect('/pagenotfound');
    }
};

const updateCartQuantity = async (req, res) => {
    try {
        const { productId, action } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Session expired! Please login again.' });
        }

        const cart = await cartModel.findOne({ userId: userId }).populate({
            path: 'items.productId',
            populate: [
              { path: 'category' },
              { path: 'brand' }
            ]
          });

        const product = await productModel.findById(productId)

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const productIndex = cart.items.findIndex(item =>
            item.productId._id.toString() === productId
        );

        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        const totalCartQuantity = cart.items.reduce((total, item) => total + item.quantity, 0);

        if (action === 'increase') {
            if (totalCartQuantity >= 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart limit reached! Maximum of 6 items allowed.'
                });
            }

            if (cart.items[productIndex].quantity + 1 > product.stock) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot add more items. Only ${product.stock} items available in stock.`,
                });
            }

            cart.items[productIndex].quantity += 1;
        } else if (action === 'decrease') {
            if (cart.items[productIndex].quantity > 1) {
                cart.items[productIndex].quantity -= 1;
            }
        }

        cart.items[productIndex].totalPrice =
            cart.items[productIndex].price * cart.items[productIndex].quantity;

        cart.totalPrice = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        if(req.session.couponApplied && req.session.couponApplied.minValue > cart.totalPrice){
            req.session.couponApplied = null
        }

        await cart.save();

        const currentDate = new Date();

        const allOffers = await offerModel.find({
            isActive: true,
            validFrom: { $lte: new Date(currentDate.setHours(23, 59, 59, 999)) },
            validUpto: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) }
        }).populate('applicableTo') || [];


        const offers = allOffers.filter(item => {
            const offerId = item.applicableTo?._id?.toString();
            return (
                offerId === product.category.toString() ||
                offerId === product.brand._id.toString() ||
                offerId === product._id.toString()
            );
        })

        let cartItems = cart.items;

        const totalOffer = calculateTotalOfferAmount(cartItems, allOffers);

        const bestOffer = getBestOffer(offers, product)

        let offerAmount = 0;
        if(bestOffer && bestOffer.discountAmount){
            
            if(bestOffer.discountType === 'flat'){
                offerAmount = bestOffer.discountAmount
            }else{
                const totalAmount = cart.items[productIndex].price * cart.items[productIndex].quantity
                offerAmount = (bestOffer.discountAmount * totalAmount)/100
            }
        }

        const couponAmount = req.session.couponApplied? req.session.couponApplied.offerAmount : 0;

        res.json({
            success: true,
            message: 'Cart updated successfully',
            newQuantity: cart.items[productIndex].quantity,
            newTotalPrice: cart.items[productIndex].totalPrice - offerAmount,
            cartTotal: cart.totalPrice,
            offerAmount : totalOffer,
            couponAmount
        });

    } catch (error) {
        console.error('Error updating cart quantity:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Session expired! Please login again.' });
        }

        const cart = await cartModel.findOne({ userId: userId });


        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const item = cart.items.find(item=>item.productId.toString()===productId.toString())

        if(!item){
            return res.status(404).json({ success: false, message: 'Product not found in cart' })
        }

        cart.items = cart.items.filter(item => item.productId.toString() !== productId.toString());

        cart.totalPrice = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        await cart.save()

        res.json({
            success: true,
            message: 'Item removed from cart',
            cartTotal: cart.totalPrice
        });

    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const validateCartStock = async (req, res) => {
    try {
        const { products } = req.body;
        const userId = req.session.user;

        if (!userId) {
            req.session.userMsg = 'Session expired!';
            return res.status(401).json({ success: false, message: 'Session expired! Please login again.' });
        }

        const insufficientItems = [];

        for (const item of products) {
            const product = await productModel.findById(item.productId);

            if (!product) {
                insufficientItems.push({
                    productId: item.productId,
                    name: item.name,
                    requestedQuantity: item.quantity,
                    availableStock: 0,
                    reason: 'Product not found'
                });
                continue;
            }

            if (product.isDeleted) {
                insufficientItems.push({
                    productId: item.productId,
                    name: item.name,
                    requestedQuantity: item.quantity,
                    availableStock: 0,
                    reason: 'Product has been unlisted'
                });
                continue;
            }

            if (product.stock < item.quantity) {
                insufficientItems.push({
                    productId: item.productId,
                    name: item.name,
                    requestedQuantity: item.quantity,
                    availableStock: product.stock,
                    reason: 'Insufficient stock'
                });
            }
        }

        if (insufficientItems.length > 0) {
            return res.json({
                success: false,
                message: 'Some items have insufficient stock',
                insufficientItems
            });
        }

        res.json({
            success: true,
            message: 'All items have sufficient stock'
        });

    } catch (error) {
        console.error('Error validating cart stock:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Session expired! Please login again.' });
        }

        const cart = await cartModel.findOne({ userId: userId });

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const productIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId
        );

        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        cart.items[productIndex].quantity = quantity;

        cart.items[productIndex].totalPrice =
            cart.items[productIndex].price * quantity;

        cart.totalPrice = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        await cart.save();

        res.json({
            success: true,
            message: 'Cart item updated successfully',
            newQuantity: quantity,
            newTotalPrice: cart.items[productIndex].totalPrice,
            cartTotal: cart.totalPrice
        });

    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const Checkout = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        let selectedProduct = req.body.products

        if (selectedProduct.length === 0) {
            req.session.userMsg = "Out-of-stock and unlisted products won't proceed to checkout, Remove product from cart!";
            return res.redirect('/shop')
        }

        let addresses = await addressModel.findOne({ userId: findUser._id })

        if (addresses) {
            addresses = addresses.address;
        }

        const productIds = selectedProduct.map(item => item.productId);

        const products = await productModel.find({ _id: { $in: productIds } });
        
        const populatedSelectedProducts = selectedProduct.map(item => {
          const fullProduct = products.find(p => p._id.toString() === item.productId);
          return {
            ...item,
            product: fullProduct
          };
        });

        req.session.checkOut = {
            selectedProduct:populatedSelectedProducts
        }

        return res.json({ redirectUrl: '/checkout' });

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const loadCheckout = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        if(!req.session.checkOut){
            req.session.userMsg = 'No products available. Continue shopping.';
            return res.redirect('/shop');
        }


        if (req.query.error) {
            req.session.userMsg = req.query.error
        }

        let addresses = await addressModel.findOne({ userId: findUser._id })

        if (addresses) {
            addresses = addresses.address;
        }

        let { selectedProduct } = req.session.checkOut;

        const currentDate = new Date();

        const allOffers = await offerModel.find({
            isActive: true,
            validFrom: { $lte: new Date(currentDate.setHours(23, 59, 59, 999)) },
            validUpto: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) }
        }).populate('applicableTo') || [];

        const result = selectedProduct.map(product => {
            const offers = allOffers
                .filter(item => {
                    const offerId = item.applicableTo?._id?.toString();
                    return (
                        offerId === product.product?.category.toString() ||
                        offerId === product.product?.brand.toString() ||
                        offerId === product.product?._id.toString()
                    );
                })
        
            const bestOffer = getBestOffer(offers, product);
        
            return {
                product,
                bestOffer
            };
        });

        const cartTotals = calculateCheckoutTotals(result,req.session.couponApplied)

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }

        return res.render('user/checkout', {
            findUser,
            selectedProduct:result,
            addresses,
            cartTotals,
            message
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const proceedToPayment = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        let { selectedProduct, selectedAddress } = req.body;

        if (!selectedAddress) {
            return res.json({ success: false, message: 'Select a address to proceed.' })
        }

        let availableProducts = [];
        let insufficientStock = [];

        const productIds = selectedProduct.map(item => {
            return item.product.productId
        });

        const products = await productModel.find({ _id: { $in: productIds } });

        if (!products) {
            return res.json({ success: false, message: 'Product not found' })
        }

        selectedProduct.forEach(item => {
            const product = products.find(p => p._id.toString() === item.product.productId.toString());

            if (product) {
                if (product.stock >= item.product.quantity && product.isDeleted == false) {
                    availableProducts.push(item);
                } else {
                    insufficientStock.push({ ...item, availableStock: product.stock });
                }
            }
        });

        if (insufficientStock.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some products are out of stock",
                insufficientStock,
            });
        }

        req.session.checkOut.finalProducts = availableProducts

        res.json({
            success: true,
            message: "Products are available for purchase",
            availableProducts,
            selectedAddress
        });

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const updateCheckout = async (req, res) => {
    try {

        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const { productId, quantity } = req.body

        let selectedProduct = req.session.checkOut.finalProducts

        selectedProduct.map(items => {
            if (items.productId._id.toString() === productId.toString()) {
                items.quantity = quantity
                items.totalPrice = items.price * quantity
            }
        })

        let cartTotals = {
            subtotal: selectedProduct.reduce((acc, item) => acc + item.totalPrice, 0),
            discount: 0,
            total: selectedProduct.reduce((acc, item) => acc + item.totalPrice, 0),
        }

        return res.json({
            success: true,
            message: 'Checkout page updated',
            selectedProduct,
            cartTotals
        })

    } catch (error) {
        console.error(error)
        return res.redirect('pagenotfound')
    }
}

const paymentPage = async (req, res) => {
    try {
        if (!req.session.user) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        req.session.forPayment = req.body.selected;
        req.session.selectedAddress = req.body.address;

        return res.redirect('/paymentpage');
    } catch (error) {
        console.error("Error in paymentPage:", error);
        return res.redirect('/pagenotfound');
    }
};

const renderPaymentPage = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const cart = await cartModel.find({userId:req.session.user})

        if (cart[0].items.length == 0) {
            return res.redirect('/cart');
        }

        const selectedProduct = req.session.forPayment || [];
        if (!Array.isArray(selectedProduct)) {
            return res.status(400).send("Invalid product data");
        }

        let walletBalance = 0;

        const wallet = await walletModel.findOne({userId:findUser._id})

        if(wallet){
            walletBalance = wallet.balance;
        }

        let message;
        if(req.session.userMsg){
            message = req.session.userMsg
            req.session.userMsg = null
        }

        const totalAmount = calculateCheckoutTotals(selectedProduct,req.session.couponApplied)

        return res.render('user/payment', { findUser, totalAmount, walletBalance, message });

    } catch (error) {
        console.error("Error in renderPaymentPage:", error);
        return res.redirect('/pagenotfound');
    }
};

function getBestOffer(applicableOffers, product) {
    if (!Array.isArray(applicableOffers) || applicableOffers.length === 0) return null;

    let bestOffer = null;
    let maxDiscount = 0;
    for (const offer of applicableOffers) {
        let discount = 0;
        let salePrice;

        if (offer.discountType === 'flat') {
            discount = offer.discountAmount;
        } else if (offer.discountType === 'percentage') {
            salePrice = product.product?.salePrice || product.productId?.salePrice || product.salePrice || 0;
            discount = (salePrice * offer.discountAmount) / 100;
        }

        // if ((salePrice / 4) < discount) {
        //     discount = Math.round(salePrice / 4);
        //     return
        // }

        if (discount > maxDiscount) {
            maxDiscount = discount;
            bestOffer = offer;
        }
    }

    return bestOffer;
}

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

function calculateTotalOfferAmount(cartItems, allOffers) {
    let totalOfferAmount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    cartItems.forEach(item => {
        const product = item.productId;
        const price = product.salePrice || product.regularPrice;

        const applicableOffers = allOffers.filter(offer => {
            const from = new Date(offer.validFrom).setHours(23, 59, 59, 999);
            const to = new Date(offer.validUpto).setHours(0, 0, 0, 0);
            const applicableId = offer.applicableTo?._id?.toString();

            const productId = product._id.toString();
            const brandId = product.brand?._id?.toString();
            const categoryId = product.category?._id?.toString();

            const isValid = offer.isActive && today >= from && today <= to;

            if (!isValid) return false;

            if (offer.offerType === "Product") return applicableId === productId;
            if (offer.offerType === "Brand") return applicableId === brandId;
            if (offer.offerType === "Category") return applicableId === categoryId;

            return false;
        });

        let maxDiscount = 0;

        applicableOffers.forEach(offer => {
            let discount = 0;
            if (offer.discountType === "flat") {
                discount = offer.discountAmount;
            } else if (offer.discountType === "percentage") {
                discount = (price * offer.discountAmount) / 100;
            }

            if (discount > maxDiscount) {
                maxDiscount = discount;
            }
        });

        totalOfferAmount += Math.floor(maxDiscount) * item.quantity;
    });

    return totalOfferAmount;
}

module.exports = {
    loadcart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    validateCartStock,
    updateCartItem,
    loadCheckout,
    Checkout,
    updateCheckout,
    renderPaymentPage,
    proceedToPayment,
    paymentPage,
    addToWishlist,
    loadWishlist,
    removeWishlist
}