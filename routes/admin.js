const express = require('express')
const router = express.Router()
const adminController = require('../controller/adminController');
const { adminAuth } = require('../middlewares/auth');
const customerController = require('../controller/customerController')
const brandController = require('../controller/brandController')
const productController = require('../controller/productController')
const categoryController = require('../controller/categoryController')
const path = require('path')
const { upload } = require('../config/multer')


//login management

router.get('/login',adminController.loadLogin);

router.post('/login',adminController.login);

router.get('/dashboard',adminAuth,adminController.loadDash);

router.get('/loaderror',adminController.loaderror);

router.get('/logout',adminAuth,adminController.logout);

//user management

router.get('/users',adminAuth,customerController.customerInfo)

router.get('/blockUser',adminAuth,customerController.blockUser)

router.get('/unblockUser',adminAuth,customerController.unblockUser)


//brand management

router.get('/brands',adminAuth,brandController.brandInfo)

router.post('/addbrand',adminAuth,brandController.addBrand)

router.post('/editbrand',adminAuth,brandController.editBrand)

router.post('/deletebrand',adminAuth,brandController.deleteBrand)

router.get('/listBrand',adminAuth,brandController.listBrand)

router.get('/unlistBrand',adminAuth,brandController.unlistBrand)

// category Management

router.get('/category',adminAuth,categoryController.loadCategory)

router.post('/addcategory',adminAuth,categoryController.addCategory)

router.post('/editcategory',adminAuth,categoryController.editCategory)

router.post('/deletecategory',adminAuth,categoryController.deleteCategory)

router.get('/listcategory',adminAuth,categoryController.listCategory)

router.get('/unlistcategory',adminAuth,categoryController.unlistCategory)


// Product Management

router.get('/products',adminAuth,productController.loadProduct)

router.get('/addproduct',adminAuth,productController.loadAddProduct)

router.post('/addproduct', upload, productController.addProduct);

router.get('/editproduct/:id',adminAuth, productController.editProductPage);

router.post('/editproduct/:id', upload, productController.updateProduct);

router.delete('/remove-product-image/:productId/:imageIndex', adminAuth,productController.removeProductImage);

router.post('/deleteproduct',adminAuth,productController.deleteProduct)




module.exports = router;