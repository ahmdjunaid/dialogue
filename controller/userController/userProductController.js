const productModel = require('../../models/productModel')
const brandModel = require('../../models/brandModel')
const categoryModel = require('../../models/categoryModel')
const userModel = require('../../models/userModel')
const offerModel = require('../../models/offerModel')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await userModel.findById(user);
        const listedCategories = await categoryModel.find({ isListed: true }).select('_id');
        const listedBrands = await brandModel.find({ isListed: true }).select('_id');


        let { search, sort, brandf, categoryf, minValue, maxValue } = req.query;
        const page = parseInt(req.query.page) || 1;
        const perPage = 6;

        if (!minValue) {
            minValue = 0
        }

        if (!maxValue) {
            maxValue = Infinity
        }

        let filter = {
            isDeleted: false,
            stock: { $gt: 0 },
            category: { $in: listedCategories.map(cat => cat._id) },
            brand: { $in: listedBrands.map(brand => brand._id) },
            $and: [
                { salePrice: { $gte: minValue } },
                { salePrice: { $lte: maxValue } }
            ]
        };

        if (search) {
            filter.productName = { $regex: search, $options: "i" };
        }


        if (categoryf) {
            filter.category = categoryf;
        }


        if (brandf) {
            filter.brand = brandf;
        }

        let sortOptions = {};
        switch (sort) {
            case '':
                sortOptions = { createdAt: -1 };
                break;
            case 'A-Z':
                sortOptions = { productName: 1 };
                break;
            case 'Z-A':
                sortOptions = { productName: -1 };
                break;
            case 'Price : low - high':
                sortOptions = { salePrice: 1 };
                break;
            case 'Price : high - low':
                sortOptions = { salePrice: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        const brand = await brandModel.find({ isListed: true, isDeleted: false });
        const category = await categoryModel.find({ isListed: true, isDeleted: false });

        const totalProducts = await productModel.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / perPage);
        const currentPage = Math.max(1, Math.min(page, totalPages));

        let message;
        if (req.session.userMsg) {
            message = req.session.userMsg
            req.session.userMsg = null
        }

        const products = await productModel.find(filter)
            .sort(sortOptions)
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .populate('category brand');

        res.render("user/shop", {
            products,
            totalPages,
            currentPage,
            search,
            sort,
            categoryf,
            brandf,
            category,
            brand,
            findUser: userData,
            message
        });
    } catch (error) {
        console.error("Error loading shop page:", error);
        res.redirect('/admin/loaderror');
    }
}

const productDetails = async (req, res) => {

    try {

        const userId = req.session.user;
        const userData = await userModel.findById(userId);
        const productId = req.params.id;

        const unlistedCategories = await categoryModel.find({ isListed: false }).select('_id');
        const unlistedBrands = await brandModel.find({ isListed: false }).select('_id');

        const blockedProduct = await productModel.findOne({
            _id: productId,
            $or: [
                { isDeleted: true },
                { category: { $in: unlistedCategories.map(cat => cat._id) } },
                { brand: { $in: unlistedBrands.map(brand => brand._id) } }
            ],
        }).populate('brand category')

        if (blockedProduct) {
            req.session.userMsg = 'This product is unlisted by the seller.'
            return res.redirect('/shop')
        }

        const product = await productModel.findById(productId).populate('brand')

        const currentDate = new Date();

        const allOffers = await offerModel.find({
            isActive: true,
            validFrom: { $lte: new Date(currentDate.setHours(23, 59, 59, 999)) },
            validUpto: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) }
        }).populate('applicableTo') || [];


        const offers = allOffers
            .filter(item => {
                const offerId = item.applicableTo?._id?.toString();
                return (
                    offerId === product.category.toString() ||
                    offerId === product.brand._id.toString() ||
                    offerId === product._id.toString()
                );
            })
            .sort((a, b) => b.discountAmount - a.discountAmount);

        const bestOffer = getBestOffer(offers, product)

        const relatedProducts = await productModel.find({
            isDeleted: false,
            stock: { $gt: 0 },
            _id: { $ne: productId },
        }).populate('brand')
            .sort({ createdOn: -1 })
            .skip(0)
            .limit(3);

        res.render("user/product-details", {
            findUser: userData,
            product: product,
            relatedProducts,
            quantity: product.stock,
            offers,
            bestOffer
        })
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.redirect('/pagenotfound');
    }
};

function getBestOffer(applicableOffers, product) {
    if (!Array.isArray(applicableOffers) || applicableOffers.length === 0) return null;

    let bestOffer = null;
    let maxDiscount = 0;

    for (const offer of applicableOffers) {
        let discount = 0;

        if (offer.discountType === 'flat') {
            discount = offer.discountAmount;
        } else if (offer.discountType === 'percentage') {
            discount = (product.salePrice * offer.discountAmount) / 100;
        }

        if (discount > maxDiscount) {
            maxDiscount = discount;
            bestOffer = offer;
        }
    }

    return bestOffer;
}

module.exports = {
    loadShoppingPage,
    productDetails,
}