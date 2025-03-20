const productModel = require('../models/productModel')
const brandModel = require('../models/brandModel')
const categoryModel = require('../models/categoryModel')
const userModel = require('../models/userModel')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')


const loadAddProduct = async (req, res) => {

    if (!req.session.admin) {
        res.redirect('/admin/login')
        return;
    }

    try {

        const brand = await brandModel.find({ isListed: true, isDeleted: false })
        const category = await categoryModel.find({ isListed: true, isDeleted: false })


        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }

        res.render('admin/addproduct', { brand, category, message })

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const addProduct = async (req, res) => {
    if (!req.session.admin) {
        res.redirect('/admin/login');
        return;
    }

    try {
        const productData = req.body;

        const productExist = await productModel.findOne({
            productName: productData.productName.trim(),isDeleted:false
        });

        if (productExist) {
            req.session.admMsg = 'Product already exists';
            return res.redirect('/admin/addproduct');
        }

        const newProduct = new productModel({
            productName: productData.productName,
            description: productData.productDescription,
            brand: productData.brandId,
            category: productData.categoryId,
            regularPrice: Number(productData.productAmount),
            salePrice: Number(productData.offerAmount),
            stock: Number(productData.stockCount),
            storage: productData.storage,
            ram: productData.ram,
            camera: productData.camera,
            cpu: productData.cpu,
            status: 'Available',
            productImage: []
        });

        let images = [];
        for (let i = 1; i <= 4; i++) {
            if (req.files[`image${i}`]) {
                images.push(req.files[`image${i}`][0].filename);
            }
        }

        // Ensure first index (0) is occupied by shifting images if necessary
        if (images.length > 0 && !images[0]) {
            images = images.filter(img => img); // Remove empty slots
        }

        newProduct.productImage = images;

        await newProduct.save();

        req.session.admMsg = 'Product added successfully';
        return res.redirect('/admin/addproduct');

    } catch (error) {
        console.error('Error adding product:', error);
        return res.redirect('/admin/loaderror');
    }
};


const loadProduct = async (req, res) => {

    if (!req.session.admin) {
        res.redirect('/admin/login')
        return;
    }

    try {

        let search = '';
        if (req.query.search) {
            search = req.query.search
        }

        const limit = 4
        const page = parseInt(req.query.page) || 1;


        const listedCategories = await categoryModel.find({ isListed: true }).select('name');
        const listedBrands = await brandModel.find({ isListed: true }).select('name');

        const totalProducts = await productModel.countDocuments({
            isDeleted: false,
            category: { $in: listedCategories.map(cat => cat.name) },
            brand: { $in: listedBrands.map(brand => brand.name) },
            productName: { $regex: ".*" + search + ".*", $options: "i" }
        });
        const totalPages = Math.ceil(totalProducts / limit)
        const skip = (page - 1) * limit

        

        const products = await productModel.find({
            isDeleted: false,
            category: { $in: listedCategories.map(cat => cat.name) },
            brand: { $in: listedBrands.map(brand => brand.name) },
            productName: { $regex: ".*" + search + ".*", $options: "i" }
        })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .skip(skip)

        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }
        res.render('admin/products', {
            products,
            message,
            currentPage: page,
            totalPages
        })

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const editProductPage = async (req, res) => {

    if (!req.session.admin) {
        res.redirect('/admin/login')
        return;
    }

    try {
        const productId = req.params.id;
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }

        const brand = await brandModel.find({ isListed: true, isDeleted: false });
        const category = await categoryModel.find({ isListed: true, isDeleted: false });

        res.render('admin/editproduct', { product, brand, category });

        
    } catch (error) {
        console.error('Error loading edit product page:', error);
        res.status(500).render('error', { message: 'Server error occurred while loading edit product page' });
    }
};

const updateProduct = async (req, res) => {

    if (!req.session.admin) {
        res.redirect('/admin/login')
        return;
    }

    try {
        const productId = req.params.id;
        const { productName, productDescription, brandId, categoryId, productAmount, offerAmount, stockCount, storage, ram, camera, cpu } = req.body;

        const existing = await productModel.findOne({
            _id: { $ne: productId },
            productName:productName.trim(),
            isDeleted:false
        })

        if(existing){
            req.session.admMsg = 'Product already exist'
            return res.redirect('/admin/products')
        }

        const updatedData = {
            productName,
            description: productDescription,
            brand: brandId,
            category: categoryId,
            regularPrice: productAmount,
            salePrice: offerAmount || null,
            stock: stockCount,
            storage,
            ram,
            camera,
            cpu
        };

        const images = [];
        for (let i = 1; i <= 4; i++) {
            if (req.files[`image${i}`]) {
                images[i - 1] = req.files[`image${i}`][0].filename;
            }
        }

        console.log(images);


        const product = await productModel.findById(productId);

        if (images.length > 0) {
            images.forEach((image, index) => {
                if (image) {
                    product.productImage[index] = image;
                }
            });
            updatedData.productImage = product.productImage;
        }

        await productModel.findByIdAndUpdate(productId, updatedData, { new: true });

        req.session.admMsg = 'Product edited successfully'
        res.redirect('/admin/products');


    } catch (error) {
        console.error('Error updating product:', error);
        req.session.admMsg = 'Error updating product'
        return res.redirect('/admin/products');
    }
};

const removeProductImage = async (req, res) => {
    try {
        const productId = req.params.productId;
        const imageIndex = parseInt(req.params.imageIndex);

        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (imageIndex < 0 || imageIndex >= product.productImage.length) {
            return res.status(400).json({ success: false, message: 'Invalid image index' });
        }

        product.productImage.splice(imageIndex, 1);

        await product.save();

        res.json({ success: true, message: 'Image removed successfully', updatedImages: product.productImage });
    } catch (error) {
        console.error('Error removing product image:', error);
        res.status(500).json({ success: false, message: 'Server error occurred while removing image' });
    }
};

const deleteProduct = async (req, res) => {
    try {

        const id = req.body.id

        await productModel.findByIdAndUpdate({ _id: id }, { $set: { isDeleted: true } })

        req.session.admMsg = 'Product Deleted Successfully'
        res.redirect('/admin/products')
        return;

    } catch (error) {
        console.log(error);
        req.session.admMsg = 'An error occured while deleting'
        res.redirect('/admin/products')
    }
}

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await userModel.findById(user);
        const listedCategories = await categoryModel.find({ isListed: true }).select('name');
        const listedBrands = await brandModel.find({ isListed: true }).select('name');


        let { search, sort, brandf, categoryf, minValue, maxValue } = req.query;
        const page = parseInt(req.query.page) || 1;
        const perPage = 6;

        if(!minValue){
            minValue = 0
        }
        
        if(!maxValue){
            maxValue = Infinity
        }

        let filter = {
            isDeleted: false,
            stock: { $gt: 0 },
            category: { $in: listedCategories.map(cat => cat.name) },
            brand: { $in: listedBrands.map(brand => brand.name) },
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
        if(req.session.userMsg){
            message = req.session.userMsg
            req.session.userMsg = null
        }

        const products = await productModel.find(filter)
            .sort(sortOptions)
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .populate('category');

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

        const unlistedCategories = await categoryModel.find({ isListed: false }).select('name');
        const unlistedBrands = await brandModel.find({ isListed: false }).select('name');

        const blockedProduct = await productModel.findOne({
            _id:productId,
            $or: [
                { isDeleted: true },
                { category: { $in: unlistedCategories.map(cat => cat.name) } },
                { brand: { $in: unlistedBrands.map(brand => brand.name) } }
            ],
        })

        if(blockedProduct){
            req.session.userMsg = 'This product is unlisted by the seller.'
            return res.redirect('/shop')
        }

        const product = await productModel.findById(productId)
 

        const relatedProducts = await productModel.find({
            isDeleted: false,
            stock: { $gt: 0 },
            _id: { $ne: productId },
        })
            .sort({ createdOn: -1 })
            .skip(0)
            .limit(3);

        res.render("user/product-details", {
            findUser: userData,
            product: product,
            relatedProducts,
            quantity: product.stock,
        })
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.redirect('/pagenotfound');
    }
};


module.exports = {
    loadAddProduct,
    addProduct,
    loadProduct,
    editProductPage,
    updateProduct,
    removeProductImage,
    deleteProduct,

    //user side
    loadShoppingPage,
    productDetails,
}