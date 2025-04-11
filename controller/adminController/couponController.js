const couponModel = require('../../models/couponModel')
const categoryModel = require('../../models/categoryModel')
const brandModel = require('../../models/brandModel')
const productModel = require('../../models/productModel')
const offerModel = require('../../models/offerModel')

const loadCoupon = async (req, res) => {
    try {
        let search = ''
        if (req.query.search) {
            search = req.query.search;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5

        const coupons = await couponModel.find({
            isList: true,
            couponName: { $regex: ".*" + search + ".*", $options: "i" }
        }) || []
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec()

        const count = await couponModel.find({
            isList: true,
            couponName: { $regex: ".*" + search + ".*", $options: "i" }
        }).countDocuments()

        const totalPages = Math.ceil(count / limit)


        return res.render('admin/coupon', {
            coupons,
            totalPages,
            currentPage:page
        })


    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const addCoupon = async (req,res)=>{
    try {
        const couponData = req.body

        if(!couponData){
            return res.json({success:false, message:'Data not found'})
        }

        const existingCoupon = await couponModel.findOne({
            $or: [
              { couponName: couponData.couponName },
              { couponCode: couponData.couponCode }
            ]
          });
          
          if (existingCoupon) {
            return res.json({
              success: false,
              message: 'Coupon name or code already exists'
            });
          }

        
        const newCoupon = new couponModel({
            couponName:couponData.couponName,
            couponCode:couponData.couponCode,
            description:couponData.couponDescription,
            validFrom:couponData.validFrom,
            validUpto:couponData.validUpto,
            minCartValue:couponData.cartValue,
            offerAmount:couponData.offerAmount
        })

        await newCoupon.save()

        return res.json({success:true, message:'Coupon Added Successfully',newCoupon})
        
    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const editCoupon = async (req,res)=>{
    try {
        const couponData = req.body

        if(!couponData){
            return res.json({success:false, message:'Data not found'})
        }

        const existingCoupon = await couponModel.findOne({
            _id: { $ne: couponData.couponId },
            $or: [
              { couponName: couponData.couponName },
              { couponCode: couponData.couponCode }
            ]
          });
          
          if (existingCoupon) {
            return res.json({
              success: false,
              message: 'Coupon name or code already exists'
            });
          }
          
        await couponModel.findOneAndUpdate(
            {_id:couponData.couponId},
            {   
                $set:{
                    couponName:couponData.couponName,
                    couponCode:couponData.couponCode,
                    description:couponData.couponDescription,
                    validFrom:couponData.validFrom,
                    validUpto:couponData.validUpto,
                    minCartValue:couponData.cartValue,
                    offerAmount:couponData.offerAmount
                }
            },
            { new: true }
        )

        return res.json({success:true, message:'Coupon edited Successfully'})

        
    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const couponListing = async (req,res)=>{
    try {
        const couponId = req.query.couponId

        const coupon = await couponModel.findById(couponId)

        if(!coupon){
            return res.json({success:false,message:'Coupon doesn\t found!'})
        }

        if(coupon.isList){
            await couponModel.findOneAndUpdate({_id:couponId},{$set:{isList:false}})
            return res.json({success:true})
        }

        if(!coupon.isList){
            await couponModel.findOneAndUpdate({_id:couponId},{$set:{isList:true}})
            return res.json({success:true})
        }

    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const loadOffers = async (req, res) => {
    try {
        let search = ''
        if (req.query.search) {
            search = req.query.search;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5

        const categories = await categoryModel.find({isDeleted:false,isListed:true})
        const brands = await brandModel.find({isDeleted:false,isListed:true})
        const products = await productModel.find({isDeleted:false})

        const offers = await offerModel.find({
            isActive: true,
            offerName: { $regex: ".*" + search + ".*", $options: "i" }
        })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate({
                path: 'applicableTo',
                select: 'name productName'
            })
            .exec();
        

        const count = await offerModel.find({
            isActive: true,
            offerName: { $regex: ".*" + search + ".*", $options: "i" }
        }).countDocuments()

        const totalPages = Math.ceil(count / limit)

        return res.render('admin/offers', {
            offers,
            totalPages,
            currentPage:page,
            categories,
            brands,
            products
        })


    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const addOffers = async (req, res) => {
    try {
        const offer = req.body


        const existing = await offerModel.findOne({
            offerName : offer.offerName
        })

        if(existing){
            return res.json({success:false,message:'Offer Already Exist'})
        }

        let applicable = offer.applicableBrands || offer.applicableProducts || offer.applicableCategories;


        const newOffer = new offerModel({
            offerName:offer.offerName,
            description:offer.description,
            discountType:offer.discountType,
            discountAmount:offer.discountAmount,
            validFrom:offer.validFrom,
            validUpto:offer.validUpto,
            offerType:offer.offerType,
            applicableTo:applicable,
            offerTypeRef:offer.offerType
        })


        await newOffer.save()

        return res.json({success:true,message:'Offer added successfully'})

    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

const editOffers = async (req,res)=>{
    try {
        const offer = req.body

        const existing = await offerModel.findOne({
            _id: { $ne: offer.offerId },
            offerName : offer.offerName
        })

        if(existing){
            return res.json({success:false,message:'Offer Already Exist'})
        }

        let applicable = offer.applicableBrands || offer.applicableProducts || offer.applicableCategories;


        const update = {
            offerName:offer.offerName,
            description:offer.description,
            discountType:offer.discountType,
            discountAmount:offer.discountAmount,
            validFrom:offer.validFrom,
            validUpto:offer.validUpto,
            offerType:offer.offerType,
            applicableTo:applicable,
            offerTypeRef:offer.offerType
        }

        await offerModel.findOneAndUpdate({_id:offer.offerId},{$set:update})

        return res.json({success:true,message:'Offer added successfully'})
    } catch (error) {
        console.error(error)
        return res.redirect('/admin/loaderror')
    }
}

module.exports = {
    loadCoupon,
    addCoupon,
    editCoupon,
    couponListing,
    loadOffers,
    addOffers,
    editOffers
}