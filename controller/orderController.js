const productModel = require('../models/productModel')
const userModel = require('../models/userModel')
const cartModel = require('../models/cartModel')
const addressModel = require('../models/addressModel')

const loadcart = async (req, res) => {
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }


        let products = await cartModel.findOne({ userId: findUser._id })
            .populate("items.productId");


        products = products.items;
        let cartTotal = products.filter(item => item.productId && !item.productId.isDeleted && item.productId.stock > 0);

        let cartTotals = {
            subtotal: cartTotal.reduce((acc, item) => acc + item.totalPrice, 0),
            discount: 0,
            total: cartTotal.reduce((acc, item) => acc + item.totalPrice, 0),
        }


        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }


        return res.render('user/cart', {
            findUser,
            products,
            cartTotals,
            message
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

        if(!userId){
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const cart = await cartModel.findOne({ userId: userId });
        const product = await productModel.findById(productId)

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const productIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId
        );

        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        const totalCartQuantity = cart.items.reduce((total, item) => total + item.quantity, 0);

        if (action === 'increase') {
            if (totalCartQuantity > 6) {
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

        await cart.save();

        res.json({
            success: true,
            message: 'Cart updated successfully',
            newQuantity: cart.items[productIndex].quantity,
            newTotalPrice: cart.items[productIndex].totalPrice,
            cartTotal: cart.totalPrice
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

        if(!userId){
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const cart = await cartModel.findOne({ userId: userId });

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const initialLength = cart.items.length;
        cart.items = cart.items.filter(item => item.productId.toString() !== productId);

        if (cart.items.length === initialLength) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        cart.totalPrice = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        await cart.save();

        res.json({ success: true, message: 'Item removed from cart' });

    } catch (error) {
        console.error('Error removing item from cart:', error);
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

        let selectedProduct = req.body.products.map(item => JSON.parse(item));
        
        let stockOutItems = req.body.stockOut.map(item => JSON.parse(item));

        if(stockOutItems.length != 0){
            req.session.userMsg = "Out-of-stock and unlisted products won't proceed to checkout.";
        }

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }

        let addresses = await addressModel.findOne({ userId: findUser._id })
        addresses = addresses.address;


        let cartTotals = {
            subtotal: selectedProduct.reduce((acc, item) => acc + item.totalPrice, 0),
            discount: 0,
            total: selectedProduct.reduce((acc, item) => acc + item.totalPrice, 0),
        }

        req.session.checkOut = {
            selectedProduct,
            addresses,
            cartTotals,
            message
        }

        return res.redirect('/checkout')

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

        let { selectedProduct, addresses, cartTotals, message } = req.session.checkOut;

        return res.render('user/checkout', {
            findUser,
            selectedProduct,
            addresses,
            cartTotals,
            message
        })

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const proceedToPayment = async (req,res)=>{
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }
        
        const { selectedAddress} = req.body.selectedAddress

        let selectedProduct = req.body.selectedProduct.map(item => JSON.parse(item));
        
        
        const totalAmount = selectedProduct.reduce((acc,item)=> acc + item.totalPrice,0)
        
        req.session.payment = {
            totalAmount,
            selectedAddress
        }
        return res.redirect('/paymentoptions')

    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const paymentPage = async (req,res)=>{
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const {totalAmount} = req.session.payment

        return res.render('user/payment',{
            findUser,
            totalAmount
        })
    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

const payment = async (req,res)=>{
    try {
        const findUser = await userModel.findOne({ _id: req.session.user });

        if (!findUser) {
            req.session.userMsg = 'Session expired!';
            return res.redirect('/login');
        }

        const payMethod = req.query.payment

        
        
    } catch (error) {
        console.error(error)
        return res.redirect('/pagenotfound')
    }
}

module.exports = {
    loadcart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    loadCheckout,
    Checkout,
    proceedToPayment,
    paymentPage,
    payment
}