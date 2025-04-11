const getTotalOffers = async (product) => {
    console.log("Fetching offers...");
    console.log(product, "Product details");
  
    if (!product.category && !product.brand) return 0; // Ensure product has a category or brand
  
    const filterConditions = [];
  
    if (product.category) {
      filterConditions.push({ categoryId: new mongoose.Types.ObjectId(product.category) });
    }
    if (product.brand) {
      filterConditions.push({ brandId: new mongoose.Types.ObjectId(product.brand) });
    }
    if (product._id != null) {
      filterConditions.push({ productId: new mongoose.Types.ObjectId(product._id) });
    }
  
    const offerList = await offerschema.find({
      $or: filterConditions,
      status: true,
      startDate: { $lte: new Date() },
      expiredOn: { $gte: new Date() },
    });
  
    if (!offerList || offerList.length === 0) return 0; // No offers available
  
    let bestOffer = null;
    let maxDiscountValue = 0;
  
    offerList.forEach((offer) => {
      let discountValue =
        offer.discountType === "percentage"
          ? (offer.discountValue / 100) * product.salePrice
          : offer.discountValue;
  
      if (offer.maxDiscount) {
        discountValue = Math.min(discountValue, offer.maxDiscount);
      }
  
      if (discountValue > maxDiscountValue) {
        maxDiscountValue = discountValue;
        bestOffer = offer;
      }
    });
  
    if (!bestOffer) return 0;
  
    console.log(bestOffer, "Selected Offer");
    console.log(maxDiscountValue, "Final Discount Value");
  
    return maxDiscountValue;
  };
  
  
  const getBestOfferForProduct = async (product) => {
    if (!product.category && !product.brand) return null;
    const filterConditions = [];
  
    if (product.category != null) {
      filterConditions.push({ categoryId: new mongoose.Types.ObjectId(product.category) });
    }
    if (product.brand != null) {
      filterConditions.push({ brandId: new mongoose.Types.ObjectId(product.brand) });
    }
    if (product._id != null) {
      filterConditions.push({ productId: new mongoose.Types.ObjectId(product._id) });
    }
    console.log(filterConditions, 'filtercondition')
    const offers = await offerschema.find({
      $or: filterConditions,
      status: true,
      startDate: { $lte: new Date() },
      expiredOn: { $gte: new Date() },
    });
    console.log(offers, 'offers')
    if (!offers || offers.length === 0) return null; // No offers available
  
    let bestOffer = null;
    let maxDiscountValue = 0;
  
    offers.forEach((offer) => {
      let discountValue =
        offer.discountType === "percentage"
          ? (offer.discountValue / 100) * product.salePrice
          : offer.discountValue;
  
      if (offer.maxDiscount) {
        discountValue = Math.min(discountValue, offer.maxDiscount);
      }
  
      if (discountValue > maxDiscountValue) {
        maxDiscountValue = discountValue;
        bestOffer = offer;
      }
    });
    return bestOffer;
  };